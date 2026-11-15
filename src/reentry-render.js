// Mission 4, the finale: drawing the re-entry, the parachutes and the splashdown.
const ReentryRender = (function () {
  const W = 640, H = 360, CX = 300, CY = 170;
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [], clouds = [];
  for (let i = 0; i < 140; i++) stars.push({ x: rnd() * W, y: rnd() * H, b: rnd() });
  for (let i = 0; i < 14; i++) clouds.push({ x: rnd() * W, y: rnd() * 900, w: 40 + rnd() * 50 });
  const lerp = (a, b, q) => a.map((v, i) => Math.round(v + (b[i] - v) * q));
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  // Orion's crew module: a cone, heat shield (brown) at the base (local +y), a window and the docking hatch on top.
  // Re-entry: the shield leads, hot plasma shocks in front of it and streams back past the cone.
  // sep: seconds since the service module (with solar wings) was let go; it drifts away behind the capsule.
  function capsule(x, y, rot, glow, sep = 99) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot);
    if (glow > 0) {
      for (let i = 0; i < 26; i++) { const q = i / 26, len = 20 + glow * 80 * (0.7 + Math.random() * 0.5); ctx.globalAlpha = 0.55 * glow * (1 - q * 0.5); px(-12 + q * 24, -20 - len, 2, len + 20, q < 0.3 || q > 0.7 ? '#ff6a8a' : '#ffb547'); }
      ctx.globalAlpha = 0.9 * glow; px(-15, 5, 30, 4, '#fff2c0'); px(-13, 8, 26, 3, '#ffffff'); ctx.globalAlpha = 1;
    }
    for (let r = 0; r < 18; r++) { const w = Math.round(13 - r * 0.55); px(-w, -r, w * 2, 1, r < 3 ? '#cfd3dc' : '#e6e8ee'); px(w * 0.3, -r, w * 0.7, 1, '#f6f6fa'); }
    px(-13, 0, 26, 4, '#5a4030'); px(-13, 3, 26, 1, '#3a2a20'); // heat shield
    px(-3, -10, 3, 3, '#1a1830'); px(-4, -19, 8, 3, '#c8ccd6'); // window, docking hatch
    if (sep < 3) { // the service module falls behind: body, engine bell, solar wings
      ctx.globalAlpha = 1 - sep / 3; const d = -26 - sep * 40, rr = sep * 0.8;
      ctx.save(); ctx.translate(0, d); ctx.rotate(rr);
      px(-11, -10, 22, 20, '#bcc1ce'); px(-11, -10, 22, 3, '#eef0f6'); px(-5, -16, 10, 6, '#c8962a'); px(-11, 7, 22, 3, '#8e94a4');
      px(-36, -3, 24, 6, '#3446a6'); px(12, -3, 24, 6, '#3446a6'); for (let k = 0; k < 6; k++) { px(-36 + k * 4, -3, 1, 6, '#c9d1e6'); px(13 + k * 4, -3, 1, 6, '#c9d1e6'); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  // Pixel cumulus: round tops, flat shaded bottom, three tones. (x, y) = centre of the base, s = size.
  const PUFFS = [[0, 0, 10], [12, -5, 13], [26, -1, 10], [13, 0, 9]];
  function cloud(x, y, s) {
    for (let dy = -14; dy <= 4; dy += 2) {
      let lo = 1e9, hi = -1e9;
      for (const [cx, cy, cr] of PUFFS) { const v = dy - cy; if (Math.abs(v) < cr) { const h = Math.sqrt(cr * cr - v * v); lo = Math.min(lo, cx - h); hi = Math.max(hi, cx + h); } }
      if (lo > hi) continue;
      px(x + lo * s, y + dy * s, (hi - lo) * s, 2 * s, dy < -6 ? '#ffffff' : dy < 0 ? '#eaf0fa' : '#c4d2ea');
    }
  }

  let lastT = 0, splashAt = null;
  // extra: { home: { fuel, science, ... } } for the end panel; endStars: stars for the whole trip.
  function draw(context, t, s, endStars) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    if (s.phase === 'entry') entry(t, s); else if (s.phase === 'chutes') chutes(t, s); else splash(t, s, endStars);
    void dt;
  }

  function entry(t, s) {
    const q = Math.min(1, (120 - s.alt) / 110);
    const top = lerp([4, 3, 12], [14, 30, 80], q), low = lerp([20, 30, 70], [70, 120, 190], q);
    for (let b = 0; b < 24; b++) px(0, (b * H) / 24, W, H / 24 + 1, rgb(lerp(top, low, b / 23)));
    ctx.globalAlpha = 1 - q; for (const st of stars) px(st.x, st.y, 1, 1, '#ffffff'); ctx.globalAlpha = 1;
    // Earth's curve below, coming closer: deep blue ocean with soft lighter patches and a thin blue atmosphere line.
    const r = 4000 + q * 6000, cy = H + r - 120 + q * 40;
    ctx.fillStyle = '#1e4a8a'; ctx.beginPath(); ctx.arc(W / 2, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, cy, r + 2, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, cy, r, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 9; i++) px(((i * 131 + t * 12) % (W + 200)) - 100, cy - r + 20 + i * 14 + q * 10, 120 + (i % 3) * 60, 6, i % 2 ? 'rgba(40,100,170,0.5)' : 'rgba(18,60,120,0.5)');
    ctx.restore();
    const shake = s.heat > 0.6 ? Math.round((Math.random() - 0.5) * 4 * s.heat) : 0;
    // The heat shield leads: it faces straight down at Earth, rocking a little with the entry angle.
    const rot = ((s.angle + 6.5) * 8 * Math.PI) / 180; // 8 degrees of lean per degree of entry angle
    capsule(CX + shake, CY + shake, rot, Math.min(1, s.heat), s.t);
    // Hot air streaming past, against the direction of travel.
    for (let i = 0; i < 24; i++) { const y = H - ((i * 37 + t * 500) % H); px((i * 71) % W, y, 1, 10, `rgba(255,190,140,${0.12 + s.heat * 0.25})`); }
    // HUD: heat, shield, angle readouts; the corridor bar sits at the top, clear of the radio box and the controls.
    const c = s.cfg;
    MoonRender.hudPanel(ctx, 6, 6, 200, 70);
    T(`ALT   ${s.alt.toFixed(0)} KM`, 12, 12, '#c8c4f0'); T(`SPEED ${s.v.toFixed(1)} KM/S`, 12, 24, '#c8c4f0');
    T('HEAT', 12, 38, '#8a84b0'); px(60, 39, 100, 5, '#1e1a2a'); px(60, 39, 100 * Math.min(1, s.heat), 5, s.heat > 0.85 ? '#ff4d6a' : '#ff9a3d');
    T('SHIELD', 12, 50, '#8a84b0'); px(60, 51, 100, 5, '#1e1a2a'); px(60, 51, s.shield, 5, s.shield < 70 ? '#ff4d6a' : '#4dffc3'); T(`${Math.round(s.shield)}`, 200, 50, '#c8c4f0', 1, 'right');
    T(`ANGLE ${s.angle.toFixed(1)} DEG`, 12, 62, '#c8c4f0');
    const ax = 260, aw = 340, ay = 34, toX = (deg) => ax + ((-deg - 1) / 11) * aw; // -1 (shallow, left) .. -12 (steep, right)
    MoonRender.hudPanel(ctx, ax - 10, ay - 20, aw + 20, 36);
    px(ax, ay, aw, 6, '#1e1a2a'); px(toX(c.corridor[1]), ay, toX(c.corridor[0]) - toX(c.corridor[1]), 6, '#2a8a5a');
    px(toX(s.angle) - 1, ay - 4, 3, 14, '#ffffff');
    T('SHALLOW', ax, ay - 16, '#8a84b0'); T('STEEP', ax + aw, ay - 16, '#8a84b0', 1, 'right'); T('CORRIDOR', (toX(c.corridor[1]) + toX(c.corridor[0])) / 2, ay - 16, '#4dffc3', 1, 'center');
    const blink = Math.floor(t * 3) % 4 !== 0, bx = 430;
    if (s.t < 3) T('SERVICE MODULE SEPARATED', bx, 66, '#6fe3ff', 1, 'center');
    if (s.angle < c.corridor[0]) { if (blink) T('TOO STEEP: SHIELD OVERHEATING - UP!', bx, 84, '#ff4d6a', 2, 'center'); }
    else if (s.angle > c.corridor[1]) { if (blink) T('TOO SHALLOW: WE MAY SKIP - DOWN!', bx, 84, '#ffd34d', 2, 'center'); }
    else T('RE-ENTRY: KEEP IN THE CORRIDOR', bx, 84, '#4dffc3', 2, 'center');
    if (s.blackout && blink) T('RADIO BLACKOUT', bx, 106, '#ff9a3d', 1, 'center');
  }

  function chutes(t, s) {
    // Day sky over the Pacific; pixel clouds rise past as we fall; the ocean comes up at the end.
    // Continues straight from the entry picture: the same dark sky brightens, the Earth curve sinks away, the glow fades.
    const k = Math.min(1, (10 - s.alt) / 3), sky0 = lerp([14, 30, 80], [60, 120, 200], k), low = lerp([70, 120, 190], [150, 200, 240], k);
    for (let b = 0; b < 24; b++) px(0, (b * H) / 24, W, H / 24 + 1, rgb(lerp(sky0, low, b / 23)));
    if (k < 1) { const cy0 = H + 10000 - 80 + k * 300; ctx.fillStyle = '#1e4a8a'; ctx.beginPath(); ctx.arc(W / 2, cy0, 10000, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(120,180,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, cy0, 10002, Math.PI, Math.PI * 2); ctx.stroke(); }
    const fall = (10 - s.alt) * 90;
    ctx.globalAlpha = k;
    for (const c of clouds) { const y = ((c.y - fall) % 900 + 900) % 900 - 200; if (y > -40 && y < H + 20) cloud(c.x, y, c.w / 40); }
    ctx.globalAlpha = 1;
    const sea = H - Math.max(0, (3 - s.alt) / 3) * 110; // the sea rises into view in the last 3 km
    if (sea < H) { px(0, sea, W, H - sea, '#1e5a9a'); for (let i = 0; i < 20; i++) px(((i * 53 + t * 20) % W), sea + 4 + (i % 5) * 8, 14, 1, '#4a8ac8'); }
    // The capsule hangs under the chutes and swings by its tilt.
    const th = (s.tilt * Math.PI) / 180, PX = CX, PY = 105, L = 120;
    const cx = CX + (PX + Math.sin(th) * L - CX) * k, cy = CY + (PY + Math.cos(th) * L - CY) * k; // glides from the entry spot
    if (s.drogue && !s.main) for (const d of [-1, 1]) { line(cx, cy - 20, PX + d * 14, PY - 6); dome(PX + d * 14, PY - 12, 9, '#ff9a3d'); }
    if (s.main) for (const d of [-1, 0, 1]) { line(cx, cy - 20, PX + d * 34, PY + Math.abs(d) * 8 - 2); dome(PX + d * 34, PY - 8 + Math.abs(d) * 8, 22, '#ff6a2a'); }
    capsule(cx, cy, th, (1 - k) * 0.25);
    // Altitude tape (short, at the top right, clear of the controls) with the two chute heights marked.
    const c = s.cfg, tx = 604, top = 20, h = 150, toY = (km) => top + (1 - km / 10) * h;
    MoonRender.hudPanel(ctx, tx - 14, top - 10, 40, h + 20);
    px(tx, top, 6, h, '#1e1a2a'); px(tx - 3, toY(c.drogue), 12, 1, '#2a8a5a'); px(tx - 3, toY(c.main), 12, 1, '#4dffc3');
    px(tx - 4, toY(s.alt) - 1, 14, 3, '#ffffff');
    MoonRender.hudPanel(ctx, 6, 6, 170, 40);
    T(`ALT   ${(s.alt * 1000).toFixed(0)} M`, 12, 12, '#c8c4f0'); T(`FALL  ${Math.round(s.main ? 8 : s.drogue ? 30 : 60)} M/S`, 12, 26, '#c8c4f0');
    // Tilt gauge: keep the white needle inside the green zone (upright).
    const gx = 220, gw = 280, gy = 34, toG = (d) => gx + ((d + 40) / 80) * gw, ok = Math.abs(s.tilt) <= c.upright;
    MoonRender.hudPanel(ctx, gx - 10, gy - 20, gw + 20, 36);
    px(gx, gy, gw, 6, '#1e1a2a'); px(toG(-c.upright), gy, toG(c.upright) - toG(-c.upright), 6, '#2a8a5a'); px(toG(s.tilt) - 1, gy - 4, 3, 14, ok ? '#ffffff' : '#ff9a3d');
    T('TILT LEFT', gx, gy - 16, '#8a84b0'); T('TILT RIGHT', gx + gw, gy - 16, '#8a84b0', 1, 'right'); T('UPRIGHT', toG(0), gy - 16, '#4dffc3', 1, 'center');
    const blink = Math.floor(t * 3) % 4 !== 0;
    if (!ok) { if (blink) T(s.tilt > 0 ? 'SWINGING RIGHT: PRESS UP!' : 'SWINGING LEFT: PRESS DOWN!', 360, 76, '#ffd34d', 2, 'center'); }
    else T('KEEP HER UPRIGHT', 360, 76, '#4dffc3', 2, 'center');
  }
  function line(x0, y0, x1, y1) { for (let q = 0; q <= 1; q += 0.04) px(x0 + (x1 - x0) * q, y0 + (y1 - y0) * q, 1, 1, '#e6e8ee'); }
  function dome(x, y, r, col) { for (let yy = 0; yy < r * 0.7; yy++) { const w = Math.round(Math.sqrt(1 - (yy / (r * 0.7)) ** 2) * r); for (let xx = -w; xx < w; xx += 4) px(x + xx, y - yy + r * 0.35, 2, 1, ((xx + 100) / 4) % 2 ? '#ffffff' : col); px(x - w, y - yy + r * 0.35, 1, 1, '#c8c8d0'); } }

  function splash(t, s, endStars) {
    if (splashAt === null) splashAt = t;
    const a = t - splashAt;
    for (let b = 0; b < 16; b++) px(0, (b * 200) / 16, W, 200 / 16 + 1, rgb(lerp([90, 150, 220], [180, 215, 245], b / 15)));
    // Recovery ship sails in from the right, hull partly under the water; a helicopter circles in the open sky.
    const sx = W - Math.min(260, a * 40);
    px(sx - 60, 190, 120, 14, '#7a808e'); px(sx - 60, 190, 120, 2, '#a8aebc'); px(sx - 20, 174, 40, 16, '#9aa0b0'); px(sx - 10, 164, 6, 10, '#9aa0b0'); px(sx - 56, 202, 112, 2, '#4a505c');
    const hx = 200 + Math.sin(a * 0.6) * 80, hy = 150 + Math.cos(a * 0.6) * 8, fl = Math.floor(t * 20) % 2;
    px(hx - 10, hy, 20, 7, '#3a5a8a'); px(hx + 8, hy + 2, 14, 2, '#3a5a8a'); px(hx - 16 + fl * 4, hy - 3, 32 - fl * 8, 1, '#c8ccd6');
    px(0, 200, W, H - 200, '#1e5a9a');
    for (let i = 0; i < 40; i++) px(((i * 53 + t * 25) % (W + 20)) - 10, 204 + (i % 8) * 18, 18, 1, '#4a8ac8');
    // The capsule floats upright, twice as big, its heat shield under the water; the chutes lie on the sea beside it.
    const bob = Math.sin(t * 2) * 2, cy = 222 + bob;
    for (let i = 0; i < 3; i++) { const x = CX - 110 + i * 34, y = 218 + i * 2; px(x, y, 30, 4, '#ff6a2a'); px(x + 8, y, 6, 4, '#ffffff'); px(x + 20, y, 6, 4, '#ffffff'); }
    const flip = s.upright ? 0 : Math.max(0, 1 - a / 2.5), tr = (s.tilt * Math.PI) / 180 * flip;
    ctx.save(); ctx.translate(CX, cy); ctx.scale(2, 2); ctx.translate(-CX, -cy); capsule(CX, cy, tr, 0); ctx.restore();
    if (!s.upright) for (let i = -1; i <= 1; i++) { ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(CX + i * 18, cy - 44 - Math.min(1, a / 1.5) * 6, 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(30,90,154,0.85)'; ctx.fillRect(CX - 40, Math.round(cy + 2), 80, 12); px(CX - 34 + Math.sin(t * 3) * 3, cy + 3, 22, 1, '#8ac0e8'); px(CX + 6 - Math.sin(t * 3) * 3, cy + 6, 26, 1, '#8ac0e8');
    if (a < 1.5) { ctx.globalAlpha = 1 - a / 1.5; for (let i = 0; i < 24; i++) { const ang = (i / 24) * Math.PI; px(CX + Math.cos(ang) * a * 70, 220 - Math.sin(ang) * a * 40, 3, 3, '#ffffff'); } ctx.globalAlpha = 1; }
    // Final panel.
    if (a > 2) {
      MoonRender.hudPanel(ctx, 160, 30, 320, 100);
      T('WELCOME HOME!', 320, 40, '#4dffc3', 2, 'center');
      T('JOURNEY COMPLETE: EARTH, MOON AND BACK', 320, 62, '#ffd34d', 1, 'center');
      for (let i = 0; i < 3; i++) star(290 + i * 30, 88, i < (endStars || 1) ? '#ffd34d' : '#2a2440');
      T(`SPLASHDOWN ${s.upright ? 'UPRIGHT' : 'TILTED'}   SHIELD ${Math.round(s.shield)}%`, 320, 110, '#c8c4f0', 1, 'center');
    }
  }
  function star(x, y, col) { const rows = ['....#....', '...###...', '#########', '.#######.', '..#####..', '.###.###.', '.##...##.']; rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') px(x - 4 + i, y - 4 + j, 1, 1, col); }); }

  const reset = () => { splashAt = null; };
  return { draw, reset, W, H };
})();

if (typeof module !== 'undefined') module.exports = ReentryRender;
