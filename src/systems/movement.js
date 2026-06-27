// =====================================================================
// systems/movement.js — keeps units from stacking and from clipping into
// solids. Movement *along paths* is handled by world/Pathfinding's
// followPath; this is the per-frame separation pass that runs after every
// unit has moved.
// =====================================================================

import { TILE } from '../config/constants.js';

export function separateUnits(state) {
  const units = state.entities.filter(e => !e.dead && e.kind === 'unit');

  // Unit-unit: very soft separation so it doesn't fight the pathfinder.
  // Moving units push stationary ones aside, not the reverse.
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const minD = (a.radius + b.radius) * 0.82;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const overlap = minD - d;
      const nx = dx / d, ny = dy / d;
      const aMoving = Math.hypot(a.vx, a.vy) > 8;
      const bMoving = Math.hypot(b.vx, b.vy) > 8;
      let pushA = 0.5, pushB = 0.5;
      if (aMoving && !bMoving) { pushA = 0.05; pushB = 0.95; }
      if (!aMoving && bMoving) { pushA = 0.95; pushB = 0.05; }
      const f = overlap * 0.18;
      a.x -= nx * f * pushA;
      a.y -= ny * f * pushA;
      b.x += nx * f * pushB;
      b.y += ny * f * pushB;
    }
  }

  // Building / resource boundary: only nudge units clearly inside a solid.
  // A* keeps them out during travel; this is a safety net.
  for (const u of units) {
    for (const e of state.entities) {
      if (e.dead || (e.kind !== 'building' && e.kind !== 'resource')) continue;
      const hw = e.size * TILE / 2;
      const dx = u.x - e.x, dy = u.y - e.y;
      const penX = hw + u.radius - Math.abs(dx);
      const penY = hw + u.radius - Math.abs(dy);
      if (penX > 0 && penY > 0) {
        if (penX < penY) u.x += Math.sign(dx || 1) * penX * 0.4;
        else u.y += Math.sign(dy || 1) * penY * 0.4;
      }
    }
  }
}
