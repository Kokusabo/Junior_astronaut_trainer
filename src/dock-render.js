// Mission 4, part 2: drawing the docking. Orion waits in lunar orbit; the lander top creeps in from the left.
const DockRender = (function () {
  const W = 640, H = 360, OX = 480, OY = 170, K = 5; // Orion's centre; pixels per metre of distance
  let ctx;
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const T = (txt, x, y, c, sc = 1, al = 'left') => PixelText.draw(ctx, txt, x, y, c, sc, al);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = [];
  for (let i = 0; i < 150; i++) stars.push({ x: rnd() * W, y: rnd() * H, b: rnd() });

  function draw(context, t, s) {
    ctx = context;
    ctx.imageSmoothingEnabled = false;
    px(0, 0, W, H, '#05040c');
    for (const st of stars) px(st.x, st.y, 1, 1, st.b > 0.7 ? '#ffffff' : '#7a76a8');
    // The Moon's curved edge far below.
    ctx.fillStyle = '#4a4650'; ctx.beginPath(); ctx.arc(320, 1000, 700, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8e8a94'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(320, 1000, 700, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    // Orion, nose to the left (the sprite faces right, so mirror it).
    const ship = MoonRender.shipSprite(), O = MoonRender.SHIP_ORIGIN;
    ctx.save(); ctx.translate(OX, 0); ctx.scale(-1, 1); ctx.drawImage(ship, -O.x, OY - O.y); ctx.restore();
    // Docking port target: cross on Orion's nose.
    const nose = OX - 36;
    px(nose - 6, OY, 12, 1, 'rgba(77,255,195,0.8)'); px(nose, OY - 6, 1, 12, 'rgba(77,255,195,0.8)');
    // The lander's top, approaching, with the docking port on its right.
    const sprite = LandingRender.landerSprite(), sc = 1.8, lw = 32 * sc, lh = 14 * sc;
    const lx = nose - lh / 2 + 9 - s.x * K, ly = OY + s.y * 8; // turned 90 degrees: its top (the docking hatch) points at Orion
    ctx.save(); ctx.translate(Math.round(lx), Math.round(ly)); ctx.rotate(Math.PI / 2);
    ctx.drawImage(sprite, 0, 0, 32, 14, Math.round(-lw / 2), Math.round(-lh / 2), Math.round(lw), Math.round(lh));
    ctx.restore();
    if (s.status === 'docked') { ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 8); px(nose - 1, OY - 10, 2, 20, '#4dffc3'); ctx.globalAlpha = 1; }
    // Readouts.
    MoonRender.hudPanel(ctx, 6, 6, 170, 62);
    const okY = Math.abs(s.y) <= s.cfg.tol, okV = s.vx <= s.cfg.maxSpeed;
    T('DOCKING WITH ORION', 12, 12, '#6fe3ff');
    T(`DISTANCE ${Math.max(0, s.x).toFixed(0)} M`, 12, 24, '#c8c4f0');
    T(`SPEED ${s.vx.toFixed(1)} M/S`, 12, 36, okV ? '#4dffc3' : '#ff9a3d');
    T(`OFFSET ${s.y > 0 ? 'DOWN' : 'UP'} ${Math.abs(s.y).toFixed(1)} M`, 12, 48, okY ? '#4dffc3' : '#ff9a3d');
    if (s.bounces) T(`BOUNCES ${s.bounces}`, 12, 58, '#8a84b0');
    const blink = Math.floor(t * 3) % 4 !== 0;
    if (s.status === 'docked') T('DOCKED!', 340, 30, '#4dffc3', 3, 'center');
    else if (!okY) T('LINE UP THE CROSS: UP / DOWN', 340, 30, '#ffd34d', 1, 'center');
    else if (s.x < 16 && !okV && blink) T('SLOW DOWN: RELEASE THE THRUST', 340, 30, '#ff9a3d', 1, 'center');
    else T('HOLD THRUST TO CLOSE IN, RELEASE TO SLOW', 340, 30, '#8a84b0', 1, 'center');
  }
  return { draw, W, H };
})();

if (typeof module !== 'undefined') module.exports = DockRender;
