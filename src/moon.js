// Mission 2 logic: the trip budget. Pure, no DOM, so it runs in Node tests.
const Moon = (function () {
  // Fuel to reach a site: its base cost scaled by how far the Moon really is that day (JPL Horizons).
  function reachCost(site, cfg, distanceKm) {
    return site.reach * ((distanceKm || cfg.meanDistanceKm) / cfg.meanDistanceKm);
  }

  // plan: { site, items: Set of item ids, distanceKm }. Returns everything the planning screen shows.
  function budget(plan, cfg, items) {
    const chosen = items.filter((it) => plan.items.has(it.id));
    const mass = chosen.reduce((a, it) => a + it.kg, 0);
    const siteCost = plan.site ? reachCost(plan.site, cfg, plan.distanceKm) : 0;
    const cargoCost = mass * cfg.fuelPerKg;
    const maneuvers = cfg.maneuvers || 0;
    const fuelLeft = 100 - siteCost - cargoCost - maneuvers;
    const missing = items.filter((it) => it.essential && !plan.items.has(it.id)).map((it) => it.name);
    const problems = [];
    if (!plan.site) problems.push('Pick a landing site.');
    if (missing.length) problems.push(`Missing essentials: ${missing.join(', ')}.`);
    if (mass > cfg.massLimit) problems.push(`Too heavy: ${mass} kg of ${cfg.massLimit} kg allowed.`);
    if (fuelLeft < cfg.landingReserve) problems.push(`Not enough fuel to land: ${Math.max(0, fuelLeft).toFixed(0)}% left, ${cfg.landingReserve}% needed.`);
    return { mass, siteCost, cargoCost, maneuvers, fuelLeft, missing, problems, canLaunch: problems.length === 0 };
  }

  // Earth-Moon distance (km) from a JPL Horizons observer table (QUANTITIES='20', delta in AU), per date.
  const AU_KM = 149597870.7;
  function parseHorizons(json) {
    const text = json && json.result;
    if (typeof text !== 'string') return [];
    const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
    if (a < 0 || b < 0) return [];
    const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const out = [];
    for (const line of text.slice(a + 5, b).split('\n')) {
      const m = line.match(/(\d{4})-([A-Z][a-z]{2})-(\d{2})\s+\d{2}:\d{2}\s+([\d.]+)/);
      if (m && MONTHS[m[2]]) out.push({ date: `${m[1]}-${MONTHS[m[2]]}-${m[3]}`, km: Math.round(Number(m[4]) * AU_KM) });
    }
    return out;
  }

  function horizonsUrl(start, stop) {
    return "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&CENTER='500@399'"
      + `&EPHEM_TYPE='OBSERVER'&QUANTITIES='20'&START_TIME='${start}'&STOP_TIME='${stop}'&STEP_SIZE='1d'`;
  }

  // NASA GIBS (Global Imagery Browse Services) world map as one image, plate carree, for the flight Earth.
  // Layers: BlueMarble_NextGeneration (land/ocean), VIIRS_Black_Marble (city lights),
  // MODIS_Terra_CorrectedReflectance_TrueColor (that day's real clouds; needs date YYYY-MM-DD).
  function gibsUrl(layer, date, w = 512, h = 256) {
    return 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0'
      + `&LAYERS=${layer}&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${w}&HEIGHT=${h}`
      + (date ? `&TIME=${date}` : '');
  }

  // ---------- More live NASA data (parsers are pure; fetching happens in moon-main.js) ----------
  // EPIC (the camera on the DSCOVR satellite, 1.5 million km away): the newest photo of the whole Earth.
  const EPIC_URL = 'https://epic.gsfc.nasa.gov/api/natural';
  function epicLatest(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const e = list[list.length - 1];
    if (!e || typeof e.image !== 'string' || typeof e.date !== 'string') return null;
    const d = e.date.slice(0, 10), c = e.centroid_coordinates || {};
    return { image: e.image, date: d, lat: c.lat, lon: c.lon, url: `https://epic.gsfc.nasa.gov/archive/natural/${d.replace(/-/g, '/')}/thumbs/${e.image}.jpg` };
  }
  // DONKI solar flares: the strongest one in the list. Class letter x number: X1 = 10 x M1 = 100 x C1.
  function flareStrength(cls) {
    const m = /^([ABCMX])(\d+(?:\.\d+)?)/.exec(cls || '');
    return m ? { A: 0.01, B: 0.1, C: 1, M: 10, X: 100 }[m[1]] * Number(m[2]) : 0;
  }
  function strongestFlare(list) {
    if (!Array.isArray(list)) return null;
    let best = null;
    for (const f of list) if (f && flareStrength(f.classType) > (best ? flareStrength(best.classType) : 0)) best = f;
    return best && { classType: best.classType, date: String(best.peakTime || best.beginTime || '').slice(0, 10) };
  }
  const donkiUrl = (start, end) => `https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=${start}&endDate=${end}`;
  // JPL close-approach data: the asteroid that passed nearest to Earth.
  function closestApproach(json) {
    if (!json || !Array.isArray(json.fields) || !Array.isArray(json.data) || !json.data.length) return null;
    const i = (k) => json.fields.indexOf(k);
    const row = json.data.reduce((a, r) => (Number(r[i('dist')]) < Number(a[i('dist')]) ? r : a));
    return { name: row[i('des')], date: String(row[i('cd')]).slice(0, 11), km: Math.round(Number(row[i('dist')]) * AU_KM), kms: Number(Number(row[i('v_rel')]).toFixed(1)) };
  }
  const cadUrl = (start, end) => `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${start}&date-max=${end}&dist-max=0.05&sort=dist`;

  // ---------- Flight to the Moon (cockpit) ----------
  // About a minute of game time for the ~3-day coast. Three events happen on the way; each needs a
  // player action and some are only survivable well with the right cargo (shield, repair kit).
  const FLIGHT = { duration: 60, departure: 3, events: [[0.22, 'burn'], [0.5, 'storm'], [0.78, 'meteor'], [0.97, 'brake']], cruiseDose: 0.08 };
  // Brake (lunar orbit insertion): speed starts at 1 and must end inside this window to be captured.
  const CAPTURE = { lo: 0.35, hi: 0.55 };

  function startFlight(plan, b, rng, reserve = 15) {
    return {
      reserve,
      // the burns on the way use the maneuver allowance
      progress: 0, t: 0, fuel: b.fuelLeft + (b.maneuvers || 0), hull: 100, health: 100, dose: 0, mass: b.mass,
      has: (id) => plan.items.has(id), rng, event: null, next: 0, log: [], status: 'flying', reason: '',
    };
  }

  function newEvent(f, kind) {
    if (kind === 'burn') {
      const sign = f.rng() < 0.5 ? -1 : 1;
      // aimError: how far off the trans-lunar injection burn was (0 = perfect). A worse aim = a bigger fix.
      const dev = f.aimError === undefined ? 0.55 : Math.min(0.85, 0.4 + f.aimError * 0.04);
      return { kind, dev: dev * sign, sign, holding: false, timeLeft: 14, done: false };
    }
    if (kind === 'storm') {
      // A real flare (NASA DONKI) sets how strong the particle storm is: C class mild, X class severe.
      const power = f.flare ? Math.max(0.6, Math.min(1.8, 0.6 + Math.log10(Math.max(1, flareStrength(f.flare.classType))) * 0.45)) : 1;
      return { kind, timeLeft: 7, sheltered: false, done: false, power, flare: f.flare || null };
    }
    if (kind === 'brake') return { kind, speed: 1, holding: false, timeLeft: 10, done: false };
    return { kind: 'meteor', timeLeft: 9, patches: 0, need: 3, done: false };
  }

  // Heavier ships turn slower: the burn moves the needle less per second and costs more fuel.
  const burnRate = (mass) => 0.42 * (1400 / (1400 + mass));

  function finishEvent(f, ok, msg) {
    f.event.done = true;
    f.event.ok = ok;
    f.log.push(msg);
    f.lastEvent = { kind: f.event.kind, ok, msg };
    f.event = null;
  }

  function stepFlight(f, dt) {
    if (f.status !== 'flying') return;
    f.t += dt;
    if (f.t < FLIGHT.departure) { f.departing = true; return; } // trans-lunar injection burn plays first
    f.departing = false;
    const e = f.event;
    if (!e) {
      f.progress = Math.min(1, f.progress + dt / FLIGHT.duration);
      f.dose += FLIGHT.cruiseDose * dt;
      const ev = FLIGHT.events[f.next];
      if (ev && f.progress >= ev[0]) { f.next++; f.event = newEvent(f, ev[1]); f.event.total = f.event.timeLeft; }
      if (f.progress >= 1) {
        // Reaching the Moon without the landing reserve means the landing cannot be attempted.
        if (f.fuel < f.reserve) { f.status = 'lowfuel'; f.reason = `Lunar orbit reached, but only ${Math.max(0, Math.round(f.fuel))}% fuel is left and the landing needs ${f.reserve}%. Mission aborted.`; }
        else { f.status = 'orbit'; f.log.push('Lunar orbit reached.'); }
      }
      return;
    }
    e.timeLeft -= dt;
    if (e.kind === 'burn') {
      e.dev += 0.03 * e.sign * dt; // the error keeps growing until corrected
      if (e.holding) { e.dev -= e.sign * burnRate(f.mass) * dt; f.fuel -= (0.6 + f.mass / 2000) * dt; }
      if (e.dev * e.sign < -0.18) { f.fuel -= 6; finishEvent(f, false, 'Overburn! Second correction needed: fuel -6%.'); }
      else if (e.timeLeft <= 0) { f.fuel -= 8; f.health -= 5; finishEvent(f, false, 'Course not corrected in time: a longer trip, fuel -8%.'); }
    } else if (e.kind === 'brake') {
      if (e.holding) { e.speed = Math.max(0, e.speed - burnRate(f.mass) * 0.9 * dt); f.fuel -= (0.8 + f.mass / 1500) * dt; }
      if (e.speed < CAPTURE.lo - 0.15) { f.fuel -= 5; finishEvent(f, false, 'Braked too hard: an unstable low orbit. Correction burn: fuel -5%.'); }
      else if (e.timeLeft <= 0) {
        if (e.speed > CAPTURE.hi) { f.fuel -= 10; f.health -= 5; finishEvent(f, false, 'Too fast: we swung past the Moon and had to loop back. Fuel -10%.'); }
        else finishEvent(f, true, 'Captured into lunar orbit.');
      }
    } else if (e.kind === 'storm') {
      f.dose += (e.sheltered ? 0.3 : 4) * (e.power || 1) * dt;
      if (e.timeLeft <= 0) {
        if (e.sheltered) finishEvent(f, true, 'Storm passed. The water wall kept the crew safe.');
        else { const hit = Math.round(30 * (e.power || 1)); f.health -= hit; finishEvent(f, false, f.has('shield') ? `Too slow to shelter: crew health -${hit}.` : `No radiation shield on board: crew health -${hit}.`); }
      }
    } else if (e.kind === 'meteor') {
      f.hull -= 2.5 * dt; f.fuel -= 0.4 * dt; // leaking until patched
      if (e.timeLeft <= 0) {
        f.hull -= 15;
        finishEvent(f, false, f.has('repair') ? 'Patch not finished in time: hull -15.' : 'No repair kit: the leak was sealed with tape. Hull -15.');
      }
    }
    if (f.health <= 0) { f.status = 'lost'; f.reason = 'The crew could not continue. Mission aborted.'; }
    else if (f.hull <= 0) { f.status = 'lost'; f.reason = 'The hull failed. Mission aborted.'; }
    else if (f.fuel <= 0) { f.status = 'lost'; f.reason = 'Out of fuel before reaching the Moon.'; }
  }

  // Player actions. burn: hold true/false; release inside the band = success.
  function flightAction(f, action, value) {
    const e = f.event;
    if (!e || f.status !== 'flying') return false;
    if (e.kind === 'burn' && action === 'burn') {
      if (value) { e.holding = true; return true; }
      e.holding = false;
      if (Math.abs(e.dev) < 0.08) finishEvent(f, true, 'Course corrected. Right on target.');
      return true;
    }
    if (e.kind === 'brake' && action === 'burn') {
      e.holding = !!value;
      if (!value && e.speed >= CAPTURE.lo && e.speed <= CAPTURE.hi) finishEvent(f, true, 'Captured into lunar orbit. Perfect brake.');
      return true;
    }
    if (e.kind === 'storm' && action === 'shelter') {
      if (!f.has('shield')) return false;
      e.sheltered = true;
      return true;
    }
    if (e.kind === 'meteor' && action === 'patch') {
      if (!f.has('repair')) return false;
      if (++e.patches >= e.need) finishEvent(f, true, 'Leak patched. Hull holding.');
      return true;
    }
    return false;
  }

  // HUD readouts. Speed in km/s, shaped like a real trip: about 10.9 after the departure burn, slowing
  // to about 1 as Earth's gravity pulls back, then speeding up again as the Moon pulls the ship in.
  function speedKms(p) {
    return 1 + 9.9 * Math.exp(-p * 6) + 1.5 * Math.pow(Math.max(0, (p - 0.8) / 0.2), 2);
  }
  function missionClock(p) { // about three days to the Moon
    const h = p * 72;
    return `${Math.floor(h / 24)}d ${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.floor((h * 60) % 60)).padStart(2, '0')}`;
  }

  return { reachCost, budget, parseHorizons, horizonsUrl, gibsUrl, EPIC_URL, epicLatest, flareStrength, strongestFlare, donkiUrl, closestApproach, cadUrl, FLIGHT, CAPTURE, startFlight, stepFlight, flightAction, burnRate, speedKms, missionClock };
})();

if (typeof module !== 'undefined') module.exports = Moon;
