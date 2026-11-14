// Pixel font: a hand-made 5x7 bitmap alphabet drawn on canvas, so labels look like a real pixel game
// without shipping or licensing a font file.
// Usage: give an element the class "px". sync() (called every frame) redraws it as a background image
// whenever its text or state changes. The real text stays in the DOM for screen readers and copy/paste;
// CSS hides it with font-size: 0. Scale comes from the CSS variable --px (default 2), color from `color`.
const PixelText = (function () {
  const G = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ':': ['.', '#', '#', '.', '#', '#', '.'],
    '.': ['..', '..', '..', '..', '..', '##', '##'],
    ',': ['..', '..', '..', '..', '##', '.#', '#.'],
    '!': ['#', '#', '#', '#', '#', '.', '#'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '-': ['....', '....', '....', '####', '....', '....', '....'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '/': ['.....', '....#', '...#.', '..#..', '.#...', '#....', '.....'],
    '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
    ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
    "'": ['#', '#', '.', '.', '.', '.', '.'],
    '·': ['..', '..', '..', '##', '##', '..', '..'],
    '★': ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
    ' ': ['..', '..', '..', '..', '..', '..', '..'],
    '[': ['##', '#.', '#.', '#.', '#.', '#.', '##'],
    ']': ['##', '.#', '.#', '.#', '.#', '.#', '##'],
    '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
    '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
    '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
    '°': ['.#.', '#.#', '.#.', '...', '...', '...', '...'],
    '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
    '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
    '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....'],
    '|': ['#', '#', '#', '#', '#', '#', '#'],
    // Lowercase: 7 rows on the baseline, or 9 rows for letters with a descender (g j p q y).
    "a": [".....",  ".....",  ".###.",  "....#",  ".####",  "#...#",  ".####"],
    "b": ["#....",  "#....",  "####.",  "#...#",  "#...#",  "#...#",  "####."],
    "c": [".....",  ".....",  ".###.",  "#....",  "#....",  "#...#",  ".###."],
    "d": ["....#",  "....#",  ".####",  "#...#",  "#...#",  "#...#",  ".####"],
    "e": [".....",  ".....",  ".###.",  "#...#",  "#####",  "#....",  ".###."],
    "f": ["..##.",  ".#..#",  ".#...",  "###..",  ".#...",  ".#...",  ".#..."],
    "g": [".....",  ".....",  ".####",  "#...#",  "#...#",  "#...#",  ".####",  "....#",  ".###."],
    "h": ["#....",  "#....",  "#.##.",  "##..#",  "#...#",  "#...#",  "#...#"],
    "i": ["..#..",  ".....",  ".##..",  "..#..",  "..#..",  "..#..",  ".###."],
    "j": ["...#.",  ".....",  "..##.",  "...#.",  "...#.",  "...#.",  "...#.",  "#..#.",  ".##.."],
    "k": ["#....",  "#....",  "#..#.",  "#.#..",  "##...",  "#.#..",  "#..#."],
    "l": [".##..",  "..#..",  "..#..",  "..#..",  "..#..",  "..#..",  ".###."],
    "m": [".....",  ".....",  "##.#.",  "#.#.#",  "#.#.#",  "#.#.#",  "#.#.#"],
    "n": [".....",  ".....",  "#.##.",  "##..#",  "#...#",  "#...#",  "#...#"],
    "o": [".....",  ".....",  ".###.",  "#...#",  "#...#",  "#...#",  ".###."],
    "p": [".....",  ".....",  "####.",  "#...#",  "#...#",  "#...#",  "####.",  "#....",  "#...."],
    "q": [".....",  ".....",  ".####",  "#...#",  "#...#",  "#...#",  ".####",  "....#",  "....#"],
    "r": [".....",  ".....",  "#.##.",  "##..#",  "#....",  "#....",  "#...."],
    "s": [".....",  ".....",  ".####",  "#....",  ".###.",  "....#",  "####."],
    "t": [".#...",  ".#...",  "###..",  ".#...",  ".#...",  ".#..#",  "..##."],
    "u": [".....",  ".....",  "#...#",  "#...#",  "#...#",  "#..##",  ".##.#"],
    "v": [".....",  ".....",  "#...#",  "#...#",  "#...#",  ".#.#.",  "..#.."],
    "w": [".....",  ".....",  "#...#",  "#...#",  "#.#.#",  "#.#.#",  ".#.#."],
    "x": [".....",  ".....",  "#...#",  ".#.#.",  "..#..",  ".#.#.",  "#...#"],
    "y": [".....",  ".....",  "#...#",  "#...#",  "#...#",  "#...#",  ".####",  "....#",  ".###."],
    "z": [".....",  ".....",  "#####",  "...#.",  "..#..",  ".#...",  "#####"],
    "\"": ["#.#",  "#.#",  "...",  "...",  "...",  "...",  "..."],
    ";": ["..",  "##",  "##",  "..",  "##",  ".#",  "#."],
    "%": ["##...",  "##..#",  "...#.",  "..#..",  ".#...",  "#..##",  "...##"],
    "&": [".##..",  "#..#.",  "#.#..",  ".#...",  "#.#.#",  "#..#.",  ".##.#"],
    "=": [".....",  ".....",  "#####",  ".....",  "#####",  ".....",  "....."],
  };
  const H = 7;      // cap height in font pixels
  const LINE = 12;  // line pitch for wrapped text: 9 rows (with descenders) + 3 rows gap

  // Typographic quotes and ellipsis map to glyphs the font has; anything else unknown becomes "?".
  const ALIAS = { '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-', '×': 'x' };
  function clean(text) {
    return text.replace(/…/g, '...').replace(/\s+/g, ' ').trim();
  }
  function glyph(ch) {
    const c = ALIAS[ch] || ch;
    return G[c] || G[c.toUpperCase()] || G['?'];
  }

  // Width in font pixels: glyph widths plus 1px spacing between glyphs.
  function measure(text) {
    let w = 0;
    for (const ch of text) w += glyph(ch)[0].length + 1;
    return Math.max(1, w - 1);
  }

  // Greedy word wrap to maxW font pixels. A word longer than a line gets its own line.
  function wrap(text, maxW) {
    if (!maxW) return [text];
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxW) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
    return lines;
  }

  // limit: draw only the first N characters (typewriter), keeping the full text's line breaks.
  function render(lines, scale, color, limit = Infinity) {
    const w = Math.max(...lines.map(measure));
    const tall = lines.some((l) => [...l].some((ch) => glyph(ch).length > H));
    const rows = lines.length > 1 ? (lines.length - 1) * LINE + (tall ? 9 : H) : (tall ? 9 : H);
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = rows * scale;
    const g = c.getContext('2d');
    g.fillStyle = color;
    let left = limit;
    lines.forEach((line, li) => {
      let x = 0;
      for (const ch of line) {
        if (left-- <= 0) return;
        const gl = glyph(ch);
        gl.forEach((row, y) => {
          for (let i = 0; i < row.length; i++) if (row[i] === '#') g.fillRect((x + i) * scale, (li * LINE + y) * scale, scale, scale);
        });
        x += gl[0].length + 1;
      }
      left--; // the space the wrap replaced
    });
    return { url: c.toDataURL(), w: c.width, h: c.height };
  }

  // Redraw only elements whose text, size or state changed since last time.
  // .px = one line, sized to the text. .pxw = wraps to the element's width (for sentences).
  function sync() {
    const bodyCls = document.body.className;
    for (const el of document.querySelectorAll('.px, .pxw')) {
      const text = clean(el.textContent);
      const wrapIt = el.classList.contains('pxw');
      const width = wrapIt ? el.clientWidth : 0;
      if (wrapIt && !width) continue; // hidden: draw once it is visible
      const state = el.closest('li, button, section, .overlay');
      const reveal = el.dataset.reveal === undefined ? Infinity : Number(el.dataset.reveal);
      const key = `${text}|${reveal}|${width}|${el.className}|${state ? state.className : ''}|${bodyCls}|${el.disabled ? 'd' : ''}`;
      if (el._pxKey === key) continue;
      el._pxKey = key;
      if (!text) { el.style.backgroundImage = 'none'; el.style.setProperty('--pxh', '0px'); continue; }
      const cs = getComputedStyle(el);
      const scale = parseInt(cs.getPropertyValue('--px'), 10) || 2;
      const r = render(wrapIt ? wrap(text, Math.floor(width / scale)) : [text], scale, cs.color, reveal);
      el.style.backgroundImage = `url("${r.url}")`;
      el.style.setProperty('--pxw', `${r.w}px`);
      el.style.setProperty('--pxh', `${r.h}px`);
    }
  }

  // Draw straight onto a game canvas (mini-games, scene). y is the top of the capitals.
  function draw(ctx, text, x, y, color, scale = 1, align = 'left') {
    const t = clean(String(text));
    const w = measure(t) * scale;
    let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    ctx.fillStyle = color;
    for (const ch of t) {
      const gl = glyph(ch);
      gl.forEach((row, ry) => {
        for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(cx + i * scale, Math.round(y) + ry * scale, scale, scale);
      });
      cx += (gl[0].length + 1) * scale;
    }
  }

  // Typewriter text straight onto its own canvas: no image encoding per letter, so it stays smooth.
  // Lays out the full text first (lines never jump), then draws only the first `reveal` characters.
  function drawWrapped(canvas, text, maxWidthPx, reveal, scale, color) {
    const lines = wrap(clean(text), Math.max(1, Math.floor(maxWidthPx / scale)));
    const w = Math.max(...lines.map(measure)) * scale;
    const h = (lines.length * LINE - 3) * scale;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    let left = reveal;
    lines.forEach((line, li) => {
      if (left <= 0) return;
      draw(g, line.slice(0, left), 0, li * LINE * scale, color, scale);
      left -= line.length + 1;
    });
  }

  return { sync, draw, drawWrapped, measure, wrap, glyphs: G };
})();

if (typeof module !== 'undefined') module.exports = PixelText;
