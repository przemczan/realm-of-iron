// =====================================================================
// systems/ai.js — the barbarian (enemy) AI. Self-contained: keeps
// peasants gathering, expands supply/barracks, trains a mixed army, and
// launches attacks on the player once it has enough force.
//
// AI bookkeeping lives on state.ai so it resets with each new match.
// =====================================================================

import { UNITS } from '../config/units.js';
import { BUILDINGS } from '../config/buildings.js';
import { FACTION, MAP_W, MAP_H, TILE } from '../config/constants.js';
import { rand } from '../core/utils.js';
import { invalidatePaths } from '../world/Pathfinding.js';
import { trainUnit, pendingSupply } from './production.js';

function aiBuild(state, buildingType) {
  const peasants = state.entities.filter(e => !e.dead && e.type === 'peasant' && e.faction === FACTION.ENEMY);
  const builder = peasants.find(p => p.command !== 'assist-build') || peasants[0];
  if (!builder) return;
  const th = state.entities.find(e => !e.dead && e.kind === 'building' && e.type === 'townhall' && e.faction === FACTION.ENEMY);
  if (!th) return;
  const def = BUILDINGS[buildingType];
  for (let tries = 0; tries < 25; tries++) {
    const ang = rand(0, Math.PI * 2);
    const r = rand(120, 200);
    const cx = th.x + Math.cos(ang) * r;
    const cy = th.y + Math.sin(ang) * r;
    const tx = Math.floor(cx / TILE) - Math.floor(def.size / 2);
    const ty = Math.floor(cy / TILE) - Math.floor(def.size / 2);
    if (state.canPlaceBuilding(tx, ty, def.size) && tx > 0 && ty > 0 &&
        tx + def.size < MAP_W && ty + def.size < MAP_H) {
      const f = state.factions.enemy;
      if (f.gold < def.cost.gold || f.wood < (def.cost.wood || 0)) return;
      f.gold -= def.cost.gold;
      f.wood -= def.cost.wood || 0;
      const b = state.add(state.createBuilding(buildingType, FACTION.ENEMY, tx, ty, false));
      invalidatePaths(state);
      builder.command = 'assist-build';
      builder.commandData = { buildingId: b.id };
      builder.moveTarget = { x: b.x, y: b.y };
      return;
    }
  }
}

export function runAI(state, dt) {
  if (!state.ai) state.ai = { attacking: false, attackTime: 0 };
  const ai = state.ai;
  const f = state.factions.enemy;

  const myUnits = state.entities.filter(e => !e.dead && e.kind === 'unit' && e.faction === FACTION.ENEMY);
  const myBuildings = state.entities.filter(e => !e.dead && e.kind === 'building' && e.faction === FACTION.ENEMY);
  const peasants = myUnits.filter(u => u.type === 'peasant');
  const military = myUnits.filter(u => u.type !== 'peasant');
  const townhall = myBuildings.find(b => b.type === 'townhall' && b.isComplete);
  if (!townhall) return;

  // 1. Keep peasants gathering.
  for (const p of peasants) {
    if (!p.command || p.command === 'idle') {
      const want = (f.gold < 200 || Math.random() < 0.55) ? 'gold' : 'wood';
      const res = state.findNearestResource(p, want);
      if (res) {
        p.command = 'gather-' + want;
        p.commandData = { resourceId: res.id };
        p.moveTarget = { x: res.x, y: res.y };
      }
    }
  }

  // 2. Train peasants up to 6.
  if (peasants.length < 6 && !townhall.productionQueue.length) {
    if (f.gold >= UNITS.peasant.cost.gold && f.supply + 1 <= f.maxSupply) {
      trainUnit(state, townhall, 'peasant');
    }
  }

  // 3. Build a farm when near the supply cap.
  if (f.maxSupply - f.supply < 3 && f.maxSupply < 40) {
    if (f.gold >= BUILDINGS.farm.cost.gold && f.wood >= BUILDINGS.farm.cost.wood) {
      aiBuild(state, 'farm');
    }
  }

  // 4. Build barracks (first one always; a second once the army grows).
  const barracks = myBuildings.filter(b => b.type === 'barracks');
  if (barracks.length === 0 && f.gold >= BUILDINGS.barracks.cost.gold && f.wood >= BUILDINGS.barracks.cost.wood) {
    aiBuild(state, 'barracks');
  } else if (barracks.length < 2 && military.length > 5 && f.gold >= 400) {
    aiBuild(state, 'barracks');
  }

  // 5. Queue military from each barracks, weighted by affordability.
  for (const b of barracks) {
    if (!b.isComplete || b.productionQueue.length >= 2) continue;
    const affordable = ['footman', 'archer', 'knight'].filter(t => {
      const c = UNITS[t].cost;
      return f.gold >= c.gold && f.wood >= (c.wood || 0) &&
        (f.supply + pendingSupply(state, FACTION.ENEMY) + (c.supply || 0) <= f.maxSupply);
    });
    if (affordable.length) {
      trainUnit(state, b, affordable[Math.floor(Math.random() * affordable.length)]);
    }
  }

  // 6. Attack timing — march once the army reaches strength.
  const playerTH = state.entities.find(e => !e.dead && e.kind === 'building' && e.type === 'townhall' && e.faction === FACTION.PLAYER);
  if (military.length >= 5 && !ai.attacking) {
    ai.attacking = true;
    ai.attackTime = state.time;
    const tgt = playerTH || state.entities.find(e => !e.dead && e.faction === FACTION.PLAYER);
    if (tgt) {
      for (const m of military) {
        m.command = 'attack-move';
        m.moveTarget = { x: tgt.x + rand(-60, 60), y: tgt.y + rand(-60, 60) };
      }
    }
  }
  if (ai.attacking && military.length < 2) ai.attacking = false; // regroup
  if (ai.attacking && state.time - ai.attackTime > 8) {
    for (const m of military) {
      if (!m.command || m.command === 'idle') {
        m.command = 'attack-move';
        if (playerTH) m.moveTarget = { x: playerTH.x + rand(-80, 80), y: playerTH.y + rand(-80, 80) };
      }
    }
    ai.attackTime = state.time;
  }
}
