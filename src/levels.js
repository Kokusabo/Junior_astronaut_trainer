// Level data. Later missions can be added here as more entries.
// countdown / checkTime are in seconds. failureChance is the odds a check finds a failure.
// eventChance is the odds a clear check is followed by a random event (see events.js).
// pool: this level's failures. Each belongs to one checklist system; no failure appears in two levels.
// intro: what flight control says when the level starts.
// supplies is the starting stock. minStability / minFuel are the go/no-go limits, the same in every
// level because stability and fuel carry over from one level to the next.

const LEVELS = [
  {
    name: 'Pre-launch prep',
    intro: 'Control to technician. Primary inspection starts now. And last time you forgot to check the toilet. Do not repeat that. This is not a request. It is an order.',
    countdown: 180,
    checkTime: 6,
    checkFuelCost: 1,
    failureChance: 0.5,
    eventChance: 0.25,
    pool: ['fuel_leak', 'engine_bolts', 'toilet_clog'],
    minStability: 30,
    minFuel: 25,
    supplies: { sealant: 3, torque_wrench: 3, plumbing_kit: 3 },
  },
  {
    name: 'Fueling and systems',
    intro: 'Good news: the rocket has not exploded yet. Bad news: the day is young. Technical prep, go.',
    countdown: 150,
    checkTime: 4,
    checkFuelCost: 1,
    failureChance: 0.55,
    eventChance: 0.35,
    pool: ['fuel_pressure', 'ignition_wiring', 'flush_pump', 'radio_frequency'],
    minStability: 30,
    minFuel: 25,
    supplies: { pressure_regulator: 3, wire_kit: 3, pump_parts: 3, antenna_relay: 3 },
  },
  {
    name: 'Final countdown',
    intro: 'Final inspection. Every system must be GO before we clear the launch. Including, yes, the toilet.',
    countdown: 150,
    checkTime: 3,
    checkFuelCost: 1,
    failureChance: 0.5,
    eventChance: 0.45,
    pool: ['fuel_blockage', 'throttle_valves', 'fill_sensor', 'comms_fuse', 'coolant_overload'],
    minStability: 30,
    minFuel: 25,
    supplies: { fuel_filter: 3, replacement_valve: 3, diagnostic_module: 3, fuse_pack: 3, coolant: 3 },
  },
];

if (typeof module !== 'undefined') module.exports = { LEVELS };
