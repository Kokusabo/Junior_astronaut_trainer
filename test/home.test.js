// Mission 4 tests (back to Earth). Run with: node test/home.test.js
const assert = require('node:assert/strict');
const { MOON_LAUNCH, Launch } = require('../src/launch.js');
const { TEI, Tli } = require('../src/tli.js');
const Moon = require('../src/moon.js');
const { REENTRY, Reentry } = require('../src/reentry.js');
const { Dock } = require('../src/dock.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ascend = (seed, steer = true) => {
  const s = Launch.startLaunch(mulberry32(seed), MOON_LAUNCH);
  for (let i = 0; i < 4000 && s.status === 'flying'; i++) { const w = Launch.guidePitch(s.burnT, MOON_LAUNCH); Launch.stepLaunch(s, 0.05, steer ? { up: s.pitch < w - 2, down: s.pitch > w + 2 } : {}); }
  return s;
};
const teiBurn = (cfg) => {
  const s = Tli.startTli(cfg); let inT = 0;
  for (let i = 0; i < 20000 && s.status === 'orbit'; i++) { inT = Tli.windowIn(s) === 0 ? inT + 1 / 60 : 0; Tli.stepTli(s, 1 / 60, { burn: s.burning || inT >= 0.4 }); }
  return s;
};
const flyHome = (aim, fuel) => {
  const f = Moon.startFlight({ items: new Set() }, { fuelLeft: fuel, maneuvers: 0, mass: 600 }, mulberry32(3), 0, { home: true, duration: 30, events: [[0.35, 'burn'], [0.7, 'meteor']] });
  f.aimError = aim;
  for (let i = 0; i < 4000 && f.status === 'flying'; i++) {
    const e = f.event;
    if (e && e.kind === 'burn') { if (!e.holding && Math.abs(e.dev) >= 0.08) Moon.flightAction(f, 'burn', true); else if (e.holding && Math.abs(e.dev) < 0.05) Moon.flightAction(f, 'burn', false); }
    Moon.stepFlight(f, 0.05);
  }
  return f;
};
const enter = (seed, play) => {
  const s = Reentry.startReentry(mulberry32(seed));
  for (let i = 0; i < 60 * 200 && s.status === 'flying'; i++) { const inp = play(s); Reentry.stepReentry(s, 1 / 60, inp); }
  return s;
};
const goodEntry = (s) => (s.phase === 'chutes'
  ? { up: s.tilt > 2, down: s.tilt < -2 }
  : { up: s.angle < -6.8, down: s.angle > -6.2 });
const dock = (seed, play) => {
  const s = Dock.startDock(mulberry32(seed));
  for (let i = 0; i < 60 * 120 && s.status === 'flying'; i++) Dock.stepDock(s, 1 / 60, play(s));
  return s;
};

// Lift-off from the Moon: careful pilots reach orbit, nobody steering does not.
let ok = 0; for (let sd = 1; sd <= 20; sd++) if (ascend(sd).status === 'orbit') ok++;
assert.ok(ok >= 19, `ascent ok ${ok}/20`);
let bad = 0; for (let sd = 1; sd <= 10; sd++) if (ascend(sd, false).status !== 'orbit') bad++;
assert.equal(bad, 10);
// Burn for Earth: a well-timed burn reaches Earth's distance; an empty tank leaves the path short.
const tei = teiBurn(TEI);
assert.equal(tei.status, 'done'); assert.ok(tei.result.hit, JSON.stringify(tei.result));
const dry = teiBurn({ ...TEI, maxDv: 0.2 });
assert.ok(dry.outOfFuel && !dry.result.hit);
// Flight home: uses its own events and never ends in a loss.
const f = flyHome(2, 4);
assert.equal(f.status, 'orbit'); assert.equal(f.log.length, 3); assert.ok(/Earth ahead/.test(f.log[2]));
// Docking: a careful pilot docks; ramming in at full speed bounces; nobody can lose.
const careful = dock(1, (s) => ({ thrust: s.x > 8, up: s.y > 0.3, down: s.y < -0.3 }));
assert.equal(careful.status, 'docked'); assert.equal(careful.bounces, 0);
const rammed = dock(1, (s) => ({ thrust: true, up: s.y > 0.3, down: s.y < -0.3 }));
assert.ok(rammed.bounces > 0, 'full speed must bounce');
const lazy = dock(1, () => ({ thrust: true }));
assert.ok(lazy.bounces > 0 && lazy.status === 'flying' || lazy.status === 'docked');
// Re-entry: the corridor is safe; too steep damages the shield; too shallow skips; chutes open by themselves.
const good = enter(1, goodEntry), gr = Reentry.score(good);
assert.equal(good.status, 'done'); assert.equal(gr.stars, 3, JSON.stringify(gr)); assert.ok(good.upright);
assert.ok(good.drogue && good.main, 'chutes open on their own');
const steep = enter(1, (s) => (s.phase === 'chutes' ? goodEntry(s) : { down: true })); assert.ok(steep.shield < 70 && steep.status === 'done');
const shallow = enter(1, (s) => (s.phase === 'chutes' ? goodEntry(s) : { up: true })); assert.ok(shallow.skips > 0 && shallow.status === 'done');
const swing = enter(1, (s) => (s.phase === 'chutes' ? {} : goodEntry(s)));
assert.equal(swing.status, 'done'); assert.ok(Reentry.score(swing).stars >= 1);
let tilted = 0; for (let sd = 1; sd <= 10; sd++) if (!enter(sd, (s) => (s.phase === 'chutes' ? {} : goodEntry(s))).upright) tilted++;
assert.ok(tilted >= 3, `unsteered swing should often tilt: ${tilted}/10`);
// Timing: the whole of Mission 4 is about 3 minutes of play.
console.log(`entry ${REENTRY.entryTime}s + chutes ~${Math.round(good.t - REENTRY.entryTime)}s`);
console.log('All mission 4 tests passed.');
