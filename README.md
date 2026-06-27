# ⚔ Realms of Iron

A small real-time-strategy prototype for the browser — gather gold and
timber, raise an army, and destroy the enemy Town Hall. Refactored from a
single HTML file into a modular ES-module codebase built to grow.

---

## Running it

### No server (just open it)

The modular `index.html` uses native ES modules, which browsers refuse to
load over `file://`. If you just want to play by double-clicking, build the
single-file version and open that instead:

```bash
npm install            # one-time
npm run build:standalone
# → open dist/realms-of-iron.html directly in any browser
```

That file inlines the styles and a module-free bundle of the game, so it has
no imports and runs straight from disk.

### With a server (for development)

To work on the modular source, serve the folder over HTTP. The game uses
native ES modules, so opening `index.html` from `file://` will be blocked by
the browser's module CORS rules — a server avoids that.

Pick whichever you like:

```bash
# Option A — no install, if you have Python
python3 -m http.server 8000
# then open http://localhost:8000

# Option B — Node, via the bundled dev server
npm install        # one-time, pulls in esbuild
npm run dev        # serves at http://localhost:8000

# Option C — any static server you already use
npx serve .
```

### Optional: single-file build

To produce one minified bundle (handy for embedding or shipping):

```bash
npm run build      # → dist/realms-of-iron.bundle.js
```

---

## How it's organized

The codebase is split by responsibility so each mechanic can change
without disturbing the others. Dependencies flow **downward** — nothing in
`world/` or `systems/` knows about the DOM or the canvas.

```
src/
├── main.js          Composition root: wires everything, owns the loop
├── config/          Pure data — tune the game here, no logic
│   ├── constants.js   map size, camera, economy, resource placement
│   ├── units.js       unit stats / costs / colors
│   └── buildings.js   building stats / costs
├── core/            Engine glue (no game rules)
│   ├── GameState.js   single source of truth + entity factories + queries
│   ├── EventBus.js    decoupled pub/sub
│   ├── ScreenManager.js   main / playing / paused / game-over FSM
│   ├── options.js     user prefs (edge-scroll…)
│   └── utils.js       math helpers
├── world/           Simulation model (DOM-free)
│   ├── MapGenerator.js  base + resource placement
│   └── Pathfinding.js   grid A* + path smoothing + following
├── systems/         One mechanic per file; run in a fixed order each tick
│   ├── index.js       the update pipeline + per-unit dispatch
│   ├── gathering.js · construction.js · combat.js
│   ├── movement.js  · production.js   · ai.js
├── input/           Player intent
│   ├── InputManager.js  mouse/keyboard → state
│   └── commands.js      right-click semantics, build placement
├── render/          Read-only drawing (never mutates the sim)
│   ├── Renderer.js    terrain, draw order, FX, minimap
│   └── sprites.js     the hand-built unit/building/resource art
└── ui/              DOM around the canvas
    ├── hud.js         resource bar, selection, command grid
    ├── MainScreen.js  title screen
    └── menus.js       pause menu + victory/defeat overlay
```

**The flow of a frame** (`main.js` loop): while playing, the input manager
pans the camera and `systems/index.js` runs every system over the
`GameState`; then the renderer draws and the HUD refreshes. Systems never
draw; the renderer never mutates. Cross-cutting moments (a Town Hall falls,
a match should start) travel over the `EventBus`, so screens and gameplay
stay decoupled.

---

## What changed in this refactor

Beyond the restructuring, three gameplay/UX changes were requested:

1. **Fair, "walk-to-gather" starts.** Each base now spawns exactly one gold
   mine and one small forest a fixed distance away (no resources jammed
   against the Town Hall). Both factions use the *same* placement template,
   so starts are symmetric. Tune the distance with
   `RESOURCE_PLACEMENT.STARTING_PATCH_GAP_TILES` in `config/constants.js`
   (default 6 tiles ≈ a short walk); everything stays balanced because both
   sides read the same value.

2. **A title screen.** The game opens on a main screen and only generates a
   world when you press **Start New Game**. Add more options later by
   dropping buttons into `#main-actions` (see `ui/MainScreen.js`).

3. **Exit to main menu.** The pause menu (and the victory/defeat screen) now
   offer **Exit to Main Menu**, which tears the match down cleanly and
   returns to the title screen.

---

## Controls

| Action | Input |
| --- | --- |
| Select unit | Left-click |
| Box-select | Left-drag |
| Add to selection | Shift+click |
| Move / attack / gather / repair | Right-click |
| Set rally point | Right-click with a building selected |
| Pan camera | WASD / arrows, screen edges, or middle-drag |
| Cancel build / open menu | Esc |

Destroy the barbarian Town Hall to win.
