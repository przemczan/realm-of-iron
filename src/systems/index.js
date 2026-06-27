// =====================================================================
// systems/index.js — the simulation orchestrator.
//
// updateWorld() defines the fixed order systems run each frame, and
// updateUnit() is the thin dispatcher that routes a unit to the right
// behavior based on its current command. Each behavior lives in its own
// system module, so mechanics can be edited in isolation.
// =====================================================================

import { WORLD_W, WORLD_H } from '../config/constants.js';
import { clamp } from '../core/utils.js';
import { followPath, invalidatePaths } from '../world/Pathfinding.js';

import { handleGather, handleReturn } from './gathering.js';
import { handleBuild, handleRepair } from './construction.js';
import { pursueAndAttack, updateProjectiles } from './combat.js';
import { separateUnits } from './movement.js';
import { updateBuilding, recomputeSupply } from './production.js';
import { runAI } from './ai.js';

// Route a unit to the behavior matching its current command.
function updateUnit(state, u, dt) {
  if (u.attackTimer > 0) u.attackTimer -= dt;
  if (u.gatherCooldown > 0) u.gatherCooldown -= dt;

  let target = u.target ? state.getEntity(u.target) : null;
  if (target && target.dead) target = null;

  switch (u.command) {
    case 'gather-gold':
    case 'gather-wood': return handleGather(state, u, dt);
    case 'return':      return handleReturn(state, u, dt);
    case 'assist-build':return handleBuild(state, u, dt);
    case 'repair':      return handleRepair(state, u, dt);
  }

  if (u.command === 'attack' && target) return pursueAndAttack(state, u, target, dt);

  if (u.command === 'attack-move') {
    const enemy = state.findNearestEnemy(u, 180);
    if (enemy) return pursueAndAttack(state, u, enemy, dt);
  }

  // Idle defensive auto-engage.
  if (!u.moveTarget && (!u.command || u.command === 'idle')) {
    const enemy = state.findNearestEnemy(u, 120);
    if (enemy) return pursueAndAttack(state, u, enemy, dt);
  }

  if (u.moveTarget) {
    const stillMoving = followPath(state, u, u.moveTarget.x, u.moveTarget.y, 4, dt);
    if (!stillMoving) { u.moveTarget = null; u.command = 'idle'; }
  } else {
    u.vx = u.vy = 0;
  }

  u.x = clamp(u.x, u.radius, WORLD_W - u.radius);
  u.y = clamp(u.y, u.radius, WORLD_H - u.radius);
}

export function updateWorld(state, dt, bus) {
  state.time += dt;

  for (const e of state.entities) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    if (e.kind === 'unit') updateUnit(state, e, dt);
    else if (e.kind === 'building') updateBuilding(state, e, dt);
  }

  separateUnits(state);
  updateProjectiles(state, dt);

  // Transient FX lifetimes.
  for (const fx of state.rightClickFx) fx.life -= dt;
  state.rightClickFx = state.rightClickFx.filter(f => f.life > 0);
  for (const ft of state.floatTexts) { ft.life -= dt; ft.y += ft.vy * dt; }
  state.floatTexts = state.floatTexts.filter(f => f.life > 0);
  for (const hf of state.hitFx) hf.life -= dt;
  state.hitFx = state.hitFx.filter(f => f.life > 0);

  // Death cleanup + win/loss detection.
  for (const e of state.entities) {
    if (e.dead) continue;
    if (e.hp <= 0 && e.kind !== 'resource') {
      e.dead = true;
      state.selected.delete(e.id);
      if (e.kind === 'building') invalidatePaths(state);
      if (e.kind === 'building' && e.type === 'townhall' && !state.gameOver) {
        const victory = e.faction !== 'player';
        state.gameOver = victory ? 'win' : 'loss';
        bus.emit('game:over', { victory });
      }
    }
    if (e.kind === 'resource' && e.amount <= 0) {
      e.dead = true;
      invalidatePaths(state);
    }
  }
  state.entities = state.entities.filter(e => !e.dead);

  recomputeSupply(state);

  // AI runs on a fixed cadence.
  state.aiThink -= dt;
  if (state.aiThink <= 0) {
    runAI(state, dt);
    state.aiThink = 0.5;
  }

  if (state.statusUntil < state.time) state.statusMsg = '';
}
