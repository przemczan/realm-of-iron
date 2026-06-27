// =====================================================================
// input/InputManager.js — binds raw DOM events to game intent.
//
// Translates mouse/keyboard into selection, camera panning, build
// placement, and right-click orders. Command semantics live in
// commands.js; this class is the I/O surface. It only acts on gameplay
// input while the match is actually playing (screen == PLAYING), so the
// main menu and pause overlay don't get clicks bleeding through.
// =====================================================================

import { TILE, WORLD_W, WORLD_H, FACTION, CAMERA } from '../config/constants.js';
import { gameOptions } from '../core/options.js';
import { issueRightClick, tryPlaceBuilding, cancelBuildMode } from './commands.js';

export class InputManager {
  constructor(canvas, minimap, state, bus, screen) {
    this.canvas = canvas;
    this.minimap = minimap;
    this.state = state;
    this.bus = bus;
    this.screen = screen;
    this._bind();
  }

  setState(state) { this.state = state; }

  _active() { return this.screen.isPlaying(); }

  _screenToWorld(sx, sy) {
    return { x: sx + this.state.camera.x, y: sy + this.state.camera.y };
  }

  _bind() {
    const { canvas, minimap } = this;

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mouseenter', () => { this.state.mouse.inside = true; });
    canvas.addEventListener('mouseleave', () => {
      const m = this.state.mouse;
      m.inside = false;
      if (m.dragStart && !m.down) { m.dragStart = null; m.dragging = false; }
    });

    canvas.addEventListener('mousemove', e => this._onMouseMove(e));
    canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    canvas.addEventListener('mouseup', e => this._onMouseUp(e));

    // Window-level so middle-mouse panning survives the cursor leaving canvas.
    window.addEventListener('mousemove', e => {
      const m = this.state.mouse;
      if (m.panning) {
        const dx = e.clientX - m.panning.sx;
        const dy = e.clientY - m.panning.sy;
        const vw = this.state.viewport.w, vh = this.state.viewport.h;
        this.state.camera.x = clampCam(m.panning.cx - dx, WORLD_W - vw);
        this.state.camera.y = clampCam(m.panning.cy - dy, WORLD_H - vh);
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 1 && this.state.mouse.panning) this.state.mouse.panning = null;
    });

    minimap.addEventListener('mousedown', e => this._onMinimapDown(e));

    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => {
      this.state.keys[e.key.toLowerCase()] = false;
    });
  }

  _onMouseMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const m = this.state.mouse;
    m.x = e.clientX - r.left;
    m.y = e.clientY - r.top;
    m.inside = true;
    const w = this._screenToWorld(m.x, m.y);
    m.worldX = w.x; m.worldY = w.y;
    if (m.down && m.downBtn === 0 && m.dragStart) {
      const d = Math.hypot(m.x - m.dragStart.sx, m.y - m.dragStart.sy);
      if (d > 6) m.dragging = true;
    }
  }

  _onMouseDown(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const m = this.state.mouse;
    m.down = true;
    m.downBtn = e.button;

    if (e.button === 1) {
      e.preventDefault();
      m.panning = { sx: e.clientX, sy: e.clientY, cx: this.state.camera.x, cy: this.state.camera.y };
      return;
    }
    if (!this._active()) return;

    if (e.button === 0) {
      if (this.state.buildMode) { tryPlaceBuilding(this.state); return; }
      m.dragStart = { sx, sy, wx: m.worldX, wy: m.worldY };
      m.dragging = false;
    } else if (e.button === 2) {
      if (this.state.buildMode) { cancelBuildMode(this.state); return; }
      issueRightClick(this.state, m.worldX, m.worldY);
    }
  }

  _onMouseUp(e) {
    const m = this.state.mouse;
    if (e.button === 1 && m.panning) {
      m.panning = null; m.down = false; return;
    }
    if (this._active() && e.button === 0 && m.dragStart) {
      if (m.dragging) {
        const a = m.dragStart;
        const found = this.state.entitiesInRect(a.wx, a.wy, m.worldX, m.worldY,
          en => en.kind === 'unit' && en.faction === FACTION.PLAYER);
        if (!e.shiftKey) this.state.selected.clear();
        for (const u of found) this.state.selected.add(u.id);
      } else {
        const ent = this.state.entityAtPoint(m.worldX, m.worldY);
        if (!e.shiftKey) this.state.selected.clear();
        if (ent && (ent.faction === FACTION.PLAYER || this.state.selected.size === 0)) {
          this.state.selected.add(ent.id);
        }
      }
      this.bus.emit('selection:change');
    }
    m.down = false;
    m.dragStart = null;
    m.dragging = false;
  }

  _onMinimapDown(e) {
    if (!this._active()) return;
    const r = this.minimap.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const vw = this.state.viewport.w, vh = this.state.viewport.h;
    this.state.camera.x = clampCam(fx * WORLD_W - vw / 2, WORLD_W - vw);
    this.state.camera.y = clampCam(fy * WORLD_H - vh / 2, WORLD_H - vh);
  }

  _onKeyDown(e) {
    this.state.keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape') {
      if (this.state.buildMode) cancelBuildMode(this.state);
      else this.bus.emit('menu:toggle');
    }
  }

  // Keyboard + edge-of-screen camera panning. Called each frame while playing.
  updateCamera(dt) {
    const state = this.state;
    const vw = state.viewport.w, vh = state.viewport.h;
    let cs = CAMERA.panSpeed * dt;
    if (state.keys['shift']) cs *= CAMERA.fastMultiplier;
    if (state.keys['a'] || state.keys['arrowleft']) state.camera.x -= cs;
    if (state.keys['d'] || state.keys['arrowright']) state.camera.x += cs;
    if (state.keys['w'] || state.keys['arrowup']) state.camera.y -= cs;
    if (state.keys['s'] || state.keys['arrowdown']) state.camera.y += cs;

    const edge = CAMERA.edgeScrollMargin;
    const m = state.mouse;
    if (m.inside && gameOptions.edgeScroll && !m.panning) {
      if (m.x < edge && m.x >= 0) state.camera.x -= cs;
      if (m.x > vw - edge && m.x <= vw) state.camera.x += cs;
      if (m.y < edge && m.y >= 0) state.camera.y -= cs;
      if (m.y > vh - edge && m.y <= vh) state.camera.y += cs;
    }
    state.camera.x = clampCam(state.camera.x, WORLD_W - vw);
    state.camera.y = clampCam(state.camera.y, WORLD_H - vh);
  }
}

function clampCam(v, max) {
  return Math.max(0, Math.min(Math.max(0, max), v));
}
