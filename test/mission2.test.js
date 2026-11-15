// Whole Mission 2, end to end, with simulated players: launch -> Earth orbit burn -> flight -> landing.
// Checks that every landing site can be won with a sensible cargo (essentials + shelter + repair kit).
// Run with: node test/mission2.test.js
const assert = require('node:assert/strict');
const { MOON, MOON_SITES, MOON_ITEMS } = require('../src/moon-data.js');
const Moon = require('../src/moon.js');
const { Launch } = require('../src/launch.js');
const { Tli } = require('../src/tli.js');
const { Landing } = require('../src/landing.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function launch(rng) {
  const s = Launch.startLaunch(rng);
  for (let i = 0; i < 4000 && s.status === 'flying'; i++) {
    const w = Launch.guidePitch(s.burnT);
    Launch.stepLaunch(s, 0.05, { up: s.pitch < w - 2, down: s.pitch > w + 2 });
    if (!s.firing && s.waitT >= 0.6) Launch.separate(s);
  }
  return s;
}
function orbit(react) {
  const s = Tli.startTli();
  let inT = 0;
  for (let i = 0; i < 20000 && s.status === 'orbit'; i++) {
    inT = Tli.windowIn(s) === 0 ? inT + 1 / 60 : 0;
    Tli.stepTli(s, 1 / 60, { burn: s.burning || inT >= react });
  }
  return s;
}
function flight(plan, b, penalty, aim, rng) {
  const f = Moon.startFlight(plan, b, rng, MOON.landingReserve);
  f.fuel -= penalty; f.aimError = aim;
  for (let i = 0; i < 4000 && f.status === 'flying'; i++) {
    const e = f.event;
    if (e && e.kind === 'burn') {
      if (!e.holding && Math.abs(e.dev) >= 0.08) Moon.flightAction(f, 'burn', true);
      else if (e.holding && Math.abs(e.dev) < 0.05) Moon.flightAction(f, 'burn', false);
    }
    if (e && e.kind === 'brake') {
      if (!e.holding && e.speed > 0.5) Moon.flightAction(f, 'burn', true);
      else if (e.holding && e.speed <= 0.45) Moon.flightAction(f, 'burn', false);
    }
    if (e && e.kind === 'storm' && !e.sheltered) Moon.flightAction(f, 'shelter');
    if (e && e.kind === 'meteor') Moon.flightAction(f, 'patch');
    Moon.stepFlight(f, 0.05);
  }
  return f;
}
function land(site, fuel, mass, rng) {
  const s = Landing.startLanding(site, fuel, mass, rng);
  for (let t = 0; t < 200 && s.status === 'flying'; t += 0.05) {
    if (s.alarm) Landing.ackAlarm(s);
    if (!s.target) {
      const ahead = s.x + 250, zs = s.T.safe.filter((z) => z.b - z.a >= 2 && z.a > s.x + 60);
      const z = zs.sort((p, q) => Math.abs((p.a + p.b) / 2 - ahead) - Math.abs((q.a + q.b) / 2 - ahead))[0] || s.T.safe[0];
      s.target = (z.a + z.b) / 2;
    }
    const dx = s.target - s.x, dvx = s.alt > 15 ? Math.max(-12, Math.min(12, dx * 0.07)) : Math.max(-0.6, Math.min(0.6, dx * 0.2));
    const want = Math.max(-0.5, Math.min(0.5, (dvx - s.vx) * 0.3)), dvy = -Math.max(0.6, Math.min(14, s.alt * 0.12));
    Landing.stepLanding(s, 0.05, { thrust: s.vy < dvy || (Math.abs(dvx - s.vx) > 1.5 && s.alt > 30), left: s.angle > want + 0.02, right: s.angle < want - 0.02 });
  }
  return s;
}

const cargo = new Set([...MOON_ITEMS.filter((i) => i.essential).map((i) => i.id), 'shield', 'repair']);
for (const site of MOON_SITES) {
  const plan = { site, items: cargo };
  const b = Moon.budget(plan, MOON, MOON_ITEMS);
  assert.ok(b.canLaunch, `${site.id}: cannot even launch`);
  let wins = 0, n = 20, fuelAtMoon = 0;
  for (let seed = 1; seed <= n; seed++) {
    const rng = mulberry32(seed * 97 + 1);
    const L = launch(rng);
    if (L.status !== 'orbit') continue;
    const O = orbit(0.3 + rng() * 0.4);
    const F = flight(plan, b, L.penalty, O.result.penalty, rng);
    if (F.status !== 'orbit') continue;
    fuelAtMoon += F.fuel;
    const D = land(site, F.fuel, b.mass, rng);
    if (D.status === 'landed' || D.status === 'hard') wins++;
  }
  console.log(`${site.name.padEnd(18)} wins ${wins}/${n}, fuel at the Moon ${(fuelAtMoon / n).toFixed(1)}% (budget said ${b.fuelLeft.toFixed(0)}%)`);
  assert.ok(wins / n >= 0.75, `${site.id}: a good player wins only ${wins}/${n}`);
}
console.log('All mission 2 end-to-end tests passed.');
