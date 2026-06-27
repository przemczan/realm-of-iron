// =====================================================================
// systems/production.js — building production queues, supply accounting,
// and the trainUnit command. Spawned units optionally walk to a rally
// point (military attack-move, peasants just walk).
// =====================================================================

import { UNITS } from '../config/units.js';
import { BUILDINGS } from '../config/buildings.js';
import { BASE_MAX_SUPPLY, SUPPLY_HARD_CAP, FACTION } from '../config/constants.js';
import { rand } from '../core/utils.js';

export function updateBuilding(state, b, dt) {
  if (!b.isComplete || !b.productionQueue.length) return;
  const unitType = b.productionQueue[0];
  const def = UNITS[unitType];
  b.productionTimer += dt;
  if (b.productionTimer >= def.buildTime) {
    const ang = rand(0, Math.PI * 2);
    const spawnD = b.size * 32 * 0.65 + 16;
    const u = state.add(state.createUnit(unitType, b.faction,
      b.x + Math.cos(ang) * spawnD, b.y + Math.sin(ang) * spawnD));
    if (b.rally) {
      u.moveTarget = { x: b.rally.x, y: b.rally.y };
      u.command = (unitType === 'peasant') ? 'move' : 'attack-move';
    }
    b.productionQueue.shift();
    b.productionTimer = 0;
  }
}

export function recomputeSupply(state) {
  for (const f of ['player', 'enemy']) {
    let used = 0, cap = BASE_MAX_SUPPLY;
    for (const e of state.entities) {
      if (e.dead || e.faction !== f) continue;
      if (e.kind === 'unit') used += UNITS[e.type].cost.supply || 0;
      if (e.kind === 'building' && e.isComplete && BUILDINGS[e.type].supply) cap += BUILDINGS[e.type].supply;
    }
    state.factions[f].supply = used;
    state.factions[f].maxSupply = Math.min(cap, SUPPLY_HARD_CAP);
  }
}

// Supply reserved by units still in production queues (so we don't oversubscribe).
export function pendingSupply(state, faction) {
  let total = 0;
  for (const e of state.entities) {
    if (e.dead || e.kind !== 'building' || e.faction !== faction) continue;
    for (const ut of e.productionQueue) total += (UNITS[ut].cost.supply || 0);
  }
  return total;
}

export function trainUnit(state, building, unitType) {
  const def = UNITS[unitType];
  const f = state.factions[building.faction];
  const usedAndPending = f.supply + pendingSupply(state, building.faction);
  if (usedAndPending + def.cost.supply > f.maxSupply) {
    if (building.faction === FACTION.PLAYER) state.setStatus('Need more supply (build a Farm).', 2);
    return false;
  }
  if (f.gold < def.cost.gold || f.wood < (def.cost.wood || 0)) {
    if (building.faction === FACTION.PLAYER) state.setStatus('Not enough resources.', 2);
    return false;
  }
  f.gold -= def.cost.gold;
  f.wood -= def.cost.wood || 0;
  building.productionQueue.push(unitType);
  return true;
}
