// =====================================================================
// ui/menus.js — the pause menu and the game-over overlay.
//
// Both are thin DOM controllers that translate button clicks into bus
// events; the composition root owns what those events do (pause, restart,
// exit to the title screen). Keeping the verbs on the bus means these
// panels never reach into game state directly.
// =====================================================================

export class PauseMenu {
  constructor(bus) {
    this.bus = bus;
    this.root = document.getElementById('menu-overlay');
    document.getElementById('menu-resume').addEventListener('click', () => this.bus.emit('menu:resume'));
    document.getElementById('menu-restart').addEventListener('click', () => this.bus.emit('menu:restart'));
    document.getElementById('menu-exit').addEventListener('click', () => this.bus.emit('menu:exit'));
  }

  show() { this.root.classList.add('show'); }
  hide() { this.root.classList.remove('show'); }
}

export class GameOverOverlay {
  constructor(bus) {
    this.bus = bus;
    this.root = document.getElementById('overlay');
    this.title = document.getElementById('overlay-title');
    this.subtitle = document.getElementById('overlay-subtitle');
    document.getElementById('overlay-again').addEventListener('click', () => this.bus.emit('game:restart'));
    document.getElementById('overlay-exit').addEventListener('click', () => this.bus.emit('menu:exit'));
  }

  show(victory) {
    this.title.textContent = victory ? 'VICTORY' : 'DEFEAT';
    this.subtitle.textContent = victory
      ? 'The realm endures. The barbarians are scattered.'
      : 'The Town Hall has fallen. The realm is lost.';
    this.root.classList.add('show');
  }

  hide() { this.root.classList.remove('show'); }
}
