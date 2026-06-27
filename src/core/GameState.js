// =====================================================================
// GameState.js — the single source of truth for a running match.
//
// Owns all entities, the camera, input snapshot, faction economies, and
// transient FX. Also provides entity factories (so ids stay unique) and
// the spatial queries that systems and input handlers rely on.
//
// Systems receive a GameState instance and mutate it. Rendering reads it.
// Nothing here knows about the DOM or the render loop.
// =====================================================================

import {
  TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, FACTION,
  STARTING_RESOURCES, BASE_MAX_SUPPLY,
} from '../config/constants.js';
import { UNITS } from '../config/units.js';
import { BUILDINGS } from '../config/buildings.js';
import { dist2, clamp } from './utils.js';

export class GameState {
  constructor() {
    this.time = 0;
    this.entities = [];
    this.nextId = 1;
    this.selected = new Set();
    this.camera = { x: 0, y: 0 };
    this.viewport = { w: 800, h: 600 }; // kept in sync by the renderer
    this.keys = {};
    this.mouse = {
      x: 0, y: 0, worldX: 0, worldY: 0,
      down: false, downBtn: 0,
      dragStart: null, dragging: false,
      inside: false, panning: null,
    };
    this.factions = {
      player: { ...STARTING_RESOURCES.player },
      enemy: { ...STARTING_RESOURCES.enemy },
    };
    this.buildMode = null;     // { type, faction }
    this.rightClickFx = [];
    this.floatTexts = [];
    this.projectiles = [];
    this.hitFx = [];
    this.gameOver = null;      // 'win' | 'loss' | null
    this.aiThink = 0;
    this.statusMsg = '';
    this.statusUntil = 0;
    this.passGrid = new Uint8Array(MAP_W * MAP_H);
    this.passGridDirty = true;
    this.pathGen = 0;
  }

  // ---- Factories -----------------------------------------------------
  createUnit(type, faction, x, y) {
    const def = UNITS[type];
    return {
      id: this.nextId++,
      kind: 'unit',
      type, faction,
      x, y, vx: 0, vy: 0,
      radius: def.radius,
      hp: def.hp, maxHp: def.hp,
      speed: def.speed,
      damage: def.damage, range: def.range,
      attackCd: def.attackCd, attackTimer: 0,
      target: null,
      moveTarget: null,
      command: null,
      commandData: null,
      carrying: null,
      gatherCooldown: 0,
      buildSite: null,
      dead: false,
      facing: 0,
      flash: 0,
    };
  }

  createBuilding(type, faction, tx, ty, complete = true) {
    const def = BUILDINGS[type];
    const w = def.size * TILE;
    return {
      id: this.nextId++,
      kind: 'building',
      type, faction,
      tx, ty,
      x: tx * TILE + w / 2,
      y: ty * TILE + w / 2,
      size: def.size,
      radius: w / 2,
      hp: complete ? def.hp : 1,
      maxHp: def.hp,
      isComplete: complete,
      buildProgress: complete ? def.buildTime : 0,
      buildTotal: def.buildTime,
      productionQueue: [],
      productionTimer: 0,
      rally: null,
      dead: false,
      flash: 0,
    };
  }

  createResource(type, tx, ty, amount = 1500) {
    const sz = type === 'gold' ? 2 : 1;
    return {
      id: this.nextId++,
      kind: 'resource',
      type, faction: FACTION.NEUTRAL,
      tx, ty,
      x: tx * TILE + sz * TILE / 2,
      y: ty * TILE + sz * TILE / 2,
      size: sz,
      radius: type === 'gold' ? 22 : 14,
      amount,
      dead: false,
    };
  }

  add(entity) {
    this.entities.push(entity);
    return entity;
  }

  // ---- Queries -------------------------------------------------------
  getEntity(id) {
    return this.entities.find(e => e.id === id && !e.dead);
  }

  entitiesInRect(x1, y1, x2, y2, filter = () => true) {
    const xMin = Math.min(x1, x2), xMax = Math.max(x1, x2);
    const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
    return this.entities.filter(e =>
      !e.dead && filter(e) &&
      e.x >= xMin - e.radius && e.x <= xMax + e.radius &&
      e.y >= yMin - e.radius && e.y <= yMax + e.radius
    );
  }

  // Topmost entity at a world point (units > buildings > resources).
  entityAtPoint(wx, wy, filter = () => true) {
    const order = ['unit', 'building', 'resource'];
    for (const kind of order) {
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];
        if (e.dead || e.kind !== kind || !filter(e)) continue;
        if (e.kind === 'building' || e.kind === 'resource') {
          const w = e.size * TILE;
          if (wx >= e.x - w / 2 && wx <= e.x + w / 2 &&
              wy >= e.y - w / 2 && wy <= e.y + w / 2) return e;
        } else if (dist2(e, { x: wx, y: wy }) < e.radius * e.radius) {
          return e;
        }
      }
    }
    return null;
  }

  tileOccupied(tx, ty, ignoreId = null) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    for (const e of this.entities) {
      if (e.dead || e.id === ignoreId) continue;
      if (e.kind === 'building' || e.kind === 'resource') {
        if (tx >= e.tx && tx < e.tx + e.size && ty >= e.ty && ty < e.ty + e.size) return true;
      }
    }
    return false;
  }

  canPlaceBuilding(tx, ty, size, ignoreId = null) {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (this.tileOccupied(tx + dx, ty + dy, ignoreId)) return false;
      }
    }
    return true;
  }

  findNearestResource(unit, resType) {
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (e.dead || e.kind !== 'resource' || e.type !== resType) continue;
      const d = dist2(unit, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  findNearestDropoff(unit) {
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (e.dead || e.kind !== 'building' || e.faction !== unit.faction) continue;
      if (!BUILDINGS[e.type].isDropoff || !e.isComplete) continue;
      const d = dist2(unit, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  findNearestEnemy(unit, maxRange = Infinity) {
    let best = null, bestD = maxRange * maxRange;
    for (const e of this.entities) {
      if (e.dead || e.faction === unit.faction || e.faction === FACTION.NEUTRAL) continue;
      const d = dist2(unit, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // Closest point on a square footprint plus a stand spot just outside it.
  // Lets workers walk to the NEAREST face of a target instead of routing to
  // its center (which made them curve around flanking obstacles).
  approachSpot(u, target, gap) {
    const hw = target.size * TILE / 2;
    const left = target.x - hw, right = target.x + hw;
    const top = target.y - hw, bottom = target.y + hw;
    const ex = clamp(u.x, left, right);
    const ey = clamp(u.y, top, bottom);
    let dx = u.x - ex, dy = u.y - ey;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) {
      const dl = u.x - left, dr = right - u.x, dt = u.y - top, db = bottom - u.y;
      const m = Math.min(dl, dr, dt, db);
      dx = m === dl ? -1 : m === dr ? 1 : 0;
      dy = m === dt ? -1 : m === db ? 1 : 0;
      if (dx === 0 && dy === 0) dy = 1;
      d = 1;
    }
    return { ex, ey, dist: d, sx: ex + dx / d * gap, sy: ey + dy / d * gap };
  }

  // ---- Transient feedback -------------------------------------------
  floatText(x, y, txt, color = '#fff') {
    this.floatTexts.push({ x, y, txt, color, life: 1.2, vy: -30 });
  }

  setStatus(msg, dur = 3) {
    this.statusMsg = msg;
    this.statusUntil = this.time + dur;
  }
}
