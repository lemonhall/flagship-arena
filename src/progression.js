const integer = (v, min, max) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.trunc(Number(v)))) : min;
export const TRAINING = {
  gunnery: { name: '火炮工坊', description: '每级永久火力 +10%', costs: [12, 22, 36] },
  hull: { name: '船壳加固', description: '每级永久船体 +8%', costs: [12, 22, 36] },
  handling: { name: '操舵训练', description: '每级航速 +4% · 冲刺冷却 -10%', costs: [12, 22, 36] },
};
const income = p => p.migrationGrant + Object.values(p.rewards).reduce((sum, n) => sum + n, 0);
const spent = p => Object.entries(TRAINING).reduce((sum, [key, track]) => sum + track.costs.slice(0, p.training[key]).reduce((a, b) => a + b, 0), 0);
export function normalizeProgress(value = {}) {
  const cleared = integer(value?.cleared, 0, 6), voyage = cleared === 6 ? integer(value?.voyage ?? 1, 1, 999) : 1;
  const p = { version: 2, cleared, voyage, voyageCleared: voyage === 1 ? cleared : integer(value?.voyageCleared, 0, 6),
    migrationGrant: value?.version === 2 ? integer(value.migrationGrant, 0, 48) : cleared * 8,
    rewards: Object.fromEntries(Object.entries(value?.rewards && typeof value.rewards === 'object' ? value.rewards : {})
      .filter(([id]) => /^[a-zA-Z0-9:_-]{1,80}$/.test(id)).map(([id, n]) => [id, integer(n, 0, 200)])),
    training: Object.fromEntries(Object.keys(TRAINING).map(key => [key, integer(value?.training?.[key], 0, 3)])) };
  // Invalid saves must not create free training or an overdrawn balance.
  for (const key of ['handling', 'hull', 'gunnery']) while (spent(p) > income(p) && p.training[key]) p.training[key]--;
  return p;
}
export function mergeProgress(a, b) {
  a = normalizeProgress(a); b = normalizeProgress(b);
  const newer = a.voyage >= b.voyage ? a : b;
  const rewards = { ...a.rewards };
  for (const [id, n] of Object.entries(b.rewards)) rewards[id] = Math.max(rewards[id] || 0, n);
  return normalizeProgress({ ...newer, cleared: Math.max(a.cleared, b.cleared),
    voyageCleared: a.voyage === b.voyage ? Math.max(a.voyageCleared, b.voyageCleared) : newer.voyageCleared,
    migrationGrant: Math.max(a.migrationGrant, b.migrationGrant), rewards,
    training: Object.fromEntries(Object.keys(TRAINING).map(key => [key, Math.max(a.training[key], b.training[key])])) });
}
export function readProgress(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const current = store.getItem('flagship-progress-v2');
    if (current) { try { const parsed = JSON.parse(current); if (parsed?.version === 2) return normalizeProgress(parsed); } catch { /* try legacy */ } }
    return normalizeProgress(JSON.parse(store.getItem('flagship-progress-v1')));
  } catch { return normalizeProgress(); }
}
export function saveProgress(progress, storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    store.setItem('flagship-progress-v2', JSON.stringify(mergeProgress(progress, readProgress(store)))); return true;
  } catch { return false; }
}
export function recordVictory(progress, stage, voyage) {
  const p = normalizeProgress(progress);
  if (!Number.isInteger(stage) || stage < 0 || stage > 5 || voyage !== p.voyage || stage > p.voyageCleared) return p;
  return { ...p, cleared: Math.max(p.cleared, stage + 1), voyageCleared: Math.max(p.voyageCleared, stage + 1) };
}
export function nextVoyage(progress) {
  const p = normalizeProgress(progress);
  return p.voyageCleared === 6 && p.voyage < 999 ? { ...p, voyage: p.voyage + 1, voyageCleared: 0 } : p;
}
export function partsBalance(progress) { const p = normalizeProgress(progress); return Math.max(0, income(p) - spent(p)); }
export function awardRun(progress, id, amount) {
  const p = normalizeProgress(progress), reward = integer(amount, 0, 200);
  if (!reward || typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,80}$/.test(id) || Object.hasOwn(p.rewards, id)) return p;
  return { ...p, rewards: { ...p.rewards, [id]: reward } };
}
export function buyTraining(progress, key) {
  const p = normalizeProgress(progress), track = TRAINING[key];
  if (!track || p.training[key] >= 3 || partsBalance(p) < track.costs[p.training[key]]) return p;
  return { ...p, training: { ...p.training, [key]: p.training[key] + 1 } };
}
export function trainingStats(training = {}) {
  const g = integer(training.gunnery, 0, 3), h = integer(training.hull, 0, 3), m = integer(training.handling, 0, 3);
  return { damage: 1 + g * .1, hp: 1 + h * .08, speed: 1 + m * .04, boostCooldown: 1 - m * .1 };
}
