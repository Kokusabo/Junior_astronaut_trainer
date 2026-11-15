// Mission 2, part 3: drawing the landing (side view). The camera zooms in as the lander gets lower.
// The Sun is low on the right, as for real lunar landings, so slopes and boulders cast long shadows left.
const LandingRender = (function () {
  const W = 640, H = 360, BASE = H - 130; // BASE: screen line where the ground under the lander sits
  const SUN = 0.21; // tan of the Sun's height above the horizon (about 12 degrees)
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [];
  for (let i = 0; i < 150; i++) stars.push({ x: rnd() * W, y: rnd() * H * 0.7, b: rnd() });

  // Lander sprite, 4 px per metre: 8 m wide, 7 m tall. Origin: between the feet at (16, 27).
  const LW = 32, LH = 28, PPM = 4;
  let lander = null;
  function bakeLander() {
    const c = document.createElement('canvas');
    c.width = LW; c.height = LH;
    const saved = ctx; ctx = c.getContext('2d');
    const line = (x0, y0, x1, y1, col) => { for (let k = 0; k <= 1; k += 0.08) px(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 1, 1, col); };
    line(11, 18, 7, 26, '#6a6a76'); line(21, 18, 25, 26, '#6a6a76'); // far legs
    line(9, 16, 2, 26, '#a8aab6'); line(23, 16, 30, 26, '#c8cad6'); // near legs
    px(0, 26, 5, 2, '#9a9ca8'); px(28, 26, 4, 2, '#c8cad6'); px(5, 26, 4, 1, '#6a6a76'); px(23, 26, 4, 1, '#6a6a76');
    // Descent stage: gold foil box, lit from the right.
    for (let y = 13; y <= 20; y++) for (let x = 8; x <= 24; x++) {
      const edge = (y === 13 || y === 20) && (x === 8 || x === 24);
      if (edge) continue;
      px(x, y, 1, 1, x > 20 ? ((x + y) & 1 ? '#f0d070' : '#e0b850') : (x + y) % 3 ? '#c8962a' : '#a87a20');
    }
    px(8, 16, 17, 1, '#7a5a18');
    px(13, 21, 7, 2, '#5a5a66'); px(12, 23, 9, 1, '#3a3a46'); // engine bell
    // Crew cabin: faceted, white-grey, window and antenna.
    for (let y = 4; y <= 12; y++) {
      const inset = y < 6 ? 6 - y : 0;
      for (let x = 10 + inset; x <= 22 - inset; x++) px(x, y, 1, 1, x > 18 ? '#eef0f6' : x > 13 ? '#d4d8e2' : '#a8aebc');
    }
    px(15, 1, 3, 3, '#c8ccd6'); px(15, 1, 3, 1, '#eef0f6'); // hatch
    px(12, 6, 3, 3, '#1a1830'); px(12, 6, 1, 1, '#9ad6ff'); // window
    px(9, 7, 2, 2, '#5a5f6c'); px(22, 7, 2, 2, '#5a5f6c'); // thruster quads
    px(23, 4, 1, 3, '#9aa0b0'); px(23, 2, 4, 2, '#eef0f6'); // antenna dish
    ctx = saved;
    return c;
  }

  // Distant ridge (parallax), from a few sines.
  const ridge = (x) => 26 * Math.sin(x / 90) + 14 * Math.sin(x / 37 + 1) + 6 * Math.sin(x / 13 + 2);

  // Camera and particles live here, reset for each new landing.
  let cur = null, cam = null, dust = [], debris = [], lastT = 0, calloutAt = { n: 0, t: -9 }, crashAt = null;
  function reset(s, t) {
    cur = s; dust = []; debris = []; calloutAt = { n: 0, t: -9 }; crashAt = null;
    cam = { x: s.x, ref: Landing.heightAt(s.T, s.x), s: 0.36 };
    lastT = t;
  }

  // 2x2 checker patterns for the soil just under the surface (made once per canvas context).
  const ditherCache = new WeakMap();
  function dithers(g) {
    let d = ditherCache.get(g);
    if (d) return d;
    const mk = (a, b) => { const c = document.createElement('canvas'); c.width = c.height = 2; const q = c.getContext('2d'); q.fillStyle = a; q.fillRect(0, 0, 2, 2); q.fillStyle = b; q.fillRect(0, 0, 1, 1); q.fillRect(1, 1, 1, 1); return g.createPattern(c, 'repeat'); };
    d = { upper: mk('#3a373e', '#4a464c'), lower: mk('#3a373e', '#36333a') };
    ditherCache.set(g, d);
    return d;
  }

  // Per terrain point (every 2 m): light level from the slope (or -1 = in a shadow cast by higher ground
  // to the right), the never-lit crater floor, and the lidar's safe/steep marks. Static, so done once.
  const looks = new WeakMap();
  function terrainLook(TR, c) {
    let L = looks.get(TR);
    if (L) return L;
    const n = TR.h.length, base = new Float32Array(n), dark = new Uint8Array(n), zone = new Uint8Array(n), steep = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const wx = i * TR.step, h0 = TR.h[i];
      let shade = false;
      for (let d = 2; d <= 70 && !shade; d += 3) if (Landing.heightAt(TR, wx + d) - h0 > d * SUN) shade = true;
      const sl = Landing.slopeAt(TR, wx);
      base[i] = shade ? -1 : 3 - sl * 10;
      dark[i] = TR.shadow && wx > TR.shadow.a && wx < TR.shadow.b ? 1 : 0;
      zone[i] = Landing.zoneAt(TR, wx) ? 1 : 0;
      steep[i] = Math.abs(sl) > c.maxSlope ? 1 : 0;
    }
    L = { n, base, dark, zone, steep };
    looks.set(TR, L);
    return L;
  }

  function draw(context, t, s) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    if (!lander) lander = bakeLander();
    if (cur !== s) reset(s, t);
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    const c = s.cfg, TR = s.T;
    // Camera: zoom in as we get lower, look a little ahead of the drift.
    const want = Math.max(0.36, Math.min(4, 150 / (Math.max(0, s.alt) + 20)));
    cam.s += (want - cam.s) * Math.min(1, dt * 2);
    cam.x += (s.x + s.vx * 1.5 - cam.x) * Math.min(1, dt * 3);
    cam.ref += (Landing.heightAt(TR, s.x) - cam.ref) * Math.min(1, dt * 3);
    const k = cam.s;
    const SX = (wx) => W / 2 + (wx - cam.x) * k, SY = (wy) => BASE - (wy - cam.ref) * k;
    const WX = (sx) => cam.x + (sx - W / 2) / k;

    // Sky, stars, Earth hanging over the horizon, two layers of hills lit from the right.
    px(0, 0, W, H, '#05040c');
    for (const st of stars) px((st.x - cam.x * 0.02 + W * 10) % W, st.y, 1, 1, st.b > 0.7 ? '#ffffff' : '#7a76a8');
    if (MoonRender.drawEarthAt) MoonRender.drawEarthAt(ctx, 470, 74, 18);
    const B = new Map(); // colour (or pattern) -> rectangles, filled in one go each (far fewer canvas calls)
    const add = (col, x, y, w, h) => { let a = B.get(col); if (!a) B.set(col, (a = [])); a.push(x, y, w, h); };
    const flush = () => { for (const [col, r] of B) { ctx.fillStyle = col; ctx.beginPath(); for (let q = 0; q < r.length; q += 4) ctx.rect(r[q], r[q + 1], r[q + 2], r[q + 3]); ctx.fill(); } B.clear(); };
    // Each layer is painted only down to where the next one (nearer) starts: no hidden overdraw.
    const gys = new Float32Array(W / 2), near = new Float32Array(W / 2);
    for (let sx = 0; sx < W; sx += 2) { gys[sx / 2] = Math.round(SY(Landing.heightAt(TR, WX(sx + 1)))); near[sx / 2] = Math.round(BASE - 34 - ridge(sx + cam.x * 0.22 + 34 * 7) * 0.55); }
    for (const [par, lift, amp, base, lit, top] of [[0.06, 64, 0.9, '#1d1b21', '#3a373d', '#5a565a'], [0.22, 34, 0.55, '#2a272d', '#4c484e', '#77726f']]) {
      for (let sx = 0; sx < W; sx += 2) {
        const u = sx + cam.x * par + lift * 7, y = Math.round(BASE - lift - ridge(u) * amp);
        const faceSun = ridge(u + 2) < ridge(u); // the ground drops to the right: faces the low Sun
        const stop = Math.min(gys[sx / 2], lift === 64 ? near[sx / 2] : H);
        if (stop > y) add(base, sx, y, 2, stop - y);
        if (faceSun) { add(lit, sx, y, 2, 3); add(lit, sx + ((y >> 1) & 1), y + 3, 1, 2); }
        add(faceSun ? top : lit, sx, y, 2, 1);
      }
      flush(); // far layer first, then the near one over it
    }

    // Ground: one column every 2 px. Colour from the slope (facing the Sun = bright) with grain, shadows
    // from the terrain to the right, then the soil below with buried rocks. Ice sites: a never-lit floor.
    const reveal = Math.min(1, s.t / c.scanTime) * c.length; // lidar has mapped the ground left of this
    const hash = (n) => (Math.imul((n | 0) ^ 0x5bd1e995, 2654435761) >>> 0) / 4294967296;
    const tc = terrainLook(TR, c); // shading, shadows and lidar marks per terrain point, worked out once
    const at = (wx) => Math.max(0, Math.min(tc.n - 1, Math.round(wx / TR.step)));
    const GREYS = ['#1e1c22', '#3e3b40', '#5e5a5e', '#7f7a7c', '#a29c9c', '#c6c0bc'];
    const soilTop = Math.max(2, Math.round(1.5 * k)), soilMid = Math.max(6, Math.round(5 * k));
    const dith = dithers(ctx);
    for (let sx = 0; sx < W; sx += 2) {
      const wx = WX(sx + 1), i = at(wx);
      const y = gys[sx / 2];
      const dark = tc.dark[i];
      const sh = dark ? -1 : tc.base[i] < 0 ? 0 : Math.max(1, Math.min(5, Math.round(tc.base[i] + (hash(Math.floor(wx * 1.5)) - 0.5) * 1.2)));
      add(dark ? '#100f1a' : GREYS[sh], sx, y, 2, soilTop);
      if (sh >= 3) add(GREYS[Math.min(5, sh + 1)], sx, y, 2, 1); // sunlit crest
      const half = soilMid >> 1; // dithered fade from the surface colour into the soil (checker patterns)
      add(dark ? '#0b0a13' : dith.upper, sx, y + soilTop, 2, half);
      add(dark ? '#0b0a13' : dith.lower, sx, y + soilTop + half, 2, soilMid - half);
      if (dark) add('#08070e', sx, y + soilTop + soilMid, 2, H - y);
      if (dark && hash(Math.floor(wx * 3) + 77) < 0.05) add('#9ad6ff', sx, y, 1, 1); // ice glints
      // Lidar marks: green over safe pads, red dots over hazards.
      if (wx < reveal && !s.alarm) {
        if (tc.zone[i]) add('#4dffc3', sx, y - 2, 2, 1);
        else if (tc.steep[i] && (sx / 2) % 3 === 0) add('#ff4d6a', sx, y - 2, 1, 1);
      }
    }
    // Deep soil: one shape under the whole ground line instead of a tall rectangle per column.
    ctx.fillStyle = '#242128';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let sx = 0; sx < W; sx += 2) { const yy = gys[sx / 2] + soilTop + soilMid; ctx.lineTo(sx, yy); ctx.lineTo(sx + 2, yy); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    flush();
    // Close up: pebbles on the surface and rocks buried in the soil, fixed to the ground (hashed per metre).
    if (k > 0.9) {
      const dens = 0.12 + s.site.roughness * 0.25;
      for (let m = Math.floor(WX(0)) - 1; m <= WX(W) + 1; m++) {
        const gy = SY(Landing.heightAt(TR, m + 0.5)), sx = SX(m + hash(m * 5) * 0.8);
        if (hash(m * 7 + 3) < dens) {
          const r = Math.max(1, Math.round((0.12 + hash(m * 13) * 0.3) * k));
          px(sx - r, gy - r, r * 2, r, '#6e6a6c'); px(sx, gy - r, r, Math.max(1, r - 1), '#b4aea8');
          px(sx - r * 3, gy - 1, r * 2, 1, 'rgba(10,9,14,0.6)');
        }
        if (hash(m * 31 + 9) < 0.22) {
          const r = Math.max(1, Math.round((0.15 + hash(m * 17) * 0.4) * k));
          const dy = soilTop + 3 + hash(m * 19) * (soilMid + 12 * k);
          px(sx, gy + dy, r * 2, r, '#4e4a50'); px(sx, gy + dy, r * 2, 1, '#625d62');
        }
      }
    }
    // Boulders: lumpy pixel rocks, lit on the right, with long shadows to the left.
    for (const b of TR.boulders) {
      const sx = SX(b.x);
      if (sx < -60 || sx > W + 10) continue;
      const r = Math.max(1, b.r * k), gy = SY(Landing.heightAt(TR, b.x));
      px(sx - r * 6, gy - 1, r * 5.5, Math.max(1, r * 0.35), 'rgba(10,9,14,0.75)');
      const hgt = Math.max(1, Math.round(r * 1.3));
      for (let j = 0; j < hgt; j++) {
        const q = j / hgt, half = r * Math.sqrt(1 - (1 - q) ** 2 * 0.85) * (0.85 + 0.15 * Math.sin(b.x + j));
        const yy = gy - j - 1;
        px(sx - half, yy, half * 2, 1, '#4a4650');
        px(sx, yy, half, 1, q > 0.6 ? '#c0bab6' : '#8e8886');
        if (j === hgt - 1) px(sx - half * 0.3, yy, half, 1, '#d6d0ca');
      }
      if (b.x < reveal && b.r > 0.9 && !s.alarm) px(sx - 1, gy - hgt - 5, 2, 2, '#ff4d6a');
    }
    // Ice label over the shadowed crater.
    if (TR.shadow && reveal > TR.shadow.a) {
      const sx = SX((TR.shadow.a + TR.shadow.b) / 2);
      T('ICE: LAND NEAR THE EDGE', sx, SY(Landing.heightAt(TR, TR.shadow.a)) - 22, '#6fe3ff', 1, 'center');
    }

    const lx = SX(s.x), ly = SY(s.y);
    // Lidar beam while scanning.
    if (s.t < c.scanTime && s.status === 'flying') {
      ctx.fillStyle = 'rgba(77,255,195,0.6)';
      const tx = SX(reveal), ty = SY(Landing.heightAt(TR, reveal));
      for (let q = 0; q < 1; q += 0.03) if (Math.floor(q * 33 + t * 20) % 2) ctx.fillRect(Math.round(lx + (tx - lx) * q), Math.round(ly + (ty - ly) * q), 2, 1);
    }
    // Landing point marker: where we touch down if nothing changes. Green over a safe pad.
    if (s.status === 'flying' && !s.alarm && s.alt > 3) {
      const pxw = Landing.predictX(s), mx = SX(pxw), my = SY(Landing.heightAt(TR, pxw));
      const col = Landing.zoneAt(TR, pxw) ? '#4dffc3' : '#ffd34d';
      ctx.fillStyle = col;
      for (let y = Math.max(ly + 6, 0); y < my - 8; y += 6) ctx.fillRect(Math.round(lx + (mx - lx) * ((y - ly) / Math.max(1, my - ly))), Math.round(y), 1, 3);
      px(mx - 4, my - 8, 9, 1, col); px(mx - 3, my - 7, 7, 1, col); px(mx - 2, my - 6, 5, 1, col); px(mx - 1, my - 5, 3, 1, col);
    }
    // The lander's shadow on the ground (the Sun is to the right, so it falls to the left).
    if (s.status !== 'crash') {
      const shx = s.x - Math.max(0, s.alt) / SUN * 0.25, gy = SY(Landing.heightAt(TR, shx));
      if (s.alt > 0.5) px(SX(shx) - 7 * k, gy - 1, 14 * k, Math.max(1, k * 0.8), 'rgba(6,5,10,0.8)');
    }

    // Engine dust: below 35 m the exhaust blasts dust sideways and hides the ground.
    const blast = s.status === 'flying' ? s.throttle * Math.max(0, 1 - s.alt / 35) : 0;
    for (let n = Math.round(blast * 6); n > 0; n--) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      dust.push({ x: s.x + dir * Math.random() * 2, vx: dir * (20 + Math.random() * 50), h: Math.random() * 1.5, life: 0.5 + Math.random() * 0.5 });
    }
    dust = dust.filter((d) => (d.life -= dt) > 0);
    for (const d of dust) {
      d.x += d.vx * dt;
      ctx.globalAlpha = Math.min(1, d.life * 1.6) * 0.8;
      px(SX(d.x), SY(Landing.heightAt(TR, d.x) + d.h) - 2, Math.max(1, k * 0.8), 1, '#b8b2a4');
    }
    ctx.globalAlpha = 1;
    if (blast > 0.05) {
      // A sheet of blowing dust: many short streaks, thickest under the engine, redrawn every frame so it shimmers.
      const gy = SY(Landing.heightAt(TR, s.x));
      for (let n = Math.round(blast * 160); n > 0; n--) {
        const off = (Math.random() - 0.5) * 2, x = lx + off * 170 * (0.4 + blast);
        ctx.globalAlpha = (1 - Math.abs(off)) * Math.min(0.9, blast * 1.2);
        px(x, gy - Math.random() * 14 * (1 - Math.abs(off)) - 1, 4 + Math.random() * 12, 1, Math.random() < 0.5 ? '#a8a294' : '#c4bdae');
      }
      ctx.globalAlpha = 1;
    }

    // The lander (rotated about its feet) with the engine flame.
    if (s.status === 'crash') {
      if (!debris.length) for (let n = 0; n < 40; n++) debris.push({ x: s.x, y: s.y + 2, vx: (Math.random() - 0.5) * 24, vy: Math.random() * 14, life: 2 + Math.random() * 2, c: ['#e0b850', '#d4d8e2', '#ffb547', '#6a6a76'][n % 4] });
      for (const d of debris) {
        if (d.life <= 0) continue;
        d.life -= dt; d.vy -= c.g * dt; d.x += d.vx * dt; d.y = Math.max(Landing.heightAt(TR, d.x), d.y + d.vy * dt);
        px(SX(d.x), SY(d.y), Math.max(1, k * 0.5), Math.max(1, k * 0.5), d.c);
      }
    }
    const lk = Math.max(0.5, (k / PPM) * 1.8); // drawn larger than true scale so the lander reads well
    ctx.save();
    ctx.translate(Math.round(lx), Math.round(ly));
    ctx.rotate(s.status === 'crash' ? 1.2 * Math.sign(s.angle || 1) : s.angle);
    if (s.throttle > 0.02 && s.status === 'flying') {
      const len = (10 + s.throttle * 26 * (0.8 + Math.random() * 0.4)) * Math.max(0.5, lk);
      for (let q = 0; q < len; q++) {
        const w = Math.max(1, (3.5 - q * (3 / len)) * Math.max(0.6, lk));
        ctx.fillStyle = q < len * 0.25 ? '#ffffff' : q < len * 0.6 ? '#ffe9a0' : 'rgba(255,181,71,0.6)';
        ctx.fillRect(Math.round(-w), Math.round(-4 * lk + q), Math.round(w * 2), 1);
      }
    }
    ctx.drawImage(lander, Math.round(-16 * lk), Math.round(-27 * lk), Math.round(LW * lk), Math.round(LH * lk));
    ctx.restore();
    if (k < 1.2 && s.status === 'flying') { // when far, a bracket so the tiny lander is easy to find
      for (const [ax, ay, bx, by] of [[-14, -20, 1, 1], [14, -20, -1, 1], [-14, 5, 1, -1], [14, 5, -1, -1]]) { px(lx + ax, ly + ay, 3 * bx || 1, 1, '#6fe3ff'); px(lx + ax, ly + ay, 1, 3 * by || 1, '#6fe3ff'); }
    }
    if (s.status === 'crash' && crashAt === null) crashAt = t;
    if (crashAt !== null && t - crashAt < 0.25) { ctx.fillStyle = 'rgba(255,240,220,0.7)'; ctx.fillRect(0, 0, W, H); }

    hud(t, s);
  }

  function hud(t, s) {
    const c = s.cfg, blind = !!s.alarm && s.status === 'flying';
    MoonRender.hudPanel(ctx, 6, 6, 166, 84);
    const v = (n, d = 1) => (blind ? (Math.floor(t * 6) % 2 ? '----' : '8888') : n.toFixed(d));
    const vs = -s.vy;
    T(`ALT   ${v(Math.max(0, s.alt))} M`, 12, 12, '#c8c4f0');
    T(`DOWN  ${v(vs)} M/S`, 12, 24, !blind && vs > c.safeV && s.alt < 40 ? '#ff4d6a' : !blind && vs <= c.perfectV ? '#4dffc3' : '#c8c4f0');
    T(`SIDE  ${v(Math.abs(s.vx))} M/S ${blind ? '' : s.vx > 0.3 ? '>' : s.vx < -0.3 ? '<' : ''}`, 12, 36, !blind && Math.abs(s.vx) > c.safeH && s.alt < 40 ? '#ffd34d' : '#c8c4f0');
    T(`TILT  ${v((s.angle * 180) / Math.PI, 0)} DEG`, 12, 48, !blind && Math.abs(s.angle) > c.safeTilt && s.alt < 20 ? '#ffd34d' : '#c8c4f0');
    const sec = Landing.secondsLeft(s);
    T('FUEL', 12, 62, '#8a84b0');
    px(44, 63, 70, 5, '#1e1a2a'); px(44, 63, 70 * Math.min(1, s.fuel / Math.max(1, s.fuelStart)), 5, sec < 30 ? '#ff4d6a' : '#ff9a3d');
    T(`${Math.max(0, Math.floor(sec))} SEC`, 166, 62, sec < 30 ? '#ff4d6a' : '#c8c4f0', 1, 'right');
    T(s.site.name.toUpperCase(), 12, 76, '#6a64a0');

    // Banners in the middle: alarm, scan, fuel callouts, contact light, result.
    const cx = 320;
    if (s.callouts.length !== calloutAt.n) calloutAt = { n: s.callouts.length, t };
    const blink = Math.floor(t * 3) % 4 !== 0;
    if (s.status === 'flying') {
      if (blind) {
        if (blink) T('PROGRAM ALARM 1202', cx, 40, '#ff4d6a', 2, 'center');
        T('COMPUTER OVERLOADED. PRESS G (OR GO) TO CONTINUE', cx, 62, '#ffd34d', 1, 'center');
      } else if (s.contact) T('CONTACT LIGHT', cx, 40, '#4dffc3', 2, 'center');
      else if (t - calloutAt.t < 2.5 && calloutAt.n) { if (blink) T(`${s.callouts[calloutAt.n - 1]} SECONDS`, cx, 40, '#ff9a3d', 2, 'center'); }
      else if (s.t < c.scanTime) { T('LIDAR HAZARD SCAN', cx, 40, '#4dffc3', 2, 'center'); if (s.T.real) T('HILLS FROM REAL NASA LRO DATA', cx - 30, 62, '#8a84b0', 1, 'center'); }
      else if (s.t < c.scanTime + 4) T('GREEN = SAFE PAD. STEER THE MARKER ONTO IT', cx, 44, '#8a84b0', 1, 'center');
    } else {
      const r = s.result || { stars: 0 };
      const title = { landed: 'THE LANDER HAS LANDED', hard: 'HARD LANDING', crash: 'CRASH', lost: 'LANDING ABORTED' }[s.status];
      const col = s.status === 'landed' ? '#4dffc3' : s.status === 'hard' ? '#ffd34d' : '#ff4d6a';
      MoonRender.hudPanel(ctx, cx - 180, 104, 360, r.stars ? 76 : 46);
      T(title, cx, 112, col, 2, 'center');
      if (r.stars) {
        for (let i = 0; i < 3; i++) star(cx - 30 + i * 30, 146, i < r.stars ? '#ffd34d' : '#2a2440');
        const tv = s.touch ? `TOUCHDOWN ${s.touch.vs.toFixed(1)} M/S` : '';
        T(`${tv}  FUEL LEFT ${Math.round(s.fuel)}%${r.ice ? '  ICE BONUS' : ''}`, cx, 162, '#c8c4f0', 1, 'center');
      } else T(s.reason.toUpperCase(), cx, 134, '#c8c4f0', 1, 'center');
    }
  }
  function star(x, y, col) {
    const rows = ['....#....', '...###...', '#########', '.#######.', '..#####..', '.###.###.', '.##...##.'];
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') px(x - 4 + i, y - 4 + j, 1, 1, col); });
  }

  return { draw, W, H };
})();

if (typeof module !== 'undefined') module.exports = LandingRender;
