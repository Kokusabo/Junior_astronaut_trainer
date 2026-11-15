// Pure game logic: no DOM access, so it can run in Node tests as well as the browser.
const Game = (function () {
  const MG = typeof module !== 'undefined' ? require('./minigames.js') : Minigames;
  const MISS_PENALTY = 8; // stability lost when a repair mini-game is missed

  // Small seeded RNG (mulberry32) so a run can be replayed from its seed.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Waiting for weather is not free: each day waited gives more prep time but systems age.
  const WAIT = { fuelPerDay: 4, countdownPerDay: 20, failurePerDay: 0.04 };

  // carry: { stability, fuel } left over from the previous level; one pool for the whole mission.
  // carry.waited (days skipped in the launch window) and carry.day (the chosen day's weather) come
  // from the weather window at mission start.
  function start(levels, index, seed, events = [], carry = null) {
    const waited = (carry && carry.waited) || 0;
    const base = levels[index];
    const cfg = {
      ...base,
      countdown: base.countdown + WAIT.countdownPerDay * waited,
      failureChance: Math.min(0.85, base.failureChance + WAIT.failurePerDay * waited),
    };
    return {
      index,
      cfg,
      final: index === levels.length - 1,
      launchDay: (carry && carry.day) || null,
      waited,
      rng: makeRng(seed),
      timeLeft: cfg.countdown,
      stability: carry ? carry.stability : 100,
      fuel: carry ? carry.fuel : 100,
      supplies: { ...cfg.supplies },
      checking: 0,       // seconds left on the current check; 0 means idle
      // Checklist: every system in the level must end 'ok'. States: unchecked, fault, repaired (needs a re-check), ok.
      systems: Object.fromEntries(cfg.pool.map((id) => [id, 'unchecked'])),
      checkingId: null,  // system being checked
      stars: 0,
      checkPenalty: 0,   // extra seconds on the next check (from events)
      events,            // random events that can follow a clear check
      lastEvent: null,
      active: null,      // failure id waiting for a repair
      repair: null,      // running mini-game, if any
      lastRepair: null,  // { success, fact } of the latest finished repair, for the UI
      resolved: 0,
      log: [],
      status: 'playing', // 'playing' | 'won' | 'lost'
      reason: '',
    };
  }

  function canCheck(s, id) {
    const st = s.systems[id];
    return s.status === 'playing' && s.checking === 0 && s.active === null && (st === 'unchecked' || st === 'repaired');
  }

  function startCheck(s, id) {
    if (!canCheck(s, id)) return false;
    s.checkingId = id;
    s.checking = s.cfg.checkTime + s.checkPenalty;
    s.checkPenalty = 0;
    s.fuel -= s.cfg.checkFuelCost;
    s.log.push(`Checking ${s.systems[id] === 'repaired' ? 'repair on ' : ''}${id}.`);
    return true;
  }

  function lose(s, reason) {
    s.status = 'lost';
    s.reason = reason;
  }

  function finishCheck(s, failures) {
    const id = s.checkingId;
    s.checkingId = null;
    // A re-check after a repair can still fail, but less often.
    const chance = s.cfg.failureChance * (s.systems[id] === 'repaired' ? 0.5 : 1);
    if (s.rng() < chance) {
      s.systems[id] = 'fault';
      s.active = id;
      s.log.push(`Check found: ${failures[id].name}.`);
    } else {
      s.systems[id] = 'ok';
      s.log.push(`${failures[id].system}: OK.`);
      if (s.events.length && s.rng() < (s.cfg.eventChance || 0)) {
        applyEvent(s, s.events[Math.floor(s.rng() * s.events.length)]);
      }
    }
  }

  function applyEvent(s, ev) {
    const e = ev.effect;
    if (e.stability) s.stability += e.stability;
    if (e.timeLeft) s.timeLeft += e.timeLeft;
    if (e.checkPenalty) s.checkPenalty += e.checkPenalty;
    if (e.supply === 'random') {
      const ids = Object.keys(s.supplies);
      s.supplies[ids[Math.floor(s.rng() * ids.length)]] += 1;
    }
    s.lastEvent = ev;
    s.log.push(`Event: ${ev.text}`);
  }

  function canLaunch(s) {
    return s.status === 'playing' && s.active === null && s.checking === 0 && Object.values(s.systems).every((v) => v === 'ok');
  }

  // Go/no-go: all systems green, then stability and fuel must clear the level limits.
  function requestLaunch(s) {
    if (!canLaunch(s)) return false;
    if (s.stability < s.cfg.minStability) return lose(s, `NO-GO: stability ${Math.round(s.stability)} is below ${s.cfg.minStability}.`), true;
    if (s.fuel < s.cfg.minFuel) return lose(s, `NO-GO: fuel ${Math.round(s.fuel)} is below ${s.cfg.minFuel}.`), true;
    // Final launch into NO-GO weather: big chance the rocket is lost.
    const day = s.final ? s.launchDay : null;
    if (day && !day.go && s.rng() < day.risk) {
      return lose(s, `Launched into bad weather and lost the rocket. ${day.reason}`), true;
    }
    s.status = 'won';
    s.stars = 1 + (s.timeLeft >= 0.4 * s.cfg.countdown ? 1 : 0) + (s.stability >= 80 ? 1 : 0);
    if (day && !day.go) { s.stars = Math.max(1, s.stars - 1); s.lucky = true; }
    s.log.push(`GO for launch. ${s.stars} star${s.stars > 1 ? 's' : ''}.`);
    return true;
  }

  // A won mini-game repairs the system. A lost one does not: the fault stays open, the part is gone,
  // and stability takes a hit, so the player needs another part to try again.
  function finishRepair(s, failures, success) {
    const f = failures[s.active];
    s.repair = null;
    if (success) {
      s.systems[s.active] = 'repaired';
      s.active = null;
      s.resolved += 1;
      s.log.push(`Repaired: ${f.name}.`);
    } else {
      s.stability -= MISS_PENALTY;
      s.log.push(`Repair failed: ${f.name}. Stability -${MISS_PENALTY}.`);
    }
    s.lastRepair = { success, fact: f.fact };
  }

  // Mini-game for a failure in this level: failures list one per level so levels never repeat a game.
  function minigameFor(f, level) {
    if (!f.minigame) return null;
    if (typeof f.minigame === 'string') return f.minigame;
    return f.minigame[Math.min(level, f.minigame.length - 1)];
  }

  function tick(s, dt, failures) {
    if (s.status !== 'playing') return;
    s.timeLeft -= dt;
    if (s.checking > 0) {
      s.checking -= dt;
      if (s.checking <= 0) {
        s.checking = 0;
        finishCheck(s, failures);
      }
    }
    if (s.repair) {
      s.repair.step(dt);
      if (s.repair.done) finishRepair(s, failures, s.repair.success);
    }
    if (s.active !== null) {
      for (const [key, rate] of Object.entries(failures[s.active].drain)) s[key] -= rate * dt;
    }
    if (s.stability <= 0) return lose(s, 'Stability collapsed.');
    if (s.fuel <= 0) return lose(s, 'Out of fuel.');
    if (s.timeLeft <= 0) lose(s, 'Countdown ran out before launch clearance.');
  }

  // Returns { ok, fixed?, fact? } so the UI can show what happened.
  function applySupply(s, failures, supplyId) {
    if (s.status !== 'playing' || s.active === null) return { ok: false, msg: 'Nothing to repair.' };
    if (s.repair) return { ok: false, msg: 'Repair already in progress.' };
    if (!(s.supplies[supplyId] > 0)) return { ok: false, msg: 'None of that part left.' };
    s.supplies[supplyId] -= 1;
    const f = failures[s.active];
    const kind = minigameFor(f, s.index);
    if (f.fix === supplyId && kind) {
      s.repair = MG.create(kind, s.rng, s.index);
      s.log.push(`Repairing: ${f.name}.`);
      return { ok: true, fixed: false, repairing: true };
    }
    if (f.fix === supplyId) {
      s.log.push(`Repaired: ${f.name}.`);
      s.systems[s.active] = 'repaired';
      s.active = null;
      s.resolved += 1;
      return { ok: true, fixed: true, fact: f.fact };
    }
    s.stability -= 5;
    s.log.push(`Wrong part for ${f.name}. Stability -5.`);
    if (s.stability <= 0) lose(s, 'Stability collapsed.');
    return { ok: true, fixed: false };
  }

  return { WAIT, start, canCheck, startCheck, canLaunch, requestLaunch, tick, applySupply, finishRepair, applyEvent, minigameFor, MISS_PENALTY };
})();

if (typeof module !== 'undefined') module.exports = Game;
