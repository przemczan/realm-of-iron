// =====================================================================
// systems/construction.js — peasant building behaviors:
//   • assist-build: walk to an in-progress building and raise it.
//   • repair: walk to a damaged friendly building and mend it (costs
//     half the build price, pro-rated by HP restored).
// =====================================================================

import { BUILDINGS } from '../config/buildings.js';
import { FACTION } from '../config/constants.js';
import { rand } from '../core/utils.js';
import { followPath } from '../world/Pathfinding.js';

export function handleBuild(state, u, dt) {
  const b = u.commandData?.buildingId ? state.getEntity(u.commandData.buildingId) : null;
  if (!b || b.dead || b.isComplete) { u.command = 'idle'; return; }

  const spot = state.approachSpot(u, b, u.radius + 3);
  if (spot.dist > u.radius + 16) {
    followPath(state, u, spot.sx, spot.sy, u.radius, dt);
    return;
  }
  u.vx = u.vy = 0;
  u.facing = Math.atan2(spot.ey - u.y, spot.ex - u.x);
  b.buildProgress += dt * 1.0;
  b.hp = Math.min(b.maxHp, BUILDINGS[b.type].hp * (b.buildProgress / b.buildTotal));
  if (b.buildProgress >= b.buildTotal) {
    b.isComplete = true;
    b.hp = b.maxHp;
    if (b.faction === FACTION.PLAYER) state.setStatus(`${BUILDINGS[b.type].name} complete!`, 2);
    u.command = 'idle';
  }
}

export function handleRepair(state, u, dt) {
  const b = u.commandData?.buildingId ? state.getEntity(u.commandData.buildingId) : null;
  if (!b || b.dead || !b.isComplete || b.faction !== u.faction || b.hp >= b.maxHp) {
    u.command = 'idle';
    return;
  }
  const spot = state.approachSpot(u, b, u.radius + 3);
  if (spot.dist > u.radius + 16) {
    followPath(state, u, spot.sx, spot.sy, u.radius, dt);
    return;
  }
  u.vx = u.vy = 0;
  u.facing = Math.atan2(spot.ey - u.y, spot.ex - u.x);

  const def = BUILDINGS[b.type];
  const heal = Math.min((def.hp / 18) * dt, b.maxHp - b.hp); // ~18s full heal per worker
  const frac = heal / def.hp;
  const costG = def.cost.gold * 0.5 * frac;
  const costW = (def.cost.wood || 0) * 0.5 * frac;
  const f = state.factions[u.faction];
  if (f.gold < costG || f.wood < costW) {
    if (u.faction === FACTION.PLAYER) state.setStatus('Not enough resources to repair.', 1.5);
    u.command = 'idle';
    return;
  }
  f.gold -= costG;
  f.wood -= costW;
  b.hp = Math.min(b.maxHp, b.hp + heal);
  if (Math.random() < 0.10) {
    state.hitFx.push({ x: spot.ex + rand(-6, 6), y: spot.ey + rand(-6, 6), life: 0.25, r: 5, color: '#9fe0ff' });
  }
  if (b.hp >= b.maxHp) {
    if (u.faction === FACTION.PLAYER) state.setStatus(`${def.name} repaired.`, 1.5);
    u.command = 'idle';
  }
}
