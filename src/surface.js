// Mission 3: moonwalks at the landing site (side view). Pure, no DOM, so it runs in Node tests.
// Three EVAs (extra-vehicular activities). Walk out from the base, work at targets, get back to the airlock
// before the suit's oxygen runs out. What was packed in Mission 2 changes what you can do, and the fuel left
// at touchdown (plus any made from ice here) is what Mission 4 needs to fly home.
// Units: metres, seconds. Uses Landing.makeTerrain / Landing.heightAt for the ground.
const SURFACE = {
  o2Time: 60,           // seconds of suit oxygen on a full tank, at a normal pace
  walk: 28, rover: 70,  // metres per second (game speed: a moonwalk takes seconds, not minutes)
  reach: 7,             // how close you must be to work at a target or use the airlock
  dust: 1.15,           // oxygen use multiplier from dust (filters remove it)
  leakDrain: 1.2,       // extra % per second while the suit leaks
  refill: 90,           // % oxygen after an EVA without solar panels or batteries (with them: 100)
  stormWarn: 5,         // EVA 3: seconds in, a solar storm warning...
  stormIn: 16,          // ...and it hits this many seconds later (enough to finish nearby work, if quick)
  returnFuel: 20,       // % of lander fuel Mission 4 needs to lift off and fly home
  airlock: 0.8,         // seconds stepping out of the airlock at the start of each EVA
  hopV: 22, g: 24,       // hop: game-speed arc (about 10 m high, 1.8 s), real Moon gravity would feel too slow
};

const Surface = (function () {
  const Land = typeof Landing !== 'undefined' ? Landing : require('./landing.js').Landing;

  // Targets of each EVA, at distances from the base. need: the cargo item the work requires.
  function evaTargets(s, n) {
    const ice = !!s.T.shadow, b = s.base, side = () => (s.sides && s.sides[n]) || 1; // each walk goes left or right of the base
    if (n === 0) return [
      ...(s.hard ? [{ id: 'leg', name: 'Bent landing leg', game: 'hold', x: b - 16, time: 4, points: 0, need: 'repair', fix: true, fact: 'Apollo landers had crushable aluminium honeycomb in their legs to soak up a hard landing.' }] : []),
      { id: 'seismo', name: 'Seismometer', game: 'level', x: b + side('seismo') * 120, time: 1.5, points: 10, fact: 'Apollo seismometers listened for moonquakes until 1977. The Moon rang like a bell for an hour after big impacts.' },
      { id: 'rockA', name: 'Rock sample', game: 'timing', x: b + side('rockA') * 260, time: 3, points: 5, fact: 'The six Apollo landings brought back 382 kg of Moon rock. Scientists still study it today.' },
      { id: 'rockB', name: 'Rock sample', game: 'timing', x: b + side('rockB') * 390, time: 3, points: 5, fact: 'Moon rocks are about the same age as the oldest rocks on Earth: some are 4.4 billion years old.' },
    ];
    if (n === 1) return ice
      ? [{ id: 'ice', name: 'Ice at the crater edge', game: 'drill', x: b + 380, time: 6, points: 20, need: 'science', fuel: 9, fact: 'In 2009 NASA crashed the LCROSS probe into a shadowed crater near the south pole and found water ice in the plume.' }]
      : [{ id: 'oven', name: 'Oxygen from soil', game: 'drill', x: b + side('oven') * 90, time: 5, points: 5, fuel: 2, fact: 'Moon soil is about 40% oxygen by mass, locked inside the minerals. Heating it can set some free.' },
        { id: 'ejecta', name: 'Old crater rock', game: 'timing', x: b + side('ejecta') * 380, time: 5, points: 15, fact: 'Big impacts throw out rock from deep down, so a crater rim is a window into the inside of the Moon.' }];
    return [{ id: 'core', name: 'Deep core sample', game: 'drill', x: b + side('core') * 180, time: 5, points: 15, need: 'science', fact: 'Apollo drive tubes kept the soil layers in order, like a history book of the Moon written in dust.' }];
  }

  // plan: { site (with .profile for real terrain), items: Set or array of ids, fuel, hard, flare }.
  function startSurface(plan, rng, cfg = SURFACE) {
    const items = new Set(plan.items || []);
    const T = Land.makeTerrain(plan.site, rng);
    // Ice sites: the base sits a walk away from the shadowed crater, so the ice is in reach on foot.
    const base = T.shadow ? Math.max(420, T.shadow.a - 380) : 700; // room for targets on both sides
    // A flat pad under the base (the lander and habitat sit level), blending into the hills around it.
    const i0 = Math.round(base / T.step), wFlat = Math.round(45 / T.step), wBlend = Math.round(25 / T.step), lvl = T.h[i0];
    for (let i = Math.max(0, i0 - wFlat - wBlend); i <= Math.min(T.h.length - 1, i0 + wFlat + wBlend); i++) {
      const dd = Math.abs(i - i0);
      T.h[i] = dd <= wFlat ? lvl : T.h[i] + (lvl - T.h[i]) * (1 - (dd - wFlat) / wBlend);
    }
    T.boulders = T.boulders.filter((b) => Math.abs(b.x - base) > 50);
    const s = {
      cfg, site: plan.site, T, base, has: (id) => items.has(id), items: [...items], hard: !!plan.hard, flare: plan.flare || null,
      x: base, hop: 0, vy: 0, dir: 1, eva: 0, phase: 'base', t: 0, evaT: 0, o2: 100, health: 100,
      sides: (() => { const a = rng() < 0.5 ? -1 : 1; return [a, -a, rng() < 0.5 ? -1 : 1]; })(), // walk 1 and 2 go opposite ways
      fuel: Number.isFinite(plan.fuel) ? plan.fuel : 17, science: 0, targets: [], work: null, leak: false, leakDone: false,
      storm: null, results: [], status: 'playing', msg: '', log: [], collected: [],
    };
    return s;
  }

  const atBase = (s) => Math.abs(s.x - s.base) <= s.cfg.reach;
  const near = (s) => s.targets.find((g) => !g.done && Math.abs(g.x - s.x) <= s.cfg.reach) || null;
  function say(s, m) { s.msg = m; s.log.push(m); }

  // Leave the airlock for the next EVA.
  function startEva(s) {
    if (s.status !== 'playing' || s.phase !== 'base' || s.eva > 2) return false;
    s.phase = 'out'; s.evaT = 0; s.targets = evaTargets(s, s.eva); s.work = null; s.leak = false; s.storm = null; s.taped = false; s.patching = 0;
    say(s, `EVA ${s.eva + 1}: ${s.targets.map((g) => g.name).join(', ')}.`);
    return true;
  }

  // Back into the airlock (or carried back with an empty tank).
  function endEva(s, ok, why) {
    const required = s.targets.filter((g) => !g.optional);
    const done = required.filter((g) => g.done).length;
    s.results.push({ eva: s.eva, ok: ok && done === required.length, done, of: required.length, why });
    if (s.storm && !s.storm.hit) { // came in before the storm: shelter decides
      s.storm.hit = true;
      if (!s.has('shield')) { s.health -= 15; say(s, 'Storm passed. The habitat walls are thin: crew health -15.'); } else say(s, 'Storm passed. Safe behind the water-wall shelter.');
    }
    s.eva++; s.phase = 'base'; s.x = s.base; s.hop = 0; s.vy = 0; s.work = null;
    s.o2 = s.has('solar') || s.has('batteries') ? 100 : s.cfg.refill;
    if (s.has('medkit') && s.health < 100) s.health = Math.min(100, s.health + 20);
    if (s.eva > 2) { s.status = 'end'; s.phase = 'done'; }
    return true;
  }

  // Minigames while working at a target:
  //  timing (rocks): a marker swings across a bar; press E while it is in the green zone, 3 hits.
  //  level (seismometer): keep the drifting bubble in the middle with LEFT/RIGHT for 1.5 s.
  //  drill (ice, core, soil oxygen): hold E to drill; let go before the drill overheats (a jam loses progress).
  //  hold (landing leg): just keep working.
  const zoneAt = (w) => ({ c: 0.5 + 0.28 * Math.sin(w.hits * 2.3 + 1), r: w.g.id === 'ejecta' ? 0.08 : 0.11 });
  function startWork(s, g) {
    s.work = { g, t: 0, m: 0, mv: 1, hits: 0, need: 3, bubble: 0.6, hold: 0, prog: 0, heat: 0, flash: null };
  }
  // E: start work at a target, hit in the timing game, or enter the airlock at the base.
  function act(s) {
    if (s.status !== 'playing') return false;
    if (s.phase === 'base') return startEva(s);
    const w = s.work;
    if (w) {
      if (w.g.game !== 'timing') return false;
      const z = zoneAt(w);
      if (Math.abs(w.m - z.c) <= z.r) { w.hits++; w.flash = { ok: true, t: s.t }; if (w.hits >= w.need) complete(s, w.g); }
      else { w.flash = { ok: false, t: s.t }; s.o2 = Math.max(0, s.o2 - 1.5); } // a miss costs a breath of oxygen
      return true;
    }
    const g = near(s);
    if (g) {
      if (g.need && !s.has(g.need)) { say(s, g.need === 'science' ? `${g.name}: needs the science kit, and we did not pack it.` : `${g.name}: needs the repair kit.`); g.done = true; g.skipped = true; return false; }
      startWork(s, g);
      return true;
    }
    if (atBase(s)) return endEva(s, true, 'back in the airlock');
    return false;
  }
  // Space while working: give up on this target for now.
  function cancelWork(s) { if (!s.work) return false; s.work = null; return true; }

  function complete(s, g) {
    g.done = true; s.work = null;
    s.science += g.points;
    const fuel = g.fuel ? g.fuel * (s.has('solar') ? 1.4 : 1) : 0;
    s.fuel += fuel;
    s.collected.push({ id: g.id, x: g.x, at: s.t, points: g.points, fuel }); // for the HUD bag and the reward pop
    say(s, fuel ? `${g.name}: done. +${fuel.toFixed(0)}% fuel for the trip home.` : `${g.name}: done${g.points ? `. +${g.points} science` : ''}.`);
    say(s, g.fact);
  }

  // R: patch a suit leak, one press at a time. Repair kit: 4 presses, sealed. Without it: 8 presses of tape,
  // and the tape only slows the leak.
  function patch(s) {
    if (!s.leak) return false;
    const need = s.has('repair') ? 4 : 8;
    s.patching = (s.patching || 0) + 1;
    if (s.patching >= need) {
      s.leak = false; s.leakDone = true; s.patching = 0;
      if (!s.has('repair')) { s.taped = true; say(s, 'Taped up. It still leaks a little.'); } else say(s, 'Leak patched.');
    }
    return true;
  }

  // input: { left, right, hop }
  function stepSurface(s, dt, input) {
    if (s.status !== 'playing' || s.phase !== 'out') return;
    const c = s.cfg;
    s.t += dt; s.evaT += dt;
    if (s.evaT < c.airlock) return; // the airlock cycles and the astronaut steps out
    // Oxygen: steady use, more in dust (filters help) and much more with a leak.
    s.o2 -= (100 / c.o2Time) * (s.has('filters') ? 1 : c.dust) * dt + (s.leak ? c.leakDrain * dt : s.taped ? c.leakDrain * 0.3 * dt : 0);
    // EVA 2: a suit leak 20 s in. EVA 3: the solar storm.
    if (s.eva === 1 && !s.leak && !s.leakDone && s.evaT > 10) { s.leak = true; say(s, s.has('repair') ? 'Suit leak! Press R a few times to patch it.' : 'Suit leak! No repair kit: press R again and again to tape it.'); }
    if (s.eva === 2 && !s.storm && s.evaT > c.stormWarn) { s.storm = { at: s.evaT + c.stormIn, hit: false }; say(s, 'Solar storm warning! Get back inside before it hits.'); }
    if (s.storm && !s.storm.hit && s.evaT >= s.storm.at) {
      s.storm.hit = true;
      const p = s.flare && /^X/.test(s.flare.classType) ? 1.5 : 1;
      const hit = Math.round(40 * p); s.health -= hit; say(s, `The storm caught us outside: crew health -${hit}.`);
    }
    // Working holds you still; otherwise walk or drive, with low-gravity hops.
    if (s.work) {
      const w = s.work, g = w.g;
      w.t += dt;
      if (g.game === 'timing') { // the marker swings faster with each hit
        w.m += w.mv * (0.9 + w.hits * 0.3) * dt;
        if (w.m > 1) { w.m = 2 - w.m; w.mv = -1; } else if (w.m < 0) { w.m = -w.m; w.mv = 1; }
      } else if (g.game === 'level') { // the bubble drifts; LEFT/RIGHT push it back
        w.bubble += (Math.sin(w.t * 1.7) * 0.5 + Math.sin(w.t * 0.6 + 2) * 0.35) * dt + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 1.3 * dt;
        w.bubble = Math.max(-1, Math.min(1, w.bubble));
        w.hold = Math.abs(w.bubble) < 0.18 ? w.hold + dt : Math.max(0, w.hold - dt * 0.5);
        if (w.hold >= g.time) complete(s, g);
      } else if (g.game === 'drill') { // hold E to drill; heat builds up; a jam loses progress
        if (input.act) { w.prog += dt / g.time * 1.6; w.heat += dt * 0.45; } else w.heat = Math.max(0, w.heat - dt * 0.8);
        if (w.heat >= 1) { w.heat = 0.55; w.prog = Math.max(0, w.prog - 0.15); w.flash = { ok: false, t: s.t }; say(s, 'Drill jammed! Let it cool before drilling on.'); }
        if (w.prog >= 1) complete(s, g);
      } else if (w.t >= g.time) complete(s, g); // hold: just keep working
      if (input.hop) cancelWork(s);
    } else {
      const v = (s.has('rover') ? c.rover : c.walk) * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
      if (v) s.dir = Math.sign(v);
      s.x = Math.max(20, Math.min(s.T.h.length * s.T.step - 20, s.x + v * dt));
      if (input.hop && s.hop === 0 && !s.has('rover')) s.vy = c.hopV;
      if (s.hop > 0 || s.vy > 0) { s.vy -= c.g * dt; s.hop = Math.max(0, s.hop + s.vy * dt); if (s.hop === 0) s.vy = 0; }
    }
    if (s.o2 <= 0) { s.o2 = 0; say(s, 'Oxygen empty! The crew pulls you back in.'); endEva(s, false, 'out of oxygen'); }
  }

  // End result: science, fuel for the trip home, crew health -> stars.
  function score(s) {
    const fuelOk = s.fuel >= s.cfg.returnFuel;
    const stars = 1 + (s.science >= 35 ? 1 : 0) + (fuelOk && s.health >= 60 ? 1 : 0);
    return { stars, science: s.science, fuel: s.fuel, fuelOk, health: s.health, evasOk: s.results.filter((r) => r.ok).length };
  }

  const heightAt = (s, x) => Land.heightAt(s.T, x);
  return { startSurface, startEva, act, patch, cancelWork, zoneAt, stepSurface, score, near, atBase, heightAt, evaTargets };
})();

if (typeof module !== 'undefined') module.exports = { SURFACE, Surface };
