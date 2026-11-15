// Mission 2, part 1b: drawing Earth orbit and the trans-lunar injection burn, seen from above.
// Distances use a squeezed (logarithmic) scale so low orbit and the Moon fit on one screen. The picture is
// mirrored top-to-bottom (the ship goes clockwise) so the long path to the Moon swings over the top.
const TliRender = (function () {
  const W = 640, H = 360, EC = { x: 210, y: 200 }, ER = 40; // high enough that low orbit clears the radio box
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [];
  for (let i = 0; i < 220; i++) stars.push({ x: rnd() * W, y: rnd() * H, b: rnd() });

  // Earth radii -> screen pixels from Earth's centre: low orbit gets room, the Moon still fits.
  const rs = (r, c) => (r <= 1 ? r * ER : ER + 14 * Math.min(1, (r - 1) / (c.r0 - 1)) + 270 * Math.log(r) / Math.log(c.moonR));
  const toScreen = (x, y, c) => { const r = Math.hypot(x, y), a = Math.atan2(y, x), q = rs(r, c); return [EC.x + q * Math.cos(a), EC.y + q * Math.sin(a)]; };

  let cur = null, trail = [], lastT = 0;
  function draw(context, t, s) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    if (cur !== s) { cur = s; trail = []; lastT = t; }
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    const c = s.cfg, el = Tli.elements(s);
    px(0, 0, W, H, '#03020a');
    for (const st of stars) px(st.x, st.y, 1, 1, st.b > 0.7 ? '#ffffff' : st.b > 0.4 ? '#8a84c0' : '#3a3660');

    // The Moon's orbit (dashed) and the Moon on the right.
    const moonRs = rs(c.moonR, c);
    for (let a = 0; a < Math.PI * 2; a += 0.012) if (Math.floor(a / 0.012) % 4 === 0) px(EC.x + Math.cos(a) * moonRs, EC.y + Math.sin(a) * moonRs, 1, 1, '#3a3660');
    const [mx, my] = toScreen(c.moonR * Math.cos(c.moonAngle), c.moonR * Math.sin(c.moonAngle), c);
    if (MoonRender.drawMoonAt) MoonRender.drawMoonAt(ctx, mx, my, 14);
    T('MOON', mx, my + 20, '#a8a6b0', 1, 'center');
    T('384,400 KM', mx, my + 30, '#6a64a0', 1, 'center');
    // Earth with its thin atmosphere, the low orbit ring and the burn window.
    if (MoonRender.drawEarthAt) MoonRender.drawEarthAt(ctx, EC.x, EC.y, ER);
    const r0 = rs(c.r0, c), wa = Tli.windowAngle(c);
    for (let a = 0; a < Math.PI * 2; a += 0.04) px(EC.x + Math.cos(a) * r0, EC.y + Math.sin(a) * r0, 1, 1, 'rgba(111,227,255,0.35)');
    const pulse = 0.6 + 0.4 * Math.sin(t * 5);
    for (let a = wa - c.window; a <= wa + c.window; a += 0.01) {
      for (let d = -2; d <= 2; d++) px(EC.x + Math.cos(a) * (r0 + d), EC.y + Math.sin(a) * (r0 + d), 1, 1, `rgba(77,255,195,${pulse * (1 - Math.abs(d) / 3)})`);
    }
    T('BURN', EC.x + Math.cos(wa) * (r0 + 14), EC.y + Math.sin(wa) * (r0 + 14) - 8, '#4dffc3', 1, 'right');
    T('WINDOW', EC.x + Math.cos(wa) * (r0 + 14), EC.y + Math.sin(wa) * (r0 + 14), '#4dffc3', 1, 'right');

    // Predicted path: green when it reaches the Moon, yellow while short.
    const pts = Tli.predict(s);
    const reach = el.e < 1 ? el.ra / c.moonR : 2;
    const good = reach > 0.9 && Tli.judge(el, c).penalty <= 2;
    ctx.fillStyle = good ? '#4dffc3' : reach > 0.2 ? '#ffd34d' : 'rgba(255,211,77,0.4)';
    pts.forEach((p, i) => { if ((i + Math.floor(t * 8)) % 3) { const [x, y] = toScreen(p.x, p.y, c); ctx.fillRect(Math.round(x), Math.round(y), 2, 2); } });
    if (el.e < 1 && el.ra > 3) {
      const [ax, ay] = toScreen(el.ra * Math.cos(el.apoAngle), el.ra * Math.sin(el.apoAngle), c);
      px(ax - 2, ay - 2, 5, 5, good ? '#4dffc3' : '#ffd34d');
      T(`${Math.round((el.ra * c.earthKm) / 1000)},000 KM`, ax - 18, ay - 28, good ? '#4dffc3' : '#ffd34d', 1, 'center');
    }

    // The ship, its trail, and the engine flame while burning.
    const [sx, sy] = toScreen(s.x, s.y, c);
    trail.push({ x: s.x, y: s.y, age: 0 });
    trail = trail.filter((p) => (p.age += dt) < 2.5);
    for (const p of trail) { const [x, y] = toScreen(p.x, p.y, c); ctx.globalAlpha = 1 - p.age / 2.5; px(x, y, 1, 1, '#c8c4f0'); }
    ctx.globalAlpha = 1;
    const dir = Math.atan2(s.vy, s.vx); // screen angle of the velocity (mirrored view)
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    ctx.rotate(dir);
    if (s.burning) for (let q = 0; q < 14 * (0.8 + Math.random() * 0.4); q++) px(-6 - q, -Math.max(1, 3 - q * 0.2), 1, Math.max(2, 6 - q * 0.4), q < 4 ? '#ffffff' : q < 9 ? '#ffe9a0' : 'rgba(255,170,80,0.6)');
    px(-5, -2, 6, 4, '#e6e8ee'); px(1, -1, 3, 2, '#ffffff'); px(-5, -6, 2, 4, '#3446a6'); px(-5, 2, 2, 4, '#3446a6'); px(-6, -1, 1, 2, '#c8962a');
    ctx.restore();

    if (MoonRender.drawEpicAt) MoonRender.drawEpicAt(ctx, 566, 44, 60); // the real Earth today, for comparison
    hud(t, s, el);
  }

  function hud(t, s, el) {
    const c = s.cfg, need = 3.15; // km/s the TLI burn needs, about
    MoonRender.hudPanel(ctx, 6, 6, 172, 76);
    T('EARTH ORBIT', 12, 12, '#6fe3ff');
    T(`ALT   ${Math.round((el.r - 1) * c.earthKm).toLocaleString('en-US')} KM`, 12, 24, '#c8c4f0');
    T(`SPEED ${(el.speed * c.vUnit).toFixed(2)} KM/S`, 12, 36, '#c8c4f0');
    T('BURN', 12, 50, '#8a84b0');
    px(44, 51, 90, 5, '#1e1a2a'); px(44, 51, 90 * Math.min(1, (s.dv * c.vUnit) / need), 5, s.cutoff ? '#4dffc3' : '#ff9a3d');
    T(`${(s.dv * c.vUnit).toFixed(1)}/${need.toFixed(1)}`, 172, 50, '#8a84b0', 1, 'right');
    const wi = Tli.windowIn(s);
    T(s.status !== 'orbit' ? 'PATH SET' : s.cutoff ? 'ENGINE OFF' : wi === 0 ? 'IN THE WINDOW!' : `WINDOW IN ${Math.ceil(wi)} S`, 12, 64, wi === 0 && !s.cutoff ? '#4dffc3' : '#8a84b0');

    const cx = 400, blink = Math.floor(t * 3) % 4 !== 0;
    if (s.status === 'orbit') {
      if (s.cutoff) T('ENGINE CUTOFF: ON THE WAY!', cx, 18, '#4dffc3', 2, 'center');
      else if (s.burning) T('TRANS-LUNAR INJECTION', cx, 18, '#ffd34d', 2, 'center');
      else if (wi === 0) { if (blink) T('BURN NOW! HOLD SPACE', cx, 18, '#4dffc3', 2, 'center'); }
      else if (s.dv > 0.02) T('KEEP BURNING ON THE NEXT LAP', cx, 22, '#ffd34d', 1, 'center');
      else T('WAIT FOR THE GREEN WINDOW, THEN HOLD BURN', cx, 22, '#8a84b0', 1, 'center');
    } else {
      const r = s.result;
      MoonRender.hudPanel(ctx, cx - 150, 10, 300, 56);
      T(r.hit ? 'PATH SET FOR THE MOON' : 'PATH A BIT OFF', cx, 18, r.hit ? '#4dffc3' : '#ff9a3d', 2, 'center');
      T(r.why.toUpperCase(), cx, 40, '#c8c4f0', 1, 'center');
      T(r.penalty > 2 ? 'EXPECT A BIGGER COURSE CORRECTION' : 'ONLY A SMALL COURSE CORRECTION NEEDED', cx, 52, r.penalty > 4 ? '#ff9a3d' : '#8a84b0', 1, 'center');
    }
  }

  return { draw, W, H };
})();

if (typeof module !== 'undefined') module.exports = TliRender;
