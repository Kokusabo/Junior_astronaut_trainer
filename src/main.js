// Browser glue: connects Game (logic) to the HUD in index.html.
(function () {
  const $ = (id) => document.getElementById(id);
  // Per-frame UI writes go through these, so unchanged text and styles are not rewritten every frame.
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const setWidth = (el, v) => { if (el.style.width !== v) el.style.width = v; };
  const params = new URLSearchParams(location.search);
  const newSeed = () => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

  let state = null;
  let events = GROUND_EVENTS.slice();
  let lastLogLen = -1;
  let shownRepair = null;
  let liftoffAt = -1; // performance.now() ms of engine ignition on the final launch
  let launchSeqAt = -1; // performance.now() ms when the final 10..0 countdown began
  let endAt = -1;       // when to show the end screen
  let prev = null;      // last frame's snapshot, to turn state changes into effects
  let stampGame = null; // finished mini-game kept on screen under the result stamp
  let stampUntil = 0;
  let lastCount = null;
  let checkTotal = 1; // length of the running check, for the progress bar
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = $('scene').getContext('2d');

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function pct(v) {
    return Math.max(0, Math.min(100, v)) + '%';
  }

  // ---------- Flight control radio: typewriter messages with a talking portrait ----------
  const radio = { queue: [], text: '', shown: 0, holdUntil: 0 };
  const portrait = $('portrait').getContext('2d');

  function say(text, urgent) {
    if (!text) return;
    if (urgent) { radio.queue = [text]; radio.holdUntil = 0; radio.shown = radio.text.length; }
    else if (radio.queue[radio.queue.length - 1] !== text) radio.queue.push(text);
  }

  const radioCanvas = $('radio-canvas');
  let radioDrawn = '';
  function drawRadio(reveal) {
    const width = radioCanvas.parentElement.clientWidth;
    const key = `${radio.text}|${reveal}|${width}`;
    if (key === radioDrawn || !width) return;
    radioDrawn = key;
    PixelText.drawWrapped(radioCanvas, radio.text, width, reveal, 2, '#f3e8ff');
  }

  function renderRadio(now, dt) {
    drawRadio(Math.floor(radio.shown)); // also redraws after a window resize
    const typing = radio.shown < radio.text.length;
    if (typing) {
      radio.shown = Math.min(radio.text.length, radio.shown + dt * 55);
      if (radio.shown >= radio.text.length) radio.holdUntil = now + 2500;
      drawRadio(Math.floor(radio.shown));
    } else if (radio.queue.length && now >= radio.holdUntil) {
      radio.text = radio.queue.shift();
      radio.shown = 0;
      // Full message goes in the DOM once (screen readers read it whole); the pixel font reveals it letter by letter.
      $('radio').textContent = radio.text;
      drawRadio(0);
      Sfx.click();
    }
    Render.portrait(portrait, now / 1000, radio.shown < radio.text.length, state.active !== null && !state.repair);
  }

  // Live NASA OSDR study facts, read out after repairs (empty until the feed loads).
  let research = [];
  let researchIndex = 0;
  function sayResearch() {
    if (research.length) say(research[researchIndex++ % research.length]);
  }

  // Floating +/- numbers on the stat bars for sudden changes (not the slow per-second drain).
  function delta(stat, d) {
    if (Math.abs(d) < 1.5) return;
    const el = document.createElement('span');
    el.className = `delta px ${d < 0 ? 'down' : 'up'}`;
    el.textContent = `${d > 0 ? '+' : ''}${Math.round(d)}`;
    $(`${stat}-stat`).appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  let stageCarry = null; // stability and fuel at the start of this stage, for retries
  function loadLevel(index, seed, carry = null) {
    stageCarry = carry;
    state = Game.start(LEVELS, index, seed, events, carry);
    lastLogLen = -1;
    shownRepair = null;
    liftoffAt = -1;
    launchSeqAt = -1;
    endAt = -1;
    stampGame = null;
    lastCount = null;
    prev = snapshot(state);
    document.body.classList.remove('launching', 'alarm');
    $('launch-count').hidden = true;
    $('end').hidden = true;
    $('hint').textContent = '';
    radio.queue = [];
    say(state.cfg.intro, true);
    const list = $('checklist');
    list.innerHTML = '';
    for (const id of Object.keys(state.systems)) {
      const li = document.createElement('li');
      li.dataset.id = id;
      li.innerHTML = '<span class="lamp"></span><span class="sys px"></span><span class="ctl"><span class="st px"></span><button class="px">Check</button></span>';
      li.querySelector('.sys').textContent = FAILURES[id].system;
      li.querySelector('button').addEventListener('click', () => onCheck(id));
      list.appendChild(li);
    }
    const box = $('supplies');
    box.innerHTML = '';
    for (const id of Object.keys(state.cfg.supplies)) {
      const b = document.createElement('button');
      b.dataset.id = id;
      b.className = 'supply';
      b.innerHTML = '<canvas width="32" height="32" aria-hidden="true"></canvas><span class="supply-name pxw"></span><span class="supply-count px"></span>';
      b.querySelector('.supply-name').textContent = SUPPLIES[id].name;
      Render.icon(b.querySelector('canvas').getContext('2d'), id);
      b.addEventListener('click', () => onSupply(id));
      box.appendChild(b);
    }
  }

  function onSupply(id) {
    const r = Game.applySupply(state, FAILURES, id);
    if (r.repairing) $('hint').textContent = '';
    else if (r.ok && r.fixed) { $('hint').textContent = ''; Sfx.fixed(); say(`Fixed. Did you know? ${r.fact}`); sayResearch(); }
    else if (r.ok) { $('hint').textContent = 'That part does not fit this failure. Stability -5.'; Sfx.miss(); shake(); }
    else $('hint').textContent = r.msg;
  }

  function onCheck(id) {
    $('hint').textContent = '';
    if (Game.startCheck(state, id)) { checkTotal = state.checking; Sfx.scan(); }
  }

  // ---------- Effects: compare this frame with the last one ----------
  function snapshot(s) {
    return { active: s.active, systems: { ...s.systems }, status: s.status, sec: Math.ceil(s.timeLeft), event: s.lastEvent, repair: s.repair,
      stability: s.stability, fuel: s.fuel, ready: Game.canLaunch(s) };
  }

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(cls);
  }

  function shake() {
    if (!reduceMotion) retrigger(document.querySelector('main'), 'shake');
  }

  function flash(color) {
    if (!reduceMotion) retrigger($('flash'), color);
  }

  function rowFlash(id, cls) {
    const li = document.querySelector(`#checklist li[data-id="${id}"]`);
    if (li) retrigger(li, cls);
  }

  function react(now) {
    const s = state;
    const p = prev;
    if (s.active && s.active !== p.active) {
      Sfx.alarm(); shake(); flash('red'); rowFlash(s.active, 'fault-flash');
      say(FAILURES[s.active].radio, true);
    }
    for (const id of Object.keys(s.systems)) {
      if (s.systems[id] === 'ok' && p.systems[id] !== 'ok') { Sfx.go(); rowFlash(id, 'go-flash'); }
    }
    if (p.repair && !s.repair) {
      stampGame = p.repair;
      stampUntil = now + 1400;
      const ok = p.repair.success;
      $('stamp').className = ok ? 'px good' : 'px bad'; // keep 'px': it turns on the pixel font
      $('stamp').textContent = ok ? 'REPAIRED' : 'REPAIR FAILED';
      $('stamp').hidden = false;
      if (ok) {
        Sfx.fixed();
        if (s.lastRepair) say(`Good work. Did you know? ${s.lastRepair.fact}`);
        sayResearch();
      } else {
        Sfx.sloppy(); shake();
        say('Repair failed. The fault is still open. Grab another part and try again.', true);
      }
    }
    if (s.lastEvent && s.lastEvent !== p.event) {
      say(s.lastEvent.text, true);
      if (s.lastEvent.name.startsWith('Solar')) { Sfx.static(); flash('red'); } else Sfx.click();
    }
    if (s.status === 'playing' && Game.canLaunch(s) && !p.ready) say('All systems GO. Request launch when ready.', true);
    delta('stability', s.stability - p.stability);
    delta('fuel', s.fuel - p.fuel);
    const sec = Math.ceil(s.timeLeft);
    if (s.status === 'playing' && sec !== p.sec && sec <= 10 && sec > 0) Sfx.tick();
    if (s.status !== p.status) {
      if (s.status === 'lost') { Sfx.lose(); shake(); flash('red'); endAt = now + 900; say(`Hold, hold, hold. ${s.reason}`, true); }
      else if (s.index + 1 >= LEVELS.length) { say('Checking the toilet... Toilet operational. Finally. Launch is cleared.', true); launchSeqAt = now; liftoffAt = now + 8 * 700; endAt = liftoffAt + 9000; } // end screen once the rocket has left the frame
      else { Sfx.win(); flash('white'); endAt = now + 600; say('Stage complete. Satisfactory. Considering the circumstances, that is surprising.', true); }
    }
    document.body.classList.toggle('alarm', s.status === 'playing' && s.active !== null && !s.repair);
    prev = snapshot(s);
  }

  // Final launch: big 10..0 over the pad, ignition at T-2, then liftoff full screen.
  function renderLaunch(now) {
    if (launchSeqAt < 0) return;
    const n = 10 - Math.floor((now - launchSeqAt) / 700);
    const box = $('launch-count');
    if (n >= 0 && n !== lastCount) {
      lastCount = n;
      box.hidden = false;
      box.innerHTML = `<span class="px">${n === 0 ? 'LIFTOFF' : n}</span>`;
      Sfx.count(n);
      if (n === 2) { document.body.classList.add('launching'); Sfx.rumble(); }
      if (n === 0) flash('white');
    }
    if (n < 0 && now - launchSeqAt > 11 * 700 + 600) box.hidden = true;
  }

  const STATUS_TEXT = { unknown: '', // the Check button already says it
     verify: 'Re-check', ok: 'GO', fail: 'FAULT', repair: 'Fixing', off: '' };

  function renderChecklist() {
    const s = state;
    for (const li of document.querySelectorAll('#checklist li')) {
      const id = li.dataset.id;
      const lamp = Render.lampState(id, s);
      const checkingThis = s.checking > 0 && s.checkingId === id;
      for (const c of [...li.classList]) if (c.startsWith('lamp-')) li.classList.remove(c);
      li.classList.add(`lamp-${lamp}`);
      li.classList.toggle('scanning', checkingThis);
      if (checkingThis) {
        li.style.setProperty('--p', `${Math.min(100, (1 - s.checking / checkTotal) * 100)}%`);
      }
      // steady text; progress is the CSS bar (redrawing a timer here caused lag)
      setText(li.querySelector('.st'), checkingThis ? 'Scanning' : STATUS_TEXT[lamp]);
      const btn = li.querySelector('button');
      btn.disabled = !Game.canCheck(s, id);
      btn.hidden = lamp === 'ok';
    }
    const launch = $('launch-btn');
    launch.disabled = !Game.canLaunch(s);
    const left = Object.values(s.systems).filter((v) => v !== 'ok').length;
    setText(launch, left ? `Launch \u00b7 ${left} not GO` : 'Request launch');
  }

  function renderLevelHeader() {
    setText($('level-name'), planning ? 'Launch window: pick your launch day' : `Level ${state.index + 1} of ${LEVELS.length}: ${state.cfg.name}`);
  }

  function renderLog() {
    if (state.log.length === lastLogLen) return;
    lastLogLen = state.log.length;
    const ol = $('log');
    ol.innerHTML = '';
    for (const line of state.log.slice().reverse()) {
      const li = document.createElement('li');
      li.textContent = line;
      ol.appendChild(li);
    }
  }

  // Mini-game drawing and hit-testing. Rules live in minigames.js; this only maps pixels.
  const cv = $('repair-canvas');
  const ctx = cv.getContext('2d');
  const HELP = {
    find_leak: 'Tap the pipe segment that is dripping. Two wrong taps and the repair fails.',
    bolts: 'Memorise the order, then tap the bolts 1, 2, 3...',
    pressure: 'Tap (or press Space) to stop the needle inside the green zone. Hit 2 of 3.',
    wires: 'Tap a plug on the left, then the socket of the same color on the right. Two wrong links and the repair fails.',
    switches: 'Flip switches until they match the TARGET lights. Each switch also flips the one to its right. Presses are limited.',
    frequency: 'Keep the orange wave on the blue signal: tap left or right (or use the arrow keys) until the lock meter fills.',
    clogs: 'Tap the clogs before they grow and overflow. Three overflows and the repair fails.',
    pump: 'Tap (or press Space) to pump. Keep the pressure in the green band until the meter fills. Too much and the relief valve dumps it.',
    pipes: 'Tap pipe pieces to rotate them until fuel flows from the inlet on the left to the outlet on the right.',
    sensors: 'One reading is outside its normal band (between the marks). Tap the faulty sensor. Three rounds, two misses allowed.',
    fuse: 'Add up the current the devices draw, then pick the smallest fuse that can carry it. Three rounds.',
    balance: 'Tap a cooling loop to vent it. Keep every loop below the red line until the timer runs out.',
  };
  const W = 320, H = 160;
  const TIME_MAX = { find_leak: 10, bolts: 12, pressure: 15, wires: 15, switches: 18, frequency: 14, clogs: 20, pump: 15, pipes: 30, sensors: 18, fuse: 25, balance: 12 };
  const C = {
    bg: '#140a24', panel: '#1f1236', edge: '#3a2360', rivet: '#5c3a8c',
    steel: '#6b7894', steelHi: '#a3aec6', steelLo: '#3d4660', flange: '#525d7c',
    amber: '#ff9a3d', fuel: '#ffd36b', green: '#3dffc0', red: '#ff3b5c', text: '#fbeaff', muted: '#b49ad3',
  };
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const text = (t, x, y, c, size = 9, align = 'left') => {
    // y was a text baseline; the pixel font draws from the top of its 7px capitals. size is no longer used.
    PixelText.draw(ctx, t, x, y - 7, c, 1, align);
  };

  // Pipe segment layout for find_leak.
  const pipe = (g) => ({ x0: 16, w: 288 / g.n, y: 58, h: 26 });
  // Bolts sit on a circular engine flange, like a real bolt circle.
  const boltPos = (g, i) => {
    const a = (Math.PI * 2 * i) / g.n - Math.PI / 2;
    return { x: 160 + Math.cos(a) * 46, y: 86 + Math.sin(a) * 46 };
  };

  function hitIndex(g, x, y) {
    if (g.kind === 'find_leak') {
      const p = pipe(g);
      return x >= p.x0 && x < p.x0 + p.w * g.n && y > p.y - 10 && y < p.y + p.h + 30 ? Math.floor((x - p.x0) / p.w) : -1;
    }
    if (g.kind === 'bolts') {
      for (let i = 0; i < g.n; i++) {
        const b = boltPos(g, i);
        if (Math.hypot(x - b.x, y - b.y) <= 14) return i;
      }
    }
    if (g.kind === 'wires') {
      for (let i = 0; i < g.n; i++) {
        const yy = wireY(g, i);
        if (Math.abs(y - yy) <= 9 && Math.abs(x - 44) <= 16) return i;
        if (Math.abs(y - yy) <= 9 && Math.abs(x - 276) <= 16) return g.n + i;
      }
    }
    if (g.kind === 'switches') {
      for (let i = 0; i < g.n; i++) if (Math.abs(x - switchX(g, i)) <= 13 && y >= 70 && y <= 124) return i;
    }
    if (g.kind === 'frequency') return x < W / 2 ? 0 : 1;
    if (g.kind === 'clogs') {
      for (let i = 0; i < g.n; i++) { const h = clogPos(i); if (Math.hypot(x - h.x, y - h.y) <= 22) return i; }
    }
    if (g.kind === 'pump') return 0;
    if (g.kind === 'pipes') {
      const o = pipeGrid(g);
      const c = Math.floor((x - o.x) / o.s), r = Math.floor((y - o.y) / o.s);
      return r >= 0 && r < g.R && c >= 0 && c < g.C ? r * g.C + c : -1;
    }
    if (g.kind === 'sensors') {
      for (let i = 0; i < g.n; i++) { const p = sensorPos(i); if (x >= p.x - 18 && x <= p.x + 18 && y >= 34 && y <= 132) return i; }
    }
    if (g.kind === 'fuse') {
      for (let i = 0; i < g.fuses.length; i++) if (Math.abs(x - fuseX(i)) <= 20 && y >= 86 && y <= 128) return i;
    }
    if (g.kind === 'balance') {
      for (let i = 0; i < g.n; i++) if (Math.abs(x - loopX(i)) <= 30 && y >= 30 && y <= 134) return i;
    }
    return -1;
  }

  function drawFrame(g, title, right) {
    px(0, 0, W, H, C.bg);
    for (let y = 22; y < H - 14; y += 8) for (let x = 4; x < W; x += 8) px(x, y, 1, 1, '#24143e');
    px(0, 0, W, 16, '#2a1747');
    px(0, 16, W, 1, C.edge);
    px(6, 5, 6, 6, Math.floor(performance.now() / 400) % 2 ? C.red : '#5a1838'); // alarm lamp
    text(title, 18, 11, C.amber);
    text(right, W - 6, 11, C.muted, 9, 'right');
    // Segmented countdown along the bottom.
    const frac = Math.max(0, g.timeLeft) / TIME_MAX[g.kind];
    const col = frac > 0.5 ? C.green : frac > 0.25 ? C.amber : C.red;
    const n = 30, lit = Math.ceil(frac * n);
    for (let i = 0; i < n; i++) px(6 + i * 10.3, H - 9, 8, 4, i < lit ? col : '#2c1a4a');
  }

  function rivets(x, y, w, h) {
    for (const [rx, ry] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) {
      px(rx, ry, 2, 2, C.rivet);
    }
  }

  function drawLeak(g) {
    const p = pipe(g);
    const t = TIME_MAX.find_leak - g.timeLeft;
    drawFrame(g, 'FUEL LINE // LOCATE LEAK', `MISSES ${g.strikes}/2`);
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    // Hazard stripe under the line.
    for (let x = 12; x < W - 12; x += 8) px(x, 130, 4, 4, '#4a2230');
    // Wall brackets.
    for (let i = 1; i < g.n; i += 2) px(p.x0 + i * p.w - 3, p.y + p.h, 6, 18, '#3a2a50');
    for (let i = 0; i < g.n; i++) {
      const x = p.x0 + i * p.w;
      px(x, p.y, p.w, p.h, C.steel);
      px(x, p.y + 3, p.w, 3, C.steelHi);
      px(x, p.y + p.h - 6, p.w, 6, C.steelLo);
      if (i === g.leak) px(x + p.w / 2 - 4, p.y + p.h - 6, 8, 6, '#8a7a4a'); // damp stain
      text(`${String.fromCharCode(65 + Math.floor(i / 2))}${(i % 2) + 1}`, x + p.w / 2, p.y + p.h + 30, C.muted, 8, 'center');
      if (g.tried.includes(i) && i !== g.leak) {
        ctx.strokeStyle = C.red; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, p.y + 4); ctx.lineTo(x + p.w - 4, p.y + p.h - 4);
        ctx.moveTo(x + p.w - 4, p.y + 4); ctx.lineTo(x + 4, p.y + p.h - 4);
        ctx.stroke();
      }
    }
    // Flanges with bolt heads at every joint.
    for (let i = 0; i <= g.n; i++) {
      const x = p.x0 + i * p.w - 3;
      px(x, p.y - 5, 6, p.h + 10, C.flange);
      px(x + 1, p.y - 3, 4, 2, C.steelHi);
      px(x + 1, p.y + p.h + 1, 4, 2, C.steelHi);
    }
    // Drips: come and go, so the player has to watch.
    if (Math.floor(t * 2) % 3 !== 2) {
      const dx = p.x0 + g.leak * p.w + p.w / 2;
      for (let k = 0; k < 2; k++) {
        const dy = p.y + p.h + ((t * 45 + k * 20) % 38);
        px(dx - 1, dy, 2, 3, C.fuel);
      }
    }
    const pool = Math.min(14, 4 + t * 1.2);
    px(p.x0 + g.leak * p.w + p.w / 2 - pool / 2, p.y + p.h + 38, pool, 2, '#a8894a');
  }

  function drawBolts(g) {
    const showing = g.showLeft > 0;
    const label = [];
    g.order.forEach((b, k) => { label[b] = k + 1; });
    drawFrame(g, 'ENGINE 2 // TORQUE SEQUENCE', showing ? `MEMORISE ${Math.ceil(g.showLeft)}` : `BOLT ${g.pos + 1}/${g.n}`);
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    // Flange plate.
    const disc = (r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(160, 86, r, 0, Math.PI * 2); ctx.fill(); };
    disc(60, C.steelLo);
    disc(57, C.flange);
    disc(30, C.steelLo);
    disc(22, '#1a0e2e');
    text('ENG-2', 160, 89, C.muted, 8, 'center');
    for (let i = 0; i < g.n; i++) {
      const b = boltPos(g, i);
      const done = label[i] <= g.pos;
      ctx.fillStyle = done ? '#2f5a3d' : '#2c1a44';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + (done ? 0.5 : 0); // tightened bolts sit rotated
        ctx.lineTo(b.x + Math.cos(a) * 10, b.y + Math.sin(a) * 10);
      }
      ctx.fill();
      ctx.fillStyle = done ? C.green : C.steelHi;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + (done ? 0.5 : 0);
        ctx.lineTo(b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8);
      }
      ctx.fill();
      px(b.x - 2, b.y - 2, 4, 4, done ? '#2f5a3d' : C.steel);
      if (showing || done) {
        // Tag sits beside its bolt (not further out), so it never covers the header or the timer bar.
        const tx = b.x + (b.x >= 160 ? 18 : -18), ty = b.y;
        px(tx - 7, ty - 7, 14, 12, '#12081f');
        px(tx - 7, ty - 7, 14, 1, done ? C.green : C.amber);
        text(String(label[i]), tx, ty + 3, done ? C.green : C.amber, 9, 'center');
      }
    }
  }

  function drawPressure(g) {
    drawFrame(g, 'TOILET PUMP P-3 // SET PRESSURE', 'SPACE / TAP');
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    const cx = 104, cy = 118, r = 76;
    const ang = (v) => Math.PI + v * Math.PI;
    // Gauge bezel and cream face.
    ctx.fillStyle = '#2c1a44'; ctx.beginPath(); ctx.arc(cx, cy, r + 6, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#e9e3cf'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
    // Green target band.
    ctx.strokeStyle = '#3fa45f'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(cx, cy, r - 10, ang(g.center - g.width / 2), ang(g.center + g.width / 2)); ctx.stroke();
    // Tick marks.
    ctx.strokeStyle = '#2b2b2b';
    for (let k = 0; k <= 20; k++) {
      const a = ang(k / 20), len = k % 5 === 0 ? 10 : 5;
      ctx.lineWidth = k % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      ctx.lineTo(cx + Math.cos(a) * (r - 2 - len), cy + Math.sin(a) * (r - 2 - len));
      ctx.stroke();
    }
    text('0', cx - r + 18, cy - 4, '#2b2b2b', 8, 'center');
    text('100', cx + r - 20, cy - 4, '#2b2b2b', 8, 'center');
    text('kPa', cx, cy - 30, '#6a6450', 8, 'center');
    // Needle.
    const a = ang(g.pos);
    ctx.strokeStyle = '#c23a3a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); ctx.stroke();
    px(cx - 5, cy - 5, 10, 10, '#2c1a44');
    // Attempt lamps.
    px(200, 40, 104, 86, '#1a0e2e');
    px(200, 40, 104, 1, C.edge);
    text('ATTEMPTS', 252, 56, C.muted, 8, 'center');
    for (let k = 0; k < 3; k++) {
      const res = g.results[k];
      const c = res === undefined ? '#2c1a44' : res ? C.green : C.red;
      px(214 + k * 28, 66, 20, 20, '#12081f');
      px(216 + k * 28, 68, 16, 16, c);
      if (res !== undefined) px(218 + k * 28, 70, 4, 4, 'rgba(255,255,255,0.35)');
    }
    text(`NEED 2 OF 3`, 252, 104, C.text, 8, 'center');
    text(`HITS ${g.hits}`, 252, 118, g.hits >= 2 ? C.green : C.amber, 8, 'center');
  }

  // ---------- New mini-games ----------
  const WIRE_COLORS = ['#ff4d6a', '#ffd34d', '#4dffc3', '#6fe3ff', '#ff9a3d'];
  const wireY = (g, i) => 44 + i * (84 / (g.n - 1));
  const switchX = (g, i) => W / 2 + (i - (g.n - 1) / 2) * 40;

  function cable(x0, y0, x1, y1, color) {
    ctx.strokeStyle = '#12081f'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo((x0 + x1) / 2, y0 + 18, (x0 + x1) / 2, y1 + 18, x1, y1); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo((x0 + x1) / 2, y0 + 18, (x0 + x1) / 2, y1 + 18, x1, y1); ctx.stroke();
  }

  function drawWires(g) {
    drawFrame(g, 'WIRING // MATCH COLORS', `MISSES ${g.strikes}/2`);
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    px(24, 30, 40, 104, '#1a0e2e'); px(256, 30, 40, 104, '#1a0e2e'); // terminal blocks
    for (let i = 0; i < g.n; i++) {
      const sock = g.right.indexOf(i);
      if (g.linked.includes(i)) cable(52, wireY(g, i), 268, wireY(g, sock), WIRE_COLORS[i]);
    }
    if (g.sel !== null && Math.floor(performance.now() / 250) % 2) cable(52, wireY(g, g.sel), 120, wireY(g, g.sel) + 6, WIRE_COLORS[g.sel]);
    for (let i = 0; i < g.n; i++) {
      const y = wireY(g, i);
      const sel = g.sel === i;
      px(32, y - 6, 20, 12, sel ? '#fbeaff' : '#3a2a50'); px(34, y - 4, 16, 8, WIRE_COLORS[i]); px(34, y - 4, 16, 2, 'rgba(255,255,255,0.35)');
      if (g.linked.includes(i)) px(26, y - 2, 4, 4, C.green);
      px(268, y - 6, 20, 12, '#3a2a50'); px(272, y - 3, 12, 6, '#0b0614');
      px(286, y - 4, 6, 8, WIRE_COLORS[g.right[i]]);
    }
  }

  function drawSwitches(g) {
    drawFrame(g, 'VALVE PANEL // MATCH TARGET', `PRESSES ${g.pressesLeft}`);
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    text('TARGET', 24, 46, C.muted);
    text('NOW', 24, 64, C.muted);
    for (let i = 0; i < g.n; i++) {
      const x = switchX(g, i);
      px(x - 6, 36, 12, 10, '#12081f'); px(x - 4, 38, 8, 6, g.target[i] ? C.amber : '#2c1a44');
      px(x - 6, 54, 12, 10, '#12081f'); px(x - 4, 56, 8, 6, g.state[i] ? C.green : '#2c1a44');
      const ok = g.state[i] === g.target[i];
      px(x - 12, 72, 24, 50, '#1a0e2e'); px(x - 12, 72, 24, 2, ok ? C.green : C.edge);
      px(x - 3, 78, 6, 38, '#0b0614');
      const ky = g.state[i] ? 80 : 104; // lever knob: up = open, down = closed
      px(x - 8, ky, 16, 10, '#a3aec6'); px(x - 8, ky, 16, 3, '#eef2fa'); px(x - 8, ky + 8, 16, 2, '#5c6374');
      if (i + 1 < g.n) { px(x + 13, 96, 14, 2, '#5c3a8c'); px(x + 24, 94, 3, 6, '#5c3a8c'); } // link: also flips the next one
    }
  }

  function drawFrequency(g) {
    drawFrame(g, 'TUNER // MATCH THE SIGNAL', `LOCK ${Math.round((g.lock / g.need) * 100)}%`);
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    // Oscilloscope with the target signal (blue) and the receiver (orange).
    const sx = 18, sy = 32, sw = 230, sh = 70;
    px(sx - 2, sy - 2, sw + 4, sh + 4, '#3a2a50'); px(sx, sy, sw, sh, '#07140f');
    for (let x = sx; x < sx + sw; x += 23) px(x, sy, 1, sh, '#0f2a20');
    for (let y = sy; y < sy + sh; y += 14) px(sx, y, sw, 1, '#0f2a20');
    const wave = (v, color, phase) => {
      const cycles = 2 + v * 6;
      ctx.fillStyle = color;
      for (let x = 0; x < sw; x++) {
        const yy = sy + sh / 2 + Math.sin((x / sw) * cycles * Math.PI * 2 + phase) * (sh / 2 - 8);
        ctx.fillRect(sx + x, Math.round(yy), 1, 2);
      }
    };
    const t = performance.now() / 1000;
    wave(g.signal, '#6fe3ff', t * 3);
    wave(g.dial, g.inBand() ? C.green : C.amber, t * 3);
    // Frequency scale with markers, and the lock meter.
    px(sx, 112, sw, 4, '#1a0e2e');
    px(sx + (g.signal - g.band / 2) * sw, 110, g.band * sw, 8, 'rgba(111,227,255,0.35)');
    px(sx + g.dial * sw - 1, 106, 3, 14, g.inBand() ? C.green : C.amber);
    px(262, 32, 40, 86, '#1a0e2e');
    text('LOCK', 282, 42, C.muted, 8, 'center');
    const fill = Math.min(1, g.lock / g.need) * 66;
    px(274, 116 - fill, 16, fill, C.green);
    for (let y = 50; y < 116; y += 6) px(274, y, 16, 1, '#1a0e2e');
    text('< TAP LEFT', 18, 132, C.muted);
    text('TAP RIGHT >', 248, 132, C.muted, 8, 'right');
  }

  // ---------- Level 1-3 extra mini-games ----------
  // hp: like px but on the canvas's real pixels (half units), for finer detail than the 320x160 layout.
  const hp = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, Math.round(w * 2) / 2, Math.round(h * 2) / 2); };
  const circle = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const nowS = () => performance.now() / 1000;

  // Particles for splashes, sparks and steam (in mini-game units).
  const fx = [];
  function burst(x, y, color, n, spread = 1, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (20 + Math.random() * 50) * spread;
      fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: 0.5 + Math.random() * 0.4, age: 0, color, size: 1 + Math.random() * 1.5 });
    }
  }
  let fxLast = 0;
  function drawFx() {
    const t = nowS(), dt = Math.min(0.05, t - (fxLast || t));
    fxLast = t;
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt;
      if (p.age >= p.life) { fx.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - p.age / p.life;
      hp(p.x, p.y, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;
  }

  function tiles(x, y, w, h, base, grout) {
    hp(x, y, w, h, grout);
    for (let ty = y; ty < y + h; ty += 12) for (let tx = x + ((ty - y) / 12 % 2 ? 6 : 0) - 6; tx < x + w; tx += 12) {
      const cx = Math.max(x, tx), cw = Math.min(tx + 11, x + w) - cx;
      if (cw > 0) { hp(cx, ty, cw, 11, base); hp(cx, ty, cw, 1, mix2(base, '#ffffff', 0.12)); }
    }
  }
  const mix2 = (a, b, k) => {
    const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
  };

  const clogPos = (i) => ({ x: 70 + (i % 3) * 90, y: 62 + Math.floor(i / 3) * 46 });
  function drawClogs(g) {
    drawFrame(g, 'PLUMBING // CLEAR THE CLOGS', `CLEARED ${g.cleared}/${g.need}`);
    tiles(8, 26, W - 16, 112, '#2a3a52', '#1a2436'); // bathroom wall
    const t = nowS();
    for (let i = 0; i < g.n; i++) {
      const h = clogPos(i), v = g.holes[i];
      hp(h.x - 26, h.y - 3, 10, 6, C.steelLo); hp(h.x + 16, h.y - 3, 10, 6, C.steelLo); // pipe stubs
      circle(h.x, h.y, 17, '#1a1f2c');
      circle(h.x, h.y, 16, '#8a93ab'); circle(h.x - 1, h.y - 1, 14, '#c9d1e6'); circle(h.x, h.y, 12.5, '#5c6374');
      circle(h.x, h.y, 11, '#07040c');
      if (v < 0) { for (let k = -8; k <= 8; k += 4) hp(h.x + k - 0.5, h.y - 9, 1, 18, '#5c6374'); continue; } // clean grate
      // Gunk: wobbling brown blob with a shine and bubbles; turns angry red when about to overflow.
      const r = 3 + v * 14 + Math.sin(t * 8 + i) * 0.8;
      const col = v > 0.7 ? '#b8452e' : '#7a5a2e';
      circle(h.x, h.y + 1, r, mix2(col, '#000000', 0.3));
      circle(h.x, h.y, r - 0.5, col);
      circle(h.x - r * 0.35, h.y - r * 0.35, Math.max(1, r * 0.3), mix2(col, '#ffffff', 0.35));
      for (let k = 0; k < 3; k++) {
        const ph = (t * 1.3 + k * 0.33 + i * 0.2) % 1;
        circle(h.x + Math.sin(k * 2.4 + i) * r * 0.6, h.y - ph * (r + 4), 1 + (1 - ph), 'rgba(255,240,200,0.5)');
      }
      if (v > 0.7 && Math.floor(t * 6) % 2) { ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(h.x, h.y, 19, 0, Math.PI * 2); ctx.stroke(); }
    }
    hp(14, 124, 96, 12, 'rgba(10,6,20,0.7)');
    text('OVERFLOWS', 20, 133, C.muted);
    for (let k = 0; k < 3; k++) { hp(80 + k * 10, 127, 7, 7, k < g.overflows ? C.red : '#2c1a44'); }
  }

  function drawPump(g) {
    drawFrame(g, 'FLUSH PUMP // PUMP IT UP', `BURSTS ${g.bursts}/3`);
    tiles(8, 26, W - 16, 112, '#2a3a52', '#1a2436');
    const t = nowS();
    // Glass tank: water level = pressure, with bubbles; green band marks the target.
    const tx = 24, ty = 34, tw = 54, th = 96;
    hp(tx - 3, ty - 3, tw + 6, th + 6, '#525d7c'); hp(tx, ty, tw, th, '#0e1424');
    hp(tx, ty + (1 - g.hi) * th, tw, (g.hi - g.lo) * th, 'rgba(61, 255, 192, 0.18)');
    hp(tx - 6, ty + (1 - g.hi) * th, 4, 1, C.green); hp(tx - 6, ty + (1 - g.lo) * th, 4, 1, C.green);
    const lvl = Math.min(1, g.p) * th, wy = ty + th - lvl;
    hp(tx, wy, tw, lvl, '#3a8ad0'); hp(tx, wy, tw, 2, '#9ad6ff');
    for (let x = tx; x < tx + tw; x += 6) hp(x, wy + Math.sin(t * 6 + x) * 0.8, 3, 1, '#c8ecff'); // surface waves
    for (let k = 0; k < 6; k++) { const ph = (t * 0.8 + k * 0.17) % 1; if (lvl > 6) circle(tx + 6 + k * 8, ty + th - ph * lvl, 1.2, 'rgba(220,240,255,0.6)'); }
    hp(tx + 2, ty + 2, 3, th - 4, 'rgba(255,255,255,0.12)'); // glass shine
    // Dial gauge.
    const gx = 130, gy = 64, gr = 26;
    circle(gx, gy, gr + 3, '#2a2f3c'); circle(gx, gy, gr, '#e9e3cf');
    ctx.strokeStyle = '#3fa45f'; ctx.lineWidth = 5; ctx.beginPath();
    ctx.arc(gx, gy, gr - 5, Math.PI * 0.75 + g.lo * Math.PI * 1.5, Math.PI * 0.75 + g.hi * Math.PI * 1.5); ctx.stroke();
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1;
    for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5; ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * (gr - 2), gy + Math.sin(a) * (gr - 2)); ctx.lineTo(gx + Math.cos(a) * (gr - (k % 5 ? 5 : 8)), gy + Math.sin(a) * (gr - (k % 5 ? 5 : 8))); ctx.stroke(); }
    const na = Math.PI * 0.75 + Math.min(1, g.p) * Math.PI * 1.5;
    ctx.strokeStyle = '#c23a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na) * (gr - 6), gy + Math.sin(na) * (gr - 6)); ctx.stroke();
    circle(gx, gy, 3, '#2a2f3c');
    text('kPa', gx, gy + 16, '#6a6450', 8, 'center');
    // Pump: cylinder, piston rod and handle that drops when you tap.
    const press = Math.max(0, 1 - (performance.now() - (g._tapAt || 0)) / 160);
    const px0 = 196;
    hp(px0, 70, 30, 56, '#525d7c'); hp(px0, 70, 4, 56, '#7a85a0'); hp(px0 + 26, 70, 4, 56, '#3d4660');
    for (let y = 76; y < 124; y += 8) hp(px0, y, 30, 1, '#3d4660');
    hp(px0 + 12, 40 + press * 26, 6, 34 - press * 26, '#c9d1e6');
    hp(px0 - 10, 34 + press * 26, 50, 8, '#d64545'); hp(px0 - 10, 34 + press * 26, 50, 2, '#ff7a6a');
    hp(px0 + 30, 112, 22, 6, '#525d7c'); hp(tx + tw, 112, px0 - tx - tw, 4, '#525d7c'); // hose to the tank
    text('TAP / SPACE', px0 + 15, 30, C.muted, 8, 'center');
    // Hold meter.
    hp(266, 34, 40, 96, '#1a0e2e'); text('HOLD', 286, 44, C.muted, 8, 'center');
    const f = Math.min(1, g.held / g.need) * 76;
    for (let y = 0; y < f; y += 4) hp(272, 124 - y - 3, 28, 3, C.green);
  }

  function pipeGrid(g) { const s = 32; return { s, x: Math.round((W - g.C * s) / 2), y: Math.round(32 + (106 - g.R * s) / 2) }; }
  function drawPipes(g) {
    drawFrame(g, 'FUEL LINE // ROTATE THE PIPES', g.solved() ? 'FLOW OK' : 'NO FLOW');
    px(8, 26, W - 16, 112, '#262b38');
    for (let y = 30; y < 136; y += 6) for (let x = 12 + (y % 12 ? 3 : 0); x < W - 12; x += 6) hp(x, y, 1, 1, '#323848'); // tread plate
    const o = pipeGrid(g), t = nowS();
    const flow = g.flow();
    const done = g.solved();
    // Inlet tank and outlet engine.
    const iy = o.y + g.inRow * o.s + o.s / 2, oy = o.y + g.outRow * o.s + o.s / 2;
    hp(o.x - 28, iy - 14, 18, 28, '#c8962a'); hp(o.x - 28, iy - 14, 18, 3, '#ffd36b'); hp(o.x - 10, iy - 4, 10, 8, C.fuel);
    text('FUEL', o.x - 19, iy + 22, C.muted, 8, 'center');
    hp(o.x + g.C * o.s, oy - 4, 10, 8, done ? C.fuel : C.steelLo);
    hp(o.x + g.C * o.s + 10, oy - 12, 14, 24, '#5e5870'); hp(o.x + g.C * o.s + 22, oy - 9, 4, 18, '#3a3448');
    text('ENGINE', o.x + g.C * o.s + 17, oy + 20, C.muted, 8, 'center');
    for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) {
      const x = o.x + c * o.s, y = o.y + r * o.s, m = g.tiles[r][c], mid = o.s / 2;
      hp(x + 1, y + 1, o.s - 2, o.s - 2, '#1c202c'); hp(x + 1, y + 1, o.s - 2, 1, '#2e3444');
      const wet = flow.has(`${r},${c}`);
      const body = wet ? '#c8962a' : C.steel, hi = wet ? C.fuel : C.steelHi, lo = wet ? '#8a5a1a' : C.steelLo;
      const seg = (sx, sy, sw, sh) => { hp(sx, sy, sw, sh, body); };
      seg(x + mid - 5, y + mid - 5, 10, 10);
      if (m & 1) { seg(x + mid - 5, y, 10, mid); hp(x + mid - 5, y, 2, mid, hi); hp(x + mid + 3, y, 2, mid, lo); hp(x + mid - 7, y + 1, 14, 3, C.flange); }
      if (m & 4) { seg(x + mid - 5, y + mid, 10, mid); hp(x + mid - 5, y + mid, 2, mid, hi); hp(x + mid + 3, y + mid, 2, mid, lo); hp(x + mid - 7, y + o.s - 4, 14, 3, C.flange); }
      if (m & 8) { seg(x, y + mid - 5, mid, 10); hp(x, y + mid - 5, mid, 2, hi); hp(x, y + mid + 3, mid, 2, lo); hp(x + 1, y + mid - 7, 3, 14, C.flange); }
      if (m & 2) { seg(x + mid, y + mid - 5, mid, 10); hp(x + mid, y + mid - 5, mid, 2, hi); hp(x + mid, y + mid + 3, mid, 2, lo); hp(x + o.s - 4, y + mid - 7, 3, 14, C.flange); }
      circle(x + mid, y + mid, 3, wet ? '#ffe2a0' : '#8a93ab'); // joint bolt
      // Moving fuel dashes inside wet pipes.
      if (wet) {
        const ph = (t * 20) % 8;
        if (m & 8) for (let k = ph; k < mid; k += 8) hp(x + k, y + mid - 1, 3, 2, '#fff2c0');
        if (m & 2) for (let k = ph; k < mid; k += 8) hp(x + mid + k, y + mid - 1, 3, 2, '#fff2c0');
        if (m & 1) for (let k = ph; k < mid; k += 8) hp(x + mid - 1, y + k, 2, 3, '#fff2c0');
        if (m & 4) for (let k = ph; k < mid; k += 8) hp(x + mid - 1, y + mid + k, 2, 3, '#fff2c0');
      }
    }
  }

  const sensorPos = (i) => ({ x: 50 + i * 44 });
  function drawSensors(g) {
    drawFrame(g, 'SENSORS // FIND THE BAD READING', `ROUND ${g.round + 1}/3  MISSES ${g.strikes}/2`);
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    const t = nowS(), top = 38, h = 72;
    for (let i = 0; i < g.n; i++) {
      const x = sensorPos(i).x;
      // Small monitor: bezel, dark screen, normal band, scrolling history graph and a digital readout.
      hp(x - 19, top - 4, 38, h + 30, '#2c1a44'); hp(x - 19, top - 4, 38, 2, '#5c3a8c');
      hp(x - 16, top, 32, h, '#06120e');
      for (let gy = top; gy < top + h; gy += 9) hp(x - 16, gy, 32, 0.5, '#0f2a20');
      hp(x - 16, top + (1 - g.hi) * h, 32, (g.hi - g.lo) * h, 'rgba(61,255,192,0.1)');
      hp(x - 16, top + (1 - g.hi) * h, 32, 0.5, C.green); hp(x - 16, top + (1 - g.lo) * h, 32, 0.5, C.green);
      const v = Math.max(0, Math.min(1, g.values[i]));
      ctx.fillStyle = '#6fe3ff'; // same colour for all: the player has to read the band, not spot a colour
      for (let k = 0; k < 32; k++) {
        const vv = v + Math.sin(t * 3 + k * 0.6 + i * 2) * 0.02 + Math.sin(k * 1.9 + i) * 0.015;
        ctx.fillRect(x - 16 + k, top + (1 - vv) * h, 1, 1.5);
      }
      hp(x - 14, top + h + 4, 28, 10, '#06120e');
      text(String(Math.round(v * 100)).padStart(3, '0'), x, top + h + 13, '#6fe3ff', 8, 'center');
      text(`S${i + 1}`, x, top + h + 24, C.muted, 8, 'center');
    }
  }

  const fuseX = (i) => 40 + i * 48;
  function drawFuse(g) {
    drawFrame(g, 'COMMS RACK // PICK THE FUSE', `ROUND ${g.round + 1}/3  MISSES ${g.strikes}/2`);
    px(8, 26, W - 16, 112, '#2a2f3c');
    hp(12, 30, W - 24, 52, '#1e222c'); hp(12, 30, W - 24, 1, '#3e4456');
    const names = ['RADIO', 'AMP', 'COOLER'];
    const icons = [
      (x, y) => { hp(x, y, 22, 14, '#5c6374'); hp(x + 2, y + 2, 10, 10, '#1a1f2a'); circle(x + 17, y + 7, 3, '#c9d1e6'); hp(x + 10, y - 6, 1, 6, '#c9d1e6'); },
      (x, y) => { hp(x, y, 22, 14, '#3a3f4c'); for (let k = 0; k < 3; k++) circle(x + 5 + k * 6, y + 7, 2, '#ff9a3d'); },
      (x, y) => { hp(x, y, 22, 14, '#3a7bd5'); for (let k = 0; k < 4; k++) hp(x + 3 + k * 5, y + 2, 2, 10, '#9ad6ff'); },
    ];
    // Devices wired to one busbar that runs to the fuse slot.
    const busY = 70;
    g.loads.forEach((a, i) => {
      const x = 22 + i * 64;
      icons[i](x, 36);
      text(`${names[i]} ${a}A`, x + 11, 62, C.text, 8, 'center');
      hp(x + 11, 64, 1, busY - 64, '#e8b030');
    });
    hp(33, busY, 201, 1, '#e8b030'); // busbar from the devices to the fuse slot
    hp(244, 38, 56, 40, '#14171f'); hp(244, 38, 56, 1, '#3e4456');
    text('SLOT', 272, 50, C.muted, 8, 'center'); text('? A', 272, 66, C.amber, 8, 'center');
    hp(233, busY, 11, 1, '#e8b030');
    const colors = ['#ff9a3d', '#c9b8a0', '#ff4d6a', '#6fe3ff', '#ffd34d', '#4dffc3'];
    g.fuses.forEach((f, i) => {
      const x = fuseX(i);
      // Blade fuse: coloured plastic head, window, two metal legs.
      hp(x - 11, 88, 22, 16, colors[i]); hp(x - 11, 88, 22, 2, mix2(colors[i], '#ffffff', 0.4)); hp(x - 11, 102, 22, 2, mix2(colors[i], '#000000', 0.3));
      hp(x - 5, 92, 10, 6, 'rgba(255,255,255,0.35)'); hp(x - 3, 94, 6, 1, '#5c6374');
      hp(x - 8, 104, 4, 12, '#c9d1e6'); hp(x + 4, 104, 4, 12, '#c9d1e6'); hp(x - 8, 104, 1, 12, '#ffffff'); hp(x + 4, 104, 1, 12, '#ffffff');
      text(`${f}A`, x, 128, C.text, 8, 'center');
    });
  }

  const loopX = (i) => 80 + i * 80;
  function drawBalance(g) {
    drawFrame(g, 'COOLANT LOOPS // KEEP THEM COOL', `HOLD ${Math.ceil(Math.max(0, g.timeLeft))}s`);
    px(8, 26, W - 16, 112, C.panel);
    rivets(8, 26, W - 16, 112);
    const t = nowS(), top = 34, h = 84;
    g._vent = g._vent || [];
    for (let i = 0; i < g.n; i++) {
      const x = loopX(i), v = Math.min(1, g.heat[i]);
      const hot = v > 0.75 ? '#ff4d3a' : v > 0.5 ? '#ff9a3d' : '#3a8ad0';
      const glow = mix2('#3a8ad0', '#ff4d3a', v);
      // Radiator: zig-zag pipe glowing from blue (cool) to red (hot).
      for (let k = 0; k < 7; k++) {
        const yy = top + 6 + k * 11;
        hp(x - 26, yy, 30, 4, glow); hp(x - 26, yy, 30, 1, mix2(glow, '#ffffff', 0.35));
        hp(k % 2 ? x - 26 : x + 1, yy, 3, 11, glow);
      }
      if (v > 0.6) for (let k = 0; k < 3; k++) { const ph = (t * 1.2 + k * 0.33 + i) % 1; hp(x - 20 + k * 8 + Math.sin(t * 3 + k) * 2, top + 4 - ph * 10, 2, 2, `rgba(255,140,90,${0.6 * (1 - ph)})`); } // heat shimmer
      // Thermometer with bulb and red line.
      const tx = x + 14;
      hp(tx, top, 8, h, '#0b0614'); hp(tx + 2, top + 2, 4, h - 4, '#24142e');
      hp(tx + 2, top + 2 + (1 - v) * (h - 4), 4, v * (h - 4), hot);
      circle(tx + 4, top + h + 4, 6, hot); circle(tx + 3, top + h + 3, 2, 'rgba(255,255,255,0.4)');
      hp(tx - 3, top + 2, 14, 1.5, C.red);
      // Steam after a vent.
      const since = t - (g._vent[i] || -9);
      if (since < 0.6) for (let k = 0; k < 5; k++) { const ph = since / 0.6; circle(x - 12 + k * 5, top - ph * 18 + k % 2 * 3, 3 + ph * 4, `rgba(230,236,245,${0.6 * (1 - ph)})`); }
      text(`LOOP ${String.fromCharCode(65 + i)}`, x - 6, top + h + 14, C.muted, 8, 'center');
    }
  }

  // The canvas is 640x320 but the mini-games are laid out in 320x160 units: scaling by 2 keeps their
  // layout and hit-testing unchanged while circles, lines and text come out twice as fine.
  function drawRepair(g) {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    if (g.kind === 'find_leak') drawLeak(g);
    else if (g.kind === 'bolts') drawBolts(g);
    else if (g.kind === 'pressure') drawPressure(g);
    else if (g.kind === 'wires') drawWires(g);
    else if (g.kind === 'switches') drawSwitches(g);
    else if (g.kind === 'frequency') drawFrequency(g);
    else if (g.kind === 'clogs') drawClogs(g);
    else if (g.kind === 'pump') drawPump(g);
    else if (g.kind === 'pipes') drawPipes(g);
    else if (g.kind === 'sensors') drawSensors(g);
    else if (g.kind === 'fuse') drawFuse(g);
    else drawBalance(g);
    drawFx();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < H * 2; y += 2) ctx.fillRect(0, y, W * 2, 1); // scanlines at full resolution
  }

  let repairFailure = null;
  function renderRepair(now) {
    let g = state.repair;
    if (g) {
      repairFailure = FAILURES[state.active].name;
      $('stamp').hidden = true;
      stampGame = null;
    } else if (stampGame && now < stampUntil) g = stampGame;
    const box = $('repair');
    if (!g) { box.hidden = true; box.classList.remove('closing'); return; }
    box.hidden = false;
    box.classList.toggle('closing', !state.repair && now > stampUntil - 300);
    $('repair-title').textContent = repairFailure;
    $('repair-help').textContent = HELP[g.kind];
    drawRepair(g);
  }

  // Input with instant feedback: compare the game's counters before and after.
  function repairInput(x, y) {
    const g = state.repair;
    if (!g) return;
    Sfx.unlock();
    const before = [g.strikes, g.pos, g.hits, (g.results || []).length];
    const extra = [g.cleared, g.bursts, g.round];
    g._tapAt = performance.now();
    const idx = hitIndex(g, x, y);
    g.input(idx);
    // Visual feedback: splashes, sparks and steam where it happened.
    if (g.kind === 'clogs' && g.cleared > extra[0]) { const h = clogPos(idx); burst(h.x, h.y, '#9ad6ff', 14, 1, 40); }
    if (g.kind === 'pump' && g.bursts > extra[1]) burst(52, 40, '#9ad6ff', 24, 1.4, 60);
    if (g.kind === 'balance' && idx >= 0) { g._vent = g._vent || []; g._vent[idx] = nowS(); }
    if (g.kind === 'fuse' && idx >= 0) burst(fuseX(idx), 96, g.round > extra[2] || g.done ? '#4dffc3' : '#ff4d6a', 12);
    if (g.kind === 'sensors' && idx >= 0) burst(sensorPos(idx).x, 70, g.round > extra[2] || g.done ? '#4dffc3' : '#ff4d6a', 12);
    if (g.done) return; // the result stamp has its own sound
    if (g.strikes > before[0]) { Sfx.miss(); shake(); }
    else if (g.pos > before[1] || g.hits > before[2]) Sfx.hit();
    else if ((g.results || []).length > before[3]) Sfx.miss();
    else Sfx.click();
  }

  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    repairInput((e.clientX - r.left) * (320 / r.width), (e.clientY - r.top) * (160 / r.height));
  });
  document.addEventListener('keydown', (e) => {
    const g = state.repair;
    if (!g) return;
    if (e.code === 'Space' && (g.kind === 'pressure' || g.kind === 'pump')) { e.preventDefault(); repairInput(0, 0); }
    if (g.kind === 'frequency' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault();
      g.input(e.code === 'ArrowRight' ? 1 : 0);
      Sfx.click();
    }
  });

  function renderEnd(now) {
    const end = $('end');
    if (windowClosed) return; // the launch-window ending manages the overlay itself
    if (state.status === 'playing' || endAt < 0 || now < endAt) { end.hidden = true; return; }
    if (!end.hidden) return;
    end.hidden = false;
    document.body.classList.remove('launching'); // the full-screen launch view sits above overlays: drop it so the end screen and its buttons show
    const btn = $('end-btn');
    const starsEl = $('end-stars');
    starsEl.innerHTML = '';
    if (state.status === 'won') {
      const last = state.index + 1 >= LEVELS.length;
      if (last) Sfx.win();
      $('end-kicker').textContent = last ? 'MISSION COMPLETE' : `STAGE ${state.index + 1} OF ${LEVELS.length} CLEARED`;
      $('end-title').textContent = last ? 'The rocket is on its way' : 'GO for launch';
      for (let i = 0; i < 3; i++) {
        const st = document.createElement('span');
        st.textContent = '\u2605';
        st.className = i >= state.stars ? 'px off' : 'px';
        st.style.animationDelay = `${0.2 + i * 0.25}s`;
        starsEl.appendChild(st);
      }
      $('end-msg').textContent = `Time left ${fmt(state.timeLeft)} \u00b7 Stability ${Math.round(state.stability)} \u00b7 Fuel ${Math.round(state.fuel)}`
        + (last ? (state.lucky ? '. You launched into NO-GO weather and got lucky.' : '') : '. Stability and fuel carry over to the next stage.');
      btn.textContent = last ? 'Fly again' : 'Next stage';
      $('end-moon').hidden = !last; // the rocket is up: on to Mission 2
      if (last) Campaign.save({ stars: { m1: state.stars }, m1: { fuel: state.fuel, stability: state.stability } });
    } else {
      $('end-moon').hidden = true;
      $('end-kicker').textContent = 'LAUNCH SCRUBBED';
      $('end-title').textContent = 'Mission control calls a hold';
      $('end-msg').textContent = `${state.reason} Retry starts with the stability and fuel you had when this stage began.`;
      btn.textContent = 'Retry stage';
    }
    btn.focus();
  }

  function render() {
    const s = state;
    renderLevelHeader();
    setText($('timer'), fmt(Math.max(0, s.timeLeft)));
    $('timer').classList.toggle('danger', s.status === 'playing' && s.timeLeft < 30);
    for (const [id, v] of [['stability-bar', s.stability], ['fuel-bar', s.fuel]]) {
      setWidth($(id), pct(v));
      setWidth($(id).previousElementSibling, pct(v)); // ghost trails behind via CSS transition delay
    }
    $('stability-bar').parentElement.classList.toggle('low', s.stability < Math.max(30, s.cfg.minStability));
    $('fuel-bar').parentElement.classList.toggle('low', s.fuel < Math.max(30, s.cfg.minFuel));

    let status;
    if (s.status === 'won') status = 'GO for launch.';
    else if (s.status === 'lost') status = `Launch scrubbed: ${s.reason}`;
    else if (s.repair) status = `Repairing: ${FAILURES[s.active].name}...`;
    else if (s.active !== null && !(s.supplies[FAILURES[s.active].fix] > 0)) status = `No ${SUPPLIES[FAILURES[s.active].fix].name} left! The fault cannot be fixed this stage.`;
    else if (s.active !== null) status = 'Fault! Pick the right part below.'; // the radio names the exact fault
    else if (s.checking > 0) status = 'Check in progress...';
    else status = Game.canLaunch(s) ? 'All systems GO. Request launch!' : 'Pick a system to check.';
    setText($('status'), status);
    $('status').classList.toggle('alert', s.status === 'lost' || (s.status === 'playing' && s.active !== null));

    renderChecklist();

    for (const btn of document.querySelectorAll('#supplies button')) {
      const id = btn.dataset.id;
      setText(btn.querySelector('.supply-count'), `x${s.supplies[id]}`);
      btn.disabled = s.status !== 'playing' || s.active === null || s.repair !== null || s.supplies[id] <= 0;
    }

    if (s.lastRepair && s.lastRepair !== shownRepair) {
      shownRepair = s.lastRepair;
      setText($('hint'), '');
    }
    renderLog();
  }

  $('launch-btn').addEventListener('click', () => { Sfx.unlock(); Game.requestLaunch(state); });
  const muteBtn = $('mute-btn');
  const muteLabel = () => { muteBtn.textContent = Sfx.isMuted() ? 'SOUND OFF' : 'SOUND ON'; };
  muteLabel();
  muteBtn.addEventListener('click', () => { Sfx.toggle(); muteLabel(); });
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
  $('end-btn').addEventListener('click', () => {
    if (windowClosed) { windowClosed = false; $('end').hidden = true; enterPlanning(); return; }
    // Stability and fuel carry into the next stage; a retry restores what you had when the stage began.
    const last = state.index + 1 >= LEVELS.length;
    if (state.status === 'won' && last) { loadLevel(0, newSeed(), null); if (weatherDays.length >= 7) enterPlanning(); }
    else if (state.status === 'won') {
      loadLevel(state.index + 1, newSeed(), { stability: state.stability, fuel: state.fuel, waited: state.waited, day: state.launchDay });
    } else loadLevel(state.index, newSeed(), stageCarry);
  });

  loadLevel(0, Number(params.get('seed')) || newSeed());

  // Live NASA data, both optional: DONKI solar flares (last 30 days) and EONET severe storms (open now).
  // Each source that answers adds its events; one that fails is reported honestly instead of claimed.
  const day = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const range = `startDate=${day(new Date(now - 30 * 864e5))}&endDate=${day(now)}`;
  const key = typeof CONFIG !== 'undefined' ? CONFIG.nasaApiKey : 'DEMO_KEY';
  // Every request gives up after 15 s, so one hanging server cannot leave the badge stuck on CONNECTING.
  const getJson = (url, ms = 15000) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    return fetch(url, { signal: ctl.signal })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .finally(() => clearTimeout(timer));
  };
  // DONKI moved from api.nasa.gov/DONKI (now 404) to NASA CCMC's DONKI-API; same JSON format.
  const flareFeed = getJson(`https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?${range}&api_key=${encodeURIComponent(key)}`, 10000)
    .then(flaresToEvents, () => null);
  const stormFeed = getJson('https://eonet.gsfc.nasa.gov/api/v3/events?category=severeStorms&status=open&limit=20')
    .then(stormsToEvents, () => null);

  // OSDR: real NASA spaceflight health studies, a few per topic so the facts vary.
  const topics = ['bone loss', 'muscle atrophy', 'sleep', 'radiation', 'immune'];
  const studyFeed = Promise.all(topics.map((t) =>
    getJson(`https://osdr.nasa.gov/osdr/data/search?term=${encodeURIComponent(t)}&type=cgene&size=3`).then(studiesToFacts, () => [])))
    .then((lists) => {
      const seen = new Set();
      const all = lists.flat().filter((f) => !seen.has(f) && seen.add(f));
      return all.length ? { facts: all, live: true } : null;
    })
    // Browsers usually block reading osdr.nasa.gov from a local file, so fall back to the saved real NASA copy.
    .then((r) => r || (typeof OSDR_SNAPSHOT !== 'undefined'
      ? { facts: studiesToFacts(OSDR_SNAPSHOT), live: false, saved: OSDR_SNAPSHOT.saved } : null));

  // Loading screen lines: one per feed, updated as each one settles.
  function bootLine(feed, ok, text) {
    const li = document.querySelector(`#boot-list li[data-feed="${feed}"]`);
    li.className = ok ? 'ok' : 'off';
    li.querySelector('.boot-st').textContent = text;
  }
  // If flares fail (e.g. the browser blocks the request), the line is hidden rather than shown in red.
  flareFeed.then((f) => {
    if (f) bootLine('flares', true, `ready \u00b7 ${f.length}`);
    else document.querySelector('#boot-list li[data-feed="flares"]').hidden = true;
  });
  stormFeed.then((f) => bootLine('storms', !!f, f ? `ready \u00b7 ${f.length}` : 'offline'));
  studyFeed.then((f) => bootLine('studies', !!f, !f ? 'offline' : f.live ? `ready \u00b7 ${f.facts.length}`
    : `saved \u00b7 ${f.facts.length}`));

  // NASA POWER daily weather at Kennedy Space Center (last ~60 days, POWER lags a few days behind).
  // Falls back to the saved real copy in data/power-ksc.js.
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const wEnd = new Date(now - 4 * 864e5), wStart = new Date(wEnd - 60 * 864e5);
  const weatherFeed = getJson(Weather.powerUrl(ymd(wStart), ymd(wEnd)))
    .then((j) => { const d = Weather.parsePower(j); return d.length >= 7 ? { days: d, live: true } : null; }, () => null)
    .then((r) => r || (typeof POWER_SNAPSHOT !== 'undefined'
      ? { days: Weather.parsePower(POWER_SNAPSHOT), live: false, saved: POWER_SNAPSHOT.saved } : null));
  weatherFeed.then((w) => {
    weatherDays = w ? w.days : [];
    bootLine('weather', !!w, !w ? 'offline' : `${w.live ? 'ready' : 'saved'} \u00b7 ${w.days.length} days`);
    feeds.weather = w;
    applyFeeds();
  });

  // Loading screen waits for all feeds (each gives up after its timeout).
  Promise.all([flareFeed, stormFeed, studyFeed, weatherFeed]).then(() => {
    $('boot-title').textContent = 'NASA data ready';
    $('boot-start').disabled = false;
    $('boot-start').textContent = 'Start mission';
    $('boot-skip').hidden = true;
    document.querySelector('.boot-bar').classList.add('done');
    if (!started) $('boot-start').focus();
  });

  // Badge, credits and event list are rebuilt each time a feed settles.
  const feeds = {};
  function applyFeeds() {
    const { flares, storms, studies } = feeds;
    events = GROUND_EVENTS.concat(flares || [], storms || []);
    state.events = events;
    const parts = [];
    const credits = [];
    if (flares) {
      parts.push(`FLARES ${flares.length}`);
      credits.push('solar flares from NASA DONKI (CCMC)');
    }
    if (storms) {
      parts.push(`STORMS ${storms.length}`);
      credits.push('severe storms from NASA EONET');
    } else if ('storms' in feeds) parts.push('STORMS OFF');
    if (studies && studies.facts.length) {
      research = studies.facts;
      parts.push(`STUDIES ${research.length}`); // saved-copy details stay in the footer credits
      credits.push(studies.live ? 'spaceflight studies from NASA OSDR'
        : `spaceflight studies from NASA OSDR (copy saved ${studies.saved})`);
    } else if ('studies' in feeds) parts.push('STUDIES OFF');
    if (feeds.weather) {
      parts.push('WEATHER');
      credits.push(feeds.weather.live ? 'launch weather from NASA POWER' : `launch weather from NASA POWER (copy saved ${feeds.weather.saved})`);
    }
    const live = flares || storms || studies || feeds.weather;
    const wx = $('wx');
    wx.textContent = parts.length ? `NASA \u00b7 ${parts.join(' \u00b7 ')}` : 'NASA DATA: CONNECTING...';
    wx.parentElement.classList.toggle('live', !!live);
    wx.parentElement.classList.toggle('offline', !live && 'storms' in feeds && 'studies' in feeds);
    $('wx-credit').textContent = live
      ? `NASA data: ${credits.join(' and ')}.`
      : 'NASA data feeds unavailable right now, so only ground events happen.';
  }
  for (const [name, feed] of [['flares', flareFeed], ['storms', stormFeed], ['studies', studyFeed]]) {
    feed.then((v) => {
      feeds[name] = v;
      applyFeeds();
      if (v || name !== 'flares') state.log.push(`NASA ${name} feed: ${v ? 'online' : 'offline'}.`);
    });
  }

  let last = performance.now();
  // The game clock only runs after the player leaves the loading screen.
  let started = false;
  function startMission() {
    if (started || planning) return;
    $('boot').hidden = true;
    Sfx.unlock();
    Sfx.go();
    if (weatherDays.length >= 7) enterPlanning();
    else beginLevels(null); // no weather data at all: skip the launch window
  }

  // ---------- Launch window: pick a launch day from 7 days of real weather ----------
  let weatherDays = [];
  let plan = null;      // { days: 7 weather days, i: current day index }
  let planning = false;
  let timelapse = null; // { start } while skipping a day
  let windowClosed = false;
  let sceneT = 0;       // scene clock; runs fast during a timelapse

  function enterPlanning() {
    planning = true;
    started = false;
    plan = { days: Weather.pickWindow(weatherDays, Math.random), i: 0 };
    document.body.classList.add('planning');
    $('window-panel').hidden = false;
    const list = $('days');
    list.innerHTML = '';
    plan.days.forEach((d) => {
      const li = document.createElement('li');
      li.innerHTML = '<canvas width="16" height="16" aria-hidden="true"></canvas><span class="d-date px"></span><span class="d-go px"></span>';
      li.querySelector('.d-date').textContent = `D${plan.days.indexOf(d) + 1}`; // full date is in the detail box
      li.querySelector('.d-go').textContent = d.go ? 'GO' : 'NO';
      li.className = d.go ? 'go' : 'nogo';
      Render.weatherIcon(li.querySelector('canvas').getContext('2d'), d.kind);
      list.appendChild(li);
    });
    radio.queue = [];
    say('Weather officer to technician. Here is your 7-day launch window. Real numbers from Kennedy. Pick your day wisely.', true);
    sayDay();
    updatePlan();
  }

  function sayDay() {
    const d = plan.days[plan.i];
    say(`Day ${plan.i + 1}, ${d.date}: ${d.reason}`);
  }

  function updatePlan() {
    const d = plan.days[plan.i];
    [...$('days').children].forEach((li, k) => {
      li.classList.toggle('past', k < plan.i);
      li.classList.toggle('now', k === plan.i);
    });
    $('day-title').textContent = `Day ${plan.i + 1}/7 \u00b7 ${d.date} \u00b7 ${d.go ? 'GO' : 'NO-GO'}`;
    $('day-reason').textContent = d.go ? d.reason : `${d.reason} Launching today is a big gamble: ${Math.round(d.risk * 100)}% chance to lose the rocket.`;
    const w = plan.i;
    $('wait-cost').textContent = w
      ? `Waited ${w} day${w > 1 ? 's' : ''}: fuel -${Game.WAIT.fuelPerDay * w}, faults +${Math.round(Game.WAIT.failurePerDay * w * 100)}%, +${Game.WAIT.countdownPerDay * w}s prep time each stage.`
      : 'No days waited yet: full fuel, fresh systems.';
    document.body.classList.toggle('window-go', d.go);
    document.body.classList.toggle('window-nogo', !d.go);
    $('lock-btn').textContent = d.go ? 'Launch on this day' : 'Launch anyway (risky!)';
    $('skip-btn').textContent = plan.i < 6 ? 'Skip a day' : 'Let the window close';
  }

  $('skip-btn').addEventListener('click', () => {
    if (!planning || timelapse) return;
    if (plan.i >= 6) return closeWindow();
    timelapse = { start: performance.now() };
    document.body.classList.add('timelapse');
    Sfx.scan();
  });
  $('lock-btn').addEventListener('click', () => {
    if (!planning || timelapse) return;
    const d = plan.days[plan.i];
    say(d.go ? `Launch day locked: ${d.date}. Weather is GO. Now get that rocket ready.`
      : `Launch day locked: ${d.date}. Weather is NO-GO. Your call, technician. I am not signing this.`, true);
    beginLevels({ stability: 100, fuel: 100 - Game.WAIT.fuelPerDay * plan.i, waited: plan.i, day: d });
  });

  function closeWindow() {
    windowClosed = true;
    $('end-kicker').textContent = 'LAUNCH WINDOW CLOSED';
    $('end-title').textContent = 'Mission scrubbed';
    $('end-stars').innerHTML = '';
    $('end-msg').textContent = 'You waited past day 7 and the launch window closed. Try a new window.';
    $('end-btn').textContent = 'Plan a new window';
    $('end').hidden = false;
    Sfx.lose();
  }

  function beginLevels(carry) {
    planning = false;
    timelapse = null;
    document.body.classList.remove('planning', 'timelapse', 'window-go', 'window-nogo');
    $('window-panel').hidden = true;
    loadLevel(0, newSeed(), carry);
    started = true;
  }

  // Scene settings: during the window the timelapse runs a full day in 3 s; in the levels the scene
  // shows the chosen day at launch time (18:30).
  function sceneEnv(now) {
    if (planning && plan) {
      let hour = 18.5;
      let day = plan.days[plan.i];
      if (timelapse) {
        const p = (now - timelapse.start) / 3000;
        if (p >= 1) {
          timelapse = null;
          document.body.classList.remove('timelapse');
          plan.i++;
          updatePlan();
          sayDay();
          day = plan.days[plan.i];
        } else {
          hour = 18.5 + 24 * p;
          if (hour >= 24) day = plan.days[plan.i + 1]; // weather changes at midnight
          if (Math.floor(hour) !== Math.floor(hour - 0.4)) Sfx.tick();
        }
      }
      return { hour: hour % 24, kind: day.kind, wind: day.wind };
    }
    const d = state.launchDay;
    return d ? { hour: 18.5, kind: d.kind, wind: d.wind } : undefined;
  }
  $('menu-btn').addEventListener('click', () => location.reload()); // back to the mission select (progress on this mission is lost)
  $('boot-start').addEventListener('click', startMission);
  $('boot-skip').addEventListener('click', startMission);
  // Mission select: centred cards with the saved stars. Card 1 starts Mission 1 right here.
  const saved = Campaign.get();
  for (const card of document.querySelectorAll('.mission-card')) {
    const n = card.dataset.m, got = saved.stars['m' + n];
    card.querySelector('.card-stars').textContent = got ? '\u2605'.repeat(got) : 'NO STARS YET';
    if (card.dataset.m === '1') card.addEventListener('click', (e) => { e.preventDefault(); startMission(); });
  }
  $('boot-trip').textContent = `Trip stars: ${Campaign.total()} of 12`;
  $('end-moon').addEventListener('click', () => { location.href = 'moon.html'; });

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (started) Game.tick(state, dt, FAILURES);
    react(now);
    sceneT += dt * (timelapse ? 30 : 1);
    Render.draw(scene, state, sceneT, FAILURES, liftoffAt < 0 || now < liftoffAt ? -1 : (now - liftoffAt) / 1000, sceneEnv(now));
    render();
    if (planning && plan) setText($('timer'), `DAY ${plan.i + 1}`);
    renderRepair(now);
    renderLaunch(now);
    if (started || planning) renderRadio(now, dt);
    else Render.portrait(portrait, now / 1000, false, false);
    renderEnd(now);
    PixelText.sync(); // last, so text set anywhere this frame is drawn this frame
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
