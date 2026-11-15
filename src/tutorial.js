// Tutorial browser glue: chapters with live autopilot demos (the real game code), and playable practice drills.
(function () {
  const $ = (id) => document.getElementById(id);
  const site0 = MOON_SITES[0], profile = typeof MOON_NASA !== 'undefined' ? MOON_NASA.terrain[site0.id] : null;
  const ESS = ['oxygen', 'water', 'food', 'habitat', 'repair'];

  // ---- Scenes: { make() -> state, step(s, dt, input), draw(ctx, t, s), bot(s) -> input, finished(s), won(s), coach(s), keys } ----
  const SCENES = {
    ascent: {
      make: () => ({ s: Launch.startLaunch(Math.random, MOON_LAUNCH), site: { T: Landing.makeTerrain({ ...site0, profile }, Math.random), x: 700, roughness: 0.3 } }),
      step: (a, dt, inp) => Launch.stepLaunch(a.s, dt, inp),
      draw: (c, t, a) => AscentRender.draw(c, t, a.s, a.site),
      bot: (a) => { const w = Launch.guidePitch(a.s.burnT, a.s.cfg); return { up: a.s.pitch < w - 2, down: a.s.pitch > w + 2 }; },
      finished: (a) => a.s.status !== 'flying', won: (a) => a.s.status === 'orbit',
      coach: (a) => { if (a.s.t < 0) return 'Get ready: lift-off from the Moon!'; const off = a.s.pitch - Launch.guidePitch(a.s.burnT, a.s.cfg); return Math.abs(off) < 6 ? 'On the green needle. Keep it there!' : off > 0 ? 'Nose too high: press DOWN.' : 'Nose too low: press UP.'; },
      map: (k) => ({ up: k.up || k.left, down: k.down || k.right }), keys: 'UP / DOWN: keep the white needle on the green one until you reach orbit.',
      lose: 'The computer shut the engine down. Try again: small taps, follow the green needle.', win: 'In lunar orbit! That is how the real ascent works.',
    },
    dock: {
      make: () => ({ s: Dock.startDock(Math.random) }),
      step: (a, dt, inp) => Dock.stepDock(a.s, dt, inp),
      draw: (c, t, a) => DockRender.draw(c, t, a.s),
      bot: (a) => ({ thrust: a.s.x > 8, up: a.s.y > 0.3, down: a.s.y < -0.3 }),
      finished: (a) => a.s.status === 'docked', won: () => true,
      coach: (a) => { const s = a.s; return Math.abs(s.y) > s.cfg.tol ? 'Line up with the cross: UP or DOWN.' : s.x < 16 && s.vx > s.cfg.maxSpeed ? 'Too fast! Release SPACE now.' : s.x > 16 ? 'Hold SPACE to close in.' : 'Good: ease in gently.'; },
      map: (k) => ({ up: k.up || k.left, down: k.down, thrust: k.action || k.right }), keys: 'SPACE: thrust toward Orion (release to slow). UP / DOWN: line up the cross.',
      lose: '', win: 'Docked! Soft and aligned.',
    },
    burn: {
      make: () => ({ s: Tli.startTli(), inT: 0 }),
      step: (a, dt, inp) => Tli.stepTli(a.s, dt, inp),
      draw: (c, t, a) => TliRender.draw(c, t, a.s),
      bot: (a) => { a.inT = Tli.windowIn(a.s) === 0 ? a.inT + 1 / 60 : 0; return { burn: a.s.status === 'orbit' && (a.s.burning || a.inT >= 0.4) }; },
      finished: (a) => a.s.status === 'done', won: (a) => a.s.result && a.s.result.hit,
      coach: (a) => { const s = a.s; if (s.status !== 'orbit') return s.result.hit ? 'Path reaches the Moon!' : 'A bit off.'; const w = Tli.windowIn(s); return s.cutoff ? 'Engine off: on the way!' : w === 0 ? 'IN THE WINDOW: hold SPACE!' : `Wait for the green window (${Math.ceil(w)} s).`; },
      map: (k) => ({ burn: k.action }), keys: 'SPACE: hold it while the ship is inside the green window.',
      lose: 'The path was a bit off. Try again: start the burn when the ship enters the green window and keep holding.', win: 'The path reaches the Moon!',
    },
    reentry: {
      make: () => { ReentryRender.reset(); return { s: Reentry.startReentry(Math.random) }; },
      step: (a, dt, inp) => Reentry.stepReentry(a.s, dt, inp),
      draw: (c, t, a) => ReentryRender.draw(c, t, a.s, Reentry.score(a.s).stars),
      bot: (a) => (a.s.phase === 'entry' ? { up: a.s.angle < -6.8, down: a.s.angle > -6.2 } : { up: a.s.tilt > 2, down: a.s.tilt < -2 }),
      finished: (a) => a.s.status === 'done', won: (a) => Reentry.score(a.s).stars >= 3,
      coach: (a) => { const s = a.s; if (s.phase === 'entry') return s.angle < s.cfg.corridor[0] ? 'Too steep: the shield is heating. Press UP!' : s.angle > s.cfg.corridor[1] ? 'Too shallow: we may skip. Press DOWN!' : 'In the corridor. Hold steady.'; return Math.abs(s.tilt) > s.cfg.upright ? (s.tilt > 0 ? 'Swinging right: press UP.' : 'Swinging left: press DOWN.') : 'Upright. Keep her there!'; },
      map: (k) => ({ up: k.up || k.left, down: k.down || k.right }), keys: 'UP / DOWN: keep the angle in the corridor, then keep the capsule upright under the chutes.',
      lose: 'You got home, but with fewer than 3 stars. Try again: stay in the corridor, then steady the swing.', win: 'A perfect re-entry: 3 stars!',
    },
    landing: {
      make: () => ({ s: Landing.startLanding({ ...site0, profile }, 28, 600, Math.random) }),
      step: (a, dt, inp) => Landing.stepLanding(a.s, dt, inp),
      draw: (c, t, a) => LandingRender.draw(c, t, a.s),
      bot: (a) => landingPilot(a.s),
      finished: (a) => a.s.status !== 'flying', won: (a) => a.s.status === 'landed',
      coach: (a) => { const s = a.s; return s.alt > 80 ? 'Fly over a green pad (LEFT / RIGHT tilt).' : s.vy < -4 ? 'Too fast! Use the engine.' : 'Nice and slow. Gently down.'; },
      map: (k) => ({ thrust: k.up || k.action, left: k.left, right: k.right }), keys: 'UP or SPACE: engine. LEFT / RIGHT: tilt. Land on a green pad slower than 2 m/s.',
      lose: 'That was a hard one. Try again: tilt to slide sideways, and slow down with the engine near the ground.', win: 'Touchdown! A soft landing.',
    },
    flight: {
      make: () => ({ s: Moon.startFlight({ items: new Set(ESS) }, { fuelLeft: 60, maneuvers: 0, mass: 600 }, Math.random, 15) }),
      step: (a, dt) => Moon.stepFlight(a.s, dt),
      draw: (c, t, a) => MoonRender.drawFlight(c, t, a.s, 384400, site0.name),
      bot: (a) => {
        const f = a.s, e = f.event;
        if (e && e.kind === 'burn') Moon.flightAction(f, 'burn', e.holding ? Math.abs(e.dev) >= 0.05 : Math.abs(e.dev) >= 0.08);
        else if (e && e.kind === 'meteor' && ((a.tap = (a.tap || 0) + 1) % 20 === 0)) Moon.flightAction(f, 'patch');
        return {};
      },
      finished: (a) => a.s.status !== 'flying', coach: () => '', keys: '',
    },
    walk: {
      make: () => ({ s: Surface.startSurface({ site: { ...site0, profile }, items: ESS, fuel: 17 }, Math.random) }),
      step: (a, dt, inp) => Surface.stepSurface(a.s, dt, inp),
      draw: (c, t, a) => SurfaceRender.draw(c, t, a.s),
      bot: (a) => surfaceBot(a.s),
      finished: (a) => a.s.status !== 'playing', coach: () => '', keys: '',
    },
  };

  // The same sensible pilot / walker the tests use.
  function landingPilot(s) {
    if (s.alarm) Landing.ackAlarm(s);
    if (!s.target) {
      const ahead = s.x + 250, zones = s.T.safe.filter((z) => z.b - z.a >= 2 && z.a > s.x + 60);
      const z = zones.sort((p, q) => Math.abs((p.a + p.b) / 2 - ahead) - Math.abs((q.a + q.b) / 2 - ahead))[0] || s.T.safe[0];
      s.target = (z.a + z.b) / 2;
    }
    const dx = s.target - s.x, dvx = s.alt > 15 ? Math.max(-12, Math.min(12, dx * 0.07)) : Math.max(-0.6, Math.min(0.6, dx * 0.2));
    const want = Math.max(-0.5, Math.min(0.5, (dvx - s.vx) * 0.3)), dvy = -Math.max(0.6, Math.min(14, s.alt * 0.12));
    return { thrust: s.vy < dvy || (Math.abs(dvx - s.vx) > 1.5 && s.alt > 30), left: s.angle > want + 0.02, right: s.angle < want - 0.02 };
  }
  function surfaceBot(s) {
    if (s.phase === 'base') { Surface.act(s); return {}; }
    if (s.leak) Surface.patch(s);
    const left = s.targets.filter((g) => !g.done), speed = s.has('rover') ? SURFACE.rover : SURFACE.walk, back = Math.abs(s.x - s.base) / speed;
    const job = left.length ? Math.abs(left[0].x - s.x) / speed + left[0].time + Math.abs(left[0].x - s.base) / speed : 0;
    const stormLeft = s.storm && !s.storm.hit ? s.storm.at - s.evaT : Infinity;
    const home = !left.length || s.o2 < back * 1.3 + 4 || (s.storm && !s.work && job + 2 > stormLeft), goal = home ? s.base : left[0].x;
    if (!s.work && Math.abs(goal - s.x) <= SURFACE.reach - 1) Surface.act(s);
    const w = s.work, input = { right: !w && goal > s.x + 2, left: !w && goal < s.x - 2 };
    if (w && w.g.game === 'timing') { const z = Surface.zoneAt(w); if (Math.abs(w.m - z.c) < z.r * 0.6) Surface.act(s); }
    if (w && w.g.game === 'level') { input.left = w.bubble > 0.05; input.right = w.bubble < -0.05; }
    if (w && w.g.game === 'drill') input.act = w.heat < 0.8;
    return input;
  }

  // ---- Chapters ----
  const nav = $('tut-nav'), box = $('tut-chapters'), runners = [];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  for (const ch of TUTORIAL) {
    const a = el('a', 'icon-btn px', ch.title); a.href = '#' + ch.id; nav.appendChild(a);
    const sec = el('section', 'tut-chapter'); sec.id = ch.id;
    sec.appendChild(el('h2', 'px', ch.title));
    sec.appendChild(el('p', 'pxw tut-intro', ch.intro));
    if (ch.demo) {
      const w = el('div', 'scene-wrap tut-scene'), c = document.createElement('canvas'); c.width = 640; c.height = 360;
      w.appendChild(c); sec.appendChild(w);
      sec.appendChild(el('p', 'pxw tut-demo-note', 'Live demo: an autopilot is flying this with the real game code.'));
      runners.push({ canvas: c, ctx: c.getContext('2d'), scene: SCENES[ch.demo], a: null, hold: 0, visible: false });
    }
    for (const [h, t] of ch.blocks) { const b = el('div', 'tut-block'); b.appendChild(el('h3', 'px', h)); b.appendChild(el('p', 'pxw', t)); sec.appendChild(b); }
    const f = el('div', 'tut-fact'); f.appendChild(el('h3', 'px', 'Real NASA fact')); f.appendChild(el('p', 'pxw', ch.fact)); sec.appendChild(f);
    box.appendChild(sec);
  }

  // ---- Drills ----
  const DRILLS = [['ascent', 'Lift-off'], ['dock', 'Docking'], ['burn', 'Burn window'], ['landing', 'Landing'], ['reentry', 'Re-entry']];
  const dc = $('drill-canvas'), dctx = dc.getContext('2d'), coachEl = $('drill-coach');
  const keys = { up: false, down: false, left: false, right: false, action: false };
  let drill = null, dName = null, dState = null, dEnd = 0;
  const list = $('drill-list'), btns = {};
  const done = () => Campaign.get().tutorial || {};
  function mark() { for (const [n, label] of DRILLS) btns[n].textContent = (done()[n] ? '✓ ' : '') + label; }
  function startDrill(name) {
    dName = name; drill = SCENES[name]; dState = drill.make(); dEnd = 0;
    for (const [n] of DRILLS) btns[n].classList.toggle('primary', n === name);
    $('drill-keys').textContent = drill.keys;
  }
  for (const [n, label] of DRILLS) { const b = el('button', 'px', label); b.addEventListener('click', () => { Sfx.click(); startDrill(n); dc.scrollIntoView({ block: 'center', behavior: 'smooth' }); }); list.appendChild(b); btns[n] = b; }
  $('drill-again').addEventListener('click', () => { if (dName) startDrill(dName); });
  mark();
  const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'action', Enter: 'action' };
  document.addEventListener('keydown', (e) => { if (drill && KEYS[e.code]) { e.preventDefault(); keys[KEYS[e.code]] = true; } });
  document.addEventListener('keyup', (e) => { if (KEYS[e.code]) keys[KEYS[e.code]] = false; });
  for (const [id, k] of [['d-left', 'left'], ['d-up', 'up'], ['d-act', 'action'], ['d-down', 'down'], ['d-right', 'right']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[k] = true; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { keys[k] = false; });
  }
  const muteBtn = $('mute-btn'), muteLabel = () => { muteBtn.textContent = Sfx.isMuted() ? 'SOUND OFF' : 'SOUND ON'; };
  muteBtn.addEventListener('click', () => { Sfx.toggle(); muteLabel(); }); muteLabel();
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  // ---- Loop ----
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) { const r = runners.find((x) => x.canvas === e.target); if (r) r.visible = e.isIntersecting; } }) : null;
  for (const r of runners) { if (io) io.observe(r.canvas); else r.visible = true; }
  runners.push({ canvas: dc, ctx: dctx, drill: true, visible: true });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const r of runners) {
      if (!r.visible) continue;
      if (r.drill) { stepDrill(now, dt); continue; }
      if (!r.a) { r.a = r.scene.make(); r.hold = 0; }
      if (!r.scene.finished(r.a)) { r.scene.step(r.a, dt, r.scene.bot(r.a)); } else if ((r.hold += dt) > 3) r.a = null;
      if (r.a) r.scene.draw(r.ctx, now / 1000, r.a);
    }
    PixelText.sync();
    requestAnimationFrame(frame);
  }
  function stepDrill(now, dt) {
    if (!drill) { dctx.fillStyle = '#05040c'; dctx.fillRect(0, 0, 640, 360); PixelText.draw(dctx, 'PICK A DRILL ABOVE', 320, 170, '#8a84b0', 2, 'center'); setCoach('Pick a drill to start.'); return; }
    const fin = drill.finished(dState);
    if (!fin) { drill.step(dState, dt, drill.map(keys)); setCoach(drill.coach(dState)); }
    drill.draw(dctx, now / 1000, dState);
    if (fin && !dEnd) {
      dEnd = now; const won = drill.won(dState);
      if (won) { Sfx.win(); Campaign.save({ tutorial: { [dName]: true } }); mark(); setCoach(drill.win + ' Drill ticked off.'); } else { Sfx.sloppy(); setCoach(drill.lose || 'Try again.'); }
    }
    if (fin && dEnd && !drill.won(dState) && now - dEnd > 3500) startDrill(dName); // a failed run restarts by itself
  }
  let coachTxt = ''; function setCoach(t) { if (t !== coachTxt) { coachTxt = t; coachEl.textContent = t; } }
  requestAnimationFrame(frame);
})();
