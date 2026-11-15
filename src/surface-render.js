// Mission 3: drawing the moonwalks. The ground, hills, sky and Earth come from LandingRender.drawWorldAt
// (the same landing site as in Mission 2); this file adds the base, the astronaut or rover, targets and HUD.
const SurfaceRender = (function () {
  const W = 640, H = 360, ZOOM = 2.2; // px per metre
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
  let cam = null, cur = null, lastX = 0, moved = false;

  // The base: lander, inflatable habitat with the airlock, solar panels and the parked rover if packed.
  function base(s, SX, SY, t) {
    const bx = SX(s.base), gy = SY(Surface.heightAt(s, s.base));
    // Habitat dome (inflatable) with an airlock door, lit from the right.
    for (let r = 0; r < 18; r++) { const w = Math.round(Math.sqrt(1 - (r / 18) ** 2) * 30); px(bx - 4 - w, gy - r - 1, w * 2, 1, r > 12 ? '#f4f2ee' : '#dcd8d2'); px(bx - 4 + w * 0.4, gy - r - 1, w * 0.6, 1, '#f8f6f2'); }
    for (const k of [-18, -6, 6]) px(bx - 4 + k, gy - 16, 1, 15, '#bab4ac');
    // Airlock: lit inside; the door slides up while someone goes in or out.
    px(bx - 2, gy - 10, 7, 10, '#ffcf6b');
    const open = Math.max(0, Math.min(1, door.open));
    px(bx - 2, gy - 10, 7, Math.round(10 * (1 - open)), Surface.atBase(s) && s.phase === 'out' ? '#6fe3ff' : '#3a3f4c'); px(bx - 2, gy - 10, 7, 1, '#8a90a0');
    for (const wx of [-22, 10]) px(bx - 4 + wx, gy - 12, 3, 2, Math.floor(t * 0.7 + wx) % 5 ? '#ffcf6b' : '#a8823a'); // habitat windows
    // Lander behind, on four legs, gold foil.
    const lx = bx - 64;
    ctx.drawImage(LandingRender.landerSprite(), Math.round(lx - 16 * 1.8), Math.round(gy - 27 * 1.8), 58, 50); // the same lander as in Mission 2, same 1.8x size
    if (s.hard) { px(lx + 22, gy - 3, 4, 2, '#ff4d6a'); }
    if (s.has('solar')) for (const k of [0, 1]) { const tilt = Math.round(Math.sin(t * 0.3 + k) * 1.5); px(bx + 34 + k * 16, gy - 14 + tilt, 12, 7 - tilt, '#2a3a8a'); px(bx + 34 + k * 16, gy - 14 + tilt, 12, 1, '#6a7ad0'); px(bx + 39 + k * 16, gy - 7, 1, 7, '#8a93ab'); } // panels follow the Sun
    { const dw = Math.round(Math.abs(Math.cos(t * 0.8)) * 4) + 1; px(lx + 8, gy - 52, 1, 6, '#9aa0b0'); px(lx + 9 - dw / 2, gy - 54, dw, 2, '#e6e8ee'); } // lander antenna dish turning
    if (s.has('rover') && s.phase !== 'out') rover(bx + 70, gy, 1, 0);
    T('BASE', bx - 4, gy - 30, '#8a84b0', 1, 'center');
  }

  function rover(x, gy, dir, t, moving = false) {
    if (moving) gy -= Math.round(Math.abs(Math.sin(t * 11)) * 1.5); // suspension bounce
    px(x - 12, gy - 9, 24, 4, '#e6ecf6'); px(x - 12, gy - 9, 24, 1, '#ffffff'); px(x - 6, gy - 13, 10, 4, '#c9d1e6');
    const sway = moving ? Math.round(Math.sin(t * 7) * 1.5) : 0;
    px(x + dir * 9, gy - 18, 1, 8, '#8a93ab'); px(x + dir * 9 - 2 - sway * dir, gy - 19, 5, 2, '#e6ecf6'); // antenna dish, swaying
    for (const w of [-9, 9]) { px(x + w - 3, gy - 6, 6, 6, '#3a3f4c'); const a = moving ? t * 12 : 0; px(x + w - 1 + Math.round(Math.cos(a) * 1.5), gy - 4 + Math.round(Math.sin(a) * 1.5), 2, 2, '#8a93ab'); } // wheel spokes turning
  }

  // Astronaut in a NASA-style moonwalk suit (Apollo A7L / Artemis xEMU look): white suit, bubble helmet with a
  // gold sun visor, big life-support backpack (PLSS), chest control box, grey gloves and boots, joint rings and the
  // commander's red stripes. Baked once per frame (4 walk frames, standing, working), with a dark outline.
  // Built from round, shaded parts (capsules and spheres lit from the top right), each with its own outline.
  // Walk: 16 poses per stride from joint angles (hip swing, knee bend, arm swing against the legs, body bob).
  const SW = 40, SH = 60, suitCache = {};
  const L = [0.55, -0.83]; // light direction (from the top right)
  const PAL = {
    suit: ['#1a1622', '#9aa0b0', '#c9ced8', '#eceef4', '#ffffff'], far: ['#1a1622', '#7c8292', '#a2a8b6', '#c4c9d4', '#d8dce4'],
    pack: ['#1a1622', '#868c9c', '#aab0bc', '#cfd3dc', '#e6e8ee'], glove: ['#1a1622', '#4e535e', '#6a707c', '#868c98', '#a0a6b0'],
    boot: ['#1a1622', '#3a3e48', '#4e535e', '#666b76', '#7e838e'], visor: ['#1a1622', '#8a5418', '#c88a28', '#e8b040', '#ffe08a'],
  };
  function suitFrame(k, working) { // k: 0..15 stride phase, or -1 standing
    const key = `${k}${working ? 'w' : ''}`;
    if (suitCache[key]) return suitCache[key];
    const c = document.createElement('canvas'); c.width = SW; c.height = SH;
    const g = c.getContext('2d'), img = g.createImageData(SW, SH), d = img.data;
    const set = (x, y, col) => { if (x < 0 || y < 0 || x >= SW || y >= SH) return; const i = (y * SW + x) * 4, n = parseInt(col.slice(1), 16); d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255; };
    // A round part between two points with radius r: outline ring, then shaded fill (+ optional bands).
    const capsule = (ax, ay, bx, by, r, pal, band) => {
      const x0 = Math.floor(Math.min(ax, bx) - r - 2), x1 = Math.ceil(Math.max(ax, bx) + r + 2), y0 = Math.floor(Math.min(ay, by) - r - 2), y1 = Math.ceil(Math.max(ay, by) + r + 2);
      const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy || 1;
      for (const pass of [0, 1]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px_ = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px_ - ax) * vx + (py - ay) * vy) / len2));
        const cx = ax + vx * t, cy = ay + vy * t, dx = px_ - cx, dy = py - cy, dist = Math.hypot(dx, dy);
        if (pass === 0) { if (dist <= r + 1) set(x, y, pal[0]); continue; }
        if (dist > r) continue;
        const l = (dx * L[0] + dy * L[1]) / Math.max(r, 0.5); // -1 shadow .. 1 lit
        let col = l > 0.55 ? pal[4] : l > 0.1 ? pal[3] : l > -0.45 ? pal[2] : pal[1];
        if (band) { const b = band(t, dist / r); if (b) col = b; }
        set(x, y, col);
      }
    };
    const sw = (a, len) => [Math.sin(a) * len, Math.cos(a) * len];
    const ph = k < 0 ? 0 : (k / 16) * Math.PI * 2, moving = k >= 0;
    const bob = moving ? Math.round(Math.abs(Math.cos(ph)) * 1.5) : 0; // lowest when the feet pass, highest mid-stride
    const lean = moving ? 0.08 : 0;
    const hip = [19, 36 + bob], sho = [20 + lean * 10, 20 + bob];
    // Leg: thigh swings from the hip; the knee bends while the leg comes forward; the boot stays flat.
    const leg = (a, pal, near) => {
      const swing = moving ? Math.sin(a) * 0.5 : 0, bend = moving ? Math.max(0, Math.cos(a)) * 0.75 : 0.05;
      const [kx, ky] = sw(swing, 10), knee = [hip[0] + kx, hip[1] + ky], [fx, fy] = sw(swing - bend, 10), foot = [knee[0] + fx, Math.min(57, knee[1] + fy)];
      capsule(hip[0], hip[1], knee[0], knee[1], 3.4, pal, near ? (t) => (t > 0.25 && t < 0.4 ? '#d0404a' : null) : null);
      capsule(knee[0], knee[1], foot[0], foot[1] - 1, 3, pal, (t) => (t < 0.12 ? pal[1] : null)); // knee ring
      capsule(foot[0] - 1.5, foot[1], foot[0] + 3, foot[1], 2.3, PAL.boot);
    };
    // Arm: upper arm swings against the legs, forearm bent forward a little, round glove.
    const arm = (a, pal, near) => {
      const swing = moving ? -Math.sin(a) * 0.55 : 0.05, [ex, ey] = sw(swing, 8), el = [sho[0] + ex, sho[1] + ey];
      const [hx, hy] = sw(swing + 0.45, 7), hand = [el[0] + hx, el[1] + hy];
      capsule(sho[0], sho[1], el[0], el[1], 2.8, pal, near ? (t) => (t > 0.2 && t < 0.35 ? '#d0404a' : null) : null);
      capsule(el[0], el[1], hand[0], hand[1], 2.6, pal);
      capsule(hand[0], hand[1], hand[0], hand[1] + 0.5, 2.3, PAL.glove);
    };
    leg(ph + Math.PI, PAL.far, false);
    if (!working) arm(ph, PAL.far, false); // far arm swings with the near leg
    // Life-support backpack, behind the body: rounded box with panel lines.
    capsule(10 - lean * 6, 18 + bob, 10, 31 + bob, 5, PAL.pack, (t, rr) => (rr < 0.7 && (Math.round(t * 12) % 4 === 0) ? '#868c9c' : null));
    // Torso: rounded hard upper torso, then the hips.
    capsule(19 + lean * 8, 22 + bob, 19, 31 + bob, 6, PAL.suit);
    capsule(19, 33 + bob, 19, 35 + bob, 5, PAL.suit, (t, rr) => (t < 0.1 ? '#9aa0b0' : null)); // waist ring
    // Chest control box with two small lights.
    for (let y = 24; y < 29; y++) for (let x = 24; x < 28; x++) set(x + Math.round(lean * 8), y + bob, y === 24 || x === 27 ? '#1a1622' : '#868c9c');
    set(25 + Math.round(lean * 8), 26 + bob, '#ff9a3d'); set(26 + Math.round(lean * 8), 26 + bob, '#6fe3ff');
    // Helmet: a white sphere with a gold sun visor facing forward and a window reflection.
    const hx = 21 + lean * 12, hy = 11 + bob;
    capsule(hx, hy, hx, hy, 7, PAL.suit);
    capsule(hx + 2.5, hy + 0.5, hx + 2.5, hy + 0.5, 4.6, PAL.visor, (t, rr) => (rr > 0.55 && rr < 0.8 && hx + 2.5 > 0 ? null : null));
    set(Math.round(hx + 3), Math.round(hy - 2), '#ffffff'); set(Math.round(hx + 4), Math.round(hy - 2), '#ffffff'); set(Math.round(hx + 4), Math.round(hy - 1), '#fff2c0');
    for (let x = -5; x <= 5; x++) set(Math.round(hx + x), Math.round(hy + 7), '#9aa0b0'); // neck ring
    leg(ph, PAL.suit, true);
    if (working) { // reaching forward to work
      capsule(sho[0], sho[1], sho[0] + 8, sho[1] + 3, 2.8, PAL.suit, (t) => (t > 0.2 && t < 0.35 ? '#d0404a' : null));
      capsule(sho[0] + 8, sho[1] + 3, sho[0] + 15, sho[1] + 4, 2.6, PAL.suit);
      capsule(sho[0] + 16, sho[1] + 4, sho[0] + 16, sho[1] + 4.5, 2.3, PAL.glove);
    } else arm(ph + Math.PI, PAL.suit, true); // near arm swings against the near leg
    g.putImageData(img, 0, 0);
    return (suitCache[key] = c);
  }
  // phase: stride position from the distance walked (one full stride per ~20 m), so feet match the ground speed.
  function astronaut(x, y, dir, t, moving, working, seated, phase = 0, hop = false) {
    const k = hop ? 4 : moving && !working ? ((Math.floor((phase / (Math.PI * 2)) * 16) % 16) + 16) % 16 : -1, img = suitFrame(k, working); // in the air: legs apart mid-stride
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(dir, 1);
    if (seated) ctx.drawImage(img, 0, 0, SW, 34, -19, -34, SW, 34);
    else ctx.drawImage(img, -19, -58 + (!moving && !working && !hop ? Math.round(Math.sin(t * 2.2) * 0.6) : 0)); // idle: breathing
    ctx.restore();
  }

  // Boot prints left in the dust, on the ground line.
  function footprints(s, SX, SY) {
    for (const fp of prints) { const x = SX(fp.x); if (x > -4 && x < W + 4) { const gy = SY(Surface.heightAt(s, fp.x)); px(x - 2, gy + (fp.near ? 2 : 1), 4, 1, 'rgba(26,22,30,0.75)'); } }
  }
  // One print per step: the stride phase crosses half a cycle.
  let prints = [], lastStep = null;
  function trackPrints(s) {
    if (s.phase !== 'out' || s.has('rover') || s.hop > 0) return;
    const step = Math.floor(s.x / 10);
    if (lastStep !== null && step !== lastStep) { prints.push({ x: s.x, near: step % 2 === 0 }); if (prints.length > 400) prints.shift(); }
    lastStep = step;
  }

  // ---- Life in the scene: dust kicked up in low gravity, the Lunar Gateway passing, far impact flashes ----
  let dust = [], lastT = 0, flash = null;
  function kickDust(s, t, dt) {
    if (s.phase !== 'out' || s.work) return;
    const moving = Math.abs(s.x - lastX) > 0.01 || moved;
    if (!moving) return;
    const rover = s.has('rover'), n = rover ? 3 : (Math.random() < dt * 6 ? 2 : 0);
    for (let i = 0; i < n; i++) dust.push({ x: s.x - s.dir * (rover ? 3 : 0.5), y: 0.1, vx: -s.dir * (rover ? 6 + Math.random() * 10 : 1 + Math.random() * 3), vy: rover ? 3 + Math.random() * 5 : 1 + Math.random() * 2, age: 0 });
  }
  function drawDust(s, SX, SY, dt) {
    dust = dust.filter((p) => (p.age += dt) < 3 && p.y >= 0); // age starts higher for short-lived bits (sparks, vapour)
    for (const p of dust) { // no air: grains fly in clean arcs and fall back slowly (1.62 m/s^2)
      p.x += p.vx * dt; p.vy -= 1.62 * dt; p.y += p.vy * dt;
      const gy = SY(Surface.heightAt(s, p.x)) - p.y * ZOOM;
      px(SX(p.x), gy, 1, 1, p.col || (p.age < 1 ? '#c8c2bc' : '#8a8690'));
    }
  }
  function sky(s, t, SX, SY) {
    // NASA's Lunar Gateway station, crossing the sky every 40 s.
    const gp = (t % 40) / 40;
    if (gp < 0.5) {
      const gx = -20 + gp * 2 * (W + 40), gy = 96 + gp * 24; // below the HUD text
      px(gx - 4, gy, 9, 2, '#d4d8e2'); px(gx - 9, gy - 1, 4, 4, '#3446a6'); px(gx + 6, gy - 1, 4, 4, '#3446a6'); px(gx, gy - 2, 2, 1, '#ffb547');
      if (gp > 0.05 && gp < 0.4) T('LUNAR GATEWAY', gx, gy + 6, '#6a64a0', 1, 'center');
    }
    // Now and then a meteorite hits far away: a flash on the horizon.
    if (!flash && Math.random() < 0.002) flash = { x: 40 + Math.random() * (W - 80), t };
    if (flash) {
      const a = t - flash.t, fy = LandingRender.BASE - 20;
      if (a > 0.6) flash = null;
      else { ctx.globalAlpha = 1 - a / 0.6; ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(flash.x, fy, 2 + a * 8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; if (a < 0.3) T('IMPACT FLASH', flash.x, fy - 16, '#ffd34d', 1, 'center'); }
    }
  }
  // Tranquility Base: the first landing site's old descent stage and a flag (1969), out on the plain.
  function apollo11(s, SX, SY) {
    if (s.site.id !== 'tranquility') return;
    const wx = s.base + 520, x = SX(wx), gy = SY(Surface.heightAt(s, wx));
    if (x < -40 || x > W + 40) return;
    px(x - 9, gy - 9, 18, 6, '#c8962a'); px(x - 9, gy - 9, 18, 1, '#e0b850'); px(x - 2, gy - 3, 4, 2, '#5a5a66');
    for (const d of [-1, 1]) { for (let k = 0; k < 6; k++) px(x + d * (8 + k), gy - 4 + k * 0.7, 1, 1, '#a8aab6'); px(x + d * 14 - 1, gy, 3, 1, '#a8aab6'); }
    px(x + 22, gy - 16, 1, 16, '#c8ccd6'); px(x + 23, gy - 16, 7, 5, '#2f9d8f'); px(x + 25, gy - 15, 3, 3, '#ffd34d'); // our own flag: teal cloth, gold sun
    T('FIRST LANDING SITE, 1969', x + 6, gy - 30, '#ffd34d', 1, 'center');
  }

  // ---- Animations: airlock, idle look-around, suit leak vapour, hop landing dust, rewards, the finale ----
  let door = { open: 0, phase: 'base' }, seenDone = 0, pops = [], endAt = null, wasHop = false;
  function puff(s) { for (let i = 0; i < 14; i++) dust.push({ x: s.base + (Math.random() - 0.3) * 2, y: 1 + Math.random() * 3, vx: (Math.random() - 0.2) * 5, vy: Math.random() * 2, age: 1.6, col: '#e6ecf6' }); } // air escaping
  function idleDir(s, t) { return !moved && !s.work && Math.floor(t / 3.5) % 4 === 3 ? -s.dir : s.dir; } // now and then looks back
  function suitFx(s, t, dt) {
    if (s.phase !== 'out') { wasHop = false; return; }
    if (s.leak) for (let i = 0; i < 2; i++) dust.push({ x: s.x - s.dir * 1.5, y: 14 + Math.random(), vx: -s.dir * (2 + Math.random() * 3), vy: 1 + Math.random() * 2, age: 2, col: '#ffffff' }); // vapour jet
    if (wasHop && s.hop === 0) for (let i = 0; i < 16; i++) { const d = i % 2 ? 1 : -1; dust.push({ x: s.x, y: 0.1, vx: d * (1 + Math.random() * 6), vy: 0.5 + Math.random() * 2, age: 0.6 }); } // boots touch down
    wasHop = s.hop > 0;
    // Working: tool effects at the target.
    if (s.work) {
      const g = s.work.g, rockish = g.id.startsWith('rock') || g.id === 'ejecta';
      if (rockish && Math.floor(t * 6) % 2 && Math.random() < 0.5) dust.push({ x: g.x - s.dir * 1, y: 0.5, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, age: 2.3, col: '#ffd34d' }); // hammer sparks and chips
      if (g.id === 'ice' || g.id === 'core' || g.id === 'oven') dust.push({ x: g.x, y: 0.2, vx: (Math.random() - 0.5) * 8, vy: 1 + Math.random() * 4, age: 1, col: g.id === 'ice' ? '#bff4ff' : '#c8c2bc' }); // drill spoil
    }
  }
  // A finished target: the sample hops into the backpack and the reward floats up.
  function rewards(s, t, dt, SX, SY) {
    for (; seenDone < s.collected.length; seenDone++) { const c = s.collected[seenDone]; pops.push({ ...c, t0: t }); }
    pops = pops.filter((p) => t - p.t0 < 1.6);
    for (const p of pops) {
      const a = t - p.t0, gy = SY(Surface.heightAt(s, p.x)), x0 = SX(p.x), x1 = SX(s.x) - s.dir * 6, y1 = SY(Surface.heightAt(s, s.x)) - 30;
      if (a < 0.6) { const q = a / 0.6, x = x0 + (x1 - x0) * q, y = gy - 4 + (y1 - gy + 4) * q - Math.sin(q * Math.PI) * 24; sampleIcon(p.id, x, y); }
      ctx.globalAlpha = Math.max(0, 1 - a / 1.6);
      const txt = p.fuel ? `+${Math.round(p.fuel)}% FUEL` : p.points ? `+${p.points} SCIENCE` : 'FIXED';
      T(txt, x0, gy - 64 - a * 22, p.fuel ? '#6fe3ff' : '#ffd34d', 1, 'center');
      ctx.globalAlpha = 1;
    }
  }
  // Small icons: in the reward arc and in the HUD sample bag.
  function sampleIcon(id, x, y) {
    if (id === 'ice') { px(x - 2, y - 2, 5, 5, '#6fe3ff'); px(x - 1, y - 1, 2, 2, '#e8fbff'); }
    else if (id === 'core') { px(x - 1, y - 4, 3, 8, '#c8ccd6'); px(x - 1, y - 2, 3, 1, '#6a6268'); px(x - 1, y + 1, 3, 1, '#8a8478'); }
    else if (id === 'seismo') { px(x - 2, y - 1, 5, 3, '#c9a24a'); px(x, y - 4, 1, 3, '#9aa0b0'); px(x - 1, y - 5, 3, 1, '#e6e8ee'); }
    else if (id === 'oven') { px(x - 2, y - 2, 5, 4, '#9aa0b0'); px(x - 1, y - 1, 3, 1, '#ff9a3d'); }
    else if (id === 'leg') { px(x - 2, y, 5, 1, '#a8aab6'); px(x - 2, y - 2, 1, 3, '#a8aab6'); }
    else { px(x - 2, y - 1, 5, 3, '#8e8886'); px(x - 1, y - 2, 3, 1, '#c0bab6'); px(x + 1, y, 2, 1, '#5e5a5e'); }
  }
  // Target objects on the ground (before and after the work).
  function targetArt(g, x, gy, t, s) {
    if (g.id.startsWith('rock') || g.id === 'ejecta') { if (!g.done) { const big = g.id === 'ejecta' ? 2 : 1; px(x - 7 * big, gy - 4 * big, 9 * big, 4 * big, '#6e6a6c'); px(x - 5 * big, gy - 5 * big, 6 * big, 2 * big, '#b4aea8'); px(x - 7 * big, gy - 4 * big, 2, 4 * big, '#4a464e'); } }
    else if (g.id === 'seismo') { // a packed crate, then the deployed station with its dish and a blinking light
      if (!g.done) { px(x - 8, gy - 5, 7, 5, '#c9a24a'); px(x - 8, gy - 5, 7, 1, '#e0c070'); }
      else { px(x - 9, gy - 4, 9, 4, '#c9a24a'); px(x - 5, gy - 10, 1, 6, '#9aa0b0'); px(x - 8, gy - 11, 7, 2, '#e6e8ee'); if (Math.floor(t * 2) % 2) px(x - 2, gy - 6, 1, 1, '#4dffc3'); }
    } else if (g.id === 'core' && (g.done || (s.work && s.work.g === g))) { // drill rig: tripod and turning drill
      px(x - 6, gy - 14, 1, 14, '#9aa0b0'); px(x - 1, gy - 14, 1, 14, '#9aa0b0'); px(x - 6, gy - 15, 6, 2, '#c8ccd6');
      const turn = s.work && s.work.g === g ? Math.floor(t * 12) % 2 : 0; px(x - 4 + turn, gy - 12, 2, 12, '#e6e8ee');
    } else if (g.id === 'oven') { px(x - 9, gy - 7, 8, 7, '#8a90a0'); px(x - 9, gy - 7, 8, 1, '#c8ccd6'); px(x - 7, gy - 4, 4, 1, s.work && s.work.g === g ? (Math.floor(t * 6) % 2 ? '#ff9a3d' : '#ffd34d') : '#5a3a2a'); }
  }
  // End of the mission: the crew waves in front of the base next to a freshly planted flag.
  function finale(s, t, SX, SY) {
    if (endAt === null) endAt = t;
    const bx = SX(s.base + 26), gy = SY(Surface.heightAt(s, s.base + 26)), a = t - endAt;
    const fh = Math.min(20, a * 30); // the flag goes in
    px(bx + 18, gy - fh, 1, fh, '#c8ccd6'); if (a > 0.7) { px(bx + 19, gy - 20, 9, 6, '#2f9d8f'); px(bx + 22, gy - 19, 3, 3, '#ffd34d'); }
    astronaut(bx, gy, 1, t, false, Math.floor(t * 3) % 2 === 0, false); // waving: the arm goes up and down
  }

  function draw(context, t, s) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    if (cur !== s) { cur = s; cam = { x: s.x + 60, ref: Surface.heightAt(s, s.x), s: ZOOM }; prints = []; lastStep = null; seenDone = 0; pops = []; door = { open: 0, phase: s.phase }; endAt = null; }
    // Airlock door: opens when an EVA starts or ends, then closes again.
    if (s.phase !== door.phase) { door.phase = s.phase; door.until = t + 1.2; puff(s); }
    door.open += ((door.until && t < door.until ? 1 : 0) - door.open) * 0.15;
    trackPrints(s);
    const dtF = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    moved = Math.abs(s.x - lastX) > 0.01; lastX = s.x; // walking this frame: animate the legs
    cam.x += (s.x + s.dir * 60 - cam.x) * 0.16; // look ahead of the walk
    cam.ref += (Surface.heightAt(s, s.x) - cam.ref) * 0.08;
    LandingRender.drawWorldAt(ctx, s.T, LANDING, cam, s.site.roughness);
    const BASE_Y = LandingRender.BASE;
    const SX = (wx) => W / 2 + (wx - cam.x) * ZOOM, SY = (wy) => BASE_Y - (wy - cam.ref) * ZOOM;
    if (s.T.shadow) { const sx = SX((s.T.shadow.a + s.T.shadow.b) / 2); T('SHADOWED CRATER: WATER ICE', sx, SY(Surface.heightAt(s, s.T.shadow.a)) - 30, '#6fe3ff', 1, 'center'); }
    sky(s, t, SX, SY);
    apollo11(s, SX, SY);
    footprints(s, SX, SY);
    base(s, SX, SY, t);
    // Targets: flag, name, progress while working, tick when done.
    for (const g of s.targets) {
      const x = SX(g.x), gy = SY(Surface.heightAt(s, g.x));
      if (x < -60 || x > W + 60) continue;
      const col = g.skipped ? '#8a84b0' : g.done ? '#4dffc3' : g.fuel ? '#6fe3ff' : '#ffd34d';
      px(x, gy - 22, 1, 22, '#e6ecf6'); px(x + 1, gy - 22, 8, 5, col);
      if (g.id === 'ice' && !g.done) for (let k = 0; k < 5; k++) if (Math.floor(t * 4 + k) % 3 === 0) px(x - 8 + k * 4, gy - 2, 2, 2, '#bff4ff');
      targetArt(g, x, gy, t, s);
      T(g.done ? (g.skipped ? 'SKIPPED' : 'DONE') : g.name.toUpperCase(), x + 4, gy - 70, col, 1, 'center');

    }
    // The explorer: on the rover if packed, else on foot (hopping in low gravity).
    const ax = SX(s.x), ay = SY(Surface.heightAt(s, s.x) + s.hop);
    if (s.phase === 'out') {
      if (s.has('rover')) { rover(ax, ay, s.dir, t, moved); astronaut(ax - s.dir * 2, ay - 9, s.dir, t, false, !!s.work, true); }
      else astronaut(ax, ay, idleDir(s, t), t, moved, !!s.work, false, (s.x / 20) * Math.PI, s.hop > 0);
      if (s.o2 < 25 && Math.floor(t * 4) % 2) px(ax + s.dir * 6, ay - 32, 2, 2, '#ff4d6a'); // chest light blinks red: low oxygen
    }
    kickDust(s, t, dtF); suitFx(s, t, dtF); drawDust(s, SX, SY, dtF);
    rewards(s, t, dtF, SX, SY);
    if (s.status === 'end') finale(s, t, SX, SY);
    if (s.storm && !s.storm.hit) { // solar storm: particle streaks from the Sun (right) and a pulsing tint
      for (let i = 0; i < 40; i++) { const x = W - ((i * 97 + t * 420) % (W + 60)), y = (i * 53) % (LandingRender.BASE - 20); px(x, y, 6, 1, i % 3 ? 'rgba(255,170,80,0.7)' : '#ffe2a0'); }
      ctx.fillStyle = `rgba(255,120,40,${0.08 + 0.06 * Math.sin(t * 6)})`; ctx.fillRect(0, 0, W, H);
    }
    if (s.work) minigame(s, t, SX(s.x), SY(Surface.heightAt(s, s.x)));
    hud(t, s);
  }

  // The minigame panel above the astronaut while working at a target.
  function minigame(s, t, x, gy) {
    const w = s.work, g = w.g, bx = Math.round(Math.max(70, Math.min(W - 70, x)) - 60), by = Math.round(gy - 112);
    MoonRender.hudPanel(ctx, bx, by, 120, 34);
    const flashOk = w.flash && s.t - w.flash.t < 0.25 ? w.flash.ok : null;
    if (g.game === 'timing') { // hammer: hit E while the marker is in the green
      const z = Surface.zoneAt(w);
      T(`HAMMER: E IN THE GREEN  ${w.hits}/${w.need}`, bx + 60, by + 4, flashOk === false ? '#ff4d6a' : '#ffd34d', 1, 'center');
      px(bx + 8, by + 18, 104, 8, '#1e1a2a'); px(bx + 8 + (z.c - z.r) * 104, by + 18, z.r * 2 * 104, 8, flashOk ? '#ffffff' : '#2a8a5a');
      px(bx + 8 + w.m * 104 - 1, by + 15, 3, 14, '#ffffff');
    } else if (g.game === 'level') { // seismometer: keep the bubble in the middle
      T('LEVEL IT: LEFT / RIGHT', bx + 60, by + 4, '#ffd34d', 1, 'center');
      px(bx + 8, by + 18, 104, 8, '#1e1a2a'); px(bx + 60 - 10, by + 18, 20, 8, '#2a8a5a');
      const b = bx + 60 + w.bubble * 50; px(b - 3, by + 19, 7, 6, '#6fe3ff'); px(b - 2, by + 19, 2, 2, '#ffffff');
      px(bx + 8, by + 28, 104 * Math.min(1, w.hold / g.time), 2, '#4dffc3');
    } else if (g.game === 'drill') { // hold E to drill, let go before it overheats
      T(flashOk === false ? 'JAMMED! LET IT COOL' : 'HOLD E TO DRILL', bx + 60, by + 4, flashOk === false ? '#ff4d6a' : '#ffd34d', 1, 'center');
      T('DEPTH', bx + 8, by + 15, '#8a84b0'); px(bx + 40, by + 16, 72, 5, '#1e1a2a'); px(bx + 40, by + 16, 72 * w.prog, 5, '#4dffc3');
      T('HEAT', bx + 8, by + 24, '#8a84b0'); px(bx + 40, by + 25, 72, 5, '#1e1a2a'); px(bx + 40, by + 25, 72 * Math.min(1, w.heat), 5, w.heat > 0.75 ? (Math.floor(t * 8) % 2 ? '#ff4d6a' : '#ff9a3d') : '#ff9a3d');
    } else { T('FIXING...', bx + 60, by + 4, '#ffd34d', 1, 'center'); px(bx + 8, by + 18, 104, 8, '#1e1a2a'); px(bx + 8, by + 18, 104 * Math.min(1, w.t / g.time), 8, '#4dffc3'); }
  }

  function hud(t, s) {
    const c = s.cfg;
    MoonRender.hudPanel(ctx, 6, 6, 176, 72);
    T(s.phase === 'done' ? 'ALL EVAS DONE' : `EVA ${Math.min(3, s.eva + 1)} OF 3${s.phase === 'base' ? ': IN THE BASE' : ''}`, 12, 12, '#6fe3ff');
    const bar = (y, label, v, col, mark, shown = v) => { T(label, 12, y, '#8a84b0'); px(70, y + 1, 72, 5, '#1e1a2a'); px(70, y + 1, 72 * Math.max(0, Math.min(1, v / 100)), 5, col); if (mark) px(70 + 72 * mark / 100, y - 1, 1, 9, '#ffffff'); T(`${Math.round(shown)}`, 172, y, '#c8c4f0', 1, 'right'); };
    bar(24, 'OXYGEN', s.o2, s.o2 < 25 ? (Math.floor(t * 4) % 2 ? '#ff4d6a' : '#7a2030') : '#6fe3ff'); // pulses when low
    bar(36, 'CREW', s.health, s.health < 50 ? '#ff4d6a' : '#4dffc3');
    bar(48, 'FUEL HOME', s.fuel * 2.5, s.fuel >= c.returnFuel ? '#4dffc3' : '#ff9a3d', c.returnFuel * 2.5, s.fuel); // bar shows 0..40%, white mark = needed
    T(`SCIENCE ${s.science}`, 12, 62, '#ffd34d');
    s.collected.forEach((c, i) => sampleIcon(c.id, 92 + i * 10, 65)); // the sample bag
    const cx = 330, blink = Math.floor(t * 3) % 4 !== 0;
    if (s.storm && !s.storm.hit) { if (blink) T(`STORM IN ${Math.ceil(s.storm.at - s.evaT)} S: GET INSIDE!`, cx + 20, 30, '#ff9a3d', 2, 'center'); }
    else if (s.leak) { const need = s.has('repair') ? 4 : 8; if (blink) T(`SUIT LEAK: PRESS R ${need - (s.patching || 0)}X`, cx, 30, '#ff4d6a', 2, 'center'); T(s.has('repair') ? 'REPAIR KIT PATCH' : 'NO REPAIR KIT: TAPE IT', cx, 50, '#c8c4f0', 1, 'center'); }
    else if (s.phase === 'out' && s.o2 < 25 && blink) T('OXYGEN LOW: HEAD BACK', cx, 30, '#ff4d6a', 2, 'center');
    if (s.phase === 'out') {
      const g = Surface.near(s);
      if (s.work) T('SPACE: STOP AND WALK ON', cx, 60, '#8a84b0', 1, 'center');
      else if (g) T(`PRESS E: ${g.name.toUpperCase()}`, cx, 60, '#ffffff', 1, 'center');
      else if (Surface.atBase(s) && !s.work) T('PRESS E: ENTER THE AIRLOCK', cx, 60, '#ffffff', 1, 'center');
      else if (!s.work) { const left = s.targets.filter((x) => !x.done); if (left.length) T(`NEXT: ${left[0].name.toUpperCase()} ${left[0].x > s.x ? '>' : '<'} ${Math.round(Math.abs(left[0].x - s.x))} M`, cx, 60, '#8a84b0', 1, 'center'); else T('ALL DONE: BACK TO THE BASE <', cx, 60, '#4dffc3', 1, 'center'); }
    } else if (s.phase === 'base') T(`PRESS E TO START EVA ${s.eva + 1}`, cx, 30, '#4dffc3', 2, 'center');
  }

  // Bakes one astronaut pose per call (idle frames), so the first steps do not hitch. Returns true while poses remain.
  const poses = [-1, ...Array.from({ length: 16 }, (_, i) => i)].flatMap((k) => [[k, false], [k, true]]);
  const warm = () => { const p = poses.shift(); if (p) suitFrame(p[0], p[1]); return poses.length > 0; };
  return { draw, suitFrame, warm, W, H }; // suitFrame: for previews and tests
})();

if (typeof module !== 'undefined') module.exports = SurfaceRender;
