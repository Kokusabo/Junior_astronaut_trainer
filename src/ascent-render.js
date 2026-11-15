// Mission 4, part 1: lifting off from the Moon. The top of the lander (the crew cabin) fires its engine and
// leaves the gold descent stage behind on the landing site. Near the ground the real site terrain is drawn
// (LandingRender.drawWorldAt); higher up the view zooms out to black space and the Moon's curved edge.
const AscentRender = (function () {
  const W = 640, H = 360, RX = 250, R_MOON = 1737;
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [];
  for (let i = 0; i < 160; i++) stars.push({ x: rnd() * W, y: rnd() * H, b: rnd() });
  let cur = null, path = null, debris = [], lastT = 0;

  // site: { T (terrain), x (lander position, m) }
  function draw(context, t, s, site) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    if (cur !== s) { cur = s; path = Launch.idealPath(s.cfg); debris = []; lastT = t; }
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    const k = Math.max(0.35, 650 / (1 + s.y * 9)); // px per km: close on the pad, far in orbit
    const BASE = LandingRender.BASE, ry = BASE - 37 - Math.min(60, s.y * k); // where the cabin sits on screen (on top of the descent stage at first)
    const SX = (wx) => RX + (wx - s.x) * k, SY = (wy) => ry - (wy - s.y) * k;
    const sprite = LandingRender.landerSprite(), sc = 1.8;
    if (k >= 50) { // near the ground: the real landing-site terrain, with the descent stage left behind
      const camera = { x: site.x + s.x * 1000 - (RX - W / 2) / (k / 1000), ref: Landing.heightAt(site.T, site.x), s: k / 1000 };
      LandingRender.drawWorldAt(ctx, site.T, LANDING, camera, site.roughness || 0.3);
      const lx = W / 2 + (site.x - camera.x) * camera.s, lsc = Math.max(0.4, sc * (k / 650)); // the descent stage stays where we landed
      ctx.drawImage(sprite, 0, 13, 32, 15, Math.round(lx - 16 * lsc), Math.round(BASE - 14 * lsc), Math.round(32 * lsc), Math.round(15 * lsc));
    } else { // space: stars, then the Moon's curved edge below and Earth above the horizon
      px(0, 0, W, H, '#05040c');
      for (const st of stars) px(st.x, st.y, 1, 1, st.b > 0.7 ? '#ffffff' : '#7a76a8');
      const cy = SY(-R_MOON), r = R_MOON * k;
      ctx.fillStyle = '#4a4650'; ctx.beginPath(); ctx.arc(RX, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8e8a94'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(RX, cy, r, Math.PI, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 18; i++) { const a = -Math.PI / 2 + (i - 9) * 0.004 * (20 / Math.max(1, k)), rr = r - 8 - (i % 4) * 7; ctx.fillStyle = i % 2 ? '#3a3640' : '#5e5a64'; ctx.beginPath(); ctx.ellipse(RX + Math.cos(a) * rr, cy + Math.sin(a) * rr, 4 + (i % 3) * 3, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
      if (MoonRender.drawEarthAt) MoonRender.drawEarthAt(ctx, 520, Math.max(60, cy - r - 30), 16);
    }
    // Guidance: where a perfect ascent goes.
    if (s.status === 'flying' && s.t > 0) {
      ctx.fillStyle = 'rgba(111,227,255,0.75)';
      path.forEach((p, i) => { const x = SX(p.x), y = SY(p.y); if (x > -4 && x < W + 4 && y > -4 && y < H && (i + Math.floor(t * 4)) % 2 === 0) ctx.fillRect(Math.round(x), Math.round(y), 2, 2); });
    }
    // Lift-off: gold foil and dust blown out from the descent stage.
    if (s.t > 0 && s.t < 0.3 && !debris.length) for (let i = 0; i < 40; i++) debris.push({ x: RX + (Math.random() - 0.5) * 20, y: BASE - 6, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, age: 0, c: i % 3 ? '#e0b850' : '#c8c2bc' });
    debris = debris.filter((d) => (d.age += dt) < 2);
    for (const d of debris) { d.vy += 60 * dt; d.x += d.vx * dt; d.y = Math.min(BASE - 2, d.y + d.vy * dt); px(d.x, d.y, 2, 1, d.c); }
    // The ascent stage (top of the lander), tilted by its pitch, with its engine flame.
    ctx.save(); ctx.translate(RX, ry); ctx.rotate(((90 - s.pitch) * Math.PI) / 180);
    if (s.firing && s.t > 0 && s.status === 'flying') for (let q = 0; q < 16 * (0.8 + Math.random() * 0.4); q++) { const w = Math.max(1, 4 - q * 0.2); px(-w / 2, 12 + q, w, 1, q < 4 ? '#ffffff' : q < 9 ? '#ffe9a0' : 'rgba(255,170,80,0.6)'); }
    ctx.drawImage(sprite, 0, 0, 32, 14, Math.round(-16 * sc), Math.round(-14 * sc + 12), Math.round(32 * sc), Math.round(14 * sc));
    ctx.restore();
    hud(t, s);
  }

  function hud(t, s) {
    const c = s.cfg;
    MoonRender.hudPanel(ctx, 6, 6, 160, 50);
    T(Launch.missionTime(s), 12, 12, s.t < 0 ? '#ffd34d' : '#c8c4f0');
    T(`ALT   ${s.y.toFixed(1)} KM`, 12, 24, '#c8c4f0');
    T(`SPEED ${Math.hypot(s.vx, s.vy).toFixed(2)} KM/S`, 12, 36, '#c8c4f0');
    // Pitch gauge (same idea as the Earth launch): keep the white needle on the green one.
    const gx = 470, gy = 116, R = 44;
    MoonRender.hudPanel(ctx, gx - 10, gy - R - 22, R + 120, R + 40);
    T('PITCH', gx, gy - R - 16, '#8a84b0');
    for (let a = 0; a <= 90; a += 3) { const r = (a * Math.PI) / 180; px(gx + Math.cos(r) * R, gy - Math.sin(r) * R, 1, 1, a % 30 === 0 ? '#c8c4f0' : '#3a3460'); }
    const needle = (deg, col, len) => { const r = (Math.max(-10, Math.min(95, deg)) * Math.PI) / 180; for (let q = 4; q < len; q++) px(gx + Math.cos(r) * q, gy - Math.sin(r) * q, 2, 2, col); };
    const target = Launch.guidePitch(s.burnT, c), off = Math.abs(s.pitch - target);
    needle(target, '#4dffc3', R + 2); needle(s.pitch, off > 10 ? '#ff4d6a' : '#ffffff', R - 6);
    T(`${Math.round(s.pitch)} DEG`, gx + R + 12, gy - 30, off > 10 ? '#ff4d6a' : '#ffffff');
    T(`GO ${Math.round(target)}`, gx + R + 12, gy - 16, '#4dffc3');
    const cx = 310, blink = Math.floor(t * 3) % 4 !== 0;
    if (s.status === 'flying') {
      if (s.t < 0) T(`${Math.ceil(-s.t)}`, cx, 40, '#ffd34d', 4, 'center');
      else if (s.t < 1.5) T('LIFTOFF FROM THE MOON!', cx, 40, '#ffd34d', 2, 'center');
      else T('FOLLOW THE GREEN NEEDLE TO ORBIT', cx, 44, '#8a84b0', 1, 'center');
    } else if (s.status === 'orbit') { MoonRender.hudPanel(ctx, cx - 150, 28, 300, 46); T('LUNAR ORBIT', cx, 36, '#4dffc3', 2, 'center'); T(`${Math.round(s.orbit.alt)} KM UP${s.penalty ? `: WOBBLY CLIMB COST ${s.penalty}% FUEL` : ''}`, cx, 58, '#c8c4f0', 1, 'center'); }
    else if (blink) T('NOT IN ORBIT', cx, 40, '#ff4d6a', 2, 'center');
  }

  return { draw, W, H };
})();

if (typeof module !== 'undefined') module.exports = AscentRender;
