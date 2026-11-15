// Sound effects synthesised with Web Audio, so there are no asset files to license.
// The AudioContext starts on the first click (browsers block audio before a user gesture).
const Sfx = (function () {
  let ac = null;
  let muted = false;
  try { muted = localStorage.getItem('fm-muted') === '1'; } catch (e) { /* storage blocked: default on */ }

  function ctx() {
    if (!ac) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur, type = 'square', vol = 0.06, delay = 0, slide = 0) {
    const a = !muted && ctx();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.08, cutoff = 800, delay = 0) {
    const a = !muted && ctx();
    if (!a) return;
    const t = a.currentTime + delay;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  }

  return {
    unlock: () => ctx(),
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      try { localStorage.setItem('fm-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      return muted;
    },
    click: () => tone(660, 0.05, 'square', 0.03),
    scan: () => { tone(300, 0.25, 'sine', 0.04, 0, 500); },
    go: () => { tone(880, 0.08, 'square', 0.04); tone(1320, 0.12, 'square', 0.04, 0.08); },
    alarm: () => { for (let i = 0; i < 3; i++) { tone(880, 0.14, 'sawtooth', 0.05, i * 0.3); tone(620, 0.14, 'sawtooth', 0.05, i * 0.3 + 0.15); } },
    hit: () => tone(1040, 0.07, 'square', 0.04),
    miss: () => tone(140, 0.2, 'sawtooth', 0.06),
    fixed: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.04, i * 0.08)),
    sloppy: () => { tone(300, 0.2, 'sawtooth', 0.05); tone(200, 0.3, 'sawtooth', 0.05, 0.18); },
    static: () => noise(0.5, 0.05, 3000),
    tick: () => tone(1200, 0.03, 'square', 0.03),
    count: (n) => tone(n === 0 ? 1320 : 660, n === 0 ? 0.5 : 0.12, 'square', 0.05),
    thrust: () => noise(0.14, 0.05, 260), // call repeatedly while an engine burns
    crash: () => { noise(1.2, 0.3, 500); tone(90, 0.8, 'sawtooth', 0.06, 0, -60); },
    rumble: () => { noise(6, 0.25, 180); noise(3, 0.12, 900, 0.2); },
    win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, i * 0.1)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.05, i * 0.18)),
  };
})();

if (typeof module !== 'undefined') module.exports = Sfx;
