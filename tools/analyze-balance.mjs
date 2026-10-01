import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ArenaSim } from '../src/sim.js';
import { runBattle } from './battle-policy.mjs';
import { playCampaign } from './campaign.mjs';

// Observe the real rules with repeatable inputs. This is balance evidence,
// not a claim about human win rates or a test that every policy should win.
const scenarios = [
  { name: 'first-stage-starter', stage: 0, hull: 'caravel', voyage: 1 },
  { name: 'first-stage-first-training', stage: 0, hull: 'caravel', voyage: 1, training: { gunnery: 1, hull: 1, handling: 1 } },
  { name: 'first-stage-trained', stage: 0, hull: 'caravel', voyage: 1, training: { gunnery: 3, hull: 3, handling: 3 } },
  { name: 'last-stage-unlocked-hull', stage: 5, hull: 'ship_of_line', voyage: 1 },
  { name: 'second-voyage-treasure', stage: 0, hull: 'zhenghe_baochuan', voyage: 2 },
];
const policies = {
  stationary: () => ({ throttle: 0, fire: false }),
  circleWithoutFire: () => ({ steer: .32, throttle: .6, fire: false }),
  circleWithFire: () => ({ steer: .32, throttle: .6, fire: true }),
  existingAI: sim => sim.aiCommand(sim.unit('p0')),
};
const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
const rows = [];
const round = n => Math.round(n * 100) / 100;
const median = values => {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return round(ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2);
};

for (const scenario of scenarios) for (const [policy, command] of Object.entries(policies)) {
  for (const seed of seeds) {
    const sim = new ArenaSim(seed, scenario), player = sim.unit('p0');
    const metrics = { scenario: scenario.name, policy, seed, enemyDamage: 0, stormDamage: 0,
      firstMinuteEnemyDamage: 0, effectiveRepair: 0, playerDamage: 0, allyDamage: 0,
      bossAt: null, enemyDamageDuringBoss: 0, deathSource: null, minimumHp: player.hp,
      bossWarnings: 0, upgrades: [], startingDamage: sim.weaponFor(player).damage };
    const damage = sim.damage.bind(sim), collect = sim.collect.bind(sim);
    sim.damage = (unit, amount, source, chain) => {
      const hp = unit.hp;
      damage(unit, amount, source, chain);
      const actual = hp - unit.hp;
      if (unit.player) {
        metrics.minimumHp = Math.min(metrics.minimumHp, unit.hp);
        if (source === 'storm') metrics.stormDamage += actual;
        else {
          metrics.enemyDamage += actual;
          if (sim.time <= 60) metrics.firstMinuteEnemyDamage += actual;
          if (metrics.bossAt !== null) metrics.enemyDamageDuringBoss += actual;
        }
        if (hp > 0 && unit.hp === 0) metrics.deathSource = source;
      } else if (unit.team === 1) {
        if (source === 'p0') metrics.playerDamage += actual;
        else if (source === 'p1' || source === 'p2') metrics.allyDamage += actual;
      }
    };
    sim.collect = dt => {
      const hp = player.hp;
      collect(dt);
      metrics.effectiveRepair += Math.max(0, player.hp - hp);
    };
    runBattle(sim, command, () => {
      if (metrics.bossAt === null && sim.events.some(event => event.type === 'boss')) metrics.bossAt = sim.time;
      metrics.bossWarnings += sim.events.filter(event => event.type === 'boss_warning').length;
    });
    metrics.upgrades = sim.upgrades;
    rows.push({ ...metrics, outcome: sim.outcome, seconds: sim.time, maximumHp: player.maxHp,
      finalHp: player.hp, finalDamage: sim.weaponFor(player).damage, parts: sim.loot,
      bossSeconds: metrics.bossAt === null ? null : sim.time - metrics.bossAt });
  }
}

const summary = scenarios.flatMap(scenario => Object.keys(policies).map(policy => {
  const sample = rows.filter(row => row.scenario === scenario.name && row.policy === policy);
  const bosses = sample.filter(row => row.bossAt !== null);
  return {
    scenario: scenario.name, policy, runs: sample.length,
    wins: sample.filter(row => row.outcome === 'victory').length,
    stormDeaths: sample.filter(row => row.deathSource === 'storm').length,
    combatDeaths: sample.filter(row => row.deathSource !== null && row.deathSource !== 'storm').length,
    medianSeconds: median(sample.map(row => row.seconds)),
    medianMinimumHpPercent: median(sample.map(row => 100 * row.minimumHp / row.maximumHp)),
    medianFirstMinuteEnemyDamage: median(sample.map(row => row.firstMinuteEnemyDamage)),
    medianTotalEnemyDamage: median(sample.map(row => row.enemyDamage)),
    medianEffectiveRepair: median(sample.map(row => row.effectiveRepair)),
    medianAllyDamageSharePercent: median(sample.map(row => 100 * row.allyDamage / (row.allyDamage + row.playerDamage || 1))),
    bossEncounters: bosses.length,
    medianBossSeconds: median(bosses.map(row => row.bossSeconds)),
    medianEnemyDamageDuringBoss: median(bosses.map(row => row.enemyDamageDuringBoss)),
    medianBossWarnings: median(bosses.map(row => row.bossWarnings)),
    medianParts: median(sample.map(row => row.parts)),
  };
}));

const report = {
  checkedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: Object.fromEntries(['src/sim.js', 'src/bosses.js', 'src/upgrades.js', 'src/progression.js', 'src/catalog.js', 'src/geometry.js', 'tools/battle-policy.mjs', 'tools/campaign.mjs'].map(path =>
    [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
  stepSeconds: 1 / 60, seeds, scenarios,
  notes: [
    'All scenarios use the default cannon, real game rules and only offered upgrade choices.',
    'Existing AI has access to simulation state and is not a human skill estimate.',
    'First-minute damage counts only enemy combat damage before 60 seconds or the end of battle.',
    'Boss damage counts all enemy combat damage after boss arrival, including escorts.',
    'Repairs are actual HP restored; overhealing is excluded.',
    'Damage shares exclude storm damage; stationary and circleWithoutFire never fire.',
    'Source hashes identify the tested working files, including changes after sourceCommit.',
  ],
  summary, runs: rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]))),
};
const fresh = summary.filter(row => row.scenario === 'first-stage-starter');
assert.ok(fresh.find(row => row.policy === 'stationary').wins <= 1);
assert.ok(fresh.find(row => row.policy === 'circleWithFire').wins <= 8);
assert.ok(fresh.find(row => row.policy === 'existingAI').wins > fresh.find(row => row.policy === 'circleWithFire').wins);
assert.ok(summary.find(row => row.scenario === 'first-stage-trained' && row.policy === 'existingAI').wins > fresh.find(row => row.policy === 'existingAI').wins);
const campaign = playCampaign();
assert.equal(campaign.progress.cleared, 6);
report.campaign = campaign;
await mkdir('evidence', { recursive: true });
await writeFile(process.argv[2] || 'evidence/combat-balance-v2.json', JSON.stringify(report, null, 2) + '\n', 'utf8');
console.table(summary);
