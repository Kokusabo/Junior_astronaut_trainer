// Run with: node test/game.test.js
const assert = require('node:assert/strict');
const Game = require('../src/game.js');
const { FAILURES, SUPPLIES } = require('../src/failures.js');
const { LEVELS } = require('../src/levels.js');

// Data: every failure has a real supply, and every level can be solved with its stock.
for (const [id, f] of Object.entries(FAILURES)) {
  assert.ok(SUPPLIES[f.fix], `${id} has no supply`);
}
LEVELS.forEach((lvl, i) => {
  for (const id of lvl.pool) {
    assert.ok(FAILURES[id], `level ${i} lists unknown failure ${id}`);
    assert.ok(lvl.supplies[FAILURES[id].fix] > 0, `level ${i} has no ${FAILURES[id].fix} for ${id}`);
  }
});

// Checks: one at a time, only on systems in the level, and a check takes fuel.
{
  const s = Game.start(LEVELS, 0, 1);
  assert.equal(Game.startCheck(s, 'coolant_overload'), false, 'system not in this level');
  assert.equal(Game.startCheck(s, 'fuel_leak'), true);
  assert.equal(Game.startCheck(s, 'toilet_clog'), false, 'second check should be blocked');
  assert.equal(s.fuel, 100 - LEVELS[0].checkFuelCost);
}

// Checklist: pass marks ok (no re-check); fail opens the fault; repair needs a re-check before launch.
{
  const pass = Game.start(LEVELS.map((l) => ({ ...l, failureChance: 0 })), 0, 1);
  Game.startCheck(pass, 'fuel_leak');
  Game.tick(pass, 10, FAILURES);
  assert.equal(pass.systems.fuel_leak, 'ok');
  assert.equal(Game.canCheck(pass, 'fuel_leak'), false, 'ok systems are not re-checked');

  const fail = Game.start(LEVELS.map((l) => ({ ...l, failureChance: 1 })), 0, 1);
  Game.startCheck(fail, 'engine_bolts');
  Game.tick(fail, 10, FAILURES);
  assert.equal(fail.active, 'engine_bolts');
  assert.equal(fail.systems.engine_bolts, 'fault');
  Game.applySupply(fail, FAILURES, 'torque_wrench');
  fail.repair.done = true; fail.repair.success = true;
  Game.tick(fail, 0.1, FAILURES);
  assert.equal(fail.systems.engine_bolts, 'repaired');
  assert.equal(Game.canCheck(fail, 'engine_bolts'), true);
}

// Launch: blocked until every system is ok; then go/no-go on the limits; stars for time and stability.
{
  const s = Game.start(LEVELS, 0, 1);
  assert.equal(Game.requestLaunch(s), false);
  for (const id of Object.keys(s.systems)) s.systems[id] = 'ok';
  assert.equal(Game.requestLaunch(s), true);
  assert.equal(s.status, 'won');
  assert.equal(s.stars, 3);

  const low = Game.start(LEVELS, 0, 1);
  for (const id of Object.keys(low.systems)) low.systems[id] = 'ok';
  low.stability = LEVELS[0].minStability - 1;
  Game.requestLaunch(low);
  assert.equal(low.status, 'lost');
  assert.ok(low.reason.startsWith('NO-GO'));

  const late = Game.start(LEVELS, 0, 1);
  for (const id of Object.keys(late.systems)) late.systems[id] = 'ok';
  late.timeLeft = 1;
  late.stability = 70;
  Game.requestLaunch(late);
  assert.equal(late.stars, 1);
}

// Instant repair still works for a failure without a mini-game (data-driven, so test with a copy).
{
  const s = Game.start(LEVELS, 0, 1);
  const noGame = { ...FAILURES, toilet_clog: { ...FAILURES.toilet_clog, minigame: undefined } };
  s.active = 'toilet_clog';
  s.supplies.antenna_relay = 1;
  const r = Game.applySupply(s, noGame, 'plumbing_kit');
  assert.equal(r.fixed, true);
  assert.equal(s.active, null);
  assert.equal(s.supplies.plumbing_kit, LEVELS[0].supplies.plumbing_kit - 1);
}

// Mini-game repair: right supply is used and starts the game; failure stays open until it ends.
// A win repairs (system needs a re-check). A loss does NOT repair: fault stays, stability drops.
for (const success of [true, false]) {
  const s = Game.start(LEVELS, 0, 1);
  s.systems.fuel_leak = 'fault';
  s.active = 'fuel_leak';
  const r = Game.applySupply(s, FAILURES, 'sealant');
  assert.equal(r.repairing, true);
  assert.equal(s.supplies.sealant, LEVELS[0].supplies.sealant - 1);
  assert.equal(Game.applySupply(s, FAILURES, 'sealant').ok, false, 'no second repair while one runs');
  s.repair.done = true;
  s.repair.success = success;
  Game.tick(s, 0.1, FAILURES);
  assert.equal(s.repair, null);
  if (success) {
    assert.equal(s.active, null);
    assert.equal(s.systems.fuel_leak, 'repaired');
    assert.equal(Math.round(s.stability), 100);
  } else {
    assert.equal(s.active, 'fuel_leak', 'lost mini-game leaves the fault open');
    assert.equal(s.systems.fuel_leak, 'fault');
    assert.equal(s.resolved, 0);
    assert.ok(Math.abs(s.stability - (100 - Game.MISS_PENALTY)) < 1);
    assert.equal(Game.applySupply(s, FAILURES, 'sealant').repairing, true, 'can retry with another part');
  }
}

// Every level has its own failures and its own mini-game types: nothing repeats between levels.
{
  const Minigames = require('../src/minigames.js');
  const seenGames = new Set();
  const seenFailures = new Set();
  LEVELS.forEach((lvl, i) => {
    for (const id of lvl.pool) {
      assert.ok(!seenFailures.has(id), `${id} appears in two levels`);
      seenFailures.add(id);
      const g = Game.minigameFor(FAILURES[id], i);
      assert.ok(!seenGames.has(g), `mini-game ${g} appears twice (level ${i + 1})`);
      seenGames.add(g);
      assert.ok(Minigames.create(g, () => 0.3, i), `unknown mini-game ${g}`);
    }
  });
  assert.equal(seenGames.size, 12);
}

// Stability and fuel carry over between levels.
{
  const s = Game.start(LEVELS, 1, 1, [], { stability: 63, fuel: 48 });
  assert.equal(s.stability, 63);
  assert.equal(s.fuel, 48);
}

// Mini-games: win and lose paths with a fixed rng.
const Minigames = require('../src/minigames.js');
const rng = (v) => () => v;
{
  const g = Minigames.create('find_leak', rng(0.5), 0); // leak = floor(0.5*6) = 3
  g.input(0); g.input(1);
  assert.ok(g.done && !g.success, 'two wrong taps lose');
  const h = Minigames.create('find_leak', rng(0.5), 0);
  h.input(h.leak);
  assert.ok(h.done && h.success);
  const t = Minigames.create('find_leak', rng(0.5), 0);
  t.step(11);
  assert.ok(t.done && !t.success, 'timeout loses');
}
{
  const g = Minigames.create('bolts', rng(0.5), 0);
  g.input(g.order[0]);
  assert.equal(g.pos, 0, 'input ignored while order is shown');
  g.step(3.1);
  g.order.forEach((b) => g.input(b));
  assert.ok(g.done && g.success);
  const w = Minigames.create('bolts', rng(0.5), 0);
  w.step(3.1);
  w.input((w.order[0] + 1) % w.n);
  assert.ok(w.done && !w.success, 'wrong bolt loses');
}
{
  const g = Minigames.create('pressure', rng(0.5), 0);
  for (let i = 0; i < 3; i++) { g.step(0.01); g.pos = g.center; g.input(); }
  assert.ok(g.done && g.success);
  const m = Minigames.create('pressure', rng(0.5), 0);
  for (let i = 0; i < 3; i++) { m.step(0.01); m.pos = m.center < 0.5 ? 1 : 0; m.input(); }
  assert.ok(m.done && !m.success, 'three misses lose');
}

// Wrong supply costs stability and stock, and leaves the failure active.
{
  const s = Game.start(LEVELS, 0, 1);
  s.active = 'fuel_leak';
  const r = Game.applySupply(s, FAILURES, 'plumbing_kit');
  assert.equal(r.fixed, false);
  assert.equal(s.active, 'fuel_leak');
  assert.equal(s.stability, 95);
  assert.equal(s.supplies.plumbing_kit, LEVELS[0].supplies.plumbing_kit - 1);
}

// Countdown reaching zero before launch is a loss, even with everything green.
{
  const s = Game.start(LEVELS, 0, 1);
  for (const id of Object.keys(s.systems)) s.systems[id] = 'ok';
  s.timeLeft = 0.05;
  Game.tick(s, 0.1, FAILURES);
  assert.equal(s.status, 'lost');
}

// Nothing can be repaired when no failure is active.
{
  const s = Game.start(LEVELS, 0, 1);
  assert.equal(Game.applySupply(s, FAILURES, 'sealant').ok, false);
}

// Events: DONKI rows become events (C dropped, M small, X adds a check penalty).
const { GROUND_EVENTS, flaresToEvents } = require('../src/events.js');
{
  const evs = flaresToEvents([
    { classType: 'C3.1', peakTime: '2024-10-02T10:00Z' },
    { classType: 'M1.5', peakTime: '2024-10-02T11:00Z' },
    { classType: 'X9.0', peakTime: '2024-10-03T12:18Z' },
  ]);
  assert.equal(evs.length, 2);
  assert.equal(evs[0].effect.stability, -4);
  assert.deepEqual(evs[1].effect, { stability: -8, checkPenalty: 3 });
  assert.ok(evs[1].text.includes('X9.0') && evs[1].text.includes('2024-10-03'));
  assert.deepEqual(flaresToEvents(null), []);
}

// EONET storms become weather holds; bad rows are skipped, not crashed on.
{
  const { stormsToEvents } = require('../src/events.js');
  const evs = stormsToEvents({ events: [
    { title: 'Typhoon Cempaka', geometry: [{ date: '2026-11-06T00:00:00Z', coordinates: [140, 18] }, { date: '2026-11-07T00:00:00Z', coordinates: [144.2, 19.1] }] },
    { title: 'Tropical Storm Pena', geometry: [{ date: '2026-11-06T18:00:00Z', coordinates: [-149.6, -11.2] }] },
    { title: 'No track yet' },
  ] });
  assert.equal(evs.length, 2);
  assert.ok(evs[0].text.includes('19.1N 144.2E') && evs[0].text.includes('2026-11-07'), evs[0].text);
  assert.ok(evs[1].text.includes('11.2S 149.6W'));
  assert.deepEqual(evs[0].effect, { timeLeft: -8, stability: -3 });
  assert.deepEqual(stormsToEvents(null), []);
}

// OSDR search hits become research facts; hits without an id or title are skipped.
{
  const { studiesToFacts } = require('../src/events.js');
  const facts = studiesToFacts({ hits: { hits: [
    { _source: { Accession: 'OSD-342', 'Study Title': 'Targeting myostatin/activin A protects  against bone loss', Mission: { Name: 'SpaceX-19' } } },
    { _source: { Accession: 'OSD-1' } },
    { _source: { 'Study Identifier': 'OSD-9', 'Study Title': 'x'.repeat(200) } },
  ] } });
  assert.equal(facts.length, 2);
  assert.ok(facts[0].includes('OSD-342') && facts[0].includes('mission SpaceX-19') && facts[0].includes('protects against'));
  assert.ok(facts[1].includes('...') && facts[1].length < 220);
  assert.deepEqual(studiesToFacts(undefined), []);
}

// Saved OSDR copy: every study converts to a fact (guards the generated data file).
{
  const { studiesToFacts } = require('../src/events.js');
  const snap = require('../data/osdr-studies.js');
  const facts = studiesToFacts(snap);
  assert.equal(facts.length, snap.hits.hits.length);
  assert.ok(facts.length >= 10 && facts.every((f) => /OSD-\d+/.test(f)));
}

// Applying events: check penalty lands on the next check only; supply truck adds one part.
{
  const s = Game.start(LEVELS, 0, 1, []);
  Game.applyEvent(s, { text: 'x', effect: { stability: -8, checkPenalty: 3, timeLeft: -10 } });
  assert.equal(s.stability, 92);
  assert.equal(s.timeLeft, LEVELS[0].countdown - 10);
  Game.startCheck(s, 'fuel_leak');
  assert.equal(s.checking, LEVELS[0].checkTime + 3);
  assert.equal(s.checkPenalty, 0);
  const before = Object.values(s.supplies).reduce((x, y) => x + y, 0);
  Game.applyEvent(s, GROUND_EVENTS[1]);
  assert.equal(Object.values(s.supplies).reduce((x, y) => x + y, 0), before + 1);
}

// Events fire only after clear checks, and the same seed gives the same events.
{
  const lv = LEVELS.map((l) => ({ ...l, failureChance: 0, eventChance: 1 }));
  const s = Game.start(lv, 0, 7, GROUND_EVENTS);
  Game.startCheck(s, 'fuel_leak');
  Game.tick(s, lv[0].checkTime + 0.01, FAILURES);
  assert.ok(s.lastEvent, 'clear check with eventChance 1 should fire an event');
  const f = Game.start(LEVELS.map((l) => ({ ...l, failureChance: 1, eventChance: 1 })), 0, 7, GROUND_EVENTS);
  Game.startCheck(f, 'fuel_leak');
  Game.tick(f, LEVELS[0].checkTime + 0.01, FAILURES);
  assert.equal(f.lastEvent, null, 'no event when the check finds a failure');
}

{
  const w = Minigames.create('wires', rng(0.5), 0);
  for (let c = 0; c < w.n; c++) { w.input(c); w.input(w.n + w.right.indexOf(c)); }
  assert.ok(w.done && w.success, 'matching every color wins');
  const x = Minigames.create('wires', rng(0.5), 0);
  for (let k = 0; k < 2; k++) { x.input(0); x.input(x.n + x.right.findIndex((c) => c !== 0)); }
  assert.ok(x.done && !x.success, 'two wrong links lose');
}
{
  const sw = Minigames.create('switches', rng(0.3), 0);
  // Solve: sweep left to right, flipping i whenever state[i] differs from target[i].
  for (let i = 0; i < sw.n && !sw.done; i++) if (sw.state[i] !== sw.target[i]) sw.input(i);
  assert.ok(sw.done && sw.success, 'left-to-right sweep solves the valve puzzle');
  const bad = Minigames.create('switches', rng(0.3), 0);
  while (!bad.done) bad.input(bad.n - 1); // flipping only the last switch cannot fix the others
  assert.ok(!bad.success);
}
{
  const f = Minigames.create('frequency', rng(0.5), 0);
  for (let k = 0; k < 400 && !f.done; k++) { f.step(0.02); f.dial = f.signal; }
  assert.ok(f.done && f.success, 'staying on the signal locks it');
  const off = Minigames.create('frequency', rng(0.5), 0);
  for (let k = 0; k < 800 && !off.done; k++) { off.step(0.02); off.dial = off.signal > 0.5 ? 0 : 1; }
  assert.ok(off.done && !off.success, 'never in band times out');
}

// New mini-games: each can be won by correct play and lost by bad play.
{
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Clogs: clearing every clog as it appears wins; ignoring them overflows.
  const c = Minigames.create('clogs', r, 0);
  for (let k = 0; k < 2000 && !c.done; k++) { c.step(0.05); c.holes.forEach((v, i) => { if (v >= 0) c.input(i); }); }
  assert.ok(c.done && c.success, 'clearing clogs wins');
  const c2 = Minigames.create('clogs', r, 0);
  for (let k = 0; k < 2000 && !c2.done; k++) c2.step(0.05);
  assert.ok(c2.done && !c2.success, 'ignored clogs overflow');
  // Pump: tapping whenever pressure dips below the band wins; never tapping times out; over-pumping bursts.
  const p = Minigames.create('pump', r, 0);
  for (let k = 0; k < 2000 && !p.done; k++) { p.step(0.05); if (p.p < p.lo + 0.05) p.input(); }
  assert.ok(p.done && p.success, 'steady pumping wins');
  const p2 = Minigames.create('pump', r, 0);
  for (let k = 0; k < 50 && !p2.done; k++) p2.input();
  assert.ok(p2.done && !p2.success, 'over-pumping bursts three times');
  // Pipes: a depth-first solver finds rotations that connect inlet to outlet, then plays them as taps.
  const rotate = (m) => ((m << 1) & 15) | (m >> 3);
  const DIRS = { 1: [-1, 0, 4], 2: [0, 1, 8], 4: [1, 0, 1], 8: [0, -1, 2] };
  function solvePipes(g) {
    const want = g.tiles.map((row) => row.slice());
    const used = new Set();
    function go(r, c, from) {
      const key = `${r},${c}`;
      if (used.has(key)) return false;
      used.add(key);
      let m = g.tiles[r][c];
      for (let k = 0; k < 4; k++, m = rotate(m)) {
        if (!(m & from)) continue;
        want[r][c] = m;
        for (const bit of [1, 2, 4, 8]) {
          if (bit === from || !(m & bit)) continue;
          if (r === g.outRow && c === g.C - 1 && bit === 2) return true;
          const [dr, dc, opp] = DIRS[bit];
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < g.R && nc >= 0 && nc < g.C && go(nr, nc, opp)) return true;
        }
      }
      used.delete(key);
      return false;
    }
    return go(g.inRow, 0, 8) ? want : null;
  }
  for (let level = 0; level < 3; level++) for (let k = 0; k < 30; k++) {
    const pg = Minigames.create('pipes', r, level);
    assert.ok(!pg.solved(), 'pipe puzzle never starts solved');
    const want = solvePipes(pg);
    assert.ok(want, 'every pipe puzzle has a solution');
    for (let i = 0; i < pg.R * pg.C && !pg.done; i++) {
      const rr = Math.floor(i / pg.C), cc = i % pg.C;
      for (let t = 0; t < 4 && pg.tiles[rr][cc] !== want[rr][cc] && !pg.done; t++) pg.input(i);
    }
    assert.ok(pg.done && pg.success, 'playing the solution wins');
  }
  const pp2 = Minigames.create('pipes', r, 2);
  pp2.step(31);
  assert.ok(pp2.done && !pp2.success, 'pipes time out');
  // Sensors: tapping the bad one 3 times wins; two wrong taps lose.
  const se = Minigames.create('sensors', r, 2);
  for (let k = 0; k < 3; k++) se.input(se.bad);
  assert.ok(se.done && se.success);
  assert.ok(se.values.every((v, i) => i === se.bad || (v > se.lo && v < se.hi)), 'only one reading out of band');
  const se2 = Minigames.create('sensors', r, 2);
  se2.input((se2.bad + 1) % se2.n); se2.input((se2.bad + 2) % se2.n);
  assert.ok(se2.done && !se2.success);
  // Fuse: the answer is the smallest fuse that carries the total current.
  const fu = Minigames.create('fuse', r, 2);
  assert.ok(fu.fuses[fu.answer] >= fu.total && (fu.answer === 0 || fu.fuses[fu.answer - 1] < fu.total));
  for (let k = 0; k < 3; k++) fu.input(fu.answer);
  assert.ok(fu.done && fu.success);
  const fu2 = Minigames.create('fuse', r, 2);
  fu2.input((fu2.answer + 1) % 6); fu2.input((fu2.answer + 2) % 6);
  assert.ok(fu2.done && !fu2.success);
  // Balance: venting the hottest loop keeps all cool until time runs out; doing nothing overheats.
  const b = Minigames.create('balance', r, 2);
  for (let k = 0; k < 400 && !b.done; k++) { b.step(0.05); if (k % 6 === 0) b.input(b.heat.indexOf(Math.max(...b.heat))); }
  assert.ok(b.done && b.success, 'venting keeps the loops alive');
  const b2 = Minigames.create('balance', r, 2);
  for (let k = 0; k < 400 && !b2.done; k++) b2.step(0.05);
  assert.ok(b2.done && !b2.success, 'no venting overheats');
}

// Pad status lights: off outside the level, grey unchecked, red fault, amber in repair, yellow needs re-check, green ok.
const Render = require('../src/render.js');
{
  const s = Game.start(LEVELS, 0, 1);
  assert.equal(Render.lampState('coolant_overload', s), 'off');
  assert.equal(Render.lampState('fuel_leak', s), 'unknown');
  s.systems.fuel_leak = 'fault';
  s.active = 'fuel_leak';
  assert.equal(Render.lampState('fuel_leak', s), 'fail');
  Game.applySupply(s, FAILURES, 'sealant');
  assert.equal(Render.lampState('fuel_leak', s), 'repair');
  s.repair.done = true; s.repair.success = true;
  Game.tick(s, 0.1, FAILURES);
  assert.equal(Render.lampState('fuel_leak', s), 'verify');
  s.systems.fuel_leak = 'ok';
  assert.equal(Render.lampState('fuel_leak', s), 'ok');
}

// Bot that always picks the right part and wins mini-games after 3 s (a decent human).
// Pixel font: every glyph is 7 rows of equal width, and text width adds 1px spacing between glyphs.
{
  const PixelText = require('../src/pixeltext.js');
  for (const [ch, rows] of Object.entries(PixelText.glyphs)) {
    assert.ok(rows.length === 7 || rows.length === 9, `glyph ${ch} rows`);
    assert.ok(rows.every((r) => r.length === rows[0].length && /^[.#]+$/.test(r)), `glyph ${ch} width`);
  }
  assert.equal(PixelText.measure('AB'), 11);
  assert.ok(PixelText.glyphs.g.length === 9 && PixelText.glyphs.a.length === 7, 'descenders only where needed');
  assert.deepEqual(PixelText.wrap('one two three', PixelText.measure('one two')), ['one two', 'three']);
  assert.deepEqual(PixelText.wrap('supercalifragilistic x', 10), ['supercalifragilistic', 'x'], 'long word keeps its own line');
}

// Same seed gives the same run; a run always ends; a good player wins most runs.
function autoplay(levelIndex, seed) {
  const s = Game.start(LEVELS, levelIndex, seed, GROUND_EVENTS);
  for (let t = 0; s.status === 'playing' && t < 10000; t++) {
    if (s.repair && s.repair.t3 === undefined) s.repair.t3 = 3;
    if (s.repair && (s.repair.t3 -= 0.1) <= 0) { s.repair.done = true; s.repair.success = true; }
    else if (s.active !== null && !s.repair) Game.applySupply(s, FAILURES, FAILURES[s.active].fix);
    else if (!Game.requestLaunch(s)) {
      const next = Object.keys(s.systems).find((id) => Game.canCheck(s, id));
      if (next) Game.startCheck(s, next);
    }
    Game.tick(s, 0.1, FAILURES);
  }
  return s;
}
const run1 = autoplay(0, 42);
const run2 = autoplay(0, 42);
assert.deepEqual(run1.log, run2.log);
assert.notEqual(run1.status, 'playing');
LEVELS.forEach((_, i) => {
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) if (autoplay(i, seed).status === 'won') wins++;
  console.log(`level ${i + 1}: good player wins ${wins}/200`);
  assert.ok(wins >= 140, `level ${i + 1} too hard for a good player`);
});

// Full mission with stability and fuel carried over: a good player (always the right part,
// mini-games won after 3 s) should finish all three levels in most runs.
{
  let wins = 0;
  for (let seed = 1; seed <= 150; seed++) {
    let carry = null;
    let ok = true;
    for (let i = 0; i < LEVELS.length && ok; i++) {
      const s = Game.start(LEVELS, i, seed * 7 + i, GROUND_EVENTS, carry);
      for (let t = 0; s.status === 'playing' && t < 10000; t++) {
        if (s.repair && s.repair.t3 === undefined) s.repair.t3 = 3;
        if (s.repair && (s.repair.t3 -= 0.1) <= 0) { s.repair.done = true; s.repair.success = true; }
        else if (s.active !== null && !s.repair) Game.applySupply(s, FAILURES, FAILURES[s.active].fix);
        else if (!Game.requestLaunch(s)) {
          const next = Object.keys(s.systems).find((id) => Game.canCheck(s, id));
          if (next) Game.startCheck(s, next);
        }
        Game.tick(s, 0.1, FAILURES);
      }
      ok = s.status === 'won';
      carry = { stability: s.stability, fuel: s.fuel };
    }
    if (ok) wins++;
  }
  console.log(`full mission: good player wins ${wins}/150`);
  assert.ok(wins >= 105, 'full mission too hard for a good player');
}

console.log('All first-mission tests passed.');
