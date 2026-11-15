// Mission 2, part 1: the launch from Kennedy Space Center to Earth orbit (side view). Pure, no DOM.
// The player steers the rocket's pitch (its angle above the horizon) to follow the guidance "gravity turn",
// holds it steady through the gusty Max Q region, and fires each stage separation when a stage burns out.
// Stylized but in the right order and size: about 8 real minutes to orbit, shown in about 40 seconds.
// Units: km, km/s, degrees. t is game seconds; SCALE converts to mission time (real seconds).
const LAUNCH = {
  SCALE: 13,            // real seconds per game second (for the mission clock)
  posScale: 6.4,        // distance scale: the stylized climb ends near a real 180 km orbit
  stages: [{ name: 'BOOSTERS', burn: 10 }, { name: 'CORE STAGE', burn: 24 }],
  clear: 2,             // game seconds going straight up to clear the tower
  shape: 0.55,          // shape of the guidance pitch curve (90 degrees at the tower -> 0 at engine cutoff)
  orbitSpeed: 7.8,      // km/s at engine cutoff
  pitchRate: 22,        // degrees per second when steering
  gust: 26,             // wind gust strength (degrees/s), strongest at Max Q
  maxQ: [4, 9],         // game seconds of burning when the air pushes hardest
  breakErr: 20,         // degrees off the guidance line in thick air...
  breakTime: 1.2,       // ...for this long = the rocket breaks up (the abort system saves the crew)
  thickAir: 45,         // km: below this the air is thick enough to matter
  autoStage: 4,         // seconds after burnout the computer stages by itself (with a penalty)
  targetAlt: 190,       // km, where the guidance line ends
  g: 0.0098,            // km/s^2
  countdown: 3,         // seconds of countdown before liftoff
};

const Launch = (function () {
  const total = (c) => c.stages.reduce((a, s) => a + s.burn, 0);
  // Guidance: the pitch the rocket should have after b seconds of burning.
  function guidePitch(b, c = LAUNCH) {
    if (b <= c.clear) return 90;
    return 90 * (1 - Math.pow(Math.min(1, (b - c.clear) / (total(c) - c.clear)), c.shape));
  }
  // Speed after b seconds of burning: slow off the pad, fast at the end as the rocket gets lighter.
  const speedAt = (b, c = LAUNCH) => c.orbitSpeed * Math.pow(Math.min(1, b / total(c)), 1.6);
  const stageEnd = (i, c = LAUNCH) => c.stages.slice(0, i + 1).reduce((a, s) => a + s.burn, 0);

  // The ideal path (for the dotted guidance line): positions every 0.25 s of burning.
  function idealPath(c = LAUNCH) {
    const pts = [{ x: 0, y: 0 }];
    let x = 0, y = 0;
    for (let b = 0; b < total(c); b += 0.05) {
      const v = (speedAt(b, c) + speedAt(b + 0.05, c)) / 2, p = (guidePitch(b, c) * Math.PI) / 180;
      x += v * Math.cos(p) * 0.05 * c.posScale; y += v * Math.sin(p) * 0.05 * c.posScale;
      if (Math.round(b * 20) % 5 === 0) pts.push({ x, y });
    }
    return pts;
  }

  function startLaunch(rng, cfg = LAUNCH) {
    return {
      cfg, rng, t: -cfg.countdown, burnT: 0, stage: 0, firing: true, waitT: 0, x: 0, y: 0, vx: 0, vy: 0,
      pitch: 90, gust: 0, err: 0, overT: 0, loss: 0, stageLate: 0, events: [], status: 'flying', reason: '', penalty: 0, lasGone: false,
    };
  }

  // input: { up, down } (steer pitch up = steeper, down = toward the horizon).
  function stepLaunch(s, dt, input) {
    if (s.status !== 'flying') return;
    const c = s.cfg;
    s.t += dt;
    if (s.t < 0) return; // countdown
    const air = s.y < c.thickAir;
    // Wind gusts push the nose around; hardest at Max Q, none above the thick air.
    const q = s.burnT > c.maxQ[0] && s.burnT < c.maxQ[1] ? 1 : air && s.burnT > c.clear ? 0.35 : 0;
    s.gust += ((s.rng() - 0.5) * c.gust * 6 * q - s.gust * 1.5) * dt;
    if (s.burnT > c.clear * 0.5) s.pitch += (s.gust + ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * c.pitchRate) * dt;
    s.pitch = Math.max(-10, Math.min(95, s.pitch));
    if (s.firing) {
      const b0 = s.burnT;
      s.burnT = Math.min(stageEnd(s.stage, c), s.burnT + dt);
      const v = speedAt(s.burnT, c), p = (s.pitch * Math.PI) / 180;
      s.vx = v * Math.cos(p); s.vy = v * Math.sin(p);
      s.err = s.pitch - guidePitch(s.burnT, c);
      s.loss += (Math.max(0, Math.abs(s.err) - 3) / 90) * (s.burnT - b0); // 3 degrees of wobble are free
      if (s.burnT >= stageEnd(s.stage, c)) {
        s.firing = false; s.waitT = 0;
        if (s.stage === c.stages.length - 1) return finish(s);
        s.events.push({ kind: 'burnout', stage: s.stage, t: s.t });
      }
    } else {
      // Coasting with a dead stage: gravity bends the path down and no speed is gained.
      s.waitT += dt;
      s.vy -= c.g * c.SCALE * dt * 3; // gravity, exaggerated so a slow staging is felt
      if (s.waitT >= c.autoStage) { s.events.push({ kind: 'autostage', t: s.t }); separate(s); }
    }
    s.x += s.vx * dt * c.posScale;
    s.y += s.vy * dt * c.posScale;
    if (!s.lasGone && s.stage === 1 && s.burnT > stageEnd(0, c) + 2) { s.lasGone = true; s.events.push({ kind: 'las', t: s.t }); }
    // Too far off the guidance line in thick air: the aerodynamic loads break the rocket.
    s.overT = air && s.burnT > c.clear && Math.abs(s.err) > c.breakErr ? s.overT + dt : 0;
    if (s.overT > c.breakTime) return abort(s, 'Too far off course in the thick air: the rocket broke up.');
    if (s.t > 1 && s.y < 0) return abort(s, 'The rocket turned too low and came down.');
  }

  // Stage separation (player presses STAGE). Only possible after a stage burns out.
  function separate(s) {
    if (s.status !== 'flying' || s.firing) return false;
    const late = Math.max(0, s.waitT - 1); // a second to react is free
    s.stageLate += late;
    s.events.push({ kind: 'stage', stage: s.stage, t: s.t, late });
    s.stage++;
    s.firing = true;
    return true;
  }

  function abort(s, reason) {
    s.status = 'abort';
    s.reason = `${reason} The launch abort system pulled the crew capsule away. The crew is safe.`;
    s.events.push({ kind: 'abort', t: s.t });
  }

  // Engine cutoff: how good is the orbit? A bad ascent costs lander fuel (the upper stage has to fix it).
  function finish(s) {
    const c = s.cfg, gamma = (Math.atan2(s.vy, s.vx) * 180) / Math.PI;
    s.orbit = { alt: s.y, gamma };
    if (s.y < 100) return abort(s, `Engine cutoff at only ${Math.round(s.y)} km: too low for orbit.`);
    s.penalty = Math.min(6, Math.round(s.loss * 3 + s.stageLate + Math.abs(s.y - c.targetAlt) / 30 + Math.abs(gamma) * 0.2)); // at most 6% so one bad launch does not end the mission
    s.status = 'orbit';
    s.events.push({ kind: 'meco', t: s.t });
  }

  const missionTime = (s) => {
    if (s.t < 0) return `T-00:0${Math.ceil(-s.t)}`;
    const r = Math.floor(s.t * s.cfg.SCALE);
    return `T+${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
  };

  return { guidePitch, speedAt, stageEnd, idealPath, startLaunch, stepLaunch, separate, missionTime, total };
})();

if (typeof module !== 'undefined') module.exports = { LAUNCH, Launch };
