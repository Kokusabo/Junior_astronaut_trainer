// Repair mini-games: pure logic, no DOM. create(kind, rng, level) returns a game with
// step(dt), input(arg), and the fields done / success. Drawing lives in main.js.
// level (0-2) raises difficulty. A timeout ends the game as a miss.
const Minigames = (function () {
  const finish = (g, ok) => { g.done = true; g.success = ok; };

  // Find the dripping pipe segment. Two wrong taps lose.
  function findLeak(rng, level) {
    const n = 6 + 2 * level;
    const g = { kind: 'find_leak', n, leak: Math.floor(rng() * n), strikes: 0, tried: [], timeLeft: 10, done: false, success: false };
    g.step = (dt) => { if (!g.done && (g.timeLeft -= dt) <= 0) finish(g, false); };
    g.input = (i) => {
      if (g.done) return;
      if (i < 0 || g.tried.includes(i)) return;
      g.tried.push(i);
      if (i === g.leak) finish(g, true);
      else if (++g.strikes >= 2) finish(g, false);
    };
    return g;
  }

  // Bolts show their tightening order for a moment, then must be tapped in that order.
  function bolts(rng, level) {
    const n = 4 + level;
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const g = { kind: 'bolts', n, order, pos: 0, showLeft: 3, timeLeft: 12, done: false, success: false };
    g.step = (dt) => {
      if (g.done) return;
      if (g.showLeft > 0) g.showLeft -= dt;
      else if ((g.timeLeft -= dt) <= 0) finish(g, false);
    };
    g.input = (i) => {
      if (g.done || g.showLeft > 0 || i < 0) return;
      if (i !== order[g.pos]) return finish(g, false);
      if (++g.pos === n) finish(g, true);
    };
    return g;
  }

  // Stop the moving needle inside the green zone. 3 presses, 2 hits needed.
  function pressure(rng, level) {
    const g = { kind: 'pressure', t: 0, pos: 0, width: 0.3 - 0.05 * level, presses: 0, hits: 0, results: [], timeLeft: 15, done: false, success: false };
    const newZone = () => { g.center = g.width / 2 + rng() * (1 - g.width); };
    const speed = 0.6 + 0.2 * level; // sweeps per second
    newZone();
    g.step = (dt) => {
      if (g.done) return;
      g.t += dt;
      const p = (g.t * speed) % 1;
      g.pos = p < 0.5 ? p * 2 : 2 - p * 2; // triangle wave, 0..1
      if ((g.timeLeft -= dt) <= 0) finish(g, g.hits >= 2);
    };
    g.input = () => {
      if (g.done) return;
      const hit = Math.abs(g.pos - g.center) <= g.width / 2;
      g.results.push(hit);
      if (hit) g.hits++;
      if (++g.presses === 3) finish(g, g.hits >= 2);
      else newZone();
    };
    return g;
  }

  // Wires: connect each left plug to the right socket of the same color. Tap a plug, then a socket.
  // input(i): 0..n-1 = left plug i, n..2n-1 = right socket (i - n). Two wrong connections lose.
  function wires(rng, level) {
    const n = 4 + (level > 1 ? 1 : 0);
    const right = [];
    for (let i = 0; i < n; i++) right.push(i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [right[i], right[j]] = [right[j], right[i]]; }
    const g = { kind: 'wires', n, right, linked: [], sel: null, strikes: 0, timeLeft: 15, done: false, success: false };
    g.step = (dt) => { if (!g.done && (g.timeLeft -= dt) <= 0) finish(g, false); };
    g.input = (i) => {
      if (g.done || i < 0) return;
      if (i < n) { if (!g.linked.includes(i)) g.sel = i; return; }
      if (g.sel === null) return;
      const color = right[i - n];
      if (color === g.sel) {
        g.linked.push(g.sel);
        g.sel = null;
        if (g.linked.length === n) finish(g, true);
      } else {
        g.sel = null;
        if (++g.strikes >= 2) finish(g, false);
      }
    };
    return g;
  }

  // Valve switches: flipping switch i also flips its right neighbour. Match the target pattern
  // within the press limit. Targets come from random presses, so every puzzle is solvable.
  function switches(rng, level) {
    const n = 4 + level;
    const target = new Array(n).fill(false);
    const flip = (arr, i) => { arr[i] = !arr[i]; if (i + 1 < n) arr[i + 1] = !arr[i + 1]; };
    // Random presses (each switch at most once, so presses can never cancel out), then at least one.
    for (let i = 0; i < n; i++) if (rng() < 0.5) flip(target, i);
    if (target.every((v) => !v)) flip(target, Math.floor(rng() * n));
    const g = { kind: 'switches', n, target, state: new Array(n).fill(false), pressesLeft: n + 3, timeLeft: 18, done: false, success: false };
    g.step = (dt) => { if (!g.done && (g.timeLeft -= dt) <= 0) finish(g, false); };
    g.input = (i) => {
      if (g.done || i < 0 || i >= n) return;
      flip(g.state, i);
      g.pressesLeft--;
      if (g.state.every((v, k) => v === target[k])) finish(g, true);
      else if (g.pressesLeft <= 0) finish(g, false);
    };
    return g;
  }

  // Frequency tuning: the signal drifts; nudge the dial (input 0 = down, 1 = up) to keep it inside
  // the lock band. Fill the lock meter (1.6 s in band, total) before time runs out.
  function frequency(rng, level) {
    const g = {
      kind: 'frequency', dial: 0.2, signal: 0.5, band: 0.14 - 0.02 * level, lock: 0, need: 1.6,
      t: rng() * 10, speed: 0.35 + 0.15 * level, timeLeft: 14, done: false, success: false,
    };
    g.inBand = () => Math.abs(g.dial - g.signal) <= g.band / 2;
    g.step = (dt) => {
      if (g.done) return;
      g.t += dt;
      g.signal = 0.5 + 0.35 * Math.sin(g.t * g.speed) * Math.cos(g.t * g.speed * 0.37);
      if (g.inBand()) g.lock += dt;
      if (g.lock >= g.need) return finish(g, true);
      if ((g.timeLeft -= dt) <= 0) finish(g, false);
    };
    g.input = (dir) => {
      if (g.done || (dir !== 0 && dir !== 1)) return;
      g.dial = Math.min(1, Math.max(0, g.dial + (dir ? 0.05 : -0.05)));
    };
    return g;
  }

  // Clogs: blockages pop up in the pipes and grow; tap them before they overflow.
  // Clear `need` of them. Three overflows lose.
  function clogs(rng, level) {
    const n = 6;
    const g = { kind: 'clogs', n, holes: new Array(n).fill(-1), cleared: 0, need: 8 + level * 2, overflows: 0, spawnIn: 0.3, timeLeft: 20, done: false, success: false };
    const grow = 0.45 + 0.15 * level;
    g.step = (dt) => {
      if (g.done) return;
      if ((g.spawnIn -= dt) <= 0) {
        const free = g.holes.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
        if (free.length) g.holes[free[Math.floor(rng() * free.length)]] = 0;
        g.spawnIn = 0.9 - 0.15 * level;
      }
      g.holes = g.holes.map((v) => (v < 0 ? v : v + grow * dt));
      g.holes.forEach((v, i) => { if (v >= 1) { g.holes[i] = -1; g.overflows++; } });
      if (g.overflows >= 3) return finish(g, false);
      if ((g.timeLeft -= dt) <= 0) finish(g, false);
    };
    g.input = (i) => {
      if (g.done || i < 0 || g.holes[i] < 0) return;
      g.holes[i] = -1;
      if (++g.cleared >= g.need) finish(g, true);
    };
    return g;
  }

  // Pump: pressure leaks away; tap to pump it back up. Keep it in the green band (not over the top)
  // for `need` seconds in total.
  function pump(rng, level) {
    const g = { kind: 'pump', p: 0.2, lo: 0.55, hi: 0.85, held: 0, need: 4, bursts: 0, timeLeft: 15, done: false, success: false };
    const leak = 0.3 + 0.1 * level;
    g.inBand = () => g.p >= g.lo && g.p <= g.hi;
    g.step = (dt) => {
      if (g.done) return;
      g.p = Math.max(0, g.p - leak * dt);
      if (g.inBand()) g.held += dt;
      if (g.held >= g.need) return finish(g, true);
      if ((g.timeLeft -= dt) <= 0) finish(g, false);
    };
    g.input = () => {
      if (g.done) return;
      g.p += 0.09;
      if (g.p > 1) { g.p = 0.3; if (++g.bursts >= 3) finish(g, false); } // over-pumped: relief valve dumps pressure
    };
    return g;
  }

  // Pipes: rotate tiles (tap) until fuel flows from the inlet (left) to the outlet (right).
  // Tile = bitmask N1 E2 S4 W8. The puzzle is built from a real path, then every tile is spun.
  const rot = (m) => ((m << 1) & 15) | (m >> 3);
  function pipes(rng, level) {
    const R = 3, C = 4 + (level > 1 ? 1 : 0);
    const tiles = Array.from({ length: R }, () => new Array(C).fill(0));
    const inRow = Math.floor(rng() * R);
    let row = inRow;
    for (let c = 0; c < C; c++) {
      const exit = Math.floor(rng() * R);
      if (exit === row) tiles[row][c] = 8 | 2;
      else {
        const down = exit > row;
        tiles[row][c] = 8 | (down ? 4 : 1);
        for (let r = Math.min(row, exit) + 1; r < Math.max(row, exit); r++) tiles[r][c] = 1 | 4;
        tiles[exit][c] = (down ? 1 : 4) | 2;
      }
      row = exit;
    }
    const outRow = row;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (!tiles[r][c]) tiles[r][c] = rng() < 0.5 ? 5 : 3; // filler: straight or elbow
      for (let k = Math.floor(rng() * 4); k > 0; k--) tiles[r][c] = rot(tiles[r][c]);
    }
    const g = { kind: 'pipes', R, C, tiles, inRow, outRow, timeLeft: 30, done: false, success: false };
    // Flow: which tiles the inlet reaches through matching openings.
    g.flow = () => {
      const seen = new Set();
      if (!(tiles[inRow][0] & 8)) return seen;
      const stack = [[inRow, 0]];
      const dirs = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // bit, dr, dc, opposite bit
      while (stack.length) {
        const [r, c] = stack.pop();
        const k = `${r},${c}`;
        if (seen.has(k)) continue;
        seen.add(k);
        for (const [bit, dr, dc, opp] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (tiles[r][c] & bit && nr >= 0 && nr < R && nc >= 0 && nc < C && tiles[nr][nc] & opp) stack.push([nr, nc]);
        }
      }
      return seen;
    };
    g.solved = () => g.flow().has(`${outRow},${C - 1}`) && (tiles[outRow][C - 1] & 2) > 0;
    // Never start already solved: turn the inlet piece until the flow is broken.
    for (let k = 0; k < 4 && g.solved(); k++) tiles[inRow][0] = rot(tiles[inRow][0]);
    g.step = (dt) => { if (!g.done && (g.timeLeft -= dt) <= 0) finish(g, false); };
    g.input = (i) => {
      if (g.done || i < 0 || i >= R * C) return;
      const r = Math.floor(i / C), c = i % C;
      tiles[r][c] = rot(tiles[r][c]);
      if (g.solved()) finish(g, true);
    };
    return g;
  }

  // Sensors: one of several readings is out of its normal band. Tap the faulty one, 3 rounds.
  // Values are redrawn every round, and the fault is only slightly out of range. Two wrong taps lose.
  function sensors(rng, level) {
    const n = 6;
    const g = { kind: 'sensors', n, values: [], bad: 0, round: 0, rounds: 3, strikes: 0, timeLeft: 18, done: false, success: false };
    const lo = 0.3, hi = 0.7;
    const roll = () => {
      g.bad = Math.floor(rng() * n);
      g.values = Array.from({ length: n }, (_, i) => (i === g.bad
        ? (rng() < 0.5 ? lo - 0.06 - rng() * 0.08 : hi + 0.06 + rng() * 0.08)
        : lo + 0.04 + rng() * (hi - lo - 0.08)));
    };
    roll();
    g.lo = lo; g.hi = hi;
    g.step = (dt) => { if (!g.done && (g.timeLeft -= dt) <= 0) finish(g, false); };
    g.input = (i) => {
      if (g.done || i < 0 || i >= n) return;
      if (i === g.bad) { if (++g.round >= g.rounds) finish(g, true); else roll(); }
      else if (++g.strikes >= 2) finish(g, false);
    };
    return g;
  }

  // Fuse: add up the current drawn by the devices and fit the smallest fuse that can carry it.
  // input(i) picks fuse i. 3 rounds; two wrong picks lose.
  const FUSES = [5, 10, 15, 20, 25, 30];
  function fuse(rng, level) {
    const g = { kind: 'fuse', fuses: FUSES, loads: [], round: 0, rounds: 3, strikes: 0, timeLeft: 25, done: false, success: false };
    const roll = () => {
      do g.loads = Array.from({ length: 2 + (level > 1 ? 1 : 0) }, () => 2 + Math.floor(rng() * 8));
      while (g.loads.reduce((a, b) => a + b, 0) > 30);
      g.total = g.loads.reduce((a, b) => a + b, 0);
      g.answer = FUSES.findIndex((f) => f >= g.total);
    };
    roll();
    g.step = (dt) => { if (!g.done && (g.timeLeft -= dt) <= 0) finish(g, false); };
    g.input = (i) => {
      if (g.done || i < 0 || i >= FUSES.length) return;
      if (i === g.answer) { if (++g.round >= g.rounds) finish(g, true); else roll(); }
      else if (++g.strikes >= 2) finish(g, false);
    };
    return g;
  }

  // Coolant balance: three loops heat up at different speeds. Tap a loop to vent it.
  // Keep every loop under the red line until the timer runs out (survive = win).
  function balance(rng, level) {
    const n = 3;
    // Loops start cool so the player has a few seconds to read the screen before the first one needs venting.
    const g = { kind: 'balance', n, heat: [0.1, 0.2, 0], rate: [], survive: 12, timeLeft: 12, done: false, success: false };
    for (let i = 0; i < n; i++) g.rate.push(0.06 + rng() * 0.08 + 0.02 * level);
    g.step = (dt) => {
      if (g.done) return;
      g.heat = g.heat.map((h, i) => h + g.rate[i] * dt);
      if (g.heat.some((h) => h >= 1)) return finish(g, false);
      if ((g.timeLeft -= dt) <= 0) finish(g, true);
    };
    g.input = (i) => {
      if (g.done || i < 0 || i >= n) return;
      g.heat[i] = Math.max(0, g.heat[i] - 0.28);
    };
    return g;
  }

  const kinds = { find_leak: findLeak, bolts, pressure, wires, switches, frequency, clogs, pump, pipes, sensors, fuse, balance };
  function create(kind, rng, level) {
    return kinds[kind](rng, level);
  }

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Minigames;
