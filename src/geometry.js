export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const forward = h => ({ x: Math.sin(h), y: -Math.cos(h) });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, n) => ({ x: a.x * n, y: a.y * n });
export const norm = a => mul(a, 1 / (Math.hypot(a.x, a.y) || 1));
export const toward = (a, b) => norm({ x: b.x - a.x, y: b.y - a.y });
export const wrap = v => Math.atan2(Math.sin(v), Math.cos(v));
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return distance(p, { x: a.x + dx * t, y: a.y + dy * t });
}
