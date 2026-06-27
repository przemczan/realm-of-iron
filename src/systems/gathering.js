// =====================================================================
// systems/gathering.js — peasant resource economy: walk to a resource,
// harvest in cycles, carry the haul back to the nearest drop-off, repeat.
// Edit haul amounts / cooldowns in config/constants.js (GATHER).
// =====================================================================

import { GATHER, FACTION } from '../config/constants.js';
import { followPath } from '../world/Pathfinding.js';

export function handleGather(state, u, dt) {
  const carry = u.carrying;

  // Carrying → return to a drop-off.
  if (carry && carry.amount > 0) {
    const drop = state.findNearestDropoff(u);
    if (!drop) { u.command = 'idle'; u.carrying = null; return; }
    const spot = state.approachSpot(u, drop, u.radius + 6);
    if (spot.dist <= u.radius + 24) {
      const f = state.factions[u.faction];
      if (carry.type === 'gold') f.gold += carry.amount;
      else f.wood += carry.amount;
      if (u.faction === FACTION.PLAYER) {
        state.floatText(drop.x, drop.y - 20, `+${carry.amount} ${carry.type}`,
          carry.type === 'gold' ? '#ffd750' : '#a06a3a');
      }
      u.carrying = null;
      // Resume the same resource, or pick a fresh one if it's exhausted.
      const last = u.commandData?.resourceId ? state.getEntity(u.commandData.resourceId) : null;
      if (!last || last.dead) {
        const restype = u.command === 'gather-gold' ? 'gold' : 'wood';
        const res = state.findNearestResource(u, restype);
        if (res) u.commandData = { resourceId: res.id };
        else u.command = 'idle';
      }
    } else {
      followPath(state, u, spot.sx, spot.sy, u.radius, dt);
    }
    return;
  }

  // Empty-handed → go to the resource and harvest.
  const restype = u.command === 'gather-gold' ? 'gold' : 'wood';
  let res = u.commandData?.resourceId ? state.getEntity(u.commandData.resourceId) : null;
  if (!res || res.dead) {
    res = state.findNearestResource(u, restype);
    if (res) u.commandData = { resourceId: res.id };
    else { u.command = 'idle'; return; }
  }
  const spot = state.approachSpot(u, res, u.radius + 6);
  if (spot.dist <= u.radius + 22) {
    u.vx = u.vy = 0;
    u.facing = Math.atan2(spot.ey - u.y, spot.ex - u.x);
    if (u.gatherCooldown <= 0) {
      const rule = GATHER[restype];
      const take = Math.min(rule.haul, res.amount);
      res.amount -= take;
      u.carrying = { type: restype, amount: take };
      u.gatherCooldown = rule.cooldown;
    }
  } else {
    followPath(state, u, spot.sx, spot.sy, u.radius, dt);
  }
}

export function handleReturn(state, u, dt) {
  if (!u.carrying) { u.command = 'idle'; return; }
  const drop = state.findNearestDropoff(u);
  if (!drop) { u.command = 'idle'; u.carrying = null; return; }
  const spot = state.approachSpot(u, drop, u.radius + 6);
  if (spot.dist <= u.radius + 24) {
    const f = state.factions[u.faction];
    if (u.carrying.type === 'gold') f.gold += u.carrying.amount;
    else f.wood += u.carrying.amount;
    u.carrying = null;
    u.command = 'idle';
  } else {
    followPath(state, u, spot.sx, spot.sy, u.radius, dt);
  }
}
