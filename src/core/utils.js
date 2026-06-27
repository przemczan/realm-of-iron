// =====================================================================
// utils.js — small, pure, reusable helpers. No game state, no DOM.
// =====================================================================

export function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

// Octile distance heuristic for grid A* (diagonal-aware).
export function octile(x1, y1, x2, y2) {
  const dx = Math.abs(x1 - x2), dy = Math.abs(y1 - y2);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}
