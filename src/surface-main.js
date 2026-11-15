// Mission 3 browser glue: reads the Mission 2 result from the URL, runs the moonwalks, radio, keys, sound.
// URL: surface.html?site=shackleton&items=oxygen,water,...&fuel=17&hard=0 (no URL = Tranquility + essentials).
(function () {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const siteBase = MOON_SITES.find((x) => x.id === q.get('site')) || MOON_SITES[0];
  const items = (q.get('items') || 'oxygen,water,food,habitat').split(',').filter((id) => MOON_ITEMS.some((it) => it.id === id));
  const fuel = Number.isFinite(parseFloat(q.get('fuel'))) ? Math.max(0, Math.min(100, parseFloat(q.get('fuel')))) : 17;
  const plan = {
    site: { ...siteBase, profile: typeof MOON_NASA !== 'undefined' && MOON_NASA.terrain ? MOON_NASA.terrain[siteBase.id] : null },
    items, fuel, hard: q.get('hard') === '1', flare: typeof MOON_NASA !== 'undefined' ? MOON_NASA.flare : null,
  };

  // Radio (same typewriter as Mission 2).
  const radio = { queue: [], text: '', shown: 0, holdUntil: 0 };
  const portrait = $('portrait').getContext('2d'), radioCanvas = $('radio-canvas');
  let radioDrawn = '';
  function say(text, urgent) {
    if (!text) return;
    if (urgent) { radio.queue = [text]; radio.holdUntil = 0; radio.shown = radio.text.length; } else if (radio.queue[radio.queue.length - 1] !== text) radio.queue.push(text);
  }
  function renderRadio(now, dt) {
    const width = radioCanvas.parentElement.clientWidth, key = `${radio.text}|${Math.floor(radio.shown)}|${width}`;
    if (key !== radioDrawn && width) { radioDrawn = key; PixelText.drawWrapped(radioCanvas, radio.text, width, Math.floor(radio.shown), 2, '#f3e8ff'); }
    if (radio.shown < radio.text.length) { radio.shown = Math.min(radio.text.length, radio.shown + dt * 55); if (radio.shown >= radio.text.length) radio.holdUntil = now + 2500; }
    else if (radio.queue.length && now >= radio.holdUntil) { radio.text = radio.queue.shift(); radio.shown = 0; $('radio').textContent = radio.text; Sfx.click(); }
    Render.portrait(portrait, now / 1000, radio.shown < radio.text.length, false);
  }
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };

  let s, seenLog, ended, rng = Math.random;
  function start() {
    s = Surface.startSurface(plan, rng);
    seenLog = 0; ended = false;
    document.querySelector('.eva-end').hidden = true;
    document.querySelector('.land-pad').hidden = false;
    const packed = (id) => items.includes(id);
    say(`Welcome to ${siteBase.name}. Three moonwalks today. ${packed('rover') ? 'The rover is unloaded and ready.' : 'No rover, so we walk.'} ${s.T.shadow ? 'The shadowed crater nearby has water ice: dig it and we can make rocket fuel for the trip home.' : 'No ice here, so the fuel for the trip home is what is left in the lander.'} Press E to start.`, true);
  }

  const input = { left: false, right: false, hop: false, act: false };
  const doAct = () => {
    if (!s) return;
    const hits = s.work ? s.work.hits : 0, ok = Surface.act(s);
    if (!ok) return;
    if (s.work && s.work.g.game === 'timing') (s.work.hits > hits ? Sfx.hit : Sfx.miss)(); else if (!s.work || s.work.t === 0) Sfx.hit();
  };
  const doPatch = () => { if (s && Surface.patch(s)) (s.leak ? Sfx.click : Sfx.fixed)(); };
  for (const [id, key] of [['left-btn', 'left'], ['right-btn', 'right']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input[key] = true; b.classList.add('holding'); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { input[key] = false; b.classList.remove('holding'); });
  }
  const actBtn = $('act-btn'); // tap = work / hit; hold = drill
  actBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.act = true; doAct(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) actBtn.addEventListener(ev, () => { input.act = false; });
  $('patch-btn').addEventListener('click', doPatch);
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hop', ArrowUp: 'hop' };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' || e.code === 'Enter') { input.act = true; if (!e.repeat) doAct(); return; }
    if (e.code === 'KeyR') { doPatch(); return; }
    if (KEYS[e.code]) { e.preventDefault(); input[KEYS[e.code]] = true; }
  });
  document.addEventListener('keyup', (e) => { if (KEYS[e.code]) input[KEYS[e.code]] = false; if (e.code === 'KeyE' || e.code === 'Enter') input.act = false; });
  $('again-btn').addEventListener('click', start);
  $('mission4-btn').addEventListener('click', () => { const nx = $('mission4-btn').dataset.next; if (nx) location.href = `earth.html${nx}`; });
  $('m2-btn').addEventListener('click', () => { location.href = 'moon.html'; });
  $('back-btn').addEventListener('click', () => { location.href = 'index.html#menu'; });
  const muteBtn = $('mute-btn');
  const muteLabel = () => { muteBtn.textContent = Sfx.isMuted() ? 'SOUND OFF' : 'SOUND ON'; };
  muteBtn.addEventListener('click', () => { Sfx.toggle(); muteLabel(); });
  muteLabel();
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  let stepSound = 0;
  function renderPanel(dt) {
    for (; seenLog < s.log.length; seenLog++) {
      const m = s.log[seenLog];
      if (/leak!|storm warning|Oxygen empty|caught|jammed/i.test(m)) Sfx.alarm();
      say(m, true);
    }
    if (s.phase === 'out' && (input.left || input.right) && !s.work && (stepSound -= dt) <= 0) { stepSound = s.has('rover') ? 0.12 : 0.35; (s.has('rover') ? Sfx.thrust : Sfx.tick)(); }
    $('patch-btn').hidden = !s.leak;
    const g = s.phase === 'out' ? Surface.near(s) : null;
    setText($('act-btn'), s.phase === 'base' ? `START EVA ${s.eva + 1}` : g ? 'WORK (E)' : Surface.atBase(s) ? 'AIRLOCK (E)' : 'WORK (E)');
    if (s.status !== 'end') setText($('eva-text'), s.phase === 'base' ? `In the base. Suit oxygen ${Math.round(s.o2)}%. Ready for EVA ${s.eva + 1}.` : s.targets.filter((x) => !x.done).map((x) => x.name).join(', ') || 'All done: back to the airlock.');
    if (s.status === 'end' && !ended) {
      ended = true;
      const r = Surface.score(s);
      document.querySelector('.land-pad').hidden = true;
      document.querySelector('.eva-end').hidden = false;
      setText($('eva-text'), `${r.evasOk} of 3 moonwalks done. Science ${r.science}. Fuel for the trip home ${Math.round(r.fuel)}% (need ${s.cfg.returnFuel}%). ${'★'.repeat(r.stars)}`);
      (r.fuelOk ? Sfx.win : Sfx.sloppy)();
      say(r.fuelOk ? `Great work. We have ${Math.round(r.fuel)} percent fuel: enough to fly home. Mission 4 will take us back to Earth.` : `We only have ${Math.round(r.fuel)} percent fuel, and the trip home needs ${s.cfg.returnFuel}. Next time: land with more fuel, or pick a site with ice.`, true);
      Campaign.save({ stars: { m3: r.stars }, m3: { science: r.science, health: r.health, fuel: r.fuel } });
      // Ready for Mission 4: the same hand-over by URL.
      $('mission4-btn').dataset.next = `?site=${siteBase.id}&items=${items.join(',')}&fuel=${r.fuel.toFixed(1)}&health=${r.health}&science=${r.science}`;
    }
  }

  const canvas = $('map'), ctx = canvas.getContext('2d');
  start();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    SurfaceRender.warm(); // bake astronaut poses a little each frame
    Surface.stepSurface(s, dt, input);
    input.hop = false;
    SurfaceRender.draw(ctx, now / 1000, s);
    renderPanel(dt);
    renderRadio(now, dt);
    PixelText.sync();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
