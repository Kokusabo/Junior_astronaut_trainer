// Failure table and spare-part supplies. Each failure is fixed by exactly one supply.
// Every level has its own failures (no problem repeats between levels), each with its own mini-game.
// system: its checklist row (every level has its own checklist). zone: which part of the rocket the scan
// and the fault effects use: fuel, engine, cabin, antenna, avionics or cooling.
// radio: what flight control says when a check finds this failure.
// minigame: id from minigames.js. Later levels use harder game types.
// drain: amount lost per second while the failure stays unrepaired.

const SUPPLIES = {
  sealant: { name: 'Sealant tube' },
  torque_wrench: { name: 'Torque wrench' },
  plumbing_kit: { name: 'Plumbing kit' },
  pressure_regulator: { name: 'Pressure regulator' },
  wire_kit: { name: 'Wire kit' },
  pump_parts: { name: 'Pump parts' },
  antenna_relay: { name: 'Antenna relay' },
  fuel_filter: { name: 'Fuel filter' },
  replacement_valve: { name: 'Spare valve' },
  diagnostic_module: { name: 'Diagnostic module' },
  fuse_pack: { name: 'Fuse pack' },
  coolant: { name: 'Coolant' },
};

const FAILURES = {
  // ---------- Level 1: primary inspection (easy games) ----------
  fuel_leak: {
    name: 'Fuel leak', system: 'Fuel lines', zone: 'fuel',
    radio: 'WARNING: fuel leak detected. Cause: unknown. Most likely someone forgot to close a valve.',
    fix: 'sealant', minigame: 'find_leak', drain: { fuel: 1 },
    fact: 'Propellant seals and fittings are checked before every launch, because even a small leak wastes fuel and can be dangerous.',
  },
  engine_bolts: {
    name: 'Loose engine bolts', system: 'Engine mounts', zone: 'engine',
    radio: 'Engine 2 reports it does not want to work. Recommend a technical conversation.',
    fix: 'torque_wrench', minigame: 'bolts', drain: { stability: 1 },
    fact: 'Engine parts are tightened in a set order to an exact torque, because uneven bolts can work loose under launch vibration.',
  },
  toilet_clog: {
    name: 'Toilet clog', system: 'Toilet', zone: 'cabin',
    radio: 'I repeat: THE TOILET IS NOT WORKING. We do not send people to space with a broken toilet.',
    fix: 'plumbing_kit', minigame: 'clogs', drain: { stability: 0.5 },
    fact: 'Space toilets use airflow instead of gravity to pull waste away, so a blocked hose or fan stops the whole system.',
  },

  // ---------- Level 2: technical preparation (medium games) ----------
  fuel_pressure: {
    name: 'Low fuel pressure', system: 'Fuel tanks', zone: 'fuel',
    radio: 'Fuel pressure is dropping. The rocket would like to remind you it cannot fly on hope.',
    fix: 'pressure_regulator', minigame: 'pressure', drain: { fuel: 1 },
    fact: 'Propellant tanks are pressurised so fuel flows steadily into the engines; too little pressure can starve them.',
  },
  ignition_wiring: {
    name: 'Ignition wiring fault', system: 'Ignition', zone: 'engine',
    radio: 'Ignition test failed. Someone labelled every single wire "important".',
    fix: 'wire_kit', minigame: 'wires', drain: { stability: 1 },
    fact: 'Some rocket engines need an igniter to start, while others use propellants that ignite on contact with each other.',
  },
  flush_pump: {
    name: 'Flush pump failure', system: 'Toilet pump', zone: 'cabin',
    radio: 'Flush pump failure. Again. Mission control is not amused.',
    fix: 'pump_parts', minigame: 'pump', drain: { stability: 0.5 },
    fact: 'On the space station, water from the toilet system is cleaned and recycled back into drinking water.',
  },
  radio_frequency: {
    name: 'Lost radio frequency', system: 'Radio', zone: 'antenna',
    radio: 'Control to pad, do you copy? If you can hear this, we cannot hear you.',
    fix: 'antenna_relay', minigame: 'frequency', drain: { stability: 1 },
    fact: 'Ground teams rely on telemetry to make decisions, so losing the signal means flying blind.',
  },

  // ---------- Level 3: final inspection (hard games) ----------
  fuel_blockage: {
    name: 'Blocked fuel line', system: 'Fuel filters', zone: 'fuel',
    radio: 'Fuel line blocked. Probably a sandwich. Again.',
    fix: 'fuel_filter', minigame: 'pipes', drain: { fuel: 0.8 },
    fact: 'Filters in the fuel lines catch tiny particles, because even a small speck can block an engine injector.',
  },
  throttle_valves: {
    name: 'Throttle valves misset', system: 'Throttle valves', zone: 'engine',
    radio: 'Throttle valves are set wrong. Engine 2 wants full power, Engine 1 wants a nap.',
    fix: 'replacement_valve', minigame: 'switches', drain: { stability: 0.8 },
    fact: 'Valves set how much propellant reaches each engine, which controls how much thrust it makes.',
  },
  fill_sensor: {
    name: 'Faulty fill sensor', system: 'Toilet sensors', zone: 'cabin',
    radio: 'The toilet tank sensor says it is 300 percent full. It is not. Please check the sensors.',
    fix: 'diagnostic_module', minigame: 'sensors', drain: { stability: 0.5 },
    fact: 'Thousands of sensor readings are watched during a countdown; one bad sensor can trigger an automatic hold.',
  },
  comms_fuse: {
    name: 'Blown comms fuse', system: 'Electrical', zone: 'avionics',
    radio: 'Critical error: no power to comms. Cause: someone unplugged it to charge a phone.',
    fix: 'fuse_pack', minigame: 'fuse', drain: { stability: 0.8 },
    fact: 'A fuse protects electronics by breaking the circuit when more current flows than the wires can safely carry.',
  },
  coolant_overload: {
    name: 'Coolant loop overload', system: 'Life support', zone: 'cooling',
    radio: 'Cabin temperature is 38 degrees. Reminder: this is a spacecraft, not a sauna.',
    fix: 'coolant', minigame: 'balance', drain: { stability: 1 },
    fact: 'Electronics and engines overheat quickly without coolant, so cooling loops are among the first things checked.',
  },
};

if (typeof module !== 'undefined') module.exports = { SUPPLIES, FAILURES };
