// =====================================================================
// render/Renderer.js — draws a frame of the world to the canvas.
//
// Layer order (back to front):
//   1. Grass terrain tiles (desaturated, low-contrast variation)
//   2. Rivers (smooth bezier curves with shimmer)
//   3. Mountains (boulder clusters with shading + snow caps)
//   4. Resources, then buildings (sorted by Y)
//   5. Units (sorted by Y)
//   6. Projectiles + hit/click FX + float texts
//   7. Build preview, selection box
//   8. Minimap
// =====================================================================

import { TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, FACTION } from '../config/constants.js';
import { BUILDINGS } from '../config/buildings.js';
import { drawResource, drawBuilding, drawUnit } from './sprites.js';

export class Renderer {
  constructor(canvas, minimap, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.mctx = minimap.getContext('2d');
    this.state = state;
    this.resize();
  }

  setState(state) {
    this.state = state;
    this.syncViewport();
  }

  resize() {
    const playArea = this.canvas.parentElement;
    this.canvas.width = playArea.clientWidth;
    this.canvas.height = playArea.clientHeight;
    this.minimap.width = this.minimap.clientWidth;
    this.minimap.height = this.minimap.clientHeight;
    this.syncViewport();
  }

  syncViewport() {
    this.state.viewport.w = this.canvas.width;
    this.state.viewport.h = this.canvas.height;
  }

  render() {
    const { ctx, canvas, state } = this;
    const cam = state.camera;

    // 1. Terrain base fill
    ctx.fillStyle = '#4a5540';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this._drawGrass(cam);

    // 2. Rivers (below mountains and entities)
    if (state.terrain) this._drawRivers(state.terrain.rivers, cam);

    // 3. Mountains
    if (state.terrain) this._drawMountains(state.terrain.mountains, cam);

    // Map border
    ctx.strokeStyle = '#1a1208';
    ctx.lineWidth = 2;
    ctx.strokeRect(-cam.x, -cam.y, WORLD_W, WORLD_H);

    // 4+5. Entities depth-sorted by Y
    const drawList = state.entities.filter(e => !e.dead).slice().sort((a, b) => a.y - b.y);
    for (const e of drawList) {
      if (e.kind === 'resource') drawResource(ctx, state, e);
      else if (e.kind === 'building') drawBuilding(ctx, state, e);
    }
    for (const e of drawList) {
      if (e.kind === 'unit') drawUnit(ctx, state, e);
    }

    // 6. FX
    this._drawFx(cam);

    // 7. Build preview + selection box
    this._drawBuildPreview(cam);
    this._drawSelectionBox();

    // 8. Minimap
    this._renderMinimap();
  }

  // -------------------------------------------------------------------
  // Terrain
  // -------------------------------------------------------------------
  _drawGrass(cam) {
    const { ctx, canvas } = this;
    // Desaturated olive-grey greens — more contrast against saturated trees.
    const SHADES = ['#4d5a42', '#465140', '#3e4a38', '#55614a'];

    const startTX = Math.max(0, Math.floor(cam.x / TILE));
    const startTY = Math.max(0, Math.floor(cam.y / TILE));
    const endTX   = Math.min(MAP_W, Math.ceil((cam.x + canvas.width)  / TILE));
    const endTY   = Math.min(MAP_H, Math.ceil((cam.y + canvas.height) / TILE));

    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        // Deterministic hash for stable per-tile color
        const seed = (tx * 928371 + ty * 12349) % 100;
        const sx = tx * TILE - cam.x;
        const sy = ty * TILE - cam.y;

        ctx.fillStyle = SHADES[seed < 25 ? 0 : seed < 55 ? 1 : seed < 82 ? 2 : 3];
        ctx.fillRect(sx, sy, TILE, TILE);

        // Sparse dirt patches
        if (seed % 23 === 0) {
          ctx.fillStyle = 'rgba(100,80,50,0.10)';
          ctx.fillRect(sx + (seed % 20), sy + ((seed * 3) % 20), 10, 7);
        }
        // Very subtle highlight flecks
        if (seed % 29 === 0) {
          ctx.fillStyle = 'rgba(200,210,180,0.06)';
          ctx.fillRect(sx + (seed % TILE), sy + ((seed * 7) % TILE), 2, 2);
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Rivers — smooth bezier polyline
  // -------------------------------------------------------------------
  _drawRivers(rivers, cam) {
    const { ctx } = this;
    if (!rivers) return;

    for (const river of rivers) {
      const pts = river.points;
      if (pts.length < 2) continue;

      // Shadow / depth under the water
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = river.width + 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x - cam.x, pts[0].y - cam.y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x - cam.x, pts[i].y - cam.y, mx - cam.x, my - cam.y);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x - cam.x, last.y - cam.y);
      ctx.stroke();

      // Water body
      ctx.strokeStyle = river.color;
      ctx.lineWidth = river.width;
      ctx.beginPath();
      ctx.moveTo(pts[0].x - cam.x, pts[0].y - cam.y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x - cam.x, pts[i].y - cam.y, mx - cam.x, my - cam.y);
      }
      ctx.lineTo(last.x - cam.x, last.y - cam.y);
      ctx.stroke();

      // Shimmer highlight — narrow lighter stroke offset slightly
      ctx.strokeStyle = river.shimmer;
      ctx.lineWidth = Math.max(2, river.width * 0.35);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(pts[0].x - cam.x - 2, pts[0].y - cam.y - 2);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x - cam.x - 2, pts[i].y - cam.y - 2, mx - cam.x - 2, my - cam.y - 2);
      }
      ctx.lineTo(last.x - cam.x - 2, last.y - cam.y - 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------
  // Mountains — layered boulder clusters with snow caps
  // -------------------------------------------------------------------
  _drawMountains(mountains, cam) {
    const { ctx } = this;
    if (!mountains) return;

    // Stone palette: dark shadow → mid → highlight
    const STONE = ['#4a4540', '#6a6258', '#8a7e72'];
    const SNOW  = ['rgba(240,238,235,0.75)', 'rgba(255,255,255,0.55)'];

    for (const cluster of mountains) {
      // Ground shadow under the whole cluster
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath();
      ctx.ellipse(
        cluster.cx - cam.x, cluster.cy - cam.y + 18,
        38, 14, 0, 0, Math.PI * 2
      );
      ctx.fill();

      // Draw boulders back-to-front (sorted by y so "nearer" ones overlap)
      const sorted = [...cluster.rocks].sort((a, b) => a.y - b.y);
      for (const rock of sorted) {
        const rx = rock.x - cam.x;
        const ry = rock.y - cam.y;
        const r  = rock.r;

        // Body
        ctx.fillStyle = STONE[rock.shade];
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.fill();

        // Highlight top-left
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.arc(rx - r * 0.28, ry - r * 0.28, r * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Shadow bottom-right
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.arc(rx + r * 0.22, ry + r * 0.22, r * 0.60, 0, Math.PI * 2);
        ctx.fill();

        // Crack lines for texture
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rx - r * 0.2, ry - r * 0.5);
        ctx.lineTo(rx + r * 0.1, ry + r * 0.1);
        ctx.stroke();

        // Snow cap on peak boulders
        if (rock.peak || rock.shade === 2) {
          ctx.fillStyle = SNOW[0];
          ctx.beginPath();
          ctx.ellipse(rx, ry - r * 0.55, r * 0.55, r * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = SNOW[1];
          ctx.beginPath();
          ctx.ellipse(rx - r * 0.08, ry - r * 0.65, r * 0.28, r * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // FX layer
  // -------------------------------------------------------------------
  _drawFx(cam) {
    const { ctx, state } = this;

    for (const p of state.projectiles) {
      const sx = p.x - cam.x, sy = p.y - cam.y;
      ctx.fillStyle = '#fff8c0';
      ctx.strokeStyle = '#a06028';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    for (const fx of state.hitFx) {
      const a = fx.life / 0.22;
      ctx.strokeStyle = `rgba(255, 220, 120, ${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x - cam.x, fx.y - cam.y, fx.r + (1 - a) * 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const fx of state.rightClickFx) {
      const a = fx.life / 0.8;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2;
      const r = 16 * (1 - a) + 6;
      ctx.beginPath(); ctx.arc(fx.x - cam.x, fx.y - cam.y, r, 0, Math.PI * 2); ctx.stroke();
    }

    for (const ft of state.floatTexts) {
      const a = Math.min(1, ft.life / 0.6);
      ctx.font = 'bold 13px Georgia';
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillText(ft.txt, ft.x - cam.x, ft.y - cam.y);
      ctx.globalAlpha = 1;
    }
  }

  // -------------------------------------------------------------------
  _drawBuildPreview(cam) {
    const { ctx, state } = this;
    if (!state.buildMode) return;
    const def = BUILDINGS[state.buildMode.type];
    const tx = Math.floor(state.mouse.worldX / TILE) - Math.floor(def.size / 2);
    const ty = Math.floor(state.mouse.worldY / TILE) - Math.floor(def.size / 2);
    const sx = tx * TILE - cam.x;
    const sy = ty * TILE - cam.y;
    const w  = def.size * TILE;
    const ok = state.canPlaceBuilding(tx, ty, def.size);
    ctx.fillStyle   = ok ? 'rgba(80,200,80,0.3)' : 'rgba(220,60,60,0.3)';
    ctx.strokeStyle = ok ? '#5dff5d' : '#ff5d5d';
    ctx.lineWidth = 2;
    ctx.fillRect(sx, sy, w, w);
    ctx.strokeRect(sx, sy, w, w);
  }

  _drawSelectionBox() {
    const { ctx, state } = this;
    if (!(state.mouse.dragging && state.mouse.dragStart)) return;
    const a  = state.mouse.dragStart;
    const sx = Math.min(a.sx, state.mouse.x);
    const sy = Math.min(a.sy, state.mouse.y);
    const sw = Math.abs(a.sx - state.mouse.x);
    const sh = Math.abs(a.sy - state.mouse.y);
    ctx.strokeStyle = '#a0ff80';
    ctx.lineWidth   = 1.5;
    ctx.fillStyle   = 'rgba(160,255,128,0.12)';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeRect(sx, sy, sw, sh);
  }

  // -------------------------------------------------------------------
  // Minimap — shows rivers + mountains as distinct colours
  // -------------------------------------------------------------------
  _renderMinimap() {
    const { mctx, minimap, canvas, state } = this;
    const w = minimap.width, h = minimap.height;
    if (w === 0) return;

    mctx.fillStyle = '#4a5540';
    mctx.fillRect(0, 0, w, h);

    // Rivers on minimap
    if (state.terrain) {
      for (const river of state.terrain.rivers) {
        const pts = river.points;
        mctx.strokeStyle = '#2a5680';
        mctx.lineWidth = Math.max(1, river.width / 8);
        mctx.lineCap = 'round';
        mctx.beginPath();
        mctx.moveTo((pts[0].x / WORLD_W) * w, (pts[0].y / WORLD_H) * h);
        for (let i = 1; i < pts.length; i++) {
          mctx.lineTo((pts[i].x / WORLD_W) * w, (pts[i].y / WORLD_H) * h);
        }
        mctx.stroke();
      }

      // Mountains on minimap
      for (const m of state.terrain.mountains) {
        const mx = (m.cx / WORLD_W) * w;
        const my = (m.cy / WORLD_H) * h;
        mctx.fillStyle = '#6a6258';
        mctx.beginPath();
        mctx.arc(mx, my, 3, 0, Math.PI * 2);
        mctx.fill();
      }
    }

    // Entities
    for (const e of state.entities) {
      if (e.dead) continue;
      const mx = (e.x / WORLD_W) * w;
      const my = (e.y / WORLD_H) * h;
      if (e.kind === 'resource') {
        mctx.fillStyle = e.type === 'gold' ? '#ffd750' : '#3a5a2a';
        mctx.fillRect(mx - 1, my - 1, 2, 2);
      } else if (e.kind === 'building') {
        mctx.fillStyle = e.faction === FACTION.PLAYER ? '#5d8be0' : '#e06b5d';
        mctx.fillRect(mx - 2, my - 2, 4, 4);
      } else if (e.kind === 'unit') {
        mctx.fillStyle = e.faction === FACTION.PLAYER ? '#5d8be0' : '#e06b5d';
        mctx.fillRect(mx, my, 2, 2);
      }
    }

    // Viewport rectangle
    const vx = (state.camera.x / WORLD_W) * w;
    const vy = (state.camera.y / WORLD_H) * h;
    const vw = (canvas.width  / WORLD_W) * w;
    const vh = (canvas.height / WORLD_H) * h;
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 1;
    mctx.strokeRect(vx, vy, vw, vh);
  }
}
