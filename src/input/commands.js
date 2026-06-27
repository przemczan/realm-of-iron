// =====================================================================
// input/commands.js — translates player intent into unit/building orders.
//
// Pure state mutations: no DOM here. The UI reflects state.buildMode and
// selection on its own. This is where right-click semantics (move /
// attack / gather / repair / assist-build) and building placement live.
// =====================================================================

import { FACTION } from '../config/constants.js';
import { UNITS } from '../config/units.js';
import { BUILDINGS } from '../config/buildings.js';
import { invalidatePaths } from '../world/Pathfinding.js';

// Interpret a right-click at (wx, wy) for the current selection.
export function issueRightClick(state, wx, wy) {
  if (state.selected.size === 0) return;
  const target = state.entityAtPoint(wx, wy);
  const sel = [...state.selected].map(id => state.getEntity(id)).filter(Boolean);
  const selectedUnits = sel.filter(e => e.kind === 'unit' && e.faction === FACTION.PLAYER);
  const selectedBuildings = sel.filter(e => e.kind === 'building' && e.faction === FACTION.PLAYER);

  // Buildings only → set a rally point.
  if (selectedBuildings.length && !selectedUnits.length) {
    for (const b of selectedBuildings) {
      if (BUILDINGS[b.type].produces || BUILDINGS[b.type].isDropoff) {
        b.rally = { x: wx, y: wy };
      }
    }
    state.rightClickFx.push({ x: wx, y: wy, life: 0.8, color: '#ffe070' });
    return;
  }

  if (!selectedUnits.length) return;

  const n = selectedUnits.length;
  selectedUnits.forEach((u, i) => {
    let cmd, data, mx = wx, my = wy;
    if (target && target.faction !== FACTION.PLAYER && target.kind !== 'resource') {
      cmd = 'attack';
      data = { targetId: target.id };
    } else if (target && target.kind === 'resource') {
      if (UNITS[u.type].canGather) {
        cmd = target.type === 'gold' ? 'gather-gold' : 'gather-wood';
        data = { resourceId: target.id };
      } else cmd = 'move';
    } else if (target && target.kind === 'building' && target.faction === FACTION.PLAYER && !target.isComplete) {
      cmd = UNITS[u.type].canBuild ? 'assist-build' : 'move';
      if (cmd === 'assist-build') data = { buildingId: target.id };
    } else if (target && target.kind === 'building' && target.faction === FACTION.PLAYER &&
               target.isComplete && target.hp < target.maxHp) {
      cmd = UNITS[u.type].canBuild ? 'repair' : 'move';
      if (cmd === 'repair') data = { buildingId: target.id };
    } else {
      cmd = 'move';
    }
    // Spread destinations in a small ring to avoid stacking.
    if (n > 1) {
      const ang = (i / n) * Math.PI * 2;
      const r = Math.min(28, 6 + n * 2);
      mx += Math.cos(ang) * r; my += Math.sin(ang) * r;
    }
    u.target = data && data.targetId ? data.targetId : null;
    u.moveTarget = { x: mx, y: my };
    u.command = cmd;
    u.commandData = data || null;
    u.path = null;
    u.pathTo = null;
  });

  const hostile = target && target.faction !== FACTION.PLAYER && target.kind !== 'resource';
  state.rightClickFx.push({ x: wx, y: wy, life: 0.6, color: hostile ? '#ff6060' : '#60ff90' });
}

export function cancelBuildMode(state) {
  state.buildMode = null;
}

export function startBuildMode(state, buildingType) {
  const def = BUILDINGS[buildingType];
  const f = state.factions.player;
  if (f.gold < def.cost.gold || f.wood < (def.cost.wood || 0)) {
    state.setStatus(`Not enough resources for ${def.name}.`, 2);
    return;
  }
  const peasants = [...state.selected].map(id => state.getEntity(id))
    .filter(e => e && e.type === 'peasant' && e.faction === FACTION.PLAYER);
  if (!peasants.length) {
    state.setStatus('Select a peasant first.', 2);
    return;
  }
  state.buildMode = { type: buildingType, faction: FACTION.PLAYER };
}

export function tryPlaceBuilding(state) {
  if (!state.buildMode) return;
  const def = BUILDINGS[state.buildMode.type];
  const TILE = 32;
  const tx = Math.floor(state.mouse.worldX / TILE) - Math.floor(def.size / 2);
  const ty = Math.floor(state.mouse.worldY / TILE) - Math.floor(def.size / 2);
  if (!state.canPlaceBuilding(tx, ty, def.size)) {
    state.setStatus('Cannot build there.', 1.5);
    return;
  }
  const f = state.factions.player;
  if (f.gold < def.cost.gold || f.wood < (def.cost.wood || 0)) {
    state.setStatus('Not enough resources.', 1.5);
    return;
  }
  f.gold -= def.cost.gold;
  f.wood -= def.cost.wood || 0;
  const b = state.add(state.createBuilding(state.buildMode.type, FACTION.PLAYER, tx, ty, false));
  invalidatePaths(state);

  const peasants = [...state.selected].map(id => state.getEntity(id))
    .filter(e => e && e.type === 'peasant' && e.faction === FACTION.PLAYER);
  for (const p of peasants) {
    p.command = 'assist-build';
    p.commandData = { buildingId: b.id };
    p.moveTarget = { x: b.x, y: b.y };
    p.target = null;
  }
  cancelBuildMode(state);
}
