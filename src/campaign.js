// The whole trip as one saved campaign: stars per mission and what each mission hands to the next.
// Saved in localStorage (falls back to memory when storage is blocked). Pure otherwise, so Node can test it.
const Campaign = (function () {
  const KEY = 'fm-campaign';
  const empty = () => ({ stars: { m1: 0, m2: 0, m3: 0, m4: 0 }, m1: null, m2: null, m3: null, tutorial: {} });
  let mem = null;
  const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
  function get() {
    const st = store();
    let raw = null;
    try { raw = st ? st.getItem(KEY) : null; } catch (e) { /* blocked */ }
    if (raw) { try { const o = JSON.parse(raw); return { ...empty(), ...o, stars: { ...empty().stars, ...(o.stars || {}) } }; } catch (e) { /* bad data: start fresh */ } }
    return mem ? JSON.parse(JSON.stringify(mem)) : empty();
  }
  // patch: { stars: { m2: 3 }, m1: {...}, tutorial: { dock: true } }: objects merge one level deep.
  function save(patch) {
    const c = get();
    for (const k of Object.keys(patch)) c[k] = patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && c[k] && typeof c[k] === 'object' ? { ...c[k], ...patch[k] } : patch[k];
    mem = c;
    const st = store();
    try { if (st) st.setItem(KEY, JSON.stringify(c)); } catch (e) { /* blocked: memory only */ }
    return c;
  }
  function reset() { mem = empty(); const st = store(); try { if (st) st.removeItem(KEY); } catch (e) { /* ignore */ } }
  const total = (c = get()) => c.stars.m1 + c.stars.m2 + c.stars.m3 + c.stars.m4;
  return { get, save, reset, total };
})();

if (typeof module !== 'undefined') module.exports = Campaign;
