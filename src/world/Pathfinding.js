// =====================================================================
// Pathfinding.js — grid A* with line-of-sight smoothing + path following.
//
// Tiles are passable (1) or blocked (0). Buildings and resources block;
// units do NOT (they push apart via the movement system's separation).
// Paths are cached on each unit and recomputed on: new target, target
// moved >1.2 tiles, path finished, building changes (pathGen bump),
// every 0.5s stale, or when a unit is detected stuck.
//
// All functions take the GameState so they share one pass-grid.
// =====================================================================

import { TILE, MAP_W, MAP_H } from '../config/constants.js';
import { UNITS } from '../config/units.js';
import { clamp, octile } from '../core/utils.js';

// How far a unit's body is kept from solid tiles when straightening paths.
// Just under half a tile so single-tile (32px) gaps stay threadable.
const PATH_CLEARANCE = 11;

export function rebuildPassGrid(state) {
  state.passGrid.fill(1);
  for (const e of state.entities) {
    if (e.dead || (e.kind !== 'building' && e.kind !== 'resource')) continue;
    for (let dy = 0; dy < e.size; dy++) {
      for (let dx = 0; dx < e.size; dx++) {
        const tx = e.tx + dx, ty = e.ty + dy;
        if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H) {
          state.passGrid[ty * MAP_W + tx] = 0;
        }
      }
    }
  }
  state.passGridDirty = false;
}

export function isPassable(state, tx, ty) {
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
  return state.passGrid[ty * MAP_W + tx] === 1;
}

export function invalidatePaths(state) {
  state.passGridDirty = true;
  state.pathGen++;
}

// A world point is "clear" if a small box (the unit's footprint) around it
// sits entirely on passable tiles. Keeps straightened segments from grazing
// building/forest corners, which used to make units stutter.
function pointClear(state, x, y) {
  const c = PATH_CLEARANCE;
  return isPassable(state, Math.floor((x - c) / TILE), Math.floor((y - c) / TILE)) &&
         isPassable(state, Math.floor((x + c) / TILE), Math.floor((y - c) / TILE)) &&
         isPassable(state, Math.floor((x - c) / TILE), Math.floor((y + c) / TILE)) &&
         isPassable(state, Math.floor((x + c) / TILE), Math.floor((y + c) / TILE));
}

// Sampled line-clear check that respects unit body width.
function lineClear(state, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d / (TILE * 0.33)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!pointClear(state, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

// String-pull smoothing: skip waypoints when a later one has line of sight.
function smoothPath(state, startX, startY, path) {
  if (path.length <= 1) return path;
  const out = [];
  let fromX = startX, fromY = startY;
  let i = 0;
  while (i < path.length) {
    let bestJ = i;
    for (let j = path.length - 1; j > i; j--) {
      if (lineClear(state, fromX, fromY, path[j].x, path[j].y)) { bestJ = j; break; }
    }
    out.push(path[bestJ]);
    fromX = path[bestJ].x; fromY = path[bestJ].y;
    i = bestJ + 1;
  }
  return out;
}

export function findPath(state, fromX, fromY, toX, toY, maxIter = 3000) {
  if (state.passGridDirty) rebuildPassGrid(state);
  const sx = clamp(Math.floor(fromX / TILE), 0, MAP_W - 1);
  const sy = clamp(Math.floor(fromY / TILE), 0, MAP_H - 1);
  let ex = clamp(Math.floor(toX / TILE), 0, MAP_W - 1);
  let ey = clamp(Math.floor(toY / TILE), 0, MAP_H - 1);

  // If the goal tile is blocked (walking INTO a building to drop off, or onto
  // a gold mine flanked by buildings), snap to the nearest passable tile —
  // and among the closest ring, pick the one nearest the UNIT so it approaches
  // from its own side instead of circling the obstacle.
  if (!isPassable(state, ex, ey)) {
    let best = null, bestStartD = Infinity;
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = ex + dx, ty = ey + dy;
          if (isPassable(state, tx, ty)) {
            const ddx = tx - sx, ddy = ty - sy;
            const d = ddx * ddx + ddy * ddy;
            if (d < bestStartD) { bestStartD = d; best = { x: tx, y: ty }; }
          }
        }
      }
      if (best) break;
    }
    if (!best) return null;
    ex = best.x; ey = best.y;
  }
  if (!isPassable(state, sx, sy) || (sx === ex && sy === ey)) {
    return [{ x: toX, y: toY }];
  }

  const start = sy * MAP_W + sx;
  const goal = ey * MAP_W + ex;
  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();
  const open = [start];
  const inOpen = new Set([start]);
  gScore.set(start, 0);
  fScore.set(start, octile(sx, sy, ex, ey));

  let iter = 0;
  while (open.length && iter++ < maxIter) {
    let minIdx = 0, minF = fScore.get(open[0]);
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i]);
      if (f < minF) { minF = f; minIdx = i; }
    }
    const current = open[minIdx];
    if (current === goal) {
      const tiles = [];
      let cur = current;
      while (cur !== start) {
        const tx = cur % MAP_W, ty = Math.floor(cur / MAP_W);
        tiles.unshift({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
        cur = cameFrom.get(cur);
      }
      if (tiles.length) tiles[tiles.length - 1] = { x: toX, y: toY };
      else tiles.push({ x: toX, y: toY });
      return smoothPath(state, fromX, fromY, tiles);
    }
    open.splice(minIdx, 1);
    inOpen.delete(current);
    const cx = current % MAP_W, cy = Math.floor(current / MAP_W);
    const moves = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];
    for (const [dx, dy, cost] of moves) {
      const nx = cx + dx, ny = cy + dy;
      if (!isPassable(state, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!isPassable(state, cx + dx, cy) || !isPassable(state, cx, cy + dy)) continue;
      }
      const tg = gScore.get(current) + cost;
      const nKey = ny * MAP_W + nx;
      if (tg < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tg);
        fScore.set(nKey, tg + octile(nx, ny, ex, ey));
        if (!inOpen.has(nKey)) { open.push(nKey); inOpen.add(nKey); }
      }
    }
  }
  return null;
}

// Move a unit along its cached path toward (finalX, finalY).
// stopDist is the arrival tolerance for the FINAL waypoint.
// Returns true while still moving, false once arrived (or deadlocked).
export function followPath(state, u, finalX, finalY, stopDist, dt) {
  // Progress / stuck tracking: other units aren't in the A* grid, so a crowded
  // gap can stall a unit that holds a perfectly valid path.
  if (u._progPos === undefined) {
    u._progPos = { x: u.x, y: u.y }; u._progT = state.time; u._stuckTries = 0;
  }
  const movedSq = (u.x - u._progPos.x) ** 2 + (u.y - u._progPos.y) ** 2;
  if (movedSq > (TILE * 0.5) ** 2) {
    u._progPos = { x: u.x, y: u.y }; u._progT = state.time; u._stuckTries = 0;
  }
  let stuckRepath = false;
  if (state.time - u._progT > 0.6) {
    u._progPos = { x: u.x, y: u.y }; u._progT = state.time;
    u._stuckTries++;
    stuckRepath = true;
    // Persistent deadlock near the destination: accept arrival so the unit can
    // start gathering/building/fighting instead of grinding forever.
    if (u._stuckTries >= 4 &&
        Math.hypot(finalX - u.x, finalY - u.y) < stopDist + TILE * 1.5) {
      u.vx = u.vy = 0; u._stuckTries = 0; u._progT = state.time;
      return false;
    }
  }

  const finished = !u.path || u.pathIdx >= u.path.length;
  const targetMoved = !u.pathTo ||
    Math.hypot(finalX - u.pathTo.x, finalY - u.pathTo.y) > TILE * 1.2;
  const stale = (state.time - (u.pathTime || -100)) > 0.5;
  const generationOld = u.pathGen !== state.pathGen;

  if (finished || generationOld || stuckRepath || (targetMoved && stale)) {
    const p = findPath(state, u.x, u.y, finalX, finalY);
    u.path = p || [{ x: finalX, y: finalY }];
    u.pathIdx = 0;
    u.pathTo = { x: finalX, y: finalY };
    u.pathTime = state.time;
    u.pathGen = state.pathGen;
  }

  // Walk to the current waypoint, advancing as we reach each one.
  while (u.pathIdx < u.path.length) {
    const wp = u.path[u.pathIdx];
    const dx = wp.x - u.x, dy = wp.y - u.y;
    const d = Math.hypot(dx, dy);
    const isLast = u.pathIdx === u.path.length - 1;
    const tol = isLast ? stopDist : TILE * 0.5;
    if (d <= tol) {
      if (isLast) { u.vx = u.vy = 0; u._progT = state.time; return false; }
      u.pathIdx++;
      continue;
    }
    const speed = UNITS[u.type].speed;
    u.vx = dx / d * speed;
    u.vy = dy / d * speed;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    u.facing = Math.atan2(dy, dx);
    return true;
  }
  u._progT = state.time;
  return false;
}
