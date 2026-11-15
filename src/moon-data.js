// Mission 2 data: landing sites, cargo items and the lander's fuel budget.
// Fuel is in percent of a full lander tank. Every kg of cargo burns fuel on the way, and some sites cost
// more to reach (the far south needs a more expensive orbit than the equator).
// SITES are placeholders until the team sends the final list.

const MOON = {
  massLimit: 1800,        // kg of cargo the lander can carry
  fuelPerKg: 0.02,        // % of tank per kg of cargo
  landingReserve: 15,     // % of tank needed to land at all
  maneuvers: 8,           // % kept for the course correction and orbit insertion burns on the way
  meanDistanceKm: 384400, // average Earth-Moon distance; trip cost scales with the real distance
};

const MOON_SITES = [
  {
    id: 'tranquility', name: 'Tranquility Base', region: 'Sea of Tranquility (Apollo 11)', lat: 0.67, lon: 23.47,
    reach: 30, roughness: 0.15, ice: false, sunlight: 50, science: 1,
    fact: 'Apollo 11 landed here in 1969. The ground is a flat, old lava plain, so it is the easiest landing on the Moon.',
    photo: 'Apollo 11 landing site',
  },
  {
    id: 'shackleton', name: 'Shackleton ridge', region: 'Lunar south pole', lat: -89.4, lon: -137,
    reach: 46, roughness: 0.75, ice: true, sunlight: 85, science: 3,
    fact: 'The rim near Shackleton crater is lit by the Sun most of the year, while the crater floor never sees sunlight and can trap water ice.',
    photo: 'lunar south pole',
  },
  {
    id: 'malapert', name: 'Malapert Massif', region: 'South pole region', lat: -86, lon: 0,
    reach: 43, roughness: 0.6, ice: true, sunlight: 70, science: 2,
    fact: 'A tall mountain near the south pole with a direct view of Earth, which makes radio contact easier.',
    photo: 'lunar south pole',
  },
  {
    id: 'nobile', name: 'Nobile Rim', region: 'South pole region', lat: -85, lon: 45,
    reach: 44, roughness: 0.55, ice: true, sunlight: 65, science: 2,
    fact: 'The rim of Nobile crater sits next to permanently shadowed areas where water ice may hide.',
    photo: 'lunar south pole',
  },
  {
    id: 'imbrium', name: 'Mare Imbrium', region: 'Sea of Showers', lat: 32.8, lon: -15.6,
    reach: 33, roughness: 0.3, ice: false, sunlight: 50, science: 1,
    fact: 'A huge dark plain made by an ancient impact and filled with lava. Wide and safe, but dry.',
    photo: 'Mare Imbrium',
  },
];

// Cargo. essential: the crew cannot launch without it. use: what it is for (missions 2 and 3).
const MOON_ITEMS = [
  { id: 'oxygen', name: 'Oxygen', kg: 250, essential: true, use: 'Oxygen tanks: air to breathe. No oxygen, no mission.' },
  { id: 'water', name: 'Water', kg: 300, essential: true, use: 'Drinking, cooling and making oxygen. Heavy but vital.' },
  { id: 'food', name: 'Food packs', kg: 200, essential: true, use: 'Two weeks of meals for the crew.' },
  { id: 'habitat', name: 'Habitat', kg: 350, essential: true, use: 'An inflatable home on the surface: pressure, warmth, protection.' },
  { id: 'solar', name: 'Solar panels', kg: 120, use: 'Power during the lunar day. Great at sunny polar rims.' },
  { id: 'batteries', name: 'Batteries', kg: 150, use: 'Power through the long, freezing lunar night.' },
  { id: 'shield', name: 'Storm shelter', kg: 300, use: 'A radiation shield: a water-wall shelter that protects the crew in a solar storm.' },
  { id: 'filters', name: 'Dust filters', kg: 40, use: 'Moon dust is sharp and clogs machines and lungs.' },
  { id: 'medkit', name: 'Medical kit', kg: 30, use: 'For injuries and radiation sickness.' },
  { id: 'repair', name: 'Repair kit', kg: 50, use: 'Patches for hull and habitat leaks.' },
  { id: 'rover', name: 'Rover', kg: 400, use: 'Drive to ice deposits and far science targets.' },
  { id: 'science', name: 'Science kit', kg: 80, use: 'Drills and sensors. Science is why we go.' },
  { id: 'guitar', name: 'Guitar', kg: 8, use: 'Crew morale. Mission control is not convinced.' },
  { id: 'snacks', name: 'Extra snacks', kg: 15, use: 'Crew morale, round two.' },
];

if (typeof module !== 'undefined') module.exports = { MOON, MOON_SITES, MOON_ITEMS };
