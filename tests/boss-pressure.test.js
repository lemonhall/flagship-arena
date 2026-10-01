import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaSim } from '../src/sim.js';
import { BOSS_PATTERNS, bossCommand } from '../src/bosses.js';
import { segmentDistance } from '../src/geometry.js';

function encounter(stage, kind, phase = 1) {
  const sim = new ArenaSim(71, { stage });
  sim.rocks = []; sim.pickups = []; sim.bossPhase = true;
  for (const unit of sim.units) if (!unit.player) unit.hp = 0;
  const boss = sim.spawn('e0', 1, { x: 0, y: 0 }, true);
  boss.nextBossAttack = 0; boss.attackIndex = BOSS_PATTERNS[stage].indexOf(kind);
  assert.ok(boss.attackIndex >= 0, `${kind} must be part of this boss's real rotation`);
  if (phase === 2) { boss.hp *= .49; boss.bossPhase = 2; }
  const player = sim.unit('p0'); player.pos = { x: 0, y: -100 }; player.heading = Math.PI / 2;
  return { sim, boss, player };
}

test('each boss rotates multiple attacks and the fleet uses five actual attack types', () => {
  const kinds = new Set();
  for (let stage = 0; stage < 6; stage++) {
    const { sim, boss } = encounter(stage, BOSS_PATTERNS[stage][0]);
    const seen = new Set();
    for (let i = 0; i < BOSS_PATTERNS[stage].length; i++) {
      boss.bossAttack = null; boss.nextBossAttack = sim.time;
      bossCommand(sim, boss); seen.add(boss.bossAttack.kind); kinds.add(boss.bossAttack.kind);
      sim.time += 10;
    }
    assert.ok(seen.size >= 2, `stage ${stage + 1} needs a varied rotation`);
  }
  assert.deepEqual([...kinds].sort(), ['barrage', 'charge', 'encircle', 'mortar', 'sweep']);
});

test('a moving flagship is led before warning lock, never tracked after it', () => {
  const { sim, boss, player } = encounter(0, 'barrage');
  player.speed = 29;
  bossCommand(sim, boss);
  assert.ok(boss.bossAttack.dir.x > .12, 'aim ahead of a ship moving to the right');
  const warning = structuredClone(sim.hazards);
  player.pos.x = -70; player.heading = -Math.PI / 2;
  sim.time += .2; bossCommand(sim, boss);
  assert.deepEqual(sim.hazards, warning, 'telegraphs remain committed');
});

for (const [stage, kind] of [[3, 'sweep'], [5, 'encircle']]) test(`${kind} hurts a stationary ship and a committed escape reduces damage`, () => {
  const tank = encounter(stage, kind), dodge = encounter(stage, kind);
  for (const fixture of [tank, dodge]) fixture.sim.step(1 / 60, { throttle: 0 });
  const warnings = structuredClone(tank.sim.hazards);
  assert.ok(warnings.length >= 5);
  assert.ok(warnings.every(h => h.impactAt - h.createdAt >= .85));
  let hits = 0;
  for (let i = 0; i < 280; i++) {
    const hp = tank.player.hp;
    tank.sim.step(1 / 60, { throttle: 0 });
    dodge.sim.step(1 / 60, { throttle: 1, boost: i === 0 });
    if (tank.player.hp < hp) {
      hits++;
      assert.ok(tank.sim.hazards.some(h => h.kind === kind), 'hits retain a visible warning');
    }
    assert.ok(tank.sim.projectiles.length <= 256);
    for (const h of tank.sim.hazards) {
      const initial = warnings.find(w => w.id === h.id);
      if (initial) assert.deepEqual(h.pos, initial.pos);
    }
  }
  assert.ok(hits > 0);
  assert.ok(dodge.player.hp > tank.player.hp, `${kind}: dodge ${dodge.player.hp}, tank ${tank.player.hp}`);
});

test('second phase widens the fan and shortens its preparation without removing warning time', () => {
  const first = encounter(0, 'barrage'), second = encounter(0, 'barrage', 2);
  for (const f of [first, second]) bossCommand(f.sim, f.boss);
  assert.ok(second.sim.hazards.length > first.sim.hazards.length);
  assert.ok(second.boss.bossAttack.fireAt < first.boss.bossAttack.fireAt);
  assert.ok(second.boss.bossAttack.fireAt - second.sim.time >= .85);
});

test('giant hull accepts a real near-edge shell while an outside shell misses', () => {
  for (const hit of [true, false]) {
    const { sim, boss } = encounter(5, 'encircle');
    assert.ok(boss.radius >= 18 && boss.bodyScale >= 2.6);
    sim.projectiles.push({ id: ++sim.serial, owner: 'p0', team: 0, gun: 'cannon',
      pos: { x: hit ? boss.radius - 1 : boss.radius + 2, y: -40 }, vel: { x: 0, y: 140 },
      age: 0, life: 1, height: 2, arc: 0, blast: 0, damage: 25 });
    for (let i = 0; i < 50; i++) sim.moveProjectiles(1 / 60);
    assert.equal(boss.hp < boss.maxHp, hit);
  }
});

test('special cannonballs stay inside their own telegraph until expiry, including diagonal sweeps', () => {
  for (const [stage, kind] of [[0, 'barrage'], [3, 'sweep'], [5, 'encircle']]) {
    const { sim, boss, player } = encounter(stage, kind);
    player.pos = { x: 90, y: -95 }; player.hp = player.maxHp = 4000;
    for (let i = 0; i < 290; i++) {
      sim.step(1 / 60, { throttle: 0 });
      for (const shell of sim.projectiles.filter(p => p.owner === boss.id && p.special)) {
        const marker = sim.hazards.find(h => h.id === shell.warningId);
        assert.ok(marker, 'each live shell keeps its own warning');
        if (marker.shape === 'circle') continue;
        const end = { x: marker.pos.x + marker.dir.x * marker.length, y: marker.pos.y + marker.dir.y * marker.length };
        assert.ok(segmentDistance(shell.pos, marker.pos, end) <= marker.radius);
      }
    }
  }
});
