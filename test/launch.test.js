// Launch tests. Run with: node test/launch.test.js
const assert = require('node:assert/strict');
const { LAUNCH, Launch } = require('../src/launch.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A pilot that steers toward the guidance pitch (with a dead band) and stages after `react` seconds.
function fly(seed, { band = 1.5, react = 0.4, steer = true } = {}) {
  const s = Launch.startLaunch(mulberry32(seed));
  for (let i = 0; i < 4000 && s.status === 'flying'; i++) {
    const want = Launch.guidePitch(s.burnT);
    Launch.stepLaunch(s, 0.05, steer ? { up: s.pitch < want - band, down: s.pitch > want + band } : {});
    if (!s.firing && s.waitT >= react) Launch.separate(s);
  }
  return s;
}

// Guidance goes from straight up to the horizon; speed grows to orbital speed.
assert.equal(Launch.guidePitch(0), 90);
assert.ok(Math.abs(Launch.guidePitch(Launch.total(LAUNCH))) < 1e-9);
assert.ok(Math.abs(Launch.speedAt(Launch.total(LAUNCH)) - LAUNCH.orbitSpeed) < 1e-9);
const path = Launch.idealPath();
const top = path[path.length - 1];
console.log(`ideal path ends at ${top.y.toFixed(0)} km altitude, ${top.x.toFixed(0)} km downrange`);
assert.ok(top.y > 150 && top.y < 220);

// Staging only after burnout; the computer stages by itself if nobody does (with a penalty).
{
  const s = Launch.startLaunch(mulberry32(1));
  assert.equal(Launch.separate(s), false);
  for (let i = 0; i < 4000 && s.status === 'flying'; i++) Launch.stepLaunch(s, 0.05, { up: s.pitch < Launch.guidePitch(s.burnT) - 1.5, down: s.pitch > Launch.guidePitch(s.burnT) + 1.5 });
  assert.ok(s.events.some((e) => e.kind === 'autostage'));
  assert.ok(s.stageLate >= LAUNCH.autoStage - 1.01);
}

// Good pilots reach orbit with a small penalty; slow staging costs more; nobody steering does not reach orbit.
let good = 0, pen = 0, n = 0;
for (let seed = 1; seed <= 60; seed++, n++) {
  const s = fly(seed);
  if (s.status === 'orbit') { good++; pen += s.penalty; }
}
console.log(`careful pilot: orbit ${good}/${n}, average penalty ${(pen / Math.max(1, good)).toFixed(1)}% fuel`);
assert.ok(good / n >= 0.95 && pen / good <= 3);
const slow = fly(3, { react: 3 }), quick = fly(3);
assert.equal(slow.status, 'orbit');
assert.ok(slow.penalty > quick.penalty);
let lost = 0;
for (let seed = 1; seed <= 30; seed++) if (fly(seed, { steer: false }).status !== 'orbit') lost++;
console.log(`no steering: ${lost}/30 do not make orbit`);
assert.ok(lost >= 27);
// A sloppy pilot (wide dead band) mostly makes it but pays more fuel.
let sloppyPen = 0, sloppyOk = 0;
for (let seed = 1; seed <= 30; seed++) { const s = fly(seed, { band: 8 }); if (s.status === 'orbit') { sloppyOk++; sloppyPen += s.penalty; } }
console.log(`sloppy pilot: orbit ${sloppyOk}/30, average penalty ${(sloppyPen / Math.max(1, sloppyOk)).toFixed(1)}%`);
assert.ok(sloppyOk >= 15 && sloppyPen / sloppyOk > pen / good);
assert.match(Launch.missionTime({ t: 10, cfg: LAUNCH }), /^T\+02:10$/);
assert.equal(Launch.missionTime({ t: -2.5, cfg: LAUNCH }), 'T-00:03');
{ const s = Launch.startLaunch(mulberry32(1)); Launch.stepLaunch(s, 1, {}); assert.equal(s.burnT, 0); assert.equal(s.y, 0); }

console.log('All launch tests passed.');
