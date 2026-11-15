// Mission 2 browser glue, part 1: trip planning (landing site + cargo, one fuel budget).
(function () {
  const $ = (id) => document.getElementById(id);
  const plan = { site: null, items: new Set(), distanceKm: MOON.meanDistanceKm };
  // Real NASA numbers for the flight story (saved copy; replaced by live data when it arrives).
  const nasa = { flare: typeof MOON_NASA !== 'undefined' ? MOON_NASA.flare : null, asteroid: typeof MOON_NASA !== 'undefined' ? MOON_NASA.asteroid : null };

  // ---------- Radio: flight control with a typewriter line and the talking portrait ----------
  const radio = { queue: [], text: '', shown: 0, holdUntil: 0 };
  const portrait = $('portrait').getContext('2d');
  const radioCanvas = $('radio-canvas');
  let radioDrawn = '';
  function say(text, urgent) {
    if (!text) return;
    if (urgent) { radio.queue = [text]; radio.holdUntil = 0; radio.shown = radio.text.length; }
    else if (radio.queue[radio.queue.length - 1] !== text) radio.queue.push(text);
  }
  function drawRadio(reveal) {
    const width = radioCanvas.parentElement.clientWidth;
    const key = `${radio.text}|${reveal}|${width}`;
    if (key === radioDrawn || !width) return;
    radioDrawn = key;
    PixelText.drawWrapped(radioCanvas, radio.text, width, reveal, 2, '#f3e8ff');
  }
  function renderRadio(now, dt) {
    drawRadio(Math.floor(radio.shown));
    if (radio.shown < radio.text.length) {
      radio.shown = Math.min(radio.text.length, radio.shown + dt * 55);
      if (radio.shown >= radio.text.length) radio.holdUntil = now + 2500;
    } else if (radio.queue.length && now >= radio.holdUntil) {
      radio.text = radio.queue.shift();
      radio.shown = 0;
      $('radio').textContent = radio.text;
      Sfx.click();
    }
    Render.portrait(portrait, now / 1000, radio.shown < radio.text.length, false);
  }

  // ---------- Landing sites ----------
  const siteList = $('site-list');
  for (const site of MOON_SITES) {
    const b = document.createElement('button');
    b.className = 'px';
    b.textContent = site.name;
    b.dataset.id = site.id;
    b.addEventListener('click', () => pickSite(site));
    siteList.appendChild(b);
  }
  const level = (v) => (v < 0.3 ? 'Easy' : v < 0.6 ? 'Medium' : 'Hard');
  function pickSite(site) {
    plan.site = site;
    Sfx.go();
    renderSiteCard(site);
    say(`${site.name}. ${site.fact}`, true);
    loadPhoto(site);
    update();
  }
  // Card contents only (no sound, no radio): also used when the real distance arrives.
  function renderSiteCard(site) {
    for (const b of siteList.children) b.classList.toggle('on', b.dataset.id === site.id);
    $('site-card').hidden = false;
    $('site-name').textContent = site.name;
    $('site-region').textContent = site.region;
    const stats = [
      `Trip fuel: ${Moon.reachCost(site, MOON, plan.distanceKm).toFixed(0)}%`,
      `Landing: ${level(site.roughness)}`,
      `Water ice: ${site.ice ? 'Yes' : 'No'}`,
      `Sunlight: ${site.sunlight}% of the time`,
      `Science: ${'★'.repeat(site.science)}`,
    ];
    $('site-stats').innerHTML = '';
    for (const line of stats) { const li = document.createElement('li'); li.className = 'px'; li.textContent = line; $('site-stats').appendChild(li); }
    $('site-fact').textContent = site.fact;
  }

  // Real NASA photo for the site card (NASA Image and Video Library). Hidden if it cannot load.
  const photoCache = {};
  function loadPhoto(site) {
    const img = $('site-photo');
    img.hidden = true;
    const show = (src) => { if (plan.site === site && src) { img.src = src; img.alt = `NASA photo: ${site.photo}`; img.hidden = false; } };
    if (photoCache[site.id] !== undefined) return show(photoCache[site.id]);
    getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(site.photo)}&media_type=image`)
      .then((j) => {
        const item = j.collection && j.collection.items && j.collection.items.find((it) => it.links && it.links[0]);
        photoCache[site.id] = item ? item.links[0].href : null;
        show(photoCache[site.id]);
      }, () => { photoCache[site.id] = null; });
  }

  // ---------- Cargo ----------
  const cargo = $('cargo');
  for (const it of MOON_ITEMS) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'cargo-item';
    b.dataset.id = it.id;
    b.innerHTML = '<canvas width="16" height="16" aria-hidden="true"></canvas><span class="c-name px"></span><span class="c-kg px"></span>';
    b.querySelector('.c-name').textContent = it.name + (it.essential ? ' *' : '');
    b.querySelector('.c-kg').textContent = `${it.kg} kg`;
    MoonRender.icon(b.querySelector('canvas').getContext('2d'), it.id);
    b.addEventListener('click', () => toggleItem(it));
    b.addEventListener('mouseenter', () => { $('cargo-hint').textContent = `${it.name}: ${it.use}`; });
    li.appendChild(b);
    cargo.appendChild(li);
  }
  const QUIPS = {
    guitar: 'A guitar. Eight kilograms of morale. Flight control will allow it. Barely.',
    snacks: 'Extra snacks. The crew approves. The fuel gauge does not.',
    rover: 'The rover is the heaviest thing on the list. Worth it only if you plan to drive far.',
    shield: 'The radiation shield is heavy, but a solar storm without it is very dangerous.',
  };
  function toggleItem(it) {
    if (plan.items.has(it.id)) { plan.items.delete(it.id); Sfx.click(); }
    else { plan.items.add(it.id); Sfx.hit(); say(QUIPS[it.id] || `${it.name} packed. ${it.use}`, true); }
    $('cargo-hint').textContent = `${it.name}: ${it.use}`;
    update();
  }

  // ---------- Budget ----------
  let launchReady = false;
  function update() {
    const b = Moon.budget(plan, MOON, MOON_ITEMS);
    for (const btn of cargo.querySelectorAll('.cargo-item')) btn.classList.toggle('on', plan.items.has(btn.dataset.id));
    $('mass-bar').style.width = `${Math.min(100, (b.mass / MOON.massLimit) * 100)}%`;
    $('mass-bar').parentElement.classList.toggle('low', b.mass > MOON.massLimit);
    $('mass-text').textContent = `${b.mass} / ${MOON.massLimit} kg`;
    $('fuel-site').style.width = `${Math.min(100, b.siteCost)}%`;
    $('fuel-cargo').style.width = `${Math.max(0, Math.min(100 - b.siteCost, b.cargoCost))}%`;
    $('fuel-stack').classList.toggle('over', b.fuelLeft < MOON.landingReserve);
    $('fuel-text').textContent = `${Math.max(0, b.fuelLeft).toFixed(0)}% left to land (need ${MOON.landingReserve}%)`;
    $('budget-status').textContent = b.canLaunch
      ? `Ready. ${b.fuelLeft.toFixed(0)}% fuel at the Moon: ${b.fuelLeft >= 30 ? 'a comfortable margin.' : 'tight, but enough.'}`
      : b.problems.join(' ');
    $('budget-status').classList.toggle('alert', !b.canLaunch && !!plan.site);
    $('launch-btn').disabled = !b.canLaunch;
    if (b.canLaunch && !launchReady) say('Plan checks out. Lander is GO for launch whenever you are.');
    launchReady = b.canLaunch;
  }

  // ---------- Flight (cockpit view) ----------
  let flight = null;
  let seenEvent = null, seenResult = null;
  const EVENT_LINES = {
    burn: 'We are drifting off course. Hold BURN to push the ship back onto the dotted line, then let go. Heavy ships turn slowly.',
    storm: 'Solar particle storm! Real events like this are tracked by NASA DONKI. Everyone into the shelter, now!',
    meteor: 'Micrometeoroid impact! Cabin pressure dropping. Patch that leak!',
    brake: 'Approaching the Moon. Hold BRAKE to slow down into orbit, and let go when the speed is in the green.',
  };
  $('launch-btn').addEventListener('click', () => { if (Moon.budget(plan, MOON, MOON_ITEMS).canLaunch) startLaunch(); });
  // After reaching Earth orbit: the trans-lunar injection burn starts the flight. A wobbly launch costs fuel.
  // Event radio lines, with the real NASA numbers when we have them.
  function eventLine(kind) {
    if (kind === 'storm' && nasa.flare) return `Solar particle storm! This one is modelled on a real ${nasa.flare.classType} flare NASA's DONKI recorded on ${nasa.flare.date}. Everyone into the shelter, now!`;
    if (kind === 'meteor' && nasa.asteroid) return `Micrometeoroid impact! Space is full of rocks: on ${nasa.asteroid.date} asteroid ${nasa.asteroid.name} passed just ${nasa.asteroid.km.toLocaleString('en-US')} km from Earth (NASA JPL). Patch that leak!`;
    return EVENT_LINES[kind];
  }
  function startFlight(penalty = 0, aimError) {
    const b = Moon.budget(plan, MOON, MOON_ITEMS);
    flight = Moon.startFlight(plan, b, Math.random, MOON.landingReserve);
    flight.fuel -= penalty;
    flight.aimError = aimError; // a less accurate TLI burn makes the first course correction bigger
    flight.flare = nasa.flare; // real NASA data shapes the storm and the meteor story
    flight.asteroid = nasa.asteroid;
    launch = orbit = null;
    for (const id of ['launch-panel', 'orbit-panel']) $(id).hidden = true;
    seenEvent = seenResult = null;
    document.body.classList.add('flying');
    $('flight-panel').hidden = false;
    $('flight-log').innerHTML = '';
    document.querySelector('.flight-end').hidden = true;
    setText($('level-name'), `Flight to ${plan.site.name}: about three days in space`);
    say(`On our way! Next stop: ${plan.site.name}. ${b.mass} kilograms of cargo, ${Math.round(b.fuelLeft - penalty)} percent fuel for the landing.${aimError > 2 ? ' Our aim was a bit off, so expect a bigger course correction.' : ''} Watch the dashboard.`, true);
  }

  // ---------- Launch from Earth (part 1) ----------
  let launch = null, launchSeen = 0, launchDone = false, launchSound = 0, lastCount = 9, saidMaxQ = false;
  const linput = { up: false, down: false };
  function startLaunch() {
    launch = Launch.startLaunch(Math.random);
    launchSeen = 0; launchDone = false; lastCount = 9; saidMaxQ = false;
    flight = landing = null;
    document.body.classList.add('flying');
    for (const id of ['flight-panel', 'landing-panel']) $(id).hidden = true;
    $('launch-panel').hidden = false;
    document.querySelector('.launch-end').hidden = true;
    document.querySelector('.launch-pad').hidden = false;
    setText($('level-name'), 'Launch from Kennedy Space Center');
    say('Launch control here. After liftoff, steer with UP and DOWN to keep the white needle on the green one. When a stage burns out, press SPACE to drop it.', true);
  }
  const doStage = () => { if (launch && Launch.separate(launch)) Sfx.go(); };
  $('stage-btn').addEventListener('click', doStage);
  for (const [id, key] of [['up-btn', 'up'], ['down-btn', 'down']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); linput[key] = true; b.classList.add('holding'); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { linput[key] = false; b.classList.remove('holding'); });
  }
  const LKEYS = { ArrowUp: 'up', KeyW: 'up', ArrowLeft: 'up', KeyA: 'up', ArrowDown: 'down', KeyS: 'down', ArrowRight: 'down', KeyD: 'down' };
  document.addEventListener('keydown', (e) => {
    if (!launch) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) doStage(); return; }
    if (LKEYS[e.code]) { e.preventDefault(); linput[LKEYS[e.code]] = true; }
  });
  document.addEventListener('keyup', (e) => { if (LKEYS[e.code]) linput[LKEYS[e.code]] = false; });
  $('tli-btn').addEventListener('click', () => { if (launch && launch.status === 'orbit') startOrbit(launch.penalty); });

  // ---------- Earth orbit: the trans-lunar injection burn (part 1b) ----------
  let orbit = null, orbitPenalty = 0, orbitSeen = {}, burnHeld = false, orbitSound = 0;
  function startOrbit(launchPenalty) {
    orbitPenalty = launchPenalty;
    orbit = Tli.startTli();
    orbitSeen = { cutoff: false, done: false, window: false, laps: 0 };
    launch = flight = landing = null;
    document.body.classList.add('flying');
    for (const id of ['launch-panel', 'flight-panel', 'landing-panel']) $(id).hidden = true;
    $('orbit-panel').hidden = false;
    document.querySelector('.orbit-end').hidden = true;
    $('burn-tli-btn').hidden = false;
    setText($('level-name'), 'Earth orbit: the burn for the Moon');
    say('We are in Earth orbit. To reach the Moon we burn on the far side of Earth, in the green window. Hold BURN there. The computer stops the engine when we are fast enough.', true);
  }
  const tliBtn = $('burn-tli-btn');
  tliBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); burnHeld = true; tliBtn.classList.add('holding'); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) tliBtn.addEventListener(ev, () => { burnHeld = false; tliBtn.classList.remove('holding'); });
  document.addEventListener('keydown', (e) => { if (orbit && e.code === 'Space') { e.preventDefault(); burnHeld = true; } });
  document.addEventListener('keyup', (e) => { if (orbit && e.code === 'Space') burnHeld = false; });
  const coast = () => { if (orbit && orbit.status === 'done') startFlight(orbitPenalty, orbit.result.penalty); };
  $('coast-btn').addEventListener('click', coast);
  $('reorbit-btn').addEventListener('click', () => startOrbit(orbitPenalty));
  $('replan4-btn').addEventListener('click', backToPlanning);

  function renderOrbit(dt) {
    const s = orbit;
    if (s.burning && (orbitSound -= dt) <= 0) { orbitSound = 0.1; Sfx.thrust(); }
    const inWin = Tli.windowIn(s) === 0;
    if (inWin && !orbitSeen.window && !s.cutoff && s.status === 'orbit') { orbitSeen.window = true; Sfx.go(); if (!s.burning) say('We are in the window. BURN!', true); }
    if (!inWin) orbitSeen.window = false;
    if (s.laps > orbitSeen.laps) { orbitSeen.laps = s.laps; if (!s.cutoff && s.status === 'orbit') say(s.dv > 0.02 ? 'Not fast enough yet. Burn again in the window on this lap.' : 'We missed the window. It comes back every lap: about 16 seconds.', true); }
    if (s.cutoff && !orbitSeen.cutoff) { orbitSeen.cutoff = true; Sfx.fixed(); }
    setText($('orbit-text'), s.status === 'done' ? `${s.result.why[0].toUpperCase()}${s.result.why.slice(1)}.${s.result.penalty > 2 ? ' The first course correction on the way will be bigger.' : ''} Flying on to the Moon...`
      : s.cutoff ? 'Engine off. Watch the path stretch out to the Moon.'
      : inWin ? 'In the window: hold BURN now!'
      : 'Wait until the ship is in the green window on the far side of Earth, then hold BURN.');
    if (s.status === 'done' && !orbitSeen.done) {
      orbitSeen.done = true;
      burnHeld = false;
      $('burn-tli-btn').hidden = true;
      document.querySelector('.orbit-end').hidden = false;
      (s.result.hit ? Sfx.win : Sfx.sloppy)();
      say(s.result.hit ? 'Engine cutoff! The path reaches the Moon. Right on target!' : `We ${s.result.why.startsWith('burned') ? '' : 'are '}${s.result.why}. We will fix it with a course correction on the way.`, true);
      orbitSeen.doneAt = performance.now();
    }
    document.querySelector('.orbit-keys').hidden = s.status !== 'orbit' || s.cutoff;
    if (s.cutoff) $('burn-tli-btn').hidden = true;
    if (orbitSeen.doneAt && performance.now() - orbitSeen.doneAt > 3500) coast(); // fly on by itself after a moment
  }
  $('relaunch-btn').addEventListener('click', startLaunch);
  $('replan3-btn').addEventListener('click', backToPlanning);

  const LAUNCH_LINES = {
    burnout: 'Booster burnout! Stage them now: press SPACE.',
    las: 'Launch abort tower jettisoned. We are high enough to not need it.',
  };
  function renderLaunch(dt) {
    const s = launch;
    if (s.t < 0 && Math.ceil(-s.t) !== lastCount) { lastCount = Math.ceil(-s.t); Sfx.count(lastCount); }
    if (s.firing && s.t > 0 && s.status === 'flying' && (launchSound -= dt) <= 0) { launchSound = 0.12; Sfx.thrust(); }
    if (!saidMaxQ && s.burnT > s.cfg.maxQ[0]) { saidMaxQ = true; say('Max Q: the air is pushing hardest on the rocket now. Hold it steady!', true); }
    for (; launchSeen < s.events.length; launchSeen++) {
      const e = s.events[launchSeen];
      if (e.kind === 'burnout') { Sfx.alarm(); say(LAUNCH_LINES.burnout, true); }
      if (e.kind === 'stage') say(e.stage === 0 ? 'Booster separation confirmed. The core stage keeps pushing.' : 'Stage separation.', true);
      if (e.kind === 'autostage') say('The computer had to stage for us. That wasted some speed.', true);
      if (e.kind === 'las') { Sfx.click(); say(LAUNCH_LINES.las, true); }
    }
    if (s.t > 0 && s.t < 0.1 && !s.saidLiftoff) { s.saidLiftoff = true; Sfx.rumble(); say('Liftoff! We have liftoff!', true); }
    setText($('launch-text'), s.status === 'orbit' ? `In Earth orbit, ${Math.round(s.orbit.alt)} km up.${s.penalty ? ` The bumpy ride cost ${s.penalty}% of the lander fuel.` : ' A perfect ascent!'}`
      : s.status === 'abort' ? s.reason
      : s.t < 0 ? 'Countdown. Get ready to steer.'
      : !s.firing ? 'Stage burned out: press STAGE (or SPACE) now!'
      : 'Keep the white needle on the green one. UP = steeper, DOWN = flatter.');
    $('stage-btn').disabled = s.firing || s.status !== 'flying';
    if (s.status !== 'flying' && !launchDone) {
      launchDone = true;
      linput.up = linput.down = false;
      document.querySelector('.launch-end').hidden = false;
      document.querySelector('.launch-pad').hidden = true;
      $('tli-btn').hidden = s.status !== 'orbit';
      if (s.status === 'orbit') { Sfx.win(); say(`Main engine cutoff. We are in orbit, ${Math.round(s.orbit.alt)} kilometres up! Next: the burn that sends us to the Moon.`, true); }
      else { Sfx.crash(); say(`Abort! ${s.reason}`, true); }
    }
    document.querySelector('.launch-keys').hidden = s.status !== 'flying';
  }

  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };

  function act(action, value) {
    if (!flight) return;
    const ok = Moon.flightAction(flight, action, value);
    if (ok) (action === 'burn' ? (value ? Sfx.scan() : Sfx.click()) : Sfx.hit());
    else if (value !== false) Sfx.miss();
  }
  const burnBtn = $('burn-btn');
  burnBtn.addEventListener('pointerdown', () => { act('burn', true); burnBtn.classList.add('holding'); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) burnBtn.addEventListener(ev, () => { if (burnBtn.classList.contains('holding')) { burnBtn.classList.remove('holding'); act('burn', false); } });
  $('shelter-btn').addEventListener('click', () => act('shelter'));
  $('patch-btn').addEventListener('click', () => act('patch'));
  document.addEventListener('keydown', (e) => {
    if (!flight || e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    const k = flight.event && flight.event.kind;
    if (k === 'burn' || k === 'brake') { act('burn', true); burnBtn.classList.add('holding'); }
    else if (k === 'storm') act('shelter');
    else if (k === 'meteor') act('patch');
  });
  document.addEventListener('keyup', (e) => {
    if (!flight || e.code !== 'Space') return;
    if (burnBtn.classList.contains('holding')) { burnBtn.classList.remove('holding'); act('burn', false); }
  });
  $('replan-btn').addEventListener('click', () => backToPlanning());
  function backToPlanning() {
    flight = landing = launch = orbit = null;
    document.body.classList.remove('flying');
    for (const id of ['flight-panel', 'landing-panel', 'launch-panel', 'orbit-panel']) $(id).hidden = true;
    setText($('level-name'), 'Plan the trip: the landing site and the cargo share one fuel tank');
    update();
  }

  function renderFlight() {
    const f = flight, e = f.event;
    const kind = e ? e.kind : null;
    if (e && e !== seenEvent) { seenEvent = e; Sfx.alarm(); say(eventLine(kind), true); }
    if (f.lastEvent && f.lastEvent !== seenResult) {
      seenResult = f.lastEvent;
      (f.lastEvent.ok ? Sfx.fixed : Sfx.sloppy)();
      say(f.lastEvent.msg, true);
      const li = document.createElement('li');
      li.className = `pxw ${f.lastEvent.ok ? 'ok' : 'bad'}`;
      li.textContent = f.lastEvent.msg;
      $('flight-log').appendChild(li);
    }
    const text = f.status === 'lowfuel' ? f.reason
      : f.status === 'orbit' ? `Lunar orbit reached with ${Math.round(f.fuel)}% fuel for the landing. Crew health ${Math.round(f.health)}, hull ${Math.round(f.hull)}.`
      : f.status === 'lost' ? f.reason
      : f.departing ? 'Leaving Earth behind. The upper stage drops away.'
      : !e ? 'Coasting to the Moon. Keep an eye on the dashboard.'
      : kind === 'burn' ? 'Course correction: hold BURN until the ship is back on the dotted line, then let go.'
      : kind === 'brake' ? 'Orbit insertion: hold BRAKE until the speed is in the green zone, then let go.'
      : kind === 'storm' ? (f.has('shield') ? 'Solar storm: press SHELTER to move the crew behind the water wall.' : 'Solar storm, and no radiation shield on board. Hold on.')
      : (f.has('repair') ? `Leak! Press PATCH ${e.need - e.patches} more time(s).` : 'Leak, and no repair kit on board. Hold on.');
    setText($('flight-text'), text);
    burnBtn.hidden = kind !== 'burn' && kind !== 'brake';
    setText(burnBtn, kind === 'brake' ? 'Hold to BRAKE' : 'Hold to BURN');
    $('shelter-btn').hidden = kind !== 'storm';
    $('patch-btn').hidden = kind !== 'meteor';
    $('shelter-btn').disabled = !(kind === 'storm' && f.has('shield') && !e.sheltered);
    $('patch-btn').disabled = !(kind === 'meteor' && f.has('repair'));
    document.querySelector('.flight-keys').hidden = !e; // the Space tip only matters while an event needs input
    const end = document.querySelector('.flight-end');
    if (f.status !== 'flying' && end.hidden) {
      end.hidden = false;
      if (f.status === 'orbit') { Sfx.win(); say(`Lunar orbit! ${Math.round(f.fuel)} percent fuel left for the landing. Press Begin landing when you are ready.`, true); }
      else { Sfx.lose(); say(`${f.reason} Back to planning.`, true); }
      $('land-btn').hidden = f.status !== 'orbit';
    }
  }

  // ---------- Landing (part 3) ----------
  let landing = null, landStart = null, landSeen = {}, thrustSound = 0;
  const input = { thrust: false, left: false, right: false };
  const seeded = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function startLanding(fuel, mass, seed) {
    landStart = { fuel, mass, seed };
    const profile = typeof MOON_NASA !== 'undefined' && MOON_NASA.terrain ? MOON_NASA.terrain[plan.site.id] : null;
    landing = Landing.startLanding({ ...plan.site, profile }, fuel, mass, seeded(seed)); // hills from real LRO elevation
    landSeen = { alarm: false, callouts: 0, status: 'flying' };
    flight = null;
    document.body.classList.add('flying');
    $('flight-panel').hidden = true;
    $('landing-panel').hidden = false;
    document.querySelector('.landing-end').hidden = true;
    document.querySelector('.land-pad').hidden = false;
    setText($('level-name'), `Landing at ${plan.site.name}`);
    Sfx.go();
    say(`Powered descent to ${plan.site.name}. The lidar is scanning for safe ground. Put the marker on a green pad and touch down slower than 2 metres per second.`, true);
  }
  $('land-btn').addEventListener('click', () => { if (flight && flight.status === 'orbit') startLanding(flight.fuel, flight.mass, (Math.random() * 1e9) | 0); });
  $('retry-land-btn').addEventListener('click', () => startLanding(landStart.fuel, landStart.mass, landStart.seed));
  $('replan2-btn').addEventListener('click', backToPlanning);
  const goAlarm = () => { if (landing && Landing.ackAlarm(landing)) { Sfx.go(); say('We are GO on that alarm. Continue the descent.', true); } };
  $('go-btn').addEventListener('click', goAlarm);
  for (const [id, key] of [['left-btn', 'left'], ['thrust-btn', 'thrust'], ['right-btn', 'right']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input[key] = true; b.classList.add('holding'); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { input[key] = false; b.classList.remove('holding'); });
  }
  const KEYS = { ArrowUp: 'thrust', KeyW: 'thrust', Space: 'thrust', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  document.addEventListener('keydown', (e) => {
    if (!landing) return;
    if (e.code === 'KeyG') { goAlarm(); return; }
    if (KEYS[e.code]) { e.preventDefault(); input[KEYS[e.code]] = true; }
  });
  document.addEventListener('keyup', (e) => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });

  function renderLanding(dt) {
    const s = landing;
    if (s.status === 'flying' && s.throttle > 0.2 && (thrustSound -= dt) <= 0) { thrustSound = 0.1; Sfx.thrust(); }
    if (s.alarm && !landSeen.alarm) { landSeen.alarm = true; Sfx.alarm(); say('Program alarm 1202! The computer is overloaded. Apollo 11 had this exact alarm on the way down. Flight says we are GO: press G.', true); }
    if (s.callouts.length > landSeen.callouts) {
      landSeen.callouts = s.callouts.length;
      Sfx.alarm();
      say(s.callouts[s.callouts.length - 1] === 60 ? 'Sixty seconds of fuel!' : 'Thirty seconds! Get it down now.', true);
    }
    $('go-btn').hidden = !s.alarm || s.status !== 'flying';
    document.querySelector('.land-keys').hidden = s.status !== 'flying';
    setText($('landing-text'), s.status === 'flying'
      ? (s.alarm ? 'Program alarm 1202: the readouts are frozen. Press GO.' : s.alt > 60 ? 'Tilt to move sideways and put the marker on green ground. The engine slows your fall.' : 'Low and slow: under 2 m/s down, nearly no sideways speed, lander upright.')
      : s.reason);
    if (s.status !== 'flying' && landSeen.status === 'flying') {
      landSeen.status = s.status;
      input.thrust = input.left = input.right = false;
      document.querySelector('.landing-end').hidden = false;
      document.querySelector('.land-pad').hidden = true;
      const r = s.result;
      if (s.status === 'landed' || s.status === 'hard') {
        Sfx.win();
        say(`${plan.site.name} here. The lander has landed! ${r.stars} star${r.stars > 1 ? 's' : ''}, ${Math.round(s.fuel)} percent fuel left.${r.ice ? ' We are right next to the ice crater: bonus science!' : ''}${s.status === 'hard' ? ' A leg is bent, but the crew is safe.' : ''}`, true);
      } else {
        (s.status === 'crash' ? Sfx.crash : Sfx.lose)();
        say(`${s.reason} Try the landing again.`, true);
      }
    }
  }

  // ---------- Map clicks ----------
  const map = $('map');
  const mapCtx = map.getContext('2d');
  let hover = null;
  const toCanvas = (e) => { const r = map.getBoundingClientRect(); return [(e.clientX - r.left) * (MoonRender.W / r.width), (e.clientY - r.top) * (MoonRender.H / r.height)]; };
  map.addEventListener('pointerdown', (e) => { if (flight) return; const s = MoonRender.siteAt(MOON_SITES, ...toCanvas(e)); if (s) pickSite(s); });
  map.addEventListener('pointermove', (e) => { const s = MoonRender.siteAt(MOON_SITES, ...toCanvas(e)); hover = s ? s.id : null; map.style.cursor = s ? 'pointer' : 'default'; });

  // ---------- Real Earth-Moon distance (JPL Horizons), saved copy as fallback ----------
  const getJson = (url, ms = 12000) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    return fetch(url, { signal: ctl.signal }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).finally(() => clearTimeout(timer));
  };
  function setDistance(km, source) {
    plan.distanceKm = km;
    $('dist').textContent = `${Math.round(km / 1000)}K KM`;
    say(`JPL Horizons: the Moon is ${km.toLocaleString('en-US')} km away today${source}. ${km < MOON.meanDistanceKm ? 'Closer than average: a cheaper trip.' : 'Farther than average: the trip costs a bit more fuel.'}`);
    if (flight) return; // the trip is already locked in
    if (plan.site) renderSiteCard(plan.site);
    update();
  }
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  // ---------- More NASA data: EPIC Earth photo, DONKI flare, JPL asteroid. Saved copy first, live if reachable ----------
  const dayAgo = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const showEpic = (src, date) => { const img = new Image(); img.onload = () => MoonRender.setEpic(img, date); img.src = src; };
  if (typeof MOON_NASA !== 'undefined' && MOON_NASA.epic) showEpic(MOON_NASA.epic.image, MOON_NASA.epic.date);
  getJson(Moon.EPIC_URL, 10000).then((j) => { const e = Moon.epicLatest(j); if (e) showEpic(e.url, e.date); }).catch(() => {});
  getJson(Moon.donkiUrl(dayAgo(30), dayAgo(0)), 10000).then((j) => { const f = Moon.strongestFlare(j); if (f) nasa.flare = f; }).catch(() => {});
  getJson(Moon.cadUrl(dayAgo(30), dayAgo(0)), 10000).then((j) => { const a = Moon.closestApproach(j); if (a) nasa.asteroid = a; }).catch(() => {});

  getJson(Moon.horizonsUrl(today, tomorrow))
    .then((j) => { const d = Moon.parseHorizons(j); if (!d.length) throw new Error('empty'); setDistance(d[0].km, ''); })
    .catch(() => {
      if (typeof HORIZONS_SNAPSHOT === 'undefined') return;
      const d = HORIZONS_SNAPSHOT.days.find((x) => x.date === today) || HORIZONS_SNAPSHOT.days[0];
      setDistance(d.km, ` (saved copy from ${HORIZONS_SNAPSHOT.saved})`);
    });

  // ---------- Sound toggle and frame loop ----------
  $('back-btn').addEventListener('click', () => { location.href = 'index.html'; });
  const muteBtn = $('mute-btn');
  const muteLabel = () => { muteBtn.textContent = Sfx.isMuted() ? 'SOUND OFF' : 'SOUND ON'; };
  muteLabel();
  muteBtn.addEventListener('click', () => { Sfx.toggle(); muteLabel(); });
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  say('Flight control to crew. Welcome to mission 2. Pick a landing site and pack the lander. Every kilogram costs fuel, and you need fuel left to land.', true);
  update();
  // Real clouds on the flight Earth: yesterday's MODIS Terra photos from NASA GIBS (saved copy as fallback).
  (function liveClouds() {
    const date = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (typeof EARTH_MAPS !== 'undefined' && EARTH_MAPS.saved >= date) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => MoonRender.setEarthMap('clouds', img, date);
    img.src = Moon.gibsUrl('MODIS_Terra_CorrectedReflectance_TrueColor', date);
  })();
  // Test shortcut: moon.html#landing (or #landing=shackleton) jumps straight to the landing with a normal plan.
  if (location.hash === '#orbit') {
    plan.site = MOON_SITES[0];
    for (const it of MOON_ITEMS) if (it.essential || it.id === 'shield' || it.id === 'repair') plan.items.add(it.id);
    update();
    startOrbit(0);
  }
  if (location.hash === '#launch') {
    plan.site = MOON_SITES[0];
    for (const it of MOON_ITEMS) if (it.essential || it.id === 'shield' || it.id === 'repair') plan.items.add(it.id);
    update();
    startLaunch();
  }
  if (location.hash.startsWith('#landing')) {
    const site = MOON_SITES.find((x) => x.id === location.hash.split('=')[1]) || MOON_SITES[0];
    plan.site = site;
    for (const it of MOON_ITEMS) if (it.essential || it.id === 'shield' || it.id === 'repair') plan.items.add(it.id);
    update();
    startLanding(28, Moon.budget(plan, MOON, MOON_ITEMS).mass, (Math.random() * 1e9) | 0);
  }
  // Build the flight's fixed art while the player is planning, in the browser's idle time.
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  const warm = () => { if (MoonRender.warmUp()) idle(warm); };
  idle(warm);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (orbit) {
      Tli.stepTli(orbit, dt, { burn: burnHeld });
      TliRender.draw(mapCtx, now / 1000, orbit);
      MoonRender.prepareEarth([150, 240]); // build the flight's big Earth a little each frame (no freeze later)
      renderOrbit(dt);
    } else if (launch) {
      Launch.stepLaunch(launch, dt, linput);
      LaunchRender.draw(mapCtx, now / 1000, launch);
      renderLaunch(dt);
    } else if (landing) {
      Landing.stepLanding(landing, dt, input);
      LandingRender.draw(mapCtx, now / 1000, landing);
      renderLanding(dt);
    } else if (flight) {
      Moon.stepFlight(flight, dt);
      MoonRender.drawFlight(mapCtx, now / 1000, flight, plan.distanceKm, plan.site && plan.site.name);
      renderFlight();
    } else MoonRender.drawMap(mapCtx, now / 1000, MOON_SITES, plan.site && plan.site.id, hover);
    renderRadio(now, dt);
    PixelText.sync();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
