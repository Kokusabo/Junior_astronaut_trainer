// Random events that can hit after a clear system check.
// Effect fields: stability / timeLeft (added), checkPenalty (seconds added to the next check),
// supply: 'random' gives +1 of a supply this level stocks.

const GROUND_EVENTS = [
  { name: 'Weather delay', text: 'Range weather officer reports high winds. Countdown loses 10 s.', effect: { timeLeft: -10 } },
  { name: 'Supply truck', text: 'Supply truck arrived early. +1 spare part.', effect: { supply: 'random' } },
];

// Turns NASA DONKI solar flare rows (FLR API) into events. Only M and X class flares matter here.
function flaresToEvents(rows) {
  const out = [];
  for (const r of rows || []) {
    const cls = String(r.classType || '');
    const date = String(r.peakTime || r.beginTime || '').slice(0, 10);
    if (cls[0] === 'M') {
      out.push({ name: `Solar flare ${cls}`, text: `NASA DONKI: ${cls} solar flare, ${date}. Radio static on the range. Stability -4.`, effect: { stability: -4 } });
    } else if (cls[0] === 'X') {
      out.push({ name: `Solar flare ${cls}`, text: `NASA DONKI: ${cls} solar flare, ${date}. Radio blackout. Stability -8, next check +3 s.`, effect: { stability: -8, checkPenalty: 3 } });
    }
  }
  return out;
}

// Turns NASA EONET severe-storm events into weather holds. Up to 5 storms, newest track point each.
function stormsToEvents(json) {
  const out = [];
  for (const ev of ((json && json.events) || []).slice(0, 5)) {
    const geo = ev.geometry || [];
    const g = geo[geo.length - 1];
    if (!ev.title || !g || !Array.isArray(g.coordinates)) continue;
    const [lon, lat] = g.coordinates;
    const where = `${Math.abs(lat).toFixed(1)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}${lon >= 0 ? 'E' : 'W'}`;
    out.push({
      name: `Storm ${ev.title}`,
      text: `NASA EONET is tracking ${ev.title} at ${where} (${String(g.date).slice(0, 10)}). Weather team re-runs the forecast. Countdown -8 s, stability -3.`,
      effect: { timeLeft: -8, stability: -3 },
    });
  }
  return out;
}

// Turns NASA OSDR study search results into one-line research facts for flight control to read out.
function studiesToFacts(json) {
  const out = [];
  for (const hit of (json && json.hits && json.hits.hits) || []) {
    const st = hit._source || {};
    const id = st.Accession || st['Study Identifier'];
    let title = String(st['Study Title'] || '').replace(/\s+/g, ' ').trim();
    if (!id || !title) continue;
    if (title.length > 140) title = `${title.slice(0, 137)}...`;
    const mission = st.Mission && st.Mission.Name ? `, mission ${st.Mission.Name}` : '';
    out.push(`Real NASA research, ${id}: "${title}"${mission}. Source: NASA OSDR.`);
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { GROUND_EVENTS, flaresToEvents, stormsToEvents, studiesToFacts };
