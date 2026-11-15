// Mission 2 tests. Run with: node test/moon.test.js
const assert = require('node:assert/strict');
const { MOON, MOON_SITES, MOON_ITEMS } = require('../src/moon-data.js');
const Moon = require('../src/moon.js');

const ids = (list) => new Set(list);
const essentials = MOON_ITEMS.filter((i) => i.essential).map((i) => i.id);

// Data: unique ids, positive masses, essentials exist.
assert.equal(new Set(MOON_ITEMS.map((i) => i.id)).size, MOON_ITEMS.length);
assert.equal(new Set(MOON_SITES.map((s) => s.id)).size, MOON_SITES.length);
assert.ok(MOON_ITEMS.every((i) => i.kg > 0));
assert.ok(essentials.length >= 3);

// Budget: no site or missing essentials or too heavy or too little fuel = cannot launch.
{
  const site = MOON_SITES[0];
  assert.equal(Moon.budget({ site: null, items: ids(essentials) }, MOON, MOON_ITEMS).canLaunch, false);
  const missing = Moon.budget({ site, items: ids(essentials.slice(1)) }, MOON, MOON_ITEMS);
  assert.equal(missing.canLaunch, false);
  assert.equal(missing.missing.length, 1);
  const ok = Moon.budget({ site, items: ids(essentials) }, MOON, MOON_ITEMS);
  assert.equal(ok.canLaunch, true, ok.problems.join(' '));
  assert.equal(ok.mass, MOON_ITEMS.filter((i) => i.essential).reduce((a, i) => a + i.kg, 0));
  assert.ok(Math.abs(ok.fuelLeft - (100 - site.reach - ok.mass * MOON.fuelPerKg - MOON.maneuvers)) < 1e-9);
  const all = Moon.budget({ site, items: ids(MOON_ITEMS.map((i) => i.id)) }, MOON, MOON_ITEMS);
  assert.equal(all.canLaunch, false, 'taking everything is never allowed');
}

// Every site can be reached with just the essentials, and a farther Moon costs more fuel.
for (const site of MOON_SITES) {
  const b = Moon.budget({ site, items: ids(essentials) }, MOON, MOON_ITEMS);
  assert.ok(b.canLaunch, `${site.name}: ${b.problems.join(' ')}`);
  assert.ok(Moon.reachCost(site, MOON, 406000) > Moon.reachCost(site, MOON, 357000));
}

// JPL Horizons parsing: AU to km, dates in ISO form; the saved copy parses into real-looking distances.
{
  const text = 'header\n$$SOE\n 2026-Nov-14 00:00     0.00271137476442  -0.0031111\n 2026-Nov-15 00:00     0.00270582095749  -0.0163153\n$$EOE\n';
  const d = Moon.parseHorizons({ result: text });
  assert.equal(d.length, 2);
  assert.equal(d[0].date, '2026-11-14');
  assert.ok(Math.abs(d[0].km - 405618) < 50, `${d[0].km}`);
  assert.deepEqual(Moon.parseHorizons(null), []);
  const snap = require('../data/horizons-moon.js');
  assert.ok(snap.days.length >= 30 && snap.days.every((x) => x.km > 350000 && x.km < 410000));
}

// Flight: reaches orbit when events are handled well; missing cargo hurts; heavy ships burn more fuel.
{
  const site = MOON_SITES[0];
  const plan = (extra) => ({ site, items: ids([...essentials, ...extra]) });
  const fly = (p, play) => {
    const b = Moon.budget(p, MOON, MOON_ITEMS);
    const f = Moon.startFlight(p, b, () => 0.3);
    for (let i = 0; i < 4000 && f.status === 'flying'; i++) { play(f); Moon.stepFlight(f, 0.05); }
    return f;
  };
  // Good pilot: burns until centred then releases, shelters at once, patches at once.
  const good = (f) => {
    const e = f.event;
    if (!e) return;
    if (e.kind === 'burn') {
      if (!e.holding && Math.abs(e.dev) >= 0.08) Moon.flightAction(f, 'burn', true);
      else if (e.holding && Math.abs(e.dev) < 0.05) Moon.flightAction(f, 'burn', false);
    }
    if (e.kind === 'brake') {
      if (!e.holding && e.speed > 0.5) Moon.flightAction(f, 'burn', true);
      else if (e.holding && e.speed <= 0.45) Moon.flightAction(f, 'burn', false);
    }
    if (e.kind === 'storm' && !e.sheltered) Moon.flightAction(f, 'shelter');
    if (e.kind === 'meteor') Moon.flightAction(f, 'patch');
  };
  const ok = fly(plan(['shield', 'repair']), good);
  assert.equal(ok.status, 'orbit', ok.reason);
  assert.ok(ok.health === 100 && ok.hull > 90, `health ${ok.health} hull ${ok.hull}`);
  assert.equal(ok.log.filter((m) => /corrected|passed|patched|Captured/.test(m)).length, 4, ok.log.join(' | '));
  // No shield and no repair kit: the storm and the leak hurt.
  const bare = fly(plan([]), good);
  assert.ok(bare.health <= 70 && bare.hull <= 85, `health ${bare.health} hull ${bare.hull}`);
  // Doing nothing at all still ends the flight (no endless events).
  const idle = fly(plan(['shield', 'repair']), () => {});
  assert.notEqual(idle.status, 'flying');
  // Arriving below the landing reserve is not a success.
  const thin = fly(plan(['shield', 'repair']), (f) => { good(f); if (f.progress > 0.95) f.fuel = Math.min(f.fuel, 10); });
  assert.equal(thin.status, 'lowfuel', thin.status);
  // Speed readout follows a real trip's shape: fast at departure, slowest late in the coast, faster near the Moon.
  assert.ok(Moon.speedKms(0) > 10 && Moon.speedKms(0.75) < 1.5 && Moon.speedKms(1) > Moon.speedKms(0.75));
  assert.equal(Moon.missionClock(0.5), '1d 12:00');
  // Heavier cargo: the burn is slower.
  assert.ok(Moon.burnRate(1700) < Moon.burnRate(1100));
  // Overburn: holding too long fails the correction.
  const over = fly(plan(['shield', 'repair']), (f) => { if (f.event && f.event.kind === 'burn' && !f.event.holding) Moon.flightAction(f, 'burn', true); });
  assert.ok(over.log.some((m) => m.startsWith('Overburn')), over.log.join(' | '));
}

// A worse TLI aim makes the first course correction bigger.
{
  const plan = { site: MOON_SITES[0], items: ids(essentials) }, b = Moon.budget(plan, MOON, MOON_ITEMS);
  const devAt = (aim) => { const f = Moon.startFlight(plan, b, () => 0.9, 15); f.aimError = aim; f.t = 5; f.progress = Moon.FLIGHT.events[0][0]; Moon.stepFlight(f, 0.01); return Math.abs(f.event.dev); };
  assert.ok(devAt(0) < devAt(6) && devAt(6) < devAt(12) && devAt(12) <= 0.86);
}

// NASA parsers: EPIC newest photo, DONKI strongest flare, JPL closest asteroid.
{
  const e = Moon.epicLatest([{ image: 'epic_1b_a', date: '2026-11-11 10:00:00' }, { image: 'epic_1b_b', date: '2026-11-12 19:52:09', centroid_coordinates: { lat: -12, lon: -132 } }]);
  assert.equal(e.url, 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/12/thumbs/epic_1b_b.jpg');
  assert.equal(Moon.epicLatest([]), null);
  assert.ok(Moon.flareStrength('X1.0') > Moon.flareStrength('M9.9') && Moon.flareStrength('M1.0') > Moon.flareStrength('C5.0'));
  assert.deepEqual(Moon.strongestFlare([{ classType: 'C3.1', peakTime: '2026-11-01T01:00Z' }, { classType: 'M2.0', peakTime: '2026-11-03T02:00Z' }, { classType: null }]), { classType: 'M2.0', date: '2026-11-03' });
  const cad = { fields: ['des', 'cd', 'dist', 'v_rel'], data: [['A', '2026-Nov-01 10:00', '0.02', '5.1'], ['B', '2026-Nov-11 15:14', '0.00021', '12.34']] };
  assert.deepEqual(Moon.closestApproach(cad), { name: 'B', date: '2026-Nov-11', km: 31416, kms: 12.3 });
  // A bigger real flare makes the unsheltered storm hurt more.
  const plan = { site: MOON_SITES[0], items: ids(essentials) }, b = Moon.budget(plan, MOON, MOON_ITEMS);
  const hurt = (cls) => { const f = Moon.startFlight(plan, b, () => 0.3, 15); f.flare = cls && { classType: cls, date: 'x' }; f.t = 5; f.progress = 0.5; f.next = 1; for (let i = 0; i < 400 && f.status === 'flying' && f.next < 3; i++) Moon.stepFlight(f, 0.05); return 100 - f.health; };
  assert.ok(hurt('X2.0') > hurt('C1.0'));
}

// NASA GIBS world map URL.
{
  const u = Moon.gibsUrl('MODIS_Terra_CorrectedReflectance_TrueColor', '2026-11-14');
  assert.ok(u.startsWith('https://gibs.earthdata.nasa.gov/') && u.includes('LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor') && u.includes('TIME=2026-11-14'));
  assert.ok(!Moon.gibsUrl('BlueMarble_NextGeneration').includes('TIME='));
}

console.log('All mission 2 tests passed.');
