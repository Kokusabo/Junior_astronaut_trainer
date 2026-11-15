// Mission 4 browser glue: lift-off from the Moon -> burn for Earth -> flight home -> re-entry and splashdown.
// URL from Mission 3: earth.html?site=..&items=..&fuel=..&health=..&science=.. (no URL = a default trip).
(function () {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const site = MOON_SITES.find((x) => x.id === q.get('site')) || MOON_SITES[0];
  const items = new Set((q.get('items') || 'oxygen,water,food,habitat,repair').split(','));
  const num = (k, d) => (Number.isFinite(parseFloat(q.get(k))) ? parseFloat(q.get(k)) : d);
  const startFuel = num('fuel', 22), science = num('science', 40);
  const ASCENT_FUEL = 8, TEI_FUEL = 8; // % of the tank each burn needs

  // Radio (same typewriter as the other missions).
  const radio = { queue: [], text: '', shown: 0, holdUntil: 0 };
  const portrait = $('portrait').getContext('2d'), radioCanvas = $('radio-canvas');
  let radioDrawn = '';
  function say(text, urgent) { if (!text) return; if (urgent) { radio.queue = [text]; radio.holdUntil = 0; radio.shown = radio.text.length; } else radio.queue.push(text); }
  function renderRadio(now, dt) {
    const width = radioCanvas.parentElement.clientWidth, key = `${radio.text}|${Math.floor(radio.shown)}|${width}`;
    if (key !== radioDrawn && width) { radioDrawn = key; PixelText.drawWrapped(radioCanvas, radio.text, width, Math.floor(radio.shown), 2, '#f3e8ff'); }
    if (radio.shown < radio.text.length) { radio.shown = Math.min(radio.text.length, radio.shown + dt * 55); if (radio.shown >= radio.text.length) radio.holdUntil = now + 2500; }
    else if (radio.queue.length && now >= radio.holdUntil) { radio.text = radio.queue.shift(); radio.shown = 0; $('radio').textContent = radio.text; Sfx.click(); }
    Render.portrait(portrait, now / 1000, radio.shown < radio.text.length, false);
  }
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };

  // ---- The trip ----
  const terrain = Landing.makeTerrain({ ...site, profile: typeof MOON_NASA !== 'undefined' ? MOON_NASA.terrain[site.id] : null }, Math.random);
  const siteView = { T: terrain, x: 700, roughness: site.roughness };
  let phase, asc, dock, tei, flight, re, fuel, rescue, phaseAt, seenLog, endStars, ascentPenalty, said = {};
  function start() {
    phase = 'ascent'; fuel = startFuel; rescue = false; seenLog = 0; endStars = 0; ascentPenalty = 0; said = {};
    asc = Launch.startLaunch(Math.random, MOON_LAUNCH); dock = tei = flight = re = null; phaseAt = performance.now();
    ReentryRender.reset();
    document.querySelector('.home-end').hidden = true; document.querySelector('.home-pad').hidden = false;
    say(`Mission 4: time to go home. ${Math.round(fuel)} percent fuel in the tank. The top of the lander lifts off and leaves the gold descent stage on the Moon. Steer with UP and DOWN to follow the green needle.`, true);
  }
  const next = (p) => { phase = p; phaseAt = performance.now(); seenLog = 0; };

  const input = { up: false, down: false, action: false };
  let actionTap = false;
  function action(on) {
    input.action = on;
    if (!on) return;
    actionTap = true;
  }
  for (const [id, key] of [['up-btn', 'up'], ['down-btn', 'down']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input[key] = true; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { input[key] = false; });
  }
  const ab = $('action-btn');
  ab.addEventListener('pointerdown', (e) => { e.preventDefault(); action(true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ab.addEventListener(ev, () => action(false));
  const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowLeft: 'up', KeyA: 'up', ArrowDown: 'down', KeyS: 'down', ArrowRight: 'down', KeyD: 'down' };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) action(true); return; }
    if (KEYS[e.code]) { e.preventDefault(); input[KEYS[e.code]] = true; }
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') action(false); if (KEYS[e.code]) input[KEYS[e.code]] = false; });
  $('again-btn').addEventListener('click', start);
  $('start-btn').addEventListener('click', () => { Campaign.reset(); location.href = 'index.html'; });
  $('back-btn').addEventListener('click', () => { location.href = 'index.html#menu'; });
  const muteBtn = $('mute-btn');
  const muteLabel = () => { muteBtn.textContent = Sfx.isMuted() ? 'SOUND OFF' : 'SOUND ON'; };
  muteBtn.addEventListener('click', () => { Sfx.toggle(); muteLabel(); });
  muteLabel();
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  const canvas = $('map'), ctx = canvas.getContext('2d');
  let soundT = 0;
  function step(now, dt) {
    const t = now / 1000, since = (now - phaseAt) / 1000;
    if (phase === 'ascent') {
      Launch.stepLaunch(asc, dt, { up: input.up, down: input.down });
      AscentRender.draw(ctx, t, asc, siteView);
      if (asc.firing && asc.t > 0 && asc.status === 'flying' && (soundT -= dt) <= 0) { soundT = 0.12; Sfx.thrust(); }
      if (asc.t > 0 && !said.lift) { said.lift = true; Sfx.rumble(); say('Lift-off from the Moon! Goodbye, descent stage.', true); }
      if (asc.status === 'orbit' && !said.orbit) { said.orbit = true; ascentPenalty = asc.penalty; fuel -= ASCENT_FUEL + asc.penalty; Sfx.win(); say(`In lunar orbit. ${Math.max(0, Math.round(fuel))} percent fuel left for the burn home.`, true); }
      if (asc.status === 'orbit' && since > 0) { if (!said.orbitAt) said.orbitAt = now; if (now - said.orbitAt > 2500) startDock(); }
      if (asc.status === 'abort' && !said.abort) { said.abort = true; Sfx.sloppy(); say(asc.reason, true); setTimeout(() => { said = {}; asc = Launch.startLaunch(Math.random, MOON_LAUNCH); }, 3000); }
    } else if (phase === 'dock') {
      Dock.stepDock(dock, dt, { up: input.up, down: input.down, thrust: input.action });
      DockRender.draw(ctx, t, dock);
      if (input.action && dock.status === 'flying' && (soundT -= dt) <= 0) { soundT = 0.15; Sfx.thrust(); }
      for (; seenLog < dock.log.length; seenLog++) { if (/bounced/.test(dock.log[seenLog])) { Sfx.sloppy(); fuel -= Dock.fuelCost({ bounces: 1, cfg: dock.cfg }); } say(dock.log[seenLog], true); }
      if (dock.status === 'docked' && !said.docked) { said.docked = true; said.dockedAt = now; Sfx.win(); say('Docked with Orion! The crew floats over into Orion and lets the lander top go. From here Orion flies us home.', true); }
      if (said.dockedAt && now - said.dockedAt > 3500) startTei();
    } else if (phase === 'tei') {
      Tli.stepTli(tei, dt, { burn: input.action });
      TliRender.draw(ctx, t, tei);
      if (tei.burning && (soundT -= dt) <= 0) { soundT = 0.1; Sfx.thrust(); }
      if (tei.status === 'done' && !said.tei) {
        said.tei = true; said.teiAt = now;
        fuel -= Math.min(TEI_FUEL, Math.max(0, fuel));
        if (tei.outOfFuel) { rescue = true; Sfx.sloppy(); say('The tank ran dry before we were fast enough. No problem: Orion is waiting at the Lunar Gateway station. We dock there and Orion takes us home.', true); }
        else { (tei.result.hit ? Sfx.fixed : Sfx.sloppy)(); say(tei.result.hit ? 'Engine cutoff: the path reaches Earth!' : `We ${tei.result.why}. We will fix it on the way.`, true); }
      }
      if (said.teiAt && now - said.teiAt > 3500) startFlight();
    } else if (phase === 'flight') {
      if (flight.event && flight.event.kind === 'meteor' && actionTap) Moon.flightAction(flight, 'patch');
      if (flight.event && flight.event.kind === 'burn') Moon.flightAction(flight, 'burn', input.action);
      Moon.stepFlight(flight, dt);
      MoonRender.drawFlight(ctx, t, flight, 384400, 'EARTH');
      for (; seenLog < flight.log.length; seenLog++) say(flight.log[seenLog], true);
      if (flight.event && flight.event !== said.ev) { said.ev = flight.event; Sfx.alarm(); say(flight.event.kind === 'burn' ? 'Course correction! Hold SPACE until we are back on the dotted line.' : 'Micrometeoroid hit! Tap SPACE to patch the leak.', true); }
      if (flight.status !== 'flying') startReentry();
    } else if (phase === 'reentry') {
      Reentry.stepReentry(re, dt, { up: input.up, down: input.down });
      ReentryRender.draw(ctx, t, re, endStars);
      if (re.phase === 'entry' && (soundT -= dt) <= 0) { soundT = 0.15; Sfx.thrust(); }
      for (; seenLog < re.log.length; seenLog++) { const m = re.log[seenLog]; if (/skipped/.test(m)) Sfx.alarm(); say(m, true); }
      if (re.status === 'done' && !said.end) {
        said.end = true;
        const r = Reentry.score(re);
        endStars = Math.max(1, r.stars - (rescue ? 1 : 0) - (ascentPenalty > 3 ? 1 : 0));
        Sfx.win();
        const c = Campaign.save({ stars: { m4: endStars } }), st = c.stars;
        $('trip-summary').textContent = `Your trip: Mission 1 ${st.m1 ? '\u2605'.repeat(st.m1) : '-'}  Mission 2 ${st.m2 ? '\u2605'.repeat(st.m2) : '-'}  Mission 3 ${st.m3 ? '\u2605'.repeat(st.m3) : '-'}  Mission 4 ${st.m4 ? '\u2605'.repeat(st.m4) : '-'}. Total ${Campaign.total()} of 12.`;
        say(`Welcome home! The recovery ship is on its way. You flew from Earth to the Moon and back, and brought home ${science} points of science. ${rescue ? 'Next time, keep more fuel for the trip home.' : 'A perfect journey for a junior astronaut!'}`, true);
        document.querySelector('.home-pad').hidden = true; document.querySelector('.home-end').hidden = false;
      }
    }
    actionTap = false;
  }
  function startDock() {
    next('dock');
    dock = Dock.startDock(Math.random);
    say('Orion waited for us in lunar orbit. Hold the thrust to close in, release it to slow down, and line up the cross with UP and DOWN. Touch gently!', true);
  }
  function startTei() {
    next('tei');
    const needUnits = TEI.needKms / TEI.vUnit;
    tei = Tli.startTli({ ...TEI, maxDv: fuel >= TEI_FUEL ? Infinity : (Math.max(0, fuel) / TEI_FUEL) * needUnits });
    say('Now flying Orion. Earth is out there on the right. Hold SPACE in the green window to fire the engine for home.', true);
  }
  function startFlight() {
    next('flight');
    flight = Moon.startFlight({ items }, { fuelLeft: Math.max(rescue ? 10 : 0, fuel), maneuvers: 0, mass: 600 }, Math.random, 0, { home: true, duration: 30, events: [[0.35, 'burn'], [0.7, 'meteor']] });
    flight.aimError = rescue ? 6 : tei.result.penalty;
    say('Three days home, sped up. Watch the dashboard.', true);
  }
  function startReentry() {
    next('reentry');
    re = Reentry.startReentry(Math.random);
    say('The service module is let go: only the capsule goes in. Entry interface at 11 kilometres per second! Heat shield first. Keep the angle in the green corridor with UP and DOWN.', true);
  }

  const TITLES = { ascent: 'Lift-off', dock: 'Docking', tei: 'Burn for Earth', flight: 'Flight home', reentry: 'Re-entry' };
  const HINTS = {
    dock: 'Hold SPACE (or ACTION) to close in, release to slow down. UP / DOWN: line up the cross.',
    ascent: 'UP / DOWN: follow the green needle to orbit.',
    tei: 'Hold SPACE (or ACTION) in the green window to fire the engine for home.',
    flight: 'Hold SPACE for the course correction, tap it to patch a leak.',
    reentry: 'UP / DOWN: keep the angle in the corridor, then keep the capsule upright under the parachutes.',
  };
  start();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(now, dt);
    setText($('home-title'), TITLES[phase]);
    if (!said.end) setText($('home-text'), HINTS[phase]);
    if (phase !== 'flight' && phase !== 'reentry') MoonRender.prepareEarth();
    renderRadio(now, dt);
    PixelText.sync();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
