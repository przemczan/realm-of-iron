// =====================================================================
// ScreenManager.js — top-level screen state machine.
//
//   MAIN  ──Start New Game──▶  PLAYING ◀──Resume──┐
//    ▲                          │  │              │
//    └──────Exit────────────────┘  └──Menu──▶  PAUSED
//                                   │
//                                   └──Town Hall falls──▶ GAME_OVER ──Play Again──▶ PLAYING
//
// Pure flow control: it tracks the current screen and announces changes
// on the bus. Whether the world simulates is derived from `isPlaying()`.
// =====================================================================

export const SCREEN = {
  MAIN: 'main',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover',
};

export class ScreenManager {
  constructor(bus) {
    this.bus = bus;
    this.current = SCREEN.MAIN;
  }

  set(screen) {
    if (screen === this.current) return;
    const prev = this.current;
    this.current = screen;
    this.bus.emit('screen:change', { from: prev, to: screen });
  }

  is(screen) {
    return this.current === screen;
  }

  // The simulation only advances while actively playing.
  isPlaying() {
    return this.current === SCREEN.PLAYING;
  }
}
