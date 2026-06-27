// =====================================================================
// MapGenerator.js — populates a fresh GameState with terrain features,
// starting bases, resources, mountains, and rivers.
//
// Fair-start rules:
//   • Every base gets ONE gold mine (2× further away) + ONE small forest
//     (original distance) so peasants must travel for gold but have nearby
//     wood for early construction.
//   • Both factions use the same template → symmetric, balanced starts.
//   • Contested resources enforce a minimum gap from either base.
//   • Mountains and rivers are placed deterministically (seeded coords)
//     so they never stomp resources or starting buildings, but add visual
//     and tactical variety to the map.
// =====================================================================

import {
  TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, FACTION, RESOURCE_PLACEMENT as RP,
} from '../config/constants.js';
import { clamp, rand } from '../core/utils.js';

const MAP_CENTER = { x: WORLD_W / 2, y: WORLD_H / 2 };

// --- geometry helpers -------------------------------------------------
function unitVec(fromX, fromY, toX, toY) {
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
function rotate(v, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

// Tile-distance from a point to the nearest base (Town Hall) center.
function tilesFromNearestBase(state, tx, ty) {
  let min = Infinity;
  for (const e of state.entities) {
    if (e.dead || e.kind !== 'building' || e.type !== 'townhall') continue;
    const cx = e.tx + e.size / 2, cy = e.ty + e.size / 2;
    min = Math.min(min, Math.hypot(tx - cx, ty - cy));
  }
  return min;
}

// Find the nearest free top-left tile for a `size`×`size` footprint whose
// center lands close to (cx, cy) in world pixels.
function findFreeFootprint(state, cx, cy, size) {
  const target = {
    tx: Math.round((cx - size * TILE / 2) / TILE),
    ty: Math.round((cy - size * TILE / 2) / TILE),
  };
  for (let r = 0; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = target.tx + dx, ty = target.ty + dy;
        if (tx >= 1 && ty >= 1 && tx + size < MAP_W - 1 && ty + size < MAP_H - 1 &&
            state.canPlaceBuilding(tx, ty, size)) {
          return { tx, ty };
        }
      }
    }
  }
  return null;
}

// Scatter `count` trees around a world point.
function plantForest(state, cx, cy, count, spread, minBaseGap = 0) {
  const ctx = Math.floor(cx / TILE), cty = Math.floor(cy / TILE);
  let planted = 0;
  for (let i = 0; i < count * 4 && planted < count; i++) {
    const tx = clamp(ctx + Math.floor(rand(-spread, spread + 1)), 1, MAP_W - 2);
    const ty = clamp(cty + Math.floor(rand(-spread, spread + 1)), 1, MAP_H - 2);
    if (minBaseGap > 0 && tilesFromNearestBase(state, tx, ty) < minBaseGap) continue;
    if (state.canPlaceBuilding(tx, ty, 1)) {
      state.add(state.createResource('wood', tx, ty, RP.TREE_AMOUNT));
      planted++;
    }
  }
}

// Build one base: Town Hall, four peasants, a gold mine (far), a forest (near).
function placeBase(state, faction, thTx, thTy) {
  const th = state.add(state.createBuilding('townhall', faction, thTx, thTy));

  for (let i = 0; i < 4; i++) {
    state.add(state.createUnit('peasant', faction,
      th.x + Math.cos(i * Math.PI / 2) * 70,
      th.y + Math.sin(i * Math.PI / 2) * 70));
  }

  const toCenter = unitVec(th.x, th.y, MAP_CENTER.x, MAP_CENTER.y);

  // Gold mine: 2× further, angled slightly left of center direction.
  const goldGap  = RP.STARTING_GOLD_GAP_TILES   * TILE;
  const woodGap  = RP.STARTING_FOREST_GAP_TILES  * TILE;
  const goldDir  = rotate(toCenter, -0.45);
  const woodDir  = rotate(toCenter,  0.55);

  const goldSpot = findFreeFootprint(state, th.x + goldDir.x * goldGap, th.y + goldDir.y * goldGap, 2);
  if (goldSpot) state.add(state.createResource('gold', goldSpot.tx, goldSpot.ty, RP.GOLD_AMOUNT));

  plantForest(state,
    th.x + woodDir.x * woodGap, th.y + woodDir.y * woodGap,
    RP.STARTING_FOREST_TREES, RP.STARTING_FOREST_SPREAD);

  return th;
}

// =====================================================================
// Terrain feature data.  Generated once here and stored on state so the
// renderer can read it without recomputing each frame.
// Mountains are arrays of boulder descriptors; rivers are polylines in
// world-pixel coordinates.  Neither affects pathfinding — they are purely
// visual (the renderer draws them before entities).
// =====================================================================

// Simple deterministic PRNG so terrain is the same every match.
function mkRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0xffffffff; };
}

function generateMountains(rng) {
  // 4-6 mountain clusters scattered around the map, avoiding the corners
  // where bases are and the very center (contested gold).
  const clusters = [
    { cx: 18, cy: 12, boulders: 5 },
    { cx: 46, cy:  8, boulders: 4 },
    { cx: 10, cy: 28, boulders: 4 },
    { cx: 52, cy: 26, boulders: 5 },
    { cx: 32, cy: 20, boulders: 3 },
    { cx: 28, cy: 36, boulders: 4 },
  ];

  return clusters.map(({ cx, cy, boulders }) => {
    const rocks = [];
    for (let i = 0; i < boulders; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * 2.4 * TILE;
      rocks.push({
        x: cx * TILE + Math.cos(angle) * dist,
        y: cy * TILE + Math.sin(angle) * dist,
        r: 14 + rng() * 18,            // boulder radius px
        shade: Math.floor(rng() * 3),   // 0=dark 1=mid 2=light
      });
    }
    // A peak spike above the cluster centre
    rocks.push({ x: cx * TILE, y: cy * TILE, r: 10 + rng() * 8, shade: 2, peak: true });
    return { cx: cx * TILE, cy: cy * TILE, rocks };
  });
}

function generateRivers(rng) {
  // Two rivers as piecewise curves defined by control points (world px).
  // They meander roughly north-south and east-west across the map,
  // away from the corner bases.
  const rivers = [
    // River 1 — curves from north edge to south-east area
    {
      color: '#2a5680',
      shimmer: '#3a6e9a',
      width: 11,
      points: [
        { x: 36 * TILE + rng()*TILE*2, y: 0 },
        { x: 33 * TILE + rng()*TILE*3, y: 10 * TILE },
        { x: 37 * TILE + rng()*TILE*2, y: 19 * TILE },
        { x: 40 * TILE + rng()*TILE*2, y: 28 * TILE },
        { x: 38 * TILE + rng()*TILE*3, y: MAP_H * TILE },
      ],
    },
    // River 2 — cuts east to west across the mid-lower section
    {
      color: '#2a5680',
      shimmer: '#3a6e9a',
      width: 9,
      points: [
        { x: 0,            y: 30 * TILE + rng()*TILE*2 },
        { x: 14 * TILE,    y: 31 * TILE + rng()*TILE*2 },
        { x: 25 * TILE,    y: 29 * TILE + rng()*TILE*2 },
        { x: 36 * TILE,    y: 32 * TILE + rng()*TILE*2 },
        { x: MAP_W * TILE, y: 31 * TILE + rng()*TILE*2 },
      ],
    },
  ];
  return rivers;
}

export function generateMap(state) {
  state.entities = [];
  state.nextId = 1;

  // Two mirrored bases. Same template → symmetric, fair starts.
  const playerTH = placeBase(state, FACTION.PLAYER, 4, 8);
  placeBase(state, FACTION.ENEMY, MAP_W - 7, MAP_H - 11);

  // Contested center gold — far from both bases, worth fighting over.
  for (const [tx, ty, amt] of [
    [28, 18, RP.CONTESTED_GOLD_AMOUNT],
    [30, 26, RP.GOLD_AMOUNT],
  ]) {
    const spot = findFreeFootprint(state, tx * TILE + TILE, ty * TILE + TILE, 2);
    if (spot && tilesFromNearestBase(state, spot.tx, spot.ty) >= RP.MIN_GAP_FROM_ANY_BASE) {
      state.add(state.createResource('gold', spot.tx, spot.ty, amt));
    }
  }

  // Neutral forests scattered across the map, kept clear of both bases.
  const neutralForests = [
    [20, 22, 14, 4], [45, 14, 14, 4], [32, 34, 12, 3], [16, 30, 11, 3],
  ];
  for (const [cx, cy, count, spread] of neutralForests) {
    plantForest(state, cx * TILE, cy * TILE, count, spread, RP.MIN_GAP_FROM_ANY_BASE);
  }

  // Terrain features (visual only — stored for the renderer).
  const rng = mkRng(0xdeadbeef);
  state.terrain = {
    mountains: generateMountains(rng),
    rivers: generateRivers(rng),
  };

  // Auto-assign starting peasants to nearest gold.
  for (const e of state.entities) {
    if (e.kind === 'unit' && e.faction === FACTION.PLAYER && e.type === 'peasant') {
      const res = state.findNearestResource(e, 'gold');
      if (res) {
        e.command = 'gather-gold';
        e.commandData = { resourceId: res.id };
        e.moveTarget = { x: res.x, y: res.y };
      }
    }
  }

  // Center camera on the player's base.
  state.camera.x = clamp(playerTH.x - state.viewport.w / 2, 0, Math.max(0, WORLD_W - state.viewport.w));
  state.camera.y = clamp(playerTH.y - state.viewport.h / 2, 0, Math.max(0, WORLD_H - state.viewport.h));

  state.passGridDirty = true;
}
