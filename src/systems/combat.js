// =====================================================================
// systems/combat.js — pursuit, attacking, damage application, and
// projectile flight. Edit melee/ranged behavior here without touching
// movement, gathering, or AI.
// =====================================================================

import { UNITS } from '../config/units.js';
import { followPath } from '../world/Pathfinding.js';

export function pursueAndAttack(state, u, target, dt) {
  const def = UNITS[u.type];
  const dx = target.x - u.x, dy = target.y - u.y;
  const d = Math.hypot(dx, dy);
  u.facing = Math.atan2(dy, dx);
  const reach = def.range + (target.radius || 0);
  if (d <= reach) {
    u.vx = u.vy = 0;
    if (u.attackTimer <= 0) {
      attackEntity(state, u, target);
      u.attackTimer = def.attackCd;
    }
  } else {
    // Ranged units stop at the edge of range; melee end up adjacent via
    // the separation pass.
    followPath(state, u, target.x, target.y, reach * 0.9, dt);
  }
}

export function attackEntity(state, u, target) {
  const def = UNITS[u.type];
  if (def.ranged) {
    const dx = target.x - u.x, dy = target.y - u.y;
    const d = Math.hypot(dx, dy);
    const speed = 360;
    state.projectiles.push({
      x: u.x, y: u.y,
      vx: dx / d * speed, vy: dy / d * speed,
      life: d / speed,
      damage: def.damage,
      targetId: target.id,
      attackerId: u.id,
      faction: u.faction,
    });
  } else {
    damageEntity(state, target, def.damage, u.id);
    state.hitFx.push({ x: target.x, y: target.y, life: 0.18, r: target.radius + 4, color: '#fff' });
  }
}

export function damageEntity(state, target, dmg, attackerId) {
  if (target.dead) return;
  target.hp -= dmg;
  target.flash = 0.15;
  state.hitFx.push({ x: target.x, y: target.y, life: 0.22, r: (target.radius || 10) + 2, color: '#ffaa44' });
  // Idle units near the attacker turn to retaliate.
  if (target.kind === 'unit' && (!target.command || target.command === 'idle') && !target.target) {
    const a = state.getEntity(attackerId);
    if (a && !a.dead && a.faction !== target.faction) {
      target.target = a.id;
      target.command = 'attack';
    }
  }
}

export function updateProjectiles(state, dt) {
  for (const p of state.projectiles) {
    if (p.dead) continue;
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) {
      const tgt = state.getEntity(p.targetId);
      if (tgt && !tgt.dead) damageEntity(state, tgt, p.damage, p.attackerId);
      p.dead = true;
    }
  }
  state.projectiles = state.projectiles.filter(p => !p.dead);
}
