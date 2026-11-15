// Mission 4, the finale: re-entry into Earth's air and splashdown. Pure, no DOM, so it runs in Node tests.
// Entry: Orion arrives at about 11 km/s. Keep the entry angle in the corridor (real Apollo corridor: about
// 6.5 degrees down) while gusts push it. Too steep: the heat shield takes damage. Too shallow: the capsule
// skips off the air (it comes back for another pass, but it is a rough ride). Then the parachutes open by
// themselves, as on the real Orion: drogues at ~7 km, the three mains at ~3 km. Under the chutes the capsule
// swings in the wind: steer it upright with the same UP/DOWN. Splashing down tilted means the uprighting
// air bags must flip it. Friendly for kids: no deaths, mistakes only cost stars.
const REENTRY = {
  entryTime: 24,          // seconds of the fiery part (game time)
  corridor: [-7.2, -5.8], // degrees: inside = safe entry
  pitchRate: 2.5,          // degrees per second with UP/DOWN
  gust: 45,               // how hard the air pushes the angle around
  skipTime: 2.5,          // seconds too shallow before the capsule skips off the air
  blackout: [0.2, 0.6],   // part of the entry with no radio (plasma around the capsule)
  drogue: 7,              // km: the drogue chutes open by themselves
  main: 3,                // km: then the three main chutes
  fall: { none: 0.6, drogue: 0.3, main: 0.2 }, // km per second of game time (sped up)
  upright: 12,            // degrees: tilt allowed at splashdown
  tiltRate: 25,           // degrees per second with UP/DOWN under the chutes
  wind: 30,               // how hard the wind swings the capsule
};

const Reentry = (function () {
  function startReentry(rng, cfg = REENTRY) {
    return {
      cfg, rng, phase: 'entry', t: 0, angle: -6.5 + (rng() - 0.5) * 3, gust: 0, heat: 0, shield: 100, skips: 0, skipT: 0,
      alt: 120, v: 11, blackout: false, drogue: null, main: null, tilt: 0, wind: 0, upright: null,
      splashV: null, status: 'flying', log: [],
    };
  }
  const say = (s, m) => s.log.push(m);

  // input: { up, down } (entry: UP = shallower, DOWN = steeper; chutes: UP = tilt left, DOWN = tilt right)
  function stepReentry(s, dt, input) {
    if (s.status !== 'flying') return;
    const c = s.cfg;
    s.t += dt;
    if (s.phase === 'entry') {
      const p = Math.min(1, s.t / c.entryTime);
      s.alt = 120 - 110 * p; s.v = 11 - 10.6 * Math.pow(p, 0.7);
      s.gust += ((s.rng() - 0.5) * c.gust * 4 - s.gust * 1.5) * dt;
      s.angle = Math.max(-12, Math.min(-1, s.angle + (s.gust * 0.12 + ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * c.pitchRate) * dt));
      const steep = Math.max(0, c.corridor[0] - s.angle);
      s.heat = 0.25 + 0.55 * Math.sin(p * Math.PI) + steep * 0.18;
      if (steep > 0) s.shield = Math.max(30, s.shield - steep * 4 * dt);
      if (s.angle > c.corridor[1]) {
        if ((s.skipT += dt) >= c.skipTime) { // skipped off the air: another pass, a rough ride
          s.skips++; s.skipT = 0; s.angle = -6.5; if (s.skips <= 2) s.t = Math.max(0, s.t - 3); // another pass takes time (but never forever)
          say(s, 'We skipped off the top of the air! The computer turns us back in for another pass.');
        }
      } else s.skipT = Math.max(0, s.skipT - dt);
      const was = s.blackout;
      s.blackout = p > c.blackout[0] && p < c.blackout[1];
      if (s.blackout && !was) say(s, 'Radio blackout: the glowing air around us blocks all radio.');
      if (!s.blackout && was) say(s, 'Flight control here: we hear you again! Welcome back.');
      if (p >= 1) { s.phase = 'chutes'; s.alt = 10; s.v = 0.3; s.gust = 0; say(s, 'Through the fire! The parachutes open by themselves. Keep the capsule steady with UP and DOWN.'); }
      return;
    }
    if (s.phase === 'chutes') {
      if (!s.drogue && s.alt <= c.drogue) { s.drogue = 'open'; say(s, 'Drogue chutes out: they slow us down. The wind swings us - keep the capsule straight.'); }
      if (!s.main && s.alt <= c.main) { s.main = 'open'; say(s, 'Three main chutes open! Keep her upright for a soft splashdown.'); }
      const rate = s.main ? c.fall.main : s.drogue ? c.fall.drogue : c.fall.none;
      s.alt = Math.max(0, s.alt - rate * dt);
      s.v = rate;
      // Wind gusts swing the capsule (a random walk, like the entry gusts); UP/DOWN push it back.
      s.wind += ((s.rng() - 0.5) * c.wind * 4 - s.wind * 1.2) * dt;
      s.tilt = Math.max(-40, Math.min(40, s.tilt + (s.wind * 0.6 + ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * c.tiltRate) * dt));
      if (s.alt <= 0) splash(s);
    }
  }

  function splash(s) {
    s.phase = 'splash'; s.status = 'done';
    s.splashV = 8;
    s.upright = Math.abs(s.tilt) <= s.cfg.upright;
    say(s, s.upright ? 'Splashdown! A soft, upright landing in the Pacific Ocean.' : 'Splashdown, but tilted! The orange uprighting bags flip us back upright. Everyone is fine.');
  }

  // Stars for the re-entry: start at 3, lose one for a damaged shield, a skip, or a tilted splashdown.
  function score(s) {
    const stars = Math.max(1, 3 - (s.shield < 70 ? 1 : 0) - (s.skips > 0 ? 1 : 0) - (s.upright ? 0 : 1));
    return { stars, shield: Math.round(s.shield), skips: s.skips, splashV: s.splashV, upright: s.upright };
  }

  return { startReentry, stepReentry, score };
})();

if (typeof module !== 'undefined') module.exports = { REENTRY, Reentry };
