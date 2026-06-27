// =====================================================================
// render/sprites.js — how individual entities are drawn to the canvas.
//
// Pure drawing: every function takes the 2D context and reads (never
// mutates) the GameState. The hand-built medieval art — keep, drill-hall,
// hooded archer, mounted knight, gold mine, layered trees — lives here so
// visuals can be reworked without touching simulation code.
// =====================================================================

import { TILE, FACTION } from '../config/constants.js';
import { UNITS } from '../config/units.js';
import { BUILDINGS } from '../config/buildings.js';

// ---------------------------------------------------------------------
// Health / progress bar (shared by units and buildings)
// ---------------------------------------------------------------------
export function drawHPBar(ctx, cx, cy, w, frac) {
  const h = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(cx - w / 2 - 1, cy - 1, w + 2, h + 2);
  let color = '#5dcb4a';
  if (frac < 0.6) color = '#e0c040';
  if (frac < 0.3) color = '#d04030';
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, cy, w * frac, h);
}

// ---------------------------------------------------------------------
// Resources — gold mine (rocky outcrop) and trees (layered canopy)
// ---------------------------------------------------------------------
export function drawResource(ctx, state, e) {
  const cam = state.camera;
  const sx = Math.round(e.x - cam.x), sy = Math.round(e.y - cam.y);
  if (e.type === 'gold') {
    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 18, 30, 12, 0, 0, Math.PI * 2); ctx.fill();

    // Rocky mound — stacked boulders, dark base to light crown
    const rocks = [
      [-16, 6, 16, '#5c5650'], [16, 8, 15, '#544e48'],
      [-9, -4, 17, '#6f685f'], [10, -3, 16, '#6a635a'],
      [0, 2, 20, '#766e64'], [-2, -12, 14, '#837a6e'],
    ];
    for (const [dx, dy, r, col] of rocks) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(sx + dx, sy + dy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,250,235,0.18)';
    ctx.beginPath(); ctx.arc(sx - 3, sy - 16, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 8, sy - 6, 6, 0, Math.PI * 2); ctx.fill();

    // Mine entrance — dark arch with timber frame
    ctx.fillStyle = '#241c14';
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy + 12);
    ctx.lineTo(sx - 10, sy + 1);
    ctx.arc(sx, sy + 1, 10, Math.PI, 0);
    ctx.lineTo(sx + 10, sy + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a3f25';
    ctx.fillRect(sx - 13, sy - 2, 4, 16);
    ctx.fillRect(sx + 9, sy - 2, 4, 16);
    ctx.fillRect(sx - 13, sy - 4, 26, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx - 13, sy - 4, 26, 1);

    // Gold veins glinting in the rock (deterministic per mine)
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + e.id * 0.7;
      const rr = 9 + (i % 3) * 3;
      const gx = sx + Math.cos(a) * rr;
      const gy = sy - 6 + Math.sin(a) * rr * 0.7;
      ctx.fillStyle = i % 2 ? '#ffe680' : '#e8b020';
      ctx.beginPath(); ctx.arc(gx, gy, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(sx - 6, sy - 12, 1.2, 0, Math.PI * 2); ctx.fill();

    // Amount label
    ctx.font = 'bold 10px Georgia';
    ctx.fillStyle = '#3a2a10';
    ctx.strokeStyle = 'rgba(255,230,150,0.7)';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.strokeText(e.amount, sx, sy - 26);
    ctx.fillText(e.amount, sx, sy - 26);
  } else {
    // Tree — tapered trunk + layered, shaded canopy
    const v = (e.id * 2654435761) >>> 0;
    const lean = ((v & 7) - 3.5) * 0.4;
    const scale = 0.9 + ((v >> 3) & 7) / 22;

    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(sx + 2, sy + 11, 11 * scale, 4.5, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#4a3220';
    ctx.beginPath();
    ctx.moveTo(sx - 3, sy + 11);
    ctx.lineTo(sx - 2 + lean, sy - 2);
    ctx.lineTo(sx + 2 + lean, sy - 2);
    ctx.lineTo(sx + 3, sy + 11);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx + lean, sy + 9); ctx.lineTo(sx + lean, sy - 1); ctx.stroke();

    const cx = sx + lean, cy = sy - 9 * scale;
    const blob = (dx, dy, r, col) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r * scale, 0, Math.PI * 2); ctx.fill();
    };
    blob(-7, 4, 9, '#234016');
    blob(7, 4, 9, '#234016');
    blob(0, 6, 10, '#2c5019');
    blob(-5, -2, 9, '#356121');
    blob(6, -1, 8, '#356121');
    blob(0, -3, 10, '#3d6e26');
    blob(-3, -7, 6, '#4f8a30');
    ctx.fillStyle = 'rgba(190,230,140,0.35)';
    ctx.beginPath(); ctx.arc(cx - 4, cy - 8, 3.5 * scale, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------------
// Buildings — town hall keep, barracks drill-hall, farm, construction site
// ---------------------------------------------------------------------
export function drawBuilding(ctx, state, b) {
  const cam = state.camera;
  const sx = b.x - cam.x, sy = b.y - cam.y;
  const def = BUILDINGS[b.type];
  const w = def.size * TILE;
  const halfW = w / 2;
  const selected = state.selected.has(b.id);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + halfW * 0.8, halfW * 0.95, halfW * 0.35, 0, 0, Math.PI * 2); ctx.fill();

  const accent = b.faction === FACTION.PLAYER ? '#5d8be0' : '#e06b5d';
  const accentDk = b.faction === FACTION.PLAYER ? '#3a5c9a' : '#a23c33';
  const L = sx - halfW, T = sy - halfW;

  function banner(px, poleTop, poleBot, flagDown) {
    ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, poleBot); ctx.lineTo(px, poleTop); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(px, poleTop);
    ctx.lineTo(px + 13, poleTop + 2);
    ctx.lineTo(px + 10, poleTop + 6);
    ctx.lineTo(px + 13, poleTop + 10);
    ctx.lineTo(px, poleTop + flagDown);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(px, poleTop + flagDown - 4);
    ctx.lineTo(px + 10, poleTop + 6);
    ctx.lineTo(px + 13, poleTop + 10);
    ctx.lineTo(px, poleTop + flagDown);
    ctx.closePath(); ctx.fill();
  }

  if (!b.isComplete) {
    // Construction site: foundation, rising stone courses, scaffolding
    ctx.fillStyle = '#4a3f30';
    ctx.fillRect(L + 3, T + 3, w - 6, w - 6);
    ctx.fillStyle = '#6b6157';
    ctx.fillRect(L + 6, T + 6, w - 12, w - 12);
    const prog = Math.max(0, Math.min(1, b.buildProgress / b.buildTotal));
    const rows = Math.max(1, Math.round((w - 16) / 10));
    ctx.fillStyle = '#837a6e';
    for (let r = 0; r < rows; r++) {
      if (r / rows > prog) break;
      const ry = T + w - 10 - r * 10;
      for (let c = 0; c < (w - 16) / 12; c++) {
        ctx.fillRect(L + 8 + c * 12 + (r % 2 ? 6 : 0), ry, 10, 8);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
        ctx.strokeRect(L + 8 + c * 12 + (r % 2 ? 6 : 0), ry, 10, 8);
      }
    }
    ctx.strokeStyle = '#8a6238'; ctx.lineWidth = 2;
    ctx.strokeRect(L + 5, T + 5, w - 10, w - 10);
    ctx.beginPath();
    ctx.moveTo(L + 5, T + 5); ctx.lineTo(L + w - 5, T + w - 5);
    ctx.stroke();
  } else if (b.type === 'townhall') {
    ctx.fillStyle = '#5b5247'; ctx.fillRect(L + 4, T + 8, w - 8, w - 12);
    ctx.fillStyle = '#7d7468'; ctx.fillRect(L + 8, T + 10, w - 16, w - 18);
    ctx.fillStyle = 'rgba(255,250,240,0.10)'; ctx.fillRect(L + 8, T + 10, w - 16, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1;
    for (let yy = T + 22; yy < T + w - 14; yy += 12) {
      ctx.beginPath(); ctx.moveTo(L + 8, yy); ctx.lineTo(L + w - 8, yy); ctx.stroke();
    }
    ctx.fillStyle = accentDk;
    ctx.beginPath();
    ctx.moveTo(sx, T - 2);
    ctx.lineTo(sx + 18, T + 14);
    ctx.lineTo(sx - 18, T + 14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.moveTo(sx, T - 2); ctx.lineTo(sx + 18, T + 14); ctx.lineTo(sx, T + 14); ctx.closePath(); ctx.fill();
    for (const cxT of [L + 12, sx + halfW - 12]) {
      ctx.fillStyle = '#6b6256';
      ctx.beginPath(); ctx.arc(cxT, T + 14, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#857c6f';
      ctx.beginPath(); ctx.arc(cxT, T + 14, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a4239';
      for (let m = -1; m <= 1; m++) ctx.fillRect(cxT - 9 + (m + 1) * 7, T + 4, 4, 5);
    }
    ctx.fillStyle = '#3a2614';
    ctx.beginPath();
    ctx.moveTo(sx - 9, sy + halfW - 6);
    ctx.lineTo(sx - 9, sy + 6);
    ctx.arc(sx, sy + 6, 9, Math.PI, 0);
    ctx.lineTo(sx + 9, sy + halfW - 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a3f22'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(180,180,180,0.4)'; ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sx + i * 5, sy - 1); ctx.lineTo(sx + i * 5, sy + halfW - 8); ctx.stroke(); }
    ctx.fillStyle = '#1c140a';
    ctx.fillRect(sx - 16, sy - 4, 4, 9);
    ctx.fillRect(sx + 12, sy - 4, 4, 9);
    banner(sx + 2, T - 22, T - 2, 16);
  } else if (b.type === 'barracks') {
    ctx.fillStyle = '#5a5048'; ctx.fillRect(L + 4, sy - 6, w - 8, halfW - 2);
    ctx.fillStyle = '#6e4d2c'; ctx.fillRect(L + 6, T + 16, w - 12, halfW + 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
    for (let xx = L + 14; xx < L + w - 8; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, T + 18); ctx.lineTo(xx, sy + 4); ctx.stroke(); }
    ctx.fillStyle = '#7a4a2a';
    ctx.beginPath(); ctx.moveTo(L + 2, T + 20); ctx.lineTo(sx, T - 4); ctx.lineTo(sx, T + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5e3820';
    ctx.beginPath(); ctx.moveTo(L + w - 2, T + 20); ctx.lineTo(sx, T - 4); ctx.lineTo(sx, T + 20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, T - 4); ctx.lineTo(sx, T + 20); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 2); ctx.lineTo(sx - 9, sy + 6); ctx.lineTo(sx - 9, sy + 16);
    ctx.lineTo(sx, sy + 22); ctx.lineTo(sx + 9, sy + 16); ctx.lineTo(sx + 9, sy + 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy + 17); ctx.lineTo(sx + 5, sy + 7);
    ctx.moveTo(sx + 5, sy + 17); ctx.lineTo(sx - 5, sy + 7);
    ctx.stroke();
    ctx.fillStyle = '#2a1c10';
    ctx.fillRect(sx - halfW + 12, sy + halfW - 20, 12, 16);
    banner(L + 8, T + 4, T + 24, 14);
    banner(sx + halfW - 10, T + 4, T + 24, 14);
  } else if (b.type === 'farm') {
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(L + 3, T + 3, w - 6, w - 6);
    ctx.fillStyle = '#5a3d22';
    for (let i = 0; i < (w - 12) / 7; i++) ctx.fillRect(L + 6 + i * 7, T + 6, 3, w - 12);
    ctx.fillStyle = '#86b04a';
    for (let r = 0; r < (w - 16) / 8; r++)
      for (let c = 0; c < (w - 12) / 7; c++)
        ctx.fillRect(L + 7 + c * 7, T + 9 + r * 8, 2, 4);
    ctx.fillStyle = '#d8c24a';
    for (let r = 0; r < (w - 16) / 8; r++)
      for (let c = 0; c < (w - 12) / 7; c++)
        if (((r + c) & 1) === 0) ctx.fillRect(L + 7 + c * 7, T + 9 + r * 8, 2, 2);
    const bx = L + 16, by = T + 16;
    ctx.fillStyle = '#7a3a2a'; ctx.fillRect(bx - 9, by - 3, 18, 16);
    ctx.fillStyle = '#9a4a36';
    ctx.beginPath(); ctx.moveTo(bx - 11, by - 3); ctx.lineTo(bx, by - 12); ctx.lineTo(bx + 11, by - 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a2010'; ctx.fillRect(bx - 3, by + 4, 6, 9);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx - 9, by + 4); ctx.lineTo(bx + 9, by + 4); ctx.stroke();
    ctx.fillStyle = '#a99a78'; ctx.fillRect(sx + halfW - 16, sy + 2, 9, 18);
    ctx.fillStyle = '#8a7c5e';
    ctx.beginPath(); ctx.arc(sx + halfW - 11.5, sy + 2, 4.5, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 1.5; ctx.strokeRect(L + 3, T + 3, w - 6, w - 6);
  }

  if (b.flash > 0) {
    ctx.fillStyle = `rgba(255,248,200,${0.55 * (b.flash / 0.15)})`;
    ctx.fillRect(L + 2, T + 2, w - 4, w - 4);
  }

  if (!b.isComplete) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(sx - halfW, sy + halfW + 4, w, 6);
    ctx.fillStyle = '#a0c060';
    ctx.fillRect(sx - halfW, sy + halfW + 4, w * (b.buildProgress / b.buildTotal), 6);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - halfW, sy + halfW + 4, w, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(sx - halfW + 4, sy - halfW + 4); ctx.lineTo(sx + halfW - 4, sy + halfW - 4);
    ctx.moveTo(sx + halfW - 4, sy - halfW + 4); ctx.lineTo(sx - halfW + 4, sy + halfW - 4);
    ctx.stroke();
  }

  if (b.hp < b.maxHp || selected) {
    drawHPBar(ctx, sx, sy - halfW - 8, w - 6, b.hp / b.maxHp);
  }

  if (b.productionQueue.length && b.isComplete) {
    const def2 = UNITS[b.productionQueue[0]];
    const p = b.productionTimer / def2.buildTime;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(sx - halfW, sy + halfW + 4, w, 4);
    ctx.fillStyle = '#60b0e0';
    ctx.fillRect(sx - halfW, sy + halfW + 4, w * p, 4);
  }

  if (selected) {
    ctx.strokeStyle = b.faction === FACTION.PLAYER ? '#a0ff80' : '#ff8080';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx - halfW - 3, sy - halfW - 3, w + 6, w + 6);
    ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------------
// Units — peasant, footman, hooded archer, mounted knight
// ---------------------------------------------------------------------
export function drawUnit(ctx, state, u) {
  const cam = state.camera;
  const sx = u.x - cam.x, sy = u.y - cam.y;
  const def = UNITS[u.type];
  const selected = state.selected.has(u.id);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(sx, sy + u.radius * 0.7, u.radius * 0.85, u.radius * 0.35, 0, 0, Math.PI * 2); ctx.fill();

  if (selected) {
    ctx.strokeStyle = u.faction === FACTION.PLAYER ? '#a0ff80' : '#ff8080';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy + u.radius * 0.7, u.radius * 1.0, u.radius * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
  }

  const accent = u.faction === FACTION.PLAYER ? '#5d8be0' : '#e06b5d';
  const accentDk = u.faction === FACTION.PLAYER ? '#2f5390' : '#9a382f';
  const dx = Math.cos(u.facing), dy = Math.sin(u.facing);
  const px = -dy, py = dx;
  const moving = (u.vx * u.vx + u.vy * u.vy) > 64;
  const bob = moving ? Math.sin(state.time * 12 + u.id) * 1.3 : 0;
  const bx = sx, by = sy + bob;
  const R = u.radius;
  ctx.strokeStyle = '#1a1208';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  if (u.type === 'peasant') {
    ctx.strokeStyle = '#5a4226'; ctx.lineWidth = 2.5;
    const stride = moving ? Math.sin(state.time * 12 + u.id) * 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - 3, by + R - 2); ctx.lineTo(bx - 3 + stride, by + R + 4);
    ctx.moveTo(bx + 3, by + R - 2); ctx.lineTo(bx + 3 - stride, by + R + 4);
    ctx.stroke();
    ctx.fillStyle = def.color[u.faction];
    ctx.strokeStyle = '#3a2a16'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(bx, by, R * 0.85, R, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(bx, by + R * 0.4, R * 0.8, R * 0.5, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = '#6b4a28'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - R * 0.7, by + 2); ctx.lineTo(bx + R * 0.7, by + 2); ctx.stroke();
    ctx.fillStyle = '#e8c89a'; ctx.strokeStyle = '#3a2a16'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by - R * 0.8, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accentDk;
    ctx.beginPath(); ctx.arc(bx, by - R * 0.95, 4.4, Math.PI, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b4a28'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + dx * 3, by + dy * 3 - 2); ctx.lineTo(bx + dx * 12, by + dy * 12 - 6); ctx.stroke();
    ctx.strokeStyle = '#9a9a9a';
    ctx.beginPath(); ctx.moveTo(bx + dx * 12 - px * 3, by + dy * 12 - 6 - py * 3); ctx.lineTo(bx + dx * 12 + px * 3, by + dy * 12 - 6 + py * 3); ctx.stroke();
  } else if (u.type === 'footman') {
    ctx.fillStyle = accent; ctx.strokeStyle = accentDk; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(bx + px * R * 0.9, by + py * R * 0.9 + 1, 5.5, 7, u.facing, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#dfe3e8';
    ctx.beginPath(); ctx.arc(bx + px * R * 0.9, by + py * R * 0.9 + 1, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8ecf0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(bx + dx * 2, by + dy * 2); ctx.lineTo(bx + dx * (R + 9), by + dy * (R + 9)); ctx.stroke();
    ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx + dx * (R + 1) - px * 3, by + dy * (R + 1) - py * 3); ctx.lineTo(bx + dx * (R + 1) + px * 3, by + dy * (R + 1) + py * 3); ctx.stroke();
    ctx.fillStyle = '#9aa1ab'; ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(bx - 2.5, by - R + 2, 5, R * 2 - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(bx - R * 0.3, by - R * 0.3, R * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8bdc4'; ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by - R * 0.55, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#4a4f56'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, by - R * 0.55 - 4); ctx.lineTo(bx, by - R * 0.55 + 4); ctx.stroke();
  } else if (u.type === 'archer') {
    ctx.fillStyle = def.color[u.faction]; ctx.strokeStyle = '#243018'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(bx, by, R * 0.82, R, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(bx, by + R * 0.45, R * 0.7, R * 0.45, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = '#6b4a28'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx - dx * 5, by - dy * 5); ctx.lineTo(bx - dx * 9, by - dy * 9 - 4); ctx.stroke();
    ctx.fillStyle = accentDk; ctx.strokeStyle = '#243018'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by - R * 0.55, 4.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8c89a';
    ctx.beginPath(); ctx.arc(bx + dx * 1.5, by + dy * 1.5 - R * 0.55, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 1.8;
    const bcx = bx + dx * R * 0.7, bcy = by + dy * R * 0.7;
    ctx.beginPath(); ctx.arc(bcx, bcy, 8, u.facing - 1.5, u.facing + 1.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,240,230,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bcx + Math.cos(u.facing - 1.5) * 8, bcy + Math.sin(u.facing - 1.5) * 8);
    ctx.lineTo(bcx + Math.cos(u.facing + 1.5) * 8, bcy + Math.sin(u.facing + 1.5) * 8);
    ctx.stroke();
    ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bcx + dx * 6, bcy + dy * 6); ctx.stroke();
  } else if (u.type === 'knight') {
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(u.facing);
    ctx.fillStyle = u.faction === FACTION.PLAYER ? '#5a4030' : '#4a3328';
    ctx.strokeStyle = '#241810'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.15, R * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(R * 1.1, -1, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#241810'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-R * 1.1, 0); ctx.lineTo(-R * 1.5, -3); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(-R * 0.6, -R * 0.65, R * 1.1, 3);
    ctx.restore();
    ctx.fillStyle = '#aab0b8'; ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, by - 2, R * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(bx - 2, by - 4, R * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bcc2c9'; ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by - R * 0.7, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = u.faction === FACTION.PLAYER ? '#e0c050' : '#202020';
    ctx.beginPath();
    ctx.moveTo(bx, by - R * 0.7 - 3);
    ctx.lineTo(bx - 3, by - R * 0.7 - 11);
    ctx.lineTo(bx + 3, by - R * 0.7 - 9);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c0a070'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(bx - dx * 4, by - dy * 4 - 2); ctx.lineTo(bx + dx * (R + 13), by + dy * (R + 13) - 2); ctx.stroke();
    ctx.fillStyle = '#e6e6e6';
    ctx.beginPath(); ctx.arc(bx + dx * (R + 13), by + dy * (R + 13) - 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(bx + dx * (R + 6), by + dy * (R + 6) - 2);
    ctx.lineTo(bx + dx * (R + 6) + px * 5, by + dy * (R + 6) + py * 5 - 2);
    ctx.lineTo(bx + dx * (R + 10), by + dy * (R + 10) - 2);
    ctx.closePath(); ctx.fill();
  }
  ctx.lineCap = 'butt';

  if (u.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.6 * (u.flash / 0.15)})`;
    ctx.beginPath(); ctx.arc(bx, by, R + 2, 0, Math.PI * 2); ctx.fill();
  }

  if (u.carrying) {
    ctx.fillStyle = u.carrying.type === 'gold' ? '#ffd750' : '#8a5a2a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx + 6, sy - u.radius - 4, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  if (u.hp < u.maxHp || selected) {
    drawHPBar(ctx, sx, sy - u.radius - 8, 22, u.hp / u.maxHp);
  }
}
