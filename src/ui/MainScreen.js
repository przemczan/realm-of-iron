// =====================================================================
// ui/MainScreen.js — the title screen shown on load.
//
// The world isn't generated until the player chooses to begin, so this
// screen just announces intent ("game:start") on the bus and lets the
// app composition root decide what that means. Built to grow: drop more
// buttons (Settings, How to Play…) into #main-actions later.
// =====================================================================

export class MainScreen {
  constructor(bus) {
    this.bus = bus;
    this.root = document.getElementById('main-screen');
    document.getElementById('start-btn')
      .addEventListener('click', () => this.bus.emit('game:start'));
  }

  show() { this.root.classList.add('show'); }
  hide() { this.root.classList.remove('show'); }
}
