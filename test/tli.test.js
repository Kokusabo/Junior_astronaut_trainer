// Earth-orbit TLI burn tests. Run with: node test/tli.test.js
const assert = require('node:assert/strict');
const { TLI, Tli } = require('../src/tli.js');

const run = (s, input, maxT = 120) => { for (let t = 0; t < maxT && s.status === 'orbit'; t += 1 / 60) Tli.stepTli(s, 1 / 60, input(s)); return s; };

// Coasting keeps a steady low orbit (energy conserved) and passes the window once per lap.
{
  const s = Tli.startTli();
  const e0 = Tli.elements(s).energy;
  run(s, () => ({}), 3 * TLI.period + 1);
  assert.equal(s.status, 'orbit');
  assert.ok(Math.abs(Tli.elements(s).energy - e0) < 0.01);
  assert.equal(s.laps, 3);
  const w = Tli.startTli();
  assert.ok(Math.abs(Tli.windowIn(w) - (TLI.firstWindow - TLI.period * TLI.window / (2 * Math.PI))) < 0.1);
}

// A good burn: start as soon as the ship enters the green window and hold (the computer cuts off).
// lead shifts the start by game seconds (half a lap = the wrong side of Earth).
function pilot(lead) {
  let inT = 0; // a person reacts about 0.4 s after the ship enters the window
  return (s) => {
    inT = Tli.windowIn(s) === 0 ? inT + 1 / 60 : 0;
    return { burn: s.burning || (lead === 0 ? inT >= 0.4 : Math.abs(Tli.windowIn(s) - (TLI.period - lead)) < 0.03) };
  };
}
const good = run(Tli.startTli(), pilot(0));
console.log('good burn:', good.result, 'dv', (good.dv * TLI.vUnit).toFixed(2), 'km/s');
assert.equal(good.status, 'done');
assert.ok(good.result.hit && good.result.penalty <= 1);
assert.ok(Math.abs(good.dv * TLI.vUnit - 3.1) < 0.4); // about the real TLI burn

// Burning on the wrong side of Earth sends the path away from the Moon: a big penalty.
const wrong = run(Tli.startTli(), pilot(TLI.period / 2));
console.log('wrong side:', wrong.result);
assert.ok(wrong.result.penalty >= 8);
// The computer cuts the engine at the Moon's distance, however long the button is held.
const held = run(Tli.startTli(), (s) => ({ burn: Tli.windowIn(s) === 0 || s.burning }));
assert.ok(held.cutoff && Math.abs(Tli.elements(held).ra / TLI.moonR - 1) < 0.05);
// Letting go early leaves the orbit short of the Moon; a second burn on the next lap finishes the job.
{
  const s = Tli.startTli();
  let stopped = false;
  run(s, (st) => { if (!stopped && st.dv * TLI.vUnit > 1.5) stopped = true; return { burn: !stopped && (Tli.windowIn(st) === 0 || st.burning) }; }, 9);
  const ra = Tli.elements(s).ra;
  assert.equal(s.status, 'orbit');
  assert.ok(ra > 2 && ra < 20);
  run(s, (st) => ({ burn: Tli.elements(st).r < 1.2 && (Tli.windowIn(st) === 0 || st.burning) }), 200);
  console.log('two burns:', s.result);
  assert.equal(s.status, 'done');
  assert.ok(s.result.penalty <= 7); // both burns started at the very edge of the window: still reaches the Moon
}
// Never burning: still in orbit.
assert.equal(run(Tli.startTli(), () => ({}), 40).status, 'orbit');
// Prediction ends near the Moon's distance for a good burn.
{
  const s = Tli.startTli(); const p = pilot(0);
  for (let i = 0; i < 6000 && Tli.elements(s).ra < TLI.moonR; i++) Tli.stepTli(s, 1 / 60, p(s));
  const pts = Tli.predict(s);
  assert.ok(pts.length > 10 && Math.abs(pts[pts.length - 1].r - Tli.elements(s).ra) < 3);
}

console.log('All TLI tests passed.');
