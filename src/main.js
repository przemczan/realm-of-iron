// =====================================================================
// main.js — composition root.
//
// Creates the long-lived services (event bus, screen manager, renderer,
// input, HUD, screens) once, then owns the match lifecycle (start /
// restart / exit) and the single requestAnimationFrame loop. Everything
// else talks through the bus, so this file is the only place that knows
// how the pieces fit together.
// =====================================================================

import { GameState } from './core/GameState.js';
import { EventBus } from './core/EventBus.js';
import { ScreenManager, SCREEN } from './core/ScreenManager.js';
import { generateMap } from './world/MapGenerator.js';
import { updateWorld } from './systems/index.js';
import { recomputeSupply } from './systems/production.js';
import { InputManager } from './input/InputManager.js';
import { Renderer } from './render/Renderer.js';
import { Hud } from './ui/hud.js';
import { MainScreen } from './ui/MainScreen.js';
import { PauseMenu, GameOverOverlay } from './ui/menus.js';

const canvas = document.getElementById('game-canvas');
const minimap = document.getElementById('minimap');

const bus = new EventBus();
const screen = new ScreenManager(bus);

// State is recreated per match; services below get re-pointed via setState.
let state = new GameState();

const renderer = new Renderer(canvas, minimap, state);
const input = new InputManager(canvas, minimap, state, bus, screen);
const hud = new Hud(state);
const mainScreen = new MainScreen(bus);
const pauseMenu = new PauseMenu(bus);
const gameOver = new GameOverOverlay(bus);

// ---------------------------------------------------------------------
// Match lifecycle
// ---------------------------------------------------------------------
function startMatch() {
  state = new GameState();
  renderer.setState(state);   // also syncs viewport so the camera centers right
  input.setState(state);
  hud.setState(state);

  generateMap(state);
  recomputeSupply(state);

  gameOver.hide();
  pauseMenu.hide();
  screen.set(SCREEN.PLAYING);
}

function exitToMain() {
  screen.set(SCREEN.MAIN);
}

function togglePause() {
  if (screen.is(SCREEN.PLAYING)) {
    state.keys = {};            // drop held movement keys so camera won't drift
    state.mouse.down = false;
    state.mouse.dragStart = null;
    state.mouse.dragging = false;
    screen.set(SCREEN.PAUSED);
  } else if (screen.is(SCREEN.PAUSED)) {
    screen.set(SCREEN.PLAYING);
  }
}

// ---------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------
bus.on('game:start', startMatch);
bus.on('game:restart', startMatch);
bus.on('menu:restart', startMatch);
bus.on('menu:exit', exitToMain);
bus.on('menu:toggle', togglePause);
bus.on('menu:resume', () => screen.set(SCREEN.PLAYING));

bus.on('game:over', ({ victory }) => {
  screen.set(SCREEN.GAME_OVER);
  gameOver.show(victory);
});

// React to screen transitions by showing the right overlay.
bus.on('screen:change', ({ to }) => {
  if (to === SCREEN.MAIN) {
    mainScreen.show();
    pauseMenu.hide();
    gameOver.hide();
  } else if (to === SCREEN.PLAYING) {
    mainScreen.hide();
    pauseMenu.hide();
    gameOver.hide();
  } else if (to === SCREEN.PAUSED) {
    pauseMenu.show();
  }
});

document.getElementById('menu-btn').addEventListener('click', () => {
  if (screen.is(SCREEN.PLAYING) || screen.is(SCREEN.PAUSED)) togglePause();
});

window.addEventListener('resize', () => renderer.resize());

// ---------------------------------------------------------------------
// Main loop — sim advances only while playing; rendering is continuous.
// ---------------------------------------------------------------------
let lastTime = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
  lastTime = t;

  if (screen.isPlaying()) {
    input.updateCamera(dt);
    updateWorld(state, dt, bus);
  }

  renderer.render();
  hud.update();
  requestAnimationFrame(loop);
}

// Boot on the title screen; nothing simulates until "Start New Game".
mainScreen.show();
requestAnimationFrame(loop);
