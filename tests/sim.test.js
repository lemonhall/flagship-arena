import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaSim, sanitizeInput } from '../src/sim.js';
import { STAGES, HULLS, readProgress, saveProgress, recordVictory, nextVoyage, mergeProgress } from '../src/catalog.js';
import { normalizeProgress } from '../src/progression.js';
import { runBattle } from '../tools/battle-policy.mjs';
import { playCampaign } from '../tools/campaign.mjs';

test('six voyages unlock ships and recover malformed saves', () => {
  assert.deepEqual(STAGES.map(s => s.waves), [3, 3, 4, 4, 5, 5]);
  const store = { values: {}, getItem(k) { return this.values[k] || null; }, setItem(k, v) { this.values[k] = v; } };
  assert.deepEqual(readProgress(store), normalizeProgress());
  saveProgress({ cleared: 3 }, store);
  assert.equal(readProgress(store).cleared, 3);
  store.values = { 'flagship-progress-v1': '{"cleared":999}' };
  assert.equal(readProgress(store).cleared, 6);
  assert.equal(HULLS.at(-1).unlock, 6);
});

test('New Game+ carries ships, gates the next voyage, and old replays cannot regress progress', () => {
  let progress = normalizeProgress();
  assert.deepEqual(nextVoyage(progress), progress);
  for (let stage = 0; stage < 6; stage++) progress = recordVictory(progress, stage, 1);
  const second = nextVoyage(progress);
  assert.deepEqual(second, { ...progress, cleared: 6, voyage: 2, voyageCleared: 0 });
  assert.deepEqual(recordVictory(second, 5, 1), second);
  const won = recordVictory(second, 0, 2);
  assert.equal(won.voyageCleared, 1);
  assert.deepEqual(mergeProgress(won, progress), won);
  const store = { getItem() { return '{"cleared":6}'; }, setItem(k, v) { this.value = v; } };
  assert.deepEqual(readProgress(store), normalizeProgress({ cleared: 6 }));
  saveProgress(won, store); assert.deepEqual(JSON.parse(store.value), mergeProgress(won, readProgress(store)));
});

test('treasure ship has greater firepower and completes all six second-voyage battles', () => {
  const first = new ArenaSim(102);
  const report = [];
  for (let stage = 0; stage < 6; stage++) {
    const s = new ArenaSim(102 + stage, { stage, hull: 'zhenghe_baochuan', voyage: 2 });
    assert.ok(s.unit('e0').maxHp > first.unit('e0').maxHp);
    assert.ok(s.playerHull.firepower > first.playerHull.firepower);
    runBattle(s);
    assert.equal(s.outcome, 'victory', `second voyage, stage ${stage + 1}`);
    assert.equal(s.voyage, 2); assert.ok(s.time < 180);
    report.push({ stage: stage + 1, seconds: Math.round(s.time), outcome: s.outcome });
  }
  console.log('NEW_GAME_PLUS', JSON.stringify(report));
});

test('terrain is seeded, finite and keeps the starting fleet clear', () => {
  for (let seed = 1; seed < 50; seed++) {
    const sim = new ArenaSim(seed);
    assert.equal(sim.units.length, 6);
    assert.deepEqual(sim.rocks, new ArenaSim(seed).rocks);
    assert.notDeepEqual(sim.rocks, new ArenaSim(seed + 1).rocks);
    for (const u of sim.units) for (const r of sim.rocks)
      assert.ok(Math.hypot(u.pos.x - r.x, u.pos.y - r.y) > r.radius + 9);
  }
});

test('untrusted controls cannot change authoritative state or inject NaN', () => {
  assert.deepEqual(sanitizeInput({ steer: Infinity, throttle: -99, fire: true, hp: 999 }),
    { steer: 0, throttle: -.35, fire: true, boost: false, cycle: false });
});

test('flagship loss ends campaign immediately; supplies cannot revive it', () => {
  const s = new ArenaSim(7);
  s.damage(s.unit('p0'), 9999, 'e0');
  s.step(.05, {});
  assert.equal(s.outcome, 'defeat');
  assert.equal(s.unit('p0').hp, 0);
});

test('broadside needs an angle; real barrels spend ammunition without going negative', () => {
  const s = new ArenaSim(22), p = s.unit('p0'), target = s.unit('e0'); s.rocks = [];
  p.pos = { x: 0, y: 0 }; p.heading = 0; p.cooldown = 0; p.ammo = 2; target.pos = { x: 0, y: -70 };
  assert.equal(s.trigger(p, target), false);
  target.pos = { x: 70, y: 0 };
  assert.equal(s.trigger(p, target), true);
  for (let i = 0; i < 20; i++) s.advanceVolley(p, .05);
  assert.equal(p.ammo, 0); assert.equal(s.projectiles.length, 2);
  assert.equal(s.events.filter(e => e.type === 'shot').length, 2);
});

test('mortar arcs over a reef and damages a group at its landing point', () => {
  const s = new ArenaSim(22, { gun: 'mortar' }), p = s.unit('p0'), a = s.unit('e0'), b = s.unit('e1');
  p.pos = { x: 0, y: 0 }; p.cooldown = 0; p.ammo = 2;
  a.pos = { x: 130, y: 0 }; b.pos = { x: 138, y: 0 };
  s.rocks = [{ x: 65, y: 0, radius: 15, height: 12 }];
  assert.equal(s.trigger(p, a), true); s.advanceVolley(p, .05);
  assert.equal(p.ammo, 0);
  let peak = 0;
  for (let i = 0; i < 40; i++) { peak = Math.max(peak, ...s.projectiles.map(p => p.height)); s.moveProjectiles(.05); }
  assert.ok(peak > 35); assert.ok(a.hp < a.maxHp); assert.ok(b.hp < b.maxHp);
  assert.ok(s.events.some(e => e.type === 'blast'));
});

test('fresh save earns its training and completes six campaigns with real fire and bounded entities', () => {
  const { progress, runs } = playCampaign();
  console.log('CAMPAIGNS', JSON.stringify(runs));
  assert.equal(progress.cleared, 6);
  assert.deepEqual(runs.filter(r => r.outcome === 'victory').map(r => r.choices), [3, 3, 4, 4, 5, 5]);
  for (const r of runs) {
    assert.ok(r.maxShells <= 256 && r.highestEnemies <= 3 && r.balance >= 0);
    assert.ok(r.shots > 30);
    if (r.outcome === 'victory') {
      assert.equal(r.bosses, 1);
      assert.ok(r.kills >= STAGES[r.stage - 1].waves * 3 + 1);
    }
  }
});

test('same seed and controls produce the same battle', () => {
  const a = new ArenaSim(8), b = new ArenaSim(8);
  for (let i = 0; i < 400; i++) {
    const input = { steer: .2, fire: true, boost: i < 20 };
    a.step(.05, input); b.step(.05, input);
  }
  assert.deepEqual(a.units, b.units);
  assert.deepEqual(a.projectiles, b.projectiles);
});
