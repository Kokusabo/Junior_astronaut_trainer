// Mission 3 (moonwalks) tests. Run with: node test/surface.test.js
const assert = require('node:assert/strict');
const { MOON_SITES } = require('../src/moon-data.js');
const NASA = require('../data/moon-nasa.js');
const { SURFACE, Surface } = require('../src/surface.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ESS = ['oxygen', 'water', 'food', 'habitat'];
const site = (id) => ({ ...MOON_SITES.find((x) => x.id === id), profile: NASA.terrain[id] });
const start = (id, items, extra = {}) => Surface.startSurface({ site: site(id), items: [...ESS, ...items], fuel: 17, ...extra }, mulberry32(5));

// A sensible player: walks to each target in order, works, patches leaks, runs home at the storm warning
// or when oxygen gets low, and enters the airlock.
function play(s) {
  for (let i = 0; i < 60 * 900 && s.status === 'playing'; i++) {
    if (s.phase === 'base') { Surface.act(s); continue; }
    if (s.leak) Surface.patch(s);
    const left = s.targets.filter((g) => !g.done);
    const speed = s.has('rover') ? SURFACE.rover : SURFACE.walk;
    const back = Math.abs(s.x - s.base) / speed;
    const job = left.length ? Math.abs(left[0].x - s.x) / speed + left[0].time + Math.abs(left[0].x - s.base) / speed : 0;
    const stormLeft = s.storm && !s.storm.hit ? s.storm.at - s.evaT : Infinity;
    const home = !left.length || s.o2 < back * 1.3 + 4 || (s.storm && !s.work && job + 2 > stormLeft);
    const goal = home ? s.base : left[0].x;
    if (!s.work && Math.abs(goal - s.x) <= SURFACE.reach - 1) { Surface.act(s); }
    // Minigames: hit E in the green zone, keep the bubble centred, drill but let it cool.
    const w = s.work, input = { right: !w && goal > s.x + 2, left: !w && goal < s.x - 2 };
    if (w && w.g.game === 'timing') { const z = Surface.zoneAt(w); if (Math.abs(w.m - z.c) < z.r * 0.6) Surface.act(s); }
    if (w && w.g.game === 'level') { input.left = w.bubble > 0.05; input.right = w.bubble < -0.05; }
    if (w && w.g.game === 'drill') input.act = w.heat < 0.8;
    Surface.stepSurface(s, 1 / 60, input);
  }
  return s;
}

// Oxygen runs out if you just wander: the EVA fails and the crew brings you back.
{
  const s = start('tranquility', []);
  Surface.act(s);
  for (let i = 0; i < 60 * 200 && s.eva === 0; i++) Surface.stepSurface(s, 1 / 60, { right: true });
  assert.equal(s.eva, 1);
  assert.equal(s.results[0].ok, false);
  assert.equal(s.x, s.base);
}
// Rover is faster; no science kit = no ice; solar panels make more fuel; shelter protects in the storm.
{
  const a = start('tranquility', []), b = start('tranquility', ['rover']);
  Surface.act(a); Surface.act(b);
  for (let i = 0; i < 60; i++) { Surface.stepSurface(a, 1 / 60, { right: true }); Surface.stepSurface(b, 1 / 60, { right: true }); }
  assert.ok(b.x - b.base > 2 * (a.x - a.base));
  const noKit = play(start('shackleton', ['repair'])), kit = play(start('shackleton', ['science', 'repair']));
  assert.ok(kit.fuel > noKit.fuel && kit.science > noKit.science);
  const sun = play(start('shackleton', ['science', 'repair', 'solar']));
  assert.ok(sun.fuel > kit.fuel);
  const shelter = play(start('tranquility', ['shield', 'repair'])), bare = play(start('tranquility', ['repair']));
  assert.ok(shelter.health > bare.health);
}
// Hard landing adds a repair task; a leak without the repair kit drains oxygen faster.
assert.ok(Surface.evaTargets(start('tranquility', [], { hard: true }), 0).some((g) => g.id === 'leg'));
{
  const a = start('tranquility', ['repair']), b = start('tranquility', []);
  for (const s of [a, b]) { Surface.act(s); for (let i = 0; i < 400 && s.phase === 'out'; i++) Surface.stepSurface(s, 1 / 60, {}); }
  // skip to EVA 2 quickly by forcing the phase
  for (const s of [a, b]) { s.eva = 1; s.phase = 'base'; s.o2 = 100; Surface.act(s); for (let i = 0; i < 60 * 30; i++) { if (s.leak) Surface.patch(s); Surface.stepSurface(s, 1 / 60, {}); } }
  assert.ok(a.o2 > b.o2 + 2 && !b.leak && b.taped, `repair ${a.o2} vs tape ${b.o2}`); // no kit: tape works, but still leaks a little
}

// Minigames: a timing miss costs oxygen, a hit counts; the drill jams when held too long; Space gives up.
{
  const s = start('tranquility', []); Surface.act(s); s.evaT = 1;
  const g = s.targets.find((x) => x.game === 'timing'); s.x = g.x; Surface.act(s);
  const z = Surface.zoneAt(s.work); s.work.m = z.c; Surface.act(s); assert.equal(s.work.hits, 1);
  const o2 = s.o2; s.work.m = (Surface.zoneAt(s.work).c + 0.5) % 1; Surface.act(s); assert.ok(s.o2 < o2);
  Surface.stepSurface(s, 1 / 60, { hop: true }); assert.equal(s.work, null);
  const d = start('shackleton', ['science']); d.eva = 1; d.phase = 'base'; Surface.act(d); d.evaT = 1; d.x = d.targets[0].x; Surface.act(d);
  for (let i = 0; i < 60 * 3; i++) Surface.stepSurface(d, 1 / 60, { act: true });
  assert.ok(d.log.some((m) => /jammed/.test(m)));
  // Targets end up on both sides of the base in some games.
  let left = 0, right = 0;
  for (let seed = 1; seed <= 20; seed++) { const b = Surface.startSurface({ site: site('tranquility'), items: ESS, fuel: 17 }, mulberry32(seed)); for (const t of Surface.evaTargets(b, 0)) { if (t.x < b.base) left++; else right++; } }
  assert.ok(left > 0 && right > 0);
}

// Every target has a real fact to tell when it is done.
for (const id of ['tranquility', 'shackleton']) for (let n = 0; n < 3; n++) for (const g of Surface.evaTargets(start(id, [], { hard: true }), n)) assert.ok(g.fact && g.fact.length > 20, g.id);

// Balance: a sensible player finishes all 3 EVAs at every site with typical cargo. The trip-home fuel goal is
// met at ice sites (ice -> fuel) and not at a dry site that arrived with little fuel: the trade-off is real.
const typical = ['shield', 'repair', 'science', 'solar'];
for (const m of MOON_SITES) {
  const s = play(start(m.id, typical));
  const r = Surface.score(s);
  console.log(`${m.name.padEnd(18)} EVAs ok ${r.evasOk}/3, science ${r.science}, fuel ${r.fuel.toFixed(1)}% (need ${SURFACE.returnFuel}), health ${r.health}, stars ${r.stars}`);
  assert.equal(s.status, 'end');
  assert.equal(r.evasOk, 3, `${m.id}: ${JSON.stringify(s.results)}`);
  if (m.ice) assert.ok(r.fuelOk, `${m.id}: ice site should make enough fuel`);
}
assert.equal(Surface.score(play(start('imbrium', typical, { fuel: 10 }))).fuelOk, false);
console.log('All mission 3 tests passed.');
