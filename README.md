# First Mission: On the Ground

A pixel-art browser game for the NASA Space Apps Challenge 2026 challenge
"Build a Junior Astronaut Mission Trainer". You are the technician who gets an old rocket ready
for launch: check every system, fix what breaks with the right part and a repair mini-game, and
get a GO before the countdown runs out. Three levels, each with its own checklist and mini-games.

## Play

Open `index.html` in a browser for mission 1 (Earth: get the rocket ready and launch).
Open `moon.html` for mission 2 (Moon: plan the trip, in progress).
No install, no build step, no server needed.

## NASA data

On start the game loads real NASA data, and uses it for random events and facts:

- Solar flares from NASA DONKI (CCMC DONKI-API), last 30 days
- Severe storms from NASA EONET
- Spaceflight studies from NASA OSDR (falls back to a saved copy in `data/` when the browser
  blocks the live request)
- Launch weather at Kennedy Space Center from NASA POWER (saved copy: `tools/power-snapshot.js`)
- Mission 2: real Earth-Moon distance from NASA JPL Horizons (saved copy: `tools/horizons-snapshot.js`)
  and landing-site photos from the NASA Image and Video Library
- Mission 2 launch: steer the gravity turn, fly through Max Q, separate the stages, reach orbit (`src/launch.js`, test shortcut `moon.html#launch`)
- Mission 2 Earth orbit: the trans-lunar injection burn in the right window, real two-body gravity (`src/tli.js`, test shortcut `moon.html#orbit`)
- Mission 4 back to Earth (`earth.html`): lift off from the Moon, dock with Orion (`src/dock.js`), burn for Earth, the flight home, re-entry (service module drops, heat shield first), self-opening parachutes you keep upright, and splashdown in the Pacific (`src/reentry.js`)
- Mission select (centred cards) on the start screen, one saved campaign across all four missions (`src/campaign.js`: stars, Mission 1 fuel bonus into Mission 2), and an optional tutorial (`tutorial.html`): illustrated chapters with live autopilot demos plus five practice drills (lift-off, docking, burn window, landing, re-entry)
- Mission 3 moonwalks (`surface.html`): three EVAs at the landing site (real LRO terrain), cargo from Mission 2 decides what you can do, ice becomes fuel for the trip home (`src/surface.js`)
- Mission 2 real NASA extras: EPIC photo of Earth today (DSCOVR), the strongest solar flare of the month (DONKI) sets the storm strength, the closest asteroid flyby (JPL), real LRO LOLA elevation shapes the landing hills (saved copy: `tools/moon-nasa-snapshot.js`)
- Mission 2 landing: lidar hazard scan, landing point marker, the Apollo 11 1202 alarm and fuel callouts (`src/landing.js`, test shortcut `moon.html#landing=shackleton`)
- Mission 2 flight Earth: NASA GIBS maps (Blue Marble, Black Marble city lights, and yesterday's MODIS Terra clouds, fetched live; saved copy: `tools/earth-snapshot.js`)

The DONKI request needs a free key from https://api.nasa.gov. Copy `src/config.example.js` to
`src/config.js` and put your key there. `src/config.js` is git-ignored, so the key stays private.
Without it the game uses `DEMO_KEY`.

To refresh the saved OSDR copy: save
`https://osdr.nasa.gov/osdr/data/search?term=spaceflight&type=cgene&size=25` as
`data/osdr-search-spaceflight.json`, then run `node tools/osdr-snapshot.js`.

## Tests

```
node test/game.test.js
node test/moon.test.js
```

Needs Node.js. Covers game rules, every mini-game, and balance (a simulated good player).

## Code map

- `src/game.js` – game rules, no DOM (testable in Node)
- `src/levels.js`, `src/failures.js`, `src/events.js` – level, failure and event data
- `src/minigames.js` – repair mini-game rules
- `src/render.js` – launch pad scene, icons and portrait, drawn from code
- `src/pixeltext.js` – hand-made pixel font
- `src/sfx.js` – synthesised sound effects
- `src/main.js` – browser glue: HUD, overlays, NASA data loading

All art and sound are generated in code, so there are no third-party assets to license.
