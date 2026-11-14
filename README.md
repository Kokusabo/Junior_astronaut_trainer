# First Mission: On the Ground

A pixel-art browser game for the NASA Space Apps Challenge 2026 challenge
"Build a Junior Astronaut Mission Trainer". You are the technician who gets an old rocket ready
for launch: check every system, fix what breaks with the right part and a repair mini-game, and
get a GO before the countdown runs out. Three levels, each with its own checklist and mini-games.

## Play

Open `index.html` in a browser. No install, no build step, no server needed.

## NASA data

On start the game loads real NASA data, and uses it for random events and facts:

- Solar flares from NASA DONKI (CCMC DONKI-API), last 30 days
- Severe storms from NASA EONET
- Spaceflight studies from NASA OSDR (falls back to a saved copy in `data/` when the browser
  blocks the live request)

The DONKI request needs a free key from https://api.nasa.gov. Copy `src/config.example.js` to
`src/config.js` and put your key there. `src/config.js` is git-ignored, so the key stays private.
Without it the game uses `DEMO_KEY`.

To refresh the saved OSDR copy: save
`https://osdr.nasa.gov/osdr/data/search?term=spaceflight&type=cgene&size=25` as
`data/osdr-search-spaceflight.json`, then run `node tools/osdr-snapshot.js`.

## Tests

```
node test/game.test.js
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
