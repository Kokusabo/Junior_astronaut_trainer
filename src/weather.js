// Launch weather: real daily weather at Kennedy Space Center (NASA POWER) turned into GO / NO-GO days.
// Rules are a simplified version of real launch weather commit criteria. Pure logic, no DOM.
const Weather = (function () {
  const KSC = { lat: 28.57, lon: -80.65 };
  const LIMITS = { storm: 20, rain: 2, wind: 11, cold: 4 }; // mm/day, mm/day, m/s peak, deg C

  // One day of NASA POWER values -> a launch-weather verdict.
  // risk = chance a launch on this day ends in failure (0 on GO days).
  function dayFromPower(date, wind, rain, temp) {
    const d = { date, wind, rain, temp, go: false, risk: 0, kind: 'sun', reason: '' };
    if (rain >= LIMITS.storm) Object.assign(d, { kind: 'storm', risk: 0.9, reason: `Thunderstorms, ${Math.round(rain)} mm of rain. Lightning risk.` });
    else if (rain >= LIMITS.rain) Object.assign(d, { kind: 'rain', risk: Math.min(0.7, 0.4 + (rain - LIMITS.rain) / 60), reason: `Rain, ${rain.toFixed(1)} mm. No launch through precipitation.` });
    else if (wind >= LIMITS.wind) Object.assign(d, { kind: 'wind', risk: 0.7, reason: `Ground winds ${wind.toFixed(1)} m/s, over the ${LIMITS.wind} m/s limit.` });
    else if (temp <= LIMITS.cold) Object.assign(d, { kind: 'cold', risk: 0.5, reason: `Too cold: ${temp.toFixed(1)} C. Seals and fuel lines stiffen.` });
    else Object.assign(d, { go: true, kind: wind >= 7 ? 'cloud' : 'sun', reason: `Wind ${wind.toFixed(1)} m/s, ${rain.toFixed(1)} mm rain, ${temp.toFixed(0)} C. GO.` });
    return d;
  }

  // NASA POWER daily JSON -> list of days (skips days with missing values, -999).
  function parsePower(json) {
    const p = json && json.properties && json.properties.parameter;
    if (!p || !p.WS10M_MAX || !p.PRECTOTCORR || !p.T2M) return [];
    const out = [];
    for (const key of Object.keys(p.T2M).sort()) {
      const wind = p.WS10M_MAX[key], rain = p.PRECTOTCORR[key], temp = p.T2M[key];
      if ([wind, rain, temp].some((v) => typeof v !== 'number' || v <= -999)) continue;
      out.push(dayFromPower(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`, wind, rain, temp));
    }
    return out;
  }

  // Choose a real 7-day stretch with 2 to 4 GO days, so every game can be won but needs a choice.
  // Falls back to the stretch closest to that range if the data has none.
  function pickWindow(days, rng) {
    const starts = [];
    for (let i = 0; i + 7 <= days.length; i++) starts.push(i);
    if (!starts.length) return days.slice(0, 7);
    const goCount = (i) => days.slice(i, i + 7).filter((d) => d.go).length;
    let good = starts.filter((i) => goCount(i) >= 2 && goCount(i) <= 4);
    if (!good.length) {
      const dist = (i) => Math.abs(goCount(i) - 3);
      const best = Math.min(...starts.map(dist));
      good = starts.filter((i) => dist(i) === best);
    }
    const i = good[Math.floor(rng() * good.length)];
    return days.slice(i, i + 7);
  }

  function powerUrl(start, end) {
    return 'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=WS10M_MAX,PRECTOTCORR,T2M'
      + `&community=RE&longitude=${KSC.lon}&latitude=${KSC.lat}&start=${start}&end=${end}&format=JSON`;
  }

  return { dayFromPower, parsePower, pickWindow, powerUrl, LIMITS, KSC };
})();

if (typeof module !== 'undefined') module.exports = Weather;
