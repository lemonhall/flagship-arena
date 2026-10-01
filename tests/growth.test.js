// REQ-0002-003: migration, earned rewards, purchases, reload and idempotency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProgress, readProgress, saveProgress, mergeProgress, awardRun, buyTraining, partsBalance, trainingStats } from '../src/progression.js';

test('old ships and voyage migrate once, with a finite catch-up grant', () => {
  const store = new Map([['flagship-progress-v1', JSON.stringify({ cleared: 6, voyage: 2, voyageCleared: 3 })]]);
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = readProgress(storage);
  assert.equal(p.version, 2); assert.equal(p.cleared, 6); assert.equal(p.voyage, 2); assert.equal(p.voyageCleared, 3);
  assert.equal(partsBalance(p), 48);
  assert.equal(saveProgress(p, storage), true);
  assert.deepEqual(readProgress(storage), p);
  assert.deepEqual(mergeProgress(p, { cleared: 3 }), p);
});

test('earned parts survive defeat, repeat settlement cannot mint or refund spending', () => {
  const start = normalizeProgress();
  assert.deepEqual(buyTraining(start, 'gunnery'), start);
  const earned = awardRun(start, 'battle-1', 18);
  const bought = buyTraining(earned, 'gunnery');
  assert.equal(bought.training.gunnery, 1); assert.equal(partsBalance(bought), 6);
  assert.deepEqual(awardRun(bought, 'battle-1', 18), bought);
  assert.equal(partsBalance(mergeProgress(bought, earned)), 6);
  assert.ok(trainingStats(bought.training).damage > trainingStats(start.training).damage);
  assert.deepEqual(buyTraining(bought, 'unknown'), bought);
  assert.deepEqual(awardRun(start, 'empty-battle', 0), start);
});

test('malformed growth data cannot produce NaN, negative parts or unbounded training', () => {
  const p = normalizeProgress({ version: 2, earned: -3, training: { gunnery: 999, hull: NaN, handling: -1 } });
  assert.equal(partsBalance(p), 0);
  assert.ok(p.training.gunnery <= 3);
  assert.ok(Object.values(trainingStats(p.training)).every(Number.isFinite));
  assert.equal(saveProgress(p, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }), false);
});
