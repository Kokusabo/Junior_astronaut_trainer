// Mission 2, part 1b: in Earth orbit, the trans-lunar injection (TLI) burn. Pure, no DOM.
// Seen from above. Real two-body gravity in Earth units: distance in Earth radii (6371 km), speed in
// units of 7.905 km/s, so circular orbit speed at radius r is sqrt(1/r). The player holds BURN to speed
// up along the orbit. Burning on the side of Earth opposite the Moon stretches the orbit into a long
// ellipse whose far end (apogee) reaches the Moon: about 10.9 km/s, like Apollo and Artemis.
const TLI = {
  r0: 1.03,           // low Earth orbit radius (about 190 km up)
  moonR: 60.3,        // Moon distance in Earth radii (384,400 km)
  moonAngle: 0,       // where the Moon is (radians, 0 = right of Earth)
  period: 16,         // game seconds per lap of low orbit
  accel: 0.9,         // engine push (Earth units): the burn takes about a second, a quarter of a lap
  window: 0.3,        // half-width of the burn window (radians, about 17 degrees): about 1.5 s to react
  lead: 0.17,         // the window sits this far before the far side, so a burn started in it is centred there
  leaveR: 4,          // past this the ship has left Earth: the phase ends
  firstWindow: 6,     // game seconds until the first burn window
  earthKm: 6371, vUnit: 7.905, // radius of the body in the middle (km), its orbit speed unit (km/s)
  needKms: 3.15, maxDv: Infinity, targetName: 'the Moon', center: 'earth', orbitName: 'EARTH ORBIT',
};

// Mission 4: the same burn from low lunar orbit back to Earth (trans-Earth injection). Units: Moon radii (1737 km),
// orbit speed unit 1.68 km/s; Earth is 221 Moon radii away.
const TEI = Object.assign({}, TLI, { r0: 1.06, moonR: 221, earthKm: 1737, vUnit: 1.68, needKms: 0.67, targetName: 'Earth', center: 'moon', orbitName: 'LUNAR ORBIT' });

const Tli = (function () {
  const simPerGame = (c) => (2 * Math.PI * Math.pow(c.r0, 1.5)) / c.period;
  // Burn on the far side of Earth from the Moon (the apogee then points at the Moon); start a little early.
  const windowAngle = (c) => c.moonAngle + Math.PI - c.lead;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function startTli(cfg = TLI) {
    const a0 = windowAngle(cfg) - (cfg.firstWindow / cfg.period) * 2 * Math.PI, v = Math.sqrt(1 / cfg.r0);
    return {
      cfg, t: 0, x: cfg.r0 * Math.cos(a0), y: cfg.r0 * Math.sin(a0), vx: -v * Math.sin(a0), vy: v * Math.cos(a0),
      burning: false, cutoff: false, dv: 0, burnStart: null, status: 'orbit', result: null, laps: 0, lastAngle: a0,
    };
  }

  // Orbit shape from position and velocity: semi-major axis, eccentricity, apogee radius and direction.
  function elements(s) {
    const r = Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy, rv = s.x * s.vx + s.y * s.vy;
    const ex = (v2 - 1 / r) * s.x - rv * s.vx, ey = (v2 - 1 / r) * s.y - rv * s.vy;
    const e = Math.hypot(ex, ey), energy = v2 / 2 - 1 / r;
    const a = -1 / (2 * energy);
    return { r, speed: Math.sqrt(v2), e, a, energy, ra: e < 1 ? a * (1 + e) : Infinity, rp: a * (1 - e), apoAngle: Math.atan2(-ey, -ex), periAngle: Math.atan2(ey, ex), h: s.x * s.vy - s.y * s.vx };
  }

  // input: { burn }
  function stepTli(s, dt, input) {
    if (s.status !== 'orbit') return;
    const c = s.cfg, n = input.burn && !s.cutoff ? 120 : 12, h = (dt * simPerGame(c)) / n; // fine steps while burning so the cutoff is exact
    s.t += dt;
    s.burning = !!input.burn && !s.cutoff; // after the computer's cutoff the engine stays off
    if (s.burning && s.burnStart === null) s.burnStart = Math.atan2(s.y, s.x);
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(s.x, s.y), g = -1 / (r * r * r);
      let ax = g * s.x, ay = g * s.y;
      if (s.burning) {
        const v = Math.hypot(s.vx, s.vy);
        ax += (c.accel * s.vx) / v; ay += (c.accel * s.vy) / v;
        s.dv += c.accel * h;
        // Guidance cutoff: stop the engine the moment the far end of the orbit reaches the Moon.
        const v2 = s.vx * s.vx + s.vy * s.vy, en = v2 / 2 - 1 / r;
        if (en < 0) {
          const a = -1 / (2 * en), rv = s.x * s.vx + s.y * s.vy, ex = (v2 - 1 / r) * s.x - rv * s.vx, ey = (v2 - 1 / r) * s.y - rv * s.vy;
          if (a * (1 + Math.hypot(ex, ey)) >= c.moonR) { s.cutoff = true; s.burning = false; finish(s); return; } // the path is set: done
        }
        if (s.dv >= c.maxDv) { s.cutoff = true; s.burning = false; s.outOfFuel = true; finish(s); return; } // tank empty: the path stays short
      }
      s.vx += ax * h; s.vy += ay * h; // semi-implicit Euler: keeps orbits stable
      s.x += s.vx * h; s.y += s.vy * h;
    }
    const ang = Math.atan2(s.y, s.x);
    const we = windowAngle(c) + c.window;
    if (wrap(we - s.lastAngle) > 0 && wrap(we - ang) <= 0) s.laps++; // just left the window
    s.lastAngle = ang;
    if (Math.hypot(s.x, s.y) > c.leaveR) finish(s);
  }

  // How well does the path reach the Moon? Penalty = lander fuel for the mid-course correction.
  function judge(el, c) {
    if (el.e >= 1) return { penalty: 10, hit: false, distErr: Infinity, angErr: 0, why: 'too fast: the ship would fly past the Moon' };
    const distErr = Math.abs(el.ra - c.moonR) / c.moonR, angErr = Math.abs(wrap(el.apoAngle - c.moonAngle)) * (180 / Math.PI);
    const penalty = Math.min(12, Math.round(Math.max(0, distErr - 0.05) * 40 + Math.max(0, angErr - 5) / 2.5)); // small misses are free
    const why = el.ra < c.moonR * 0.9 ? `too slow: the orbit falls short of ${c.targetName}` : el.ra > c.moonR * 1.1 ? `too fast: the orbit goes past ${c.targetName}` : penalty > 1 ? (wrap(el.apoAngle - c.moonAngle) > 0 ? `burned ${penalty > 3 ? '' : 'a bit '}late: the path swings ahead of ${c.targetName}` : `burned ${penalty > 3 ? '' : 'a bit '}early: the path swings behind ${c.targetName}`) : 'right on target';
    return { penalty, hit: penalty <= 2, distErr, angErr, why };
  }
  function finish(s) {
    s.status = 'done';
    s.burning = false;
    s.result = judge(elements(s), s.cfg);
  }

  // Seconds until the ship reaches the burn window (0 while inside it).
  function windowIn(s) {
    const c = s.cfg, d = wrap(windowAngle(c) - c.window - Math.atan2(s.y, s.x));
    const inside = Math.abs(wrap(Math.atan2(s.y, s.x) - windowAngle(c))) <= c.window;
    if (inside) return 0;
    return ((d < 0 ? d + 2 * Math.PI : d) / (2 * Math.PI)) * c.period;
  }

  // Points of the predicted path from the ship onward: to the apogee (or a full lap while the orbit is
  // still small), or outward on an escape path, stopping at maxR.
  function predict(s, maxR = 70, steps = 160) {
    const el = elements(s), p = el.h * el.h; // semi-latus rectum (mu = 1)
    const nu0 = wrap(Math.atan2(s.y, s.x) - el.periAngle), pts = [];
    const nu1 = el.e < 1 ? (el.ra < 3 ? nu0 + 2 * Math.PI : Math.PI) : Math.acos(-1 / el.e) * 0.98;
    for (let i = 0; i <= steps; i++) {
      const nu = nu0 + ((nu1 - nu0) * i) / steps, r = p / (1 + el.e * Math.cos(nu));
      if (r <= 0 || r > maxR) break;
      const a = el.periAngle + nu;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), r });
    }
    return pts;
  }

  return { startTli, stepTli, elements, judge, windowIn, windowAngle, predict };
})();

if (typeof module !== 'undefined') module.exports = { TLI, TEI, Tli };
