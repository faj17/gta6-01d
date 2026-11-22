# SOLMARA — Open-World Crime in a Sun-Soaked City

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/faj17/gta6-01d/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/faj17/gta6-01d/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for [Make GTA 6](https://make.fun/bounty/gta6-01) on [make.fun](https://make.fun/) — a complete open-world crime game that runs offline in a desktop browser from static files, built with three.js (vendored) and plain JavaScript.

## The game

Rook is a getaway driver who owes the fixer **Vera Kade $12,000**. Four jobs stand between him and a clean slate, across Solmara — a fictional sun-soaked coastal city of boulevards, downtown towers, a docks district, suburbs and a beach.

- **A city to explore** on foot and by car: a road grid with traffic, pedestrians, palms, streetlights and a teal sea along the south edge.
- **Cars to steal and drive**: arcade handling, handbrake turns, collisions, a reset key for stuck cars. Stealing in view of anyone raises the heat.
- **A wanted system with police**: 0–5 stars, police cars that spawn at the map edge and ram you, stars that drain after 12 clean seconds. Get busted and you wake at St. Marina Hospital, $500 lighter.
- **Four chained missions with a story**: First Pickup, Hot Wheels, Getaway, The Drop — each paying the debt down until Solmara is free roam and your cash is the score.
- **A HUD with a minimap**: cash, debt, health, wanted stars, speed, objective line, mission banners, and a live top-down minimap with the mission blip and police dots.
- **Start screen and save**: title screen with New Game / Continue, pause menu, progress saved to localStorage on every job and on exit.
- **Procedural sound**: engine hum pitched by speed, a two-tone police siren, pickup blips, a mission jingle and crash thuds — all synthesized in WebAudio, no audio files. M mutes.

## Controls

WASD move / drive · mouse-drag to look · E get in / steal a car · SPACE handbrake · SHIFT run · R reset a stuck car · M mute · ESC pause & save.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server. No build step, no network requests — every script, texture and sound is a file under `game/` or generated at runtime.

## Structure

- `game/index.html` — page, HUD DOM, import map (`three` → vendored three.js)
- `game/src/util.js` — seeded RNG, angles, AABB collision helpers
- `game/src/palette.js` — the city's colours and canvas textures
- `game/src/audio.js` — procedural WebAudio: engine, siren, jingles, thuds
- `game/src/world.js` — builds Solmara: roads, towers, docks, beach, palms, lamps
- `game/src/input.js` — keyboard + mouse-drag state
- `game/src/player.js` — Rook on foot, arcade driving, chase camera
- `game/src/traffic.js` — AI traffic cars, parked cars, pedestrians
- `game/src/police.js` — wanted level, police spawn / chase / ram, drain
- `game/src/missions.js` — the four chained jobs, debt, rewards, timers
- `game/src/hud.js` — HUD, minimap, banners, toasts, menus
- `game/src/main.js` — renderer, fixed-step loop, save, staging, `window.__game`
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`
- `screenshots/` — four real gameplay renders (see `shots.json`)

## Staging

`?shot=drive|chase|mission|roam&seed=1` stages a scene for screenshots: driving the boulevard, a 2-star police chase, on foot at the docks marker, and free-roam street level. `window.__game` exposes the live state for probing.

## License

MIT — see `LICENSE`. Everything in Solmara is original: its city, characters, vehicles, names and story are invented for this entry, with nothing from any commercial game.
