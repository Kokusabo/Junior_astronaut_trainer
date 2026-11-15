// Mission 2, part 1: drawing the launch (side view). The rocket stays near the middle at a fixed size and
// the world zooms out as it climbs: the pad and tower, clouds, the sky turning black, Earth's curved edge.
const LaunchRender = (function () {
  const W = 640, H = 360, RX = 250, RY = 200; // where the rocket sits on screen
  const R_EARTH = 6371;
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
  let seed = 21;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [];
  for (let i = 0; i < 180; i++) stars.push({ x: rnd() * W, y: rnd() * H, b: rnd() });
  // Clouds in world km: [x, altitude, width]. Low puffy ones and a high thin layer.
  const clouds = [];
  for (let i = 0; i < 26; i++) clouds.push([-3 + rnd() * 30, 1.2 + rnd() * 2.2, 0.4 + rnd() * 1.2, i % 3 === 0]);
  for (let i = 0; i < 10; i++) clouds.push([rnd() * 60, 8 + rnd() * 3, 2 + rnd() * 4, false]);

  // Rocket sprites (nose up), 1 px = about 1.5 m: two side boosters, orange core, upper stage, capsule, abort tower.
  const RW = 22, RH = 64;
  const sprites = {};
  function bake(parts) {
    const c = document.createElement('canvas');
    c.width = RW; c.height = RH;
    const saved = ctx; ctx = c.getContext('2d');
    const shadeRow = (x0, x1, y, light, mid, dark) => { for (let x = x0; x <= x1; x++) px(x, y, 1, 1, x - x0 < (x1 - x0) * 0.3 ? dark : x - x0 > (x1 - x0) * 0.7 ? light : mid); };
    if (parts.las) { px(10, 0, 2, 2, '#ff4d6a'); px(10, 2, 2, 7, '#c8ccd6'); px(9, 5, 4, 3, '#eef0f6'); }
    if (parts.capsule) {
      for (let y = 9; y <= 16; y++) { const h = Math.round((y - 9) * 0.55); shadeRow(10 - h, 11 + h, y, '#ffffff', '#e6e8ee', '#b8bcc8'); }
      for (let y = 17; y <= 20; y++) shadeRow(7, 14, y, '#eef0f6', '#d4d8e2', '#a8aebc');
      px(7, 20, 8, 1, '#5a5f6c');
      for (let y = 21; y <= 26; y++) shadeRow(8, 13, y, '#f4f4f8', '#dcdee6', '#b0b4c0'); // upper stage
    }
    if (parts.core) {
      px(7, 27, 8, 1, '#5a5f6c');
      for (let y = 28; y <= 59; y++) shadeRow(7, 14, y, '#ffb05a', '#e8862a', '#a8541a'); // orange insulation
      for (const y of [36, 47, 55]) px(7, y, 8, 1, 'rgba(90,40,10,0.5)');
      px(8, 60, 2, 3, '#5a5a66'); px(12, 60, 2, 3, '#5a5a66'); px(10, 60, 2, 2, '#3a3a46'); // RS-25 engines
    }
    if (parts.boosters) for (const x0 of [2, 16]) {
      px(x0 + 1, 18, 2, 2, '#e6e8ee'); px(x0, 20, 4, 2, '#d4d8e2');
      for (let y = 22; y <= 57; y++) shadeRow(x0, x0 + 3, y, '#ffffff', '#e6e8ee', '#a8aebc');
      for (const y of [30, 40, 50]) px(x0, y, 4, 1, '#5a5f6c');
      px(x0, 58, 4, 4, '#4a4a56');
    }
    ctx = saved;
    return c;
  }
  function spriteFor(s) {
    const key = `${s.stage}${s.lasGone ? 'n' : 'l'}${s.status === 'orbit' ? 'o' : ''}`;
    if (!sprites[key]) sprites[key] = bake({ las: !s.lasGone, capsule: true, core: s.status !== 'orbit', boosters: s.stage === 0 });
    return sprites[key];
  }

  // Sky colour by altitude (km): blue near the ground, black in space.
  const SKY = [[0, [106, 176, 240]], [8, [58, 120, 208]], [20, [26, 58, 138]], [40, [10, 20, 64]], [70, [3, 2, 10]]];
  function skyAt(h) {
    for (let i = 1; i < SKY.length; i++) if (h < SKY[i][0]) {
      const [a, ca] = SKY[i - 1], [b, cb] = SKY[i], k = (h - a) / (b - a);
      return ca.map((v, j) => Math.round(v + (cb[j] - v) * k));
    }
    return SKY[SKY.length - 1][1];
  }
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Per-launch state (camera, trail, smoke, falling stages).
  let cur = null, trail = [], smoke = [], debris = [], seen = 0, lastT = 0, path = null, banner = { text: '', t: -9, col: '#fff' };
  function reset(s, t) { cur = s; trail = []; smoke = []; debris = []; seen = 0; lastT = t; path = Launch.idealPath(s.cfg); banner = { text: '', t: -9, col: '#fff' }; }

  function draw(context, t, s) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    if (cur !== s) reset(s, t);
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    const c = s.cfg;
    const k = Math.max(0.35, 650 / (1 + s.y * 9)); // px per km: 650 on the pad, under 1 in orbit
    const SX = (wx) => RX + (wx - s.x) * k, SY = (wy) => RY + RH / 2 - 2 - (wy - s.y) * k; // world y = the rocket's base
    const shake = s.t > -0.5 && s.y < 3 && s.status === 'flying' ? 2 : s.y < 12 && s.firing && s.burnT > c.maxQ[0] && s.burnT < c.maxQ[1] ? 1 : 0;
    ctx.save();
    if (shake) ctx.translate(Math.round((Math.random() - 0.5) * 2 * shake), Math.round((Math.random() - 0.5) * 2 * shake));

    // Sky: a few bands, lighter toward the horizon. Stars once the air is thin.
    const sky = skyAt(s.y), low = skyAt(Math.max(0, s.y - 12));
    for (let b = 0; b < 8; b++) { const q = b / 7; px(-4, -4 + b * (H / 8 + 1), W + 8, H / 8 + 2, rgb(sky.map((v, j) => v + (low[j] - v) * q * 0.6))); }
    if (s.y > 20) { ctx.globalAlpha = Math.min(1, (s.y - 20) / 40); for (const st of stars) px(st.x, st.y, 1, 1, st.b > 0.6 ? '#ffffff' : '#8a84c0'); ctx.globalAlpha = 1; }

    // Earth: flat Florida coast near the pad, then a curved planet as we climb.
    const gy = SY(0);
    if (k > 25) {
      if (gy < H + 4) {
        px(-4, gy, W + 8, H - gy + 4, '#2a5a8a'); // Atlantic Ocean (downrange, to the east)
        const coast = SX(0.35); // the pad is a few hundred metres from the Atlantic beach
        if (coast > -4) px(-4, gy, coast + 4, H - gy + 4, '#3a6a34');
        if (coast > -4) px(-4, gy, coast + 4, 2, '#5a8a44');
        px(coast, gy, W, 2, '#4a7ab0');
      }
    } else {
      const cy = SY(-R_EARTH), r = R_EARTH * k;
      ctx.fillStyle = '#1e4a8a'; ctx.beginPath(); ctx.arc(RX, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(240,245,255,0.25)';
      for (let i = 0; i < 30; i++) { const a = -Math.PI / 2 + (i - 15) * 0.0025 * (20 / Math.max(1, k)); ctx.fillRect(Math.round(RX + Math.cos(a) * (r - 6 - (i % 3) * 5)), Math.round(cy + Math.sin(a) * (r - 6 - (i % 3) * 5)), 6 + (i % 4) * 4, 2); }
      for (let i = 1; i <= 4; i++) { ctx.strokeStyle = `rgba(120,180,255,${0.5 / i})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(RX, cy, r + i * 2, Math.PI, Math.PI * 2); ctx.stroke(); }
    }
    // Pad: flame trench and the launch tower beside the rocket.
    if (k > 60) {
      const bx = SX(0), u = k / 650; // u: 1 px per 1.5 m sprite scale at liftoff
      px(bx - 30 * u, gy - 2, 60 * u, 4, '#8a8a90');
      const tx = bx - 22 * u, th = 82 * u;
      px(tx - 6 * u, gy - th, 7 * u, th, '#6a6a74');
      for (let y = 0; y < th; y += Math.max(2, 6 * u)) px(tx - 6 * u, gy - th + y, 7 * u, 1, '#3a3a44');
      px(tx - 8 * u, gy - th - 4 * u, 11 * u, 4 * u, '#8a8a94');
      if (s.t < 0.5) px(tx, gy - th * 0.72, 6 * u, 2 * u, '#9a9aa4'); // crew access arm
    }
    // Guidance line: where a perfect ascent goes.
    if (s.status !== 'abort') {
      ctx.fillStyle = 'rgba(111,227,255,0.75)';
      for (let i = 0; i < path.length; i++) {
        const p = path[i], x = SX(p.x), y = SY(p.y);
        if (x > -4 && x < W + 4 && y > -4 && y < H + 4 && (i + Math.floor(t * 4)) % 2 === 0) ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
    }
    // Clouds behind the rocket.
    const drawClouds = (front) => {
      for (const [cx0, ca, cw, fr] of clouds) {
        if (fr !== front) continue;
        const x = SX(cx0), y = SY(ca), w = cw * k;
        if (x + w < -10 || x - w > W + 10 || y < -40 || y > H + 40 || w < 2) continue;
        const thin = ca > 7;
        ctx.fillStyle = thin ? 'rgba(240,245,255,0.35)' : 'rgba(250,252,255,0.9)';
        if (thin) { ctx.fillRect(Math.round(x - w), Math.round(y), Math.round(w * 2), Math.max(1, Math.round(w * 0.05))); continue; }
        for (let j = 0; j < 4; j++) { const r = w * (0.35 + 0.1 * ((j * 7) % 3)); ctx.beginPath(); ctx.ellipse(Math.round(x - w * 0.6 + j * w * 0.4), Math.round(y - r * 0.2), r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(190,205,225,0.8)'; ctx.fillRect(Math.round(x - w * 0.9), Math.round(y + w * 0.1), Math.round(w * 1.8), Math.max(1, Math.round(w * 0.12)));
      }
    };
    drawClouds(false);
    // Exhaust trail and the ground smoke cloud at liftoff.
    if (s.firing && s.t > 0 && s.status === 'flying') trail.push({ x: s.x, y: s.y, age: 0 });
    if (s.t > -0.6 && s.t < 4 && s.status === 'flying') for (let n = 0; n < 4; n++) smoke.push({ x: (Math.random() - 0.5) * 0.03, y: 0.005, vx: (Math.random() - 0.5) * 0.12, vy: Math.random() * 0.02, r: 0.01 + Math.random() * 0.015, age: 0 });
    trail = trail.filter((p) => (p.age += dt) < 7);
    for (const p of trail) {
      const x = SX(p.x), y = SY(p.y);
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
      ctx.globalAlpha = Math.max(0, 1 - p.age / 7) * (p.y < 40 ? 0.7 : 0.25);
      const r = Math.max(1, Math.min(10, (0.004 + p.age * 0.004) * k));
      px(x - r / 2, y - r / 2, r, r, p.y < 40 ? '#e6e6ea' : '#a8b4d0');
    }
    smoke = smoke.filter((p) => (p.age += dt) < 4);
    for (const p of smoke) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += 0.01 * dt;
      ctx.globalAlpha = Math.max(0, 1 - p.age / 4) * 0.9;
      ctx.fillStyle = '#f0f0f2'; ctx.beginPath(); ctx.arc(Math.round(SX(p.x)), Math.round(SY(p.y)), Math.max(1, p.r * k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // New events: banners, falling stages.
    for (; seen < s.events.length; seen++) {
      const e = s.events[seen];
      if (e.kind === 'stage' && e.stage === 0) for (const side of [-1, 1]) debris.push({ x: s.x, y: s.y, vx: s.vx * 0.8, vy: s.vy * 0.8 + side * 0.04, rot: 0, spin: side * 1.5, kind: 'booster' });
      if (e.kind === 'las') debris.push({ x: s.x, y: s.y, vx: s.vx * 1.1, vy: s.vy * 1.3 + 0.1, rot: 0, spin: 4, kind: 'las' });
      if (e.kind === 'meco') debris.push({ x: s.x, y: s.y, vx: s.vx * 0.97, vy: s.vy * 0.9 - 0.02, rot: 0, spin: 0.6, kind: 'core' });
      const B = { burnout: ['BURNOUT! PRESS STAGE', '#ffd34d'], stage: [e.late > 0.5 ? 'STAGE SEPARATION (LATE)' : 'STAGE SEPARATION', '#4dffc3'], autostage: ['COMPUTER STAGED FOR YOU', '#ff9a3d'], las: ['ABORT TOWER JETTISONED', '#6fe3ff'], meco: ['MAIN ENGINE CUTOFF', '#4dffc3'], abort: ['ABORT! ABORT!', '#ff4d6a'] }[e.kind];
      if (B) banner = { text: B[0], col: B[1], t };
    }
    for (const d of debris) {
      d.vy -= c.g * c.SCALE * 12 * dt; d.vx *= 1 - 0.5 * dt; d.x += d.vx * dt * c.posScale; // falls away fast so it reads on screen d.y += d.vy * dt * c.posScale; d.rot += d.spin * dt;
      const x = SX(d.x), y = SY(d.y);
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(d.rot);
      if (d.kind === 'booster') { px(-2, -18, 4, 36, '#e6e8ee'); px(-2, 16, 4, 3, '#4a4a56'); }
      else if (d.kind === 'core') { px(-4, -16, 8, 32, '#e8862a'); px(-4, 16, 8, 3, '#5a5a66'); }
      else { px(-1, -5, 2, 10, '#c8ccd6'); px(-1, -6, 2, 2, '#ff4d6a'); px(-1, 5, 2, 3 + Math.random() * 3, '#ffd34d'); }
      ctx.restore();
    }

    // The rocket, tilted by its pitch, with flames: bright smoky boosters, pale blue hydrogen core flame.
    if (s.status !== 'abort') {
      ctx.save();
      ctx.translate(RX, RY);
      ctx.rotate(((90 - s.pitch) * Math.PI) / 180);
      if (s.firing && s.t > -0.3) {
        const wide = 1 + Math.min(3, s.y / 25); // flames spread out in thin air
        const flick = () => 0.85 + Math.random() * 0.3;
        if (s.stage === 0) for (const bx of [-7, 7]) for (let q = 0; q < 26 * flick(); q++) {
          const w = Math.max(1, (2 + q * 0.12) * wide * 0.6);
          px(bx - w / 2, RH / 2 - 2 + q, w, 1, q < 5 ? '#ffffff' : q < 14 ? '#ffe9a0' : 'rgba(255,170,80,0.7)');
        }
        for (let q = 0; q < 20 * flick(); q++) {
          const w = Math.max(1, (2.5 + q * 0.08) * wide * 0.7);
          px(-w / 2, RH / 2 - 1 + q, w, 1, q % 6 === 2 ? '#ffffff' : q < 4 ? '#e0f0ff' : 'rgba(150,190,255,0.6)'); // Mach diamonds
        }
      } else if (s.status === 'orbit') {
        const w = 2 + Math.random();
        px(-w / 2, RH / 2 - 38, w, 6, 'rgba(150,190,255,0.5)');
      }
      ctx.drawImage(spriteFor(s), -RW / 2, -RH / 2);
      ctx.restore();
    } else {
      // Abort: the capsule rockets away from the falling stack, then floats down under parachutes.
      const at = t - banner.t;
      const x = RX + at * 20, y = RY - at * 60 + at * at * 18;
      if (at < 1.5) { px(x - 3, y - 2, 6, 6, '#eef0f6'); px(x - 2, y + 4, 4, 8 + Math.random() * 6, '#ffd34d'); }
      else { px(x - 3, y, 6, 6, '#eef0f6'); for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#ff6a4d' : '#ffffff'; ctx.beginPath(); ctx.arc(x - 8 + i * 8, y - 16, 6, Math.PI, 0); ctx.fill(); } }
      if (at < 0.3) { ctx.fillStyle = 'rgba(255,220,180,0.6)'; ctx.fillRect(0, 0, W, H); }
    }
    drawClouds(true);
    ctx.restore();
    hud(t, s);
  }

  function hud(t, s) {
    const c = s.cfg;
    MoonRender.hudPanel(ctx, 6, 6, 160, 62);
    T(Launch.missionTime(s), 12, 12, s.t < 0 ? '#ffd34d' : '#c8c4f0');
    T(`ALT   ${s.y.toFixed(1)} KM`, 12, 24, '#c8c4f0');
    T(`SPEED ${Math.hypot(s.vx, s.vy).toFixed(2)} KM/S`, 12, 36, '#c8c4f0');
    const st = s.status === 'orbit' ? 'IN ORBIT' : (c.stages[s.stage] || {}).name || '';
    T(`STAGE ${Math.min(s.stage + 1, c.stages.length)}: ${st}`, 12, 50, '#8a84b0');
    // Pitch gauge: quarter circle from horizon (0) to straight up (90). Green = guidance, white = rocket.
    const gx = 470, gyy = 120, R = 46;
    MoonRender.hudPanel(ctx, gx - 10, gyy - R - 22, R + 120, R + 40);
    T('PITCH', gx, gyy - R - 16, '#8a84b0');
    for (let a = 0; a <= 90; a += 2) {
      const r = (a * Math.PI) / 180;
      px(gx + Math.cos(r) * R, gyy - Math.sin(r) * R, 1, 1, a % 30 === 0 ? '#c8c4f0' : '#3a3460');
    }
    const needle = (deg, col, len) => {
      const r = (Math.max(-10, Math.min(95, deg)) * Math.PI) / 180;
      for (let q = 4; q < len; q++) px(gx + Math.cos(r) * q, gyy - Math.sin(r) * q, 2, 2, col);
    };
    const target = Launch.guidePitch(s.burnT, c), off = Math.abs(s.pitch - target);
    needle(target, '#4dffc3', R + 2);
    needle(s.pitch, off > 10 ? '#ff4d6a' : '#ffffff', R - 6);
    px(gx - 2, gyy - 2, 5, 5, '#c8c4f0');
    T(`${Math.round(s.pitch)} DEG`, gx + R + 12, gyy - 30, off > 10 ? '#ff4d6a' : '#ffffff');
    T(`GO ${Math.round(target)}`, gx + R + 12, gyy - 16, '#4dffc3');
    T(s.pitch < target - 1.5 ? 'STEER UP' : s.pitch > target + 1.5 ? 'STEER DOWN' : 'ON TRACK', gx + R + 12, gyy - 2, off > 10 ? '#ff4d6a' : '#8a84b0');

    // Banners.
    const cx = 320, blink = Math.floor(t * 3) % 4 !== 0;
    if (s.status === 'flying') {
      if (s.t < 0) T(`${Math.ceil(-s.t)}`, cx, 40, '#ffd34d', 4, 'center');
      else if (!s.firing) { if (blink) T('BURNOUT! PRESS STAGE', cx, 40, '#ffd34d', 2, 'center'); T('SPACE OR THE STAGE BUTTON', cx, 62, '#c8c4f0', 1, 'center'); }
      else if (s.overT > 0) { if (blink) T('STRUCTURAL LOADS! BACK ON TRACK', cx, 40, '#ff4d6a', 2, 'center'); }
      else if (t - banner.t < 2.5) T(banner.text, cx, 40, banner.col, 2, 'center');
      else if (s.t < 1.5) T('LIFTOFF!', cx, 40, '#ffd34d', 2, 'center');
      else if (s.burnT < c.clear + 1) T('CLEAR OF THE TOWER: FOLLOW THE GREEN NEEDLE', cx, 44, '#8a84b0', 1, 'center');
      else if (s.burnT > c.maxQ[0] && s.burnT < c.maxQ[1] && s.y < c.thickAir) T('MAX Q: STRONGEST AIR PRESSURE, HOLD STEADY', cx, 44, '#ff9a3d', 1, 'center');
    } else if (s.status === 'orbit') {
      MoonRender.hudPanel(ctx, cx - 160, 28, 320, 58);
      T('ORBIT REACHED', cx, 36, '#4dffc3', 2, 'center');
      T(`${Math.round(s.orbit.alt)} KM UP, ${Math.hypot(s.vx, s.vy).toFixed(1)} KM/S`, cx, 58, '#c8c4f0', 1, 'center');
      T(s.penalty ? `A WOBBLY ASCENT COST ${s.penalty}% LANDER FUEL` : 'PERFECT ASCENT: NO EXTRA FUEL USED', cx, 70, s.penalty > 4 ? '#ff9a3d' : '#8a84b0', 1, 'center');
    } else {
      if (blink) T('ABORT! ABORT!', cx, 40, '#ff4d6a', 2, 'center');
      T('THE CREW CAPSULE ESCAPED. THE CREW IS SAFE.', cx, 62, '#c8c4f0', 1, 'center');
    }
  }

  return { draw, W, H };
})();

if (typeof module !== 'undefined') module.exports = LaunchRender;
