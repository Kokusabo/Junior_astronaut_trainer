// Mission 2, part 3: powered descent to the chosen landing site (side view). Pure, no DOM, so it runs in
// Node tests. Units: metres, seconds, m/s. Fuel is % of the lander tank, carried over from the flight.
// Ideas from the real Apollo and Artemis landings: a lidar hazard scan, a landing point marker, the
// Apollo 11 "1202" computer alarm, "60 seconds" / "30 seconds" fuel callouts, and the contact light.
const LANDING = {
  g: 1.62,              // Moon gravity, m/s^2
  baseAcc: 5,           // engine acceleration at full throttle with no cargo
  refMass: 3000,        // kg of lander; cargo adds to it and makes the engine weaker
  burnPerSec: 0.5,      // % of tank per second at full throttle
  throttleRate: 3,      // throttle goes 0 -> 1 in a third of a second
  tiltRate: 1.2,        // rad/s
  maxTilt: 0.6,         // rad (about 34 degrees)
  start: { x: 150, alt: 420, vx: 12, vy: -6 },
  length: 1500,         // metres of terrain
  step: 2,              // metres between terrain points
  pad: 12,              // width of flat, clear ground the lander needs
  maxSlope: 0.1,        // rise per metre that still counts as flat
  safeV: 2, perfectV: 1, safeH: 1.5, safeTilt: 0.14, crashV: 4, crashTilt: 0.3,
  contactAlt: 1.7,      // probes under the footpads touch the ground here: CONTACT LIGHT
  alarmAlt: 300,        // the 1202 alarm goes off around here
  scanTime: 3,          // seconds for the lidar to map the ground
  iceRange: 70,         // landing this close to the shadowed crater (ice sites) earns the ice bonus
};

const Landing = (function () {
  // ---------- Terrain ----------
  // Heights every `step` metres, made from the site: rough sites get bigger hills, more craters and boulders.
  function makeTerrain(site, rng, cfg = LANDING) {
    const n = Math.floor(cfg.length / cfg.step) + 1;
    const h = new Float32Array(n);
    const rough = site.roughness;
    const A = 4 + rough * 18;
    const p = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    // site.profile: real elevation along about 42 km through the site (NASA LRO LOLA, 8-bit steps of ~78 m),
    // squeezed into the landing strip. Its shape is kept; its height is capped so the site stays landable.
    const P = Array.isArray(site.profile) && site.profile.length > 4 ? site.profile : null;
    let mean = 0, scale = 0;
    if (P) {
      mean = P.reduce((a, v) => a + v, 0) / P.length;
      const range = Math.max(1, Math.max(...P) - Math.min(...P));
      scale = Math.min(2.8, (A * 2) / range); // 78 m per step / 28x squeeze = 2.8 m
    }
    const profileAt = (x) => { const u = (x / cfg.length) * (P.length - 1), j = Math.min(P.length - 2, Math.floor(u)), k = u - j; return (P[j] * (1 - k) + P[j + 1] * k - mean) * scale; };
    for (let i = 0; i < n; i++) {
      const x = i * cfg.step;
      const fine = 0.3 * Math.sin(x / 53 + p[1]) + 0.1 * Math.sin(x / 17 + p[2]);
      h[i] = P ? profileAt(x) + A * 0.5 * fine : A * (0.6 * Math.sin(x / 170 + p[0]) + fine);
    }
    const craters = [];
    const crater = (cx, R, depth) => {
      craters.push({ x: cx, r: R });
      for (let i = 0; i < n; i++) {
        const d = Math.abs(i * cfg.step - cx) / R;
        if (d < 1) h[i] -= depth * (1 - d * d);
        else if (d < 1.6) h[i] += depth * 0.3 * (1 - (d - 1) / 0.6);
      }
    };
    for (let k = Math.round(3 + rough * 10); k > 0; k--) crater(100 + rng() * (cfg.length - 200), 10 + rng() * 40, 3 + rng() * (4 + rough * 10));
    // Ice sites: a deep crater whose floor never sees the Sun, near the far end.
    let shadow = null;
    if (site.ice) {
      const cx = cfg.length - 330 + rng() * 80, R = 90;
      crater(cx, R, 30);
      shadow = { a: cx - R * 0.8, b: cx + R * 0.8 };
    }
    const boulders = [];
    for (let k = Math.round(10 + rough * 60); k > 0; k--) boulders.push({ x: rng() * cfg.length, r: 0.6 + rng() * 2 });
    const T = { step: cfg.step, h, boulders, craters, shadow, safe: [], real: !!P };
    T.safe = findSafe(T, cfg);
    // Always leave at least one landing spot within reach: flatten a pad if the ground is too wild.
    if (!T.safe.some((z) => z.b > 300 && z.a < cfg.length - 400)) {
      const x0 = 450 + rng() * 450, i0 = Math.round(x0 / cfg.step), w = Math.round(14 / cfg.step), lvl = h[i0];
      for (let i = i0 - w * 2; i <= i0 + w * 2; i++) {
        const d = Math.abs(i - i0);
        h[i] = d <= w ? lvl : h[i] + (lvl - h[i]) * (1 - (d - w) / w);
      }
      T.boulders = boulders.filter((b) => Math.abs(b.x - x0) > 16);
      T.safe = findSafe(T, cfg);
    }
    return T;
  }

  function heightAt(T, x) {
    const f = Math.max(0, Math.min(T.h.length - 1.001, x / T.step)), i = Math.floor(f), k = f - i;
    return T.h[i] * (1 - k) + T.h[i + 1] * k;
  }
  const slopeAt = (T, x) => (heightAt(T, x + 1) - heightAt(T, x - 1)) / 2;

  // Is there a flat, boulder-free pad centred on x?
  function clearAt(T, x, cfg = LANDING) {
    for (let d = -cfg.pad / 2; d <= cfg.pad / 2; d += 1) if (Math.abs(slopeAt(T, x + d)) > cfg.maxSlope) return false;
    if (T.shadow && x > T.shadow.a && x < T.shadow.b) return false; // no sunlight, no power: not a landing spot
    return !T.boulders.some((b) => Math.abs(b.x - x) < cfg.pad / 2 + b.r);
  }
  function findSafe(T, cfg) {
    const zones = [];
    let a = null;
    for (let x = 20; x < cfg.length - 20; x += 2) {
      const ok = clearAt(T, x, cfg);
      if (ok && a === null) a = x;
      if (!ok && a !== null) { zones.push({ a, b: x - 2 }); a = null; }
    }
    if (a !== null) zones.push({ a, b: cfg.length - 22 });
    return zones;
  }
  const zoneAt = (T, x) => T.safe.find((z) => x >= z.a - 0.5 && x <= z.b + 0.5) || null;

  // ---------- Flight ----------
  function startLanding(site, fuel, mass, rng, cfg = LANDING) {
    const T = makeTerrain(site, rng, cfg);
    const s = cfg.start;
    return {
      cfg, site, T, mass, fuel, fuelStart: fuel,
      x: s.x, y: heightAt(T, s.x) + s.alt, vx: s.vx, vy: s.vy, angle: 0, throttle: 0,
      t: 0, alt: s.alt, status: 'flying', reason: '', alarm: null, alarmDone: false, callouts: [], contact: false, result: null,
    };
  }

  const maxAcc = (s) => (s.cfg.baseAcc * s.cfg.refMass) / (s.cfg.refMass + s.mass);
  // Seconds of hovering left: what the "60 seconds" callouts count.
  const secondsLeft = (s) => s.fuel / (s.cfg.burnPerSec * Math.min(1, s.cfg.g / maxAcc(s)));

  // input: { thrust, left, right } booleans.
  function stepLanding(s, dt, input) {
    if (s.status !== 'flying') return;
    const c = s.cfg;
    s.t += dt;
    const want = input.thrust && s.fuel > 0 ? 1 : 0;
    s.throttle += Math.max(-c.throttleRate * dt, Math.min(c.throttleRate * dt, want - s.throttle));
    s.angle = Math.max(-c.maxTilt, Math.min(c.maxTilt, s.angle + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * c.tiltRate * dt));
    const acc = maxAcc(s) * s.throttle;
    s.vx += Math.sin(s.angle) * acc * dt;
    s.vy += (Math.cos(s.angle) * acc - c.g) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.fuel = Math.max(0, s.fuel - c.burnPerSec * s.throttle * dt);
    s.alt = s.y - heightAt(s.T, s.x);
    // Apollo 11's 1202: the guidance computer was overloaded. The readouts freeze until someone says GO.
    if (!s.alarmDone && !s.alarm && s.alt < c.alarmAlt) s.alarm = { t: 0 };
    if (s.alarm) s.alarm.t += dt;
    const sec = secondsLeft(s);
    for (const mark of [60, 30]) if (sec <= mark && !s.callouts.includes(mark) && s.alt > 2) s.callouts.push(mark);
    s.contact = s.alt <= c.contactAlt;
    if (s.x < 0 || s.x > c.length) return end(s, 'lost', 'We drifted out of the landing area. Abort to orbit.');
    if (s.alt <= 0) touchdown(s);
  }

  function ackAlarm(s) {
    if (!s.alarm) return false;
    s.alarm = null;
    s.alarmDone = true;
    return true;
  }

  function end(s, status, reason) { s.status = status; s.reason = reason; s.throttle = 0; s.result = rate(s); }

  function touchdown(s) {
    const c = s.cfg, T = s.T;
    s.y = heightAt(T, s.x);
    s.alt = 0;
    const vs = -s.vy, hs = Math.abs(s.vx), tilt = Math.abs(s.angle);
    s.touch = { vs, hs, tilt };
    const rock = T.boulders.find((b) => Math.abs(b.x - s.x) < 3 + b.r);
    const ground = Math.max(Math.abs(slopeAt(T, s.x - 3)), Math.abs(slopeAt(T, s.x)), Math.abs(slopeAt(T, s.x + 3)));
    if (vs > c.crashV) return end(s, 'crash', `Hit the ground at ${vs.toFixed(1)} m/s. The legs could not take it.`);
    if (tilt > c.crashTilt) return end(s, 'crash', 'Touched down tilted too far and tipped over.');
    if (rock && rock.r > 1.2) return end(s, 'crash', 'Landed on a boulder and tipped over.');
    if (ground > 0.3) return end(s, 'crash', 'The ground was too steep. The lander slid and tipped over.');
    const hard = vs > c.safeV || hs > c.safeH || tilt > c.safeTilt || ground > c.maxSlope * 1.5 || rock;
    s.vx = s.vy = 0;
    end(s, hard ? 'hard' : 'landed', hard ? 'A hard landing: we are down, but a landing leg is bent.' : 'Contact light. Engine stop. We have landed!');
  }

  // Stars and what the landing earned.
  function rate(s) {
    if (s.status === 'crash' || s.status === 'lost') return { stars: 0, ice: false };
    const t = s.touch || { vs: 9, hs: 9 };
    const inZone = !!zoneAt(s.T, s.x);
    const ice = !!s.T.shadow && Math.min(Math.abs(s.x - s.T.shadow.a), Math.abs(s.x - s.T.shadow.b)) < s.cfg.iceRange;
    let stars = s.status === 'hard' ? 1 : 2;
    if (s.status === 'landed' && t.vs <= s.cfg.perfectV && t.hs <= 0.6 && inZone) stars = 3;
    return { stars, ice, inZone, fuelLeft: s.fuel };
  }

  // Where the lander would touch down if it kept its speed (the "landing point" marker on the ground).
  function predictX(s) {
    let x = s.x, y = s.y, vx = s.vx, vy = s.vy;
    for (let i = 0; i < 400; i++) {
      x += vx * 0.1; y += vy * 0.1; vy -= s.cfg.g * 0.1 * (1 - Math.min(1, s.throttle * maxAcc(s) / s.cfg.g));
      if (y <= heightAt(s.T, x)) break;
    }
    return x;
  }

  return { makeTerrain, heightAt, slopeAt, clearAt, zoneAt, startLanding, stepLanding, ackAlarm, secondsLeft, maxAcc, predictX };
})();

if (typeof module !== 'undefined') module.exports = { LANDING, Landing };
