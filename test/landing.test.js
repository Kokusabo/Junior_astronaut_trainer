// Landing tests. Run with: node test/landing.test.js
const assert = require('node:assert/strict');
const { MOON_SITES } = require('../src/moon-data.js');
const { LANDING, Landing } = require('../src/landing.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fly = (s, input, maxT = 200) => { for (let t = 0; t < maxT && s.status === 'flying'; t += 0.05) Landing.stepLanding(s, 0.05, input(s)); return s; };

// A careful pilot: picks the safe zone closest to where it is heading, steers over it, then descends slowly.
function pilot(s) {
  if (s.alarm) Landing.ackAlarm(s);
  if (!s.target) {
    const ahead = s.x + 250;
    const zones = s.T.safe.filter((z) => z.b - z.a >= 2 && z.a > s.x + 60);
    const z = zones.sort((p, q) => Math.abs((p.a + p.b) / 2 - ahead) - Math.abs((q.a + q.b) / 2 - ahead))[0] || s.T.safe[0];
    s.target = (z.a + z.b) / 2;
  }
  const dx = s.target - s.x;
  const dvx = s.alt > 15 ? Math.max(-12, Math.min(12, dx * 0.07)) : Math.max(-0.6, Math.min(0.6, dx * 0.2));
  const want = Math.max(-0.5, Math.min(0.5, (dvx - s.vx) * 0.3));
  const dvy = -Math.max(0.6, Math.min(14, s.alt * 0.12));
  return { thrust: s.vy < dvy || Math.abs(dvx - s.vx) > 1.5 && s.alt > 30, left: s.angle > want + 0.02, right: s.angle < want - 0.02 };
}

// Terrain: every site has a reachable safe zone, deterministic per seed, clear zones are really clear.
for (const site of MOON_SITES) for (let seed = 1; seed <= 30; seed++) {
  const T = Landing.makeTerrain(site, mulberry32(seed));
  assert.ok(T.safe.some((z) => z.b > 300 && z.a < LANDING.length - 400), `${site.id} seed ${seed}: no reachable safe zone`);
  for (const z of T.safe) assert.ok(Landing.clearAt(T, (z.a + z.b) / 2));
  assert.equal(!!T.shadow, !!site.ice);
}
assert.deepEqual(Array.from(Landing.makeTerrain(MOON_SITES[0], mulberry32(7)).h.slice(0, 20)), Array.from(Landing.makeTerrain(MOON_SITES[0], mulberry32(7)).h.slice(0, 20)));

// Real NASA LOLA elevation profiles: terrain follows them and every site still has a reachable pad.
{
  const NASA = require('../data/moon-nasa.js');
  for (const site of MOON_SITES) {
    const prof = NASA.terrain[site.id];
    assert.equal(prof.length, 64);
    for (let seed = 1; seed <= 15; seed++) {
      const T = Landing.makeTerrain({ ...site, profile: prof }, mulberry32(seed));
      assert.ok(T.real && T.safe.some((z) => z.b > 300 && z.a < LANDING.length - 400), `${site.id} seed ${seed}: no pad with real terrain`);
    }
  }
  // Shape check on the most rugged site: where the profile is higher, the ground is higher on average.
  const prof = NASA.terrain.nobile, T = Landing.makeTerrain({ ...MOON_SITES.find((x) => x.id === 'nobile'), profile: prof }, mulberry32(3));
  const hi = prof.indexOf(Math.max(...prof)), lo = prof.indexOf(Math.min(...prof));
  const at = (j) => Landing.heightAt(T, (j / 63) * LANDING.length);
  assert.ok(at(hi) > at(lo), 'terrain does not follow the real profile');
}

// Free fall crashes. No fuel = no engine.
{
  const s = fly(Landing.startLanding(MOON_SITES[0], 25, 1400, mulberry32(1)), () => ({}));
  assert.equal(s.status, 'crash');
  assert.equal(s.result.stars, 0);
  const e = Landing.startLanding(MOON_SITES[0], 0, 1400, mulberry32(1));
  Landing.stepLanding(e, 0.5, { thrust: true });
  assert.equal(e.throttle, 0);
}

// The 1202 alarm appears below the alarm altitude and stays until acknowledged.
{
  const s = Landing.startLanding(MOON_SITES[0], 25, 1400, mulberry32(2));
  fly(s, (st) => ({ thrust: st.vy < -8 }), 40);
  assert.ok(s.alarm || s.alarmDone);
  if (s.alarm) { assert.ok(Landing.ackAlarm(s)); assert.equal(s.alarm, null); assert.ok(s.alarmDone); }
}

// Fuel callouts, and a gentle touchdown on a clear pad is a landing; a fast one is a crash.
{
  const s = Landing.startLanding(MOON_SITES[0], 6, 1400, mulberry32(3));
  Landing.stepLanding(s, 0.05, {});
  assert.ok(s.callouts.includes(60) && s.callouts.includes(30));
  const T = s.T, z = T.safe[0], x = (z.a + z.b) / 2;
  Object.assign(s, { x, y: Landing.heightAt(T, x) + 0.05, vx: 0, vy: -0.8, angle: 0, status: 'flying' });
  Landing.stepLanding(s, 0.1, {});
  assert.equal(s.status, 'landed');
  assert.equal(s.result.stars, 3);
  const f = Landing.startLanding(MOON_SITES[0], 25, 1400, mulberry32(3));
  Object.assign(f, { x, y: Landing.heightAt(T, x) + 0.05, vx: 0, vy: -6 });
  Landing.stepLanding(f, 0.1, {});
  assert.equal(f.status, 'crash');
}

// Balance: the careful pilot lands nearly always with the fuel a normal flight leaves (about 25%),
// and still mostly with a thin margin (16%).
for (const fuel of [25, 16]) {
  let ok = 0, n = 0, used = 0;
  for (const site of MOON_SITES) for (let seed = 1; seed <= 20; seed++, n++) {
    const s = fly(Landing.startLanding(site, fuel, 1450, mulberry32(seed * 31 + 7)), pilot);
    if (s.status === 'landed' || s.status === 'hard') ok++;
    used += fuel - s.fuel;
  }
  console.log(`fuel ${fuel}%: careful pilot lands ${ok}/${n}, avg fuel used ${(used / n).toFixed(1)}%`);
  assert.ok(ok / n >= (fuel === 25 ? 0.9 : 0.6));
}

console.log('All landing tests passed.');
