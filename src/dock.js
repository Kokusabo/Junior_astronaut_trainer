// Mission 4, part 2: docking. The lander's top (the crew cabin) meets Orion, which waited in lunar orbit.
// Hold the thrust to close in, release it to slow down, line up with UP/DOWN. Too fast or off-centre = a gentle
// bounce back and another try (no game over, a bounce just costs a little fuel).
const DOCK = { start: 50, fast: 4, slow: 0.25, accel: 1.5, maxSpeed: 1, tol: 1, vy: 3, bounceBack: 14, bounceFuel: 0.5 };

const Dock = (function () {
  function startDock(rng, cfg = DOCK) {
    return { cfg, rng, t: 0, x: cfg.start, y: (rng() < 0.5 ? -1 : 1) * (3 + rng() * 3), vx: 0, vy: 0, bounces: 0, status: 'flying', log: [] };
  }
  // input: { up, down, thrust }
  function stepDock(s, dt, input) {
    if (s.status !== 'flying') return;
    const c = s.cfg;
    s.t += dt;
    const target = input.thrust ? c.fast : c.slow;
    s.vx += Math.sign(target - s.vx) * Math.min(Math.abs(target - s.vx), c.accel * dt * (input.thrust ? 1 : 2));
    s.vy += ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * 6 * dt;
    s.vy = Math.max(-c.vy, Math.min(c.vy, s.vy)) * (1 - 0.8 * dt); // a little damping
    s.x -= s.vx * dt; s.y += s.vy * dt;
    s.y = Math.max(-9, Math.min(9, s.y));
    if (s.x <= 0) {
      if (Math.abs(s.y) <= c.tol && s.vx <= c.maxSpeed) { s.x = 0; s.status = 'docked'; s.log.push('Docked! The ports clicked together.'); }
      else {
        const fast = s.vx > c.maxSpeed && Math.abs(s.y) <= c.tol;
        s.bounces++; s.x = c.bounceBack; s.vx = 0;
        s.log.push(fast ? 'Too fast! We bounced off. Slow down before the touch.' : 'Not lined up! We bounced off. Line up the cross first.');
      }
    }
  }
  const fuelCost = (s) => s.bounces * s.cfg.bounceFuel;
  return { startDock, stepDock, fuelCost };
})();

if (typeof module !== 'undefined') module.exports = { DOCK, Dock };
