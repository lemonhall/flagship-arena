// REQ-0002-001/002/004: real weapons, wave choices and boss attacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaSim } from '../src/sim.js';

test('finishing a wave freezes combat until exactly one offered upgrade is selected', () => {
  const s = new ArenaSim(1);
  for (const enemy of s.living(1)) s.damage(enemy, 9999, 'p0');
  s.step(1 / 60, {});
  assert.equal(s.upgradeChoices.length, 3);
  assert.equal(new Set(s.upgradeChoices).size, 3);
  const t = s.time;
  s.step(.05, { fire: true }); assert.equal(s.time, t);
  assert.equal(s.chooseUpgrade('invalid'), false);
  assert.ok(s.upgradeChoices.includes('battery'));
  const before = s.weaponFor(s.unit('p0')).barrels;
  assert.equal(s.chooseUpgrade('battery'), true);
  assert.equal(s.weaponFor(s.unit('p0')).barrels, before + 2);
  assert.equal(s.chooseUpgrade('battery'), false);
  s.step(.05, {}); assert.ok(s.time > t);
});

test('growth changes real shells, burn ticks and bounded sinking explosions', () => {
  const s = new ArenaSim(2); s.rocks = [];
  const player = s.unit('p0'), enemy = s.unit('e0'), nearby = s.unit('e1');
  player.pos = { x: 0, y: 0 }; player.heading = 0; player.cooldown = 0;
  enemy.pos = { x: 55, y: 0 }; nearby.pos = { x: 63, y: 0 };
  s.upgradeChoices = ['heated', 'loader', 'hull']; s.chooseUpgrade('heated');
  s.upgradeChoices = ['chain', 'loader', 'hull']; s.chooseUpgrade('chain');
  assert.equal(s.trigger(player, enemy), true); s.advanceVolley(player, .05);
  for (let i = 0; i < 12; i++) s.moveProjectiles(.05);
  assert.ok(enemy.burn?.until > s.time);
  const hp = enemy.hp; s.tickBurns(.5); assert.ok(enemy.hp < hp);
  const nearbyHp = nearby.hp; s.damage(enemy, 9999, 'p0');
  assert.ok(nearby.hp < nearbyHp); assert.ok(s.events.some(e => e.type === 'chain_blast'));
});

function bossFixture(stage = 0) {
  const s = new ArenaSim(3, { stage }); s.rocks = []; s.pickups = []; s.bossPhase = true;
  for (const u of s.units) if (!u.player) u.hp = 0;
  s.spawn('e0', 1, { x: 0, y: 0 }, true);
  const player = s.unit('p0'); player.pos = { x: 0, y: -100 }; player.heading = Math.PI / 2;
  return s;
}
function reachWarning(s) {
  for (let i = 0; i < 200 && !s.hazards.length; i++) s.step(.05, { throttle: 0 });
  assert.ok(s.hazards.length > 0); assert.ok(s.hazards[0].impactAt > s.time);
}

test('boss barrage warns before firing, committed aim can be dodged, recovery is vulnerable', () => {
  const tank = bossFixture(), dodge = bossFixture();
  reachWarning(tank); reachWarning(dodge);
  const hp = tank.unit('p0').hp;
  for (let i = 0; i < 100; i++) { tank.step(.05, { throttle: 0 }); dodge.step(.05, { throttle: 1, boost: i === 0 }); }
  assert.ok(tank.unit('p0').hp < hp, 'standing in the marked lanes must hurt');
  assert.ok(dodge.unit('p0').hp > tank.unit('p0').hp, 'leaving the lane avoids damage');
  const boss = dodge.unit('e0'); assert.ok(boss.openUntil > dodge.time, 'attack ends in an actual recovery window');
  const before = boss.hp; dodge.damage(boss, 20, 'p0'); assert.ok(before - boss.hp > 20);
});

for (const [stage, kind] of [[1, 'mortar'], [2, 'charge']]) test(`${kind} locks its warning, causes real damage, and can be escaped`, () => {
  const tank = bossFixture(stage), dodge = bossFixture(stage);
  reachWarning(tank); reachWarning(dodge);
  assert.equal(tank.hazards[0].kind, kind);
  const markers = structuredClone(dodge.hazards), hp = tank.unit('p0').hp;
  let hit = false;
  for (let i = 0; i < 95; i++) {
    const before = tank.unit('p0').hp;
    tank.step(.05, { throttle: 0 }); dodge.step(.05, { throttle: 1, boost: i === 0 });
    if (tank.unit('p0').hp < before) {
      hit = true;
      assert.ok(tank.hazards.some(h => h.kind === kind), 'damage keeps a visible warning');
    }
    for (const marker of dodge.hazards) {
      const original = markers.find(m => m.id === marker.id);
      if (original) assert.deepEqual(marker.pos, original.pos, 'committed aim never follows the player');
    }
  }
  assert.ok(hit && tank.unit('p0').hp < hp);
  assert.ok(dodge.unit('p0').hp > tank.unit('p0').hp);
});

test('boost counter strengthens one actual volley and does not stay permanently active', () => {
  const s = new ArenaSim(2); s.rocks = [];
  s.upgradeChoices = ['counter', 'hull', 'loader']; s.chooseUpgrade('counter');
  const p = s.unit('p0'), e = s.unit('e0');
  p.pos = { x: 0, y: 0 }; p.heading = 0; e.pos = { x: 60, y: 0 };
  s.step(.05, { boost: true, throttle: 0 });
  p.cooldown = 0;
  assert.equal(s.trigger(p, e), true); s.advanceVolley(p, .05);
  assert.equal(s.projectiles.find(shell => shell.owner === 'p0').damage, s.weaponFor(p).damage * 1.6);
  assert.equal(p.counterUntil, 0);
});

test('all six bosses expose distinct patterns and enter their second phase', () => {
  const patterns = new Set();
  for (let stage = 0; stage < 6; stage++) {
    const s = bossFixture(stage); reachWarning(s);
    patterns.add(s.unit('e0').bossAttack.kind);
    s.unit('e0').hp = s.unit('e0').maxHp * .49;
    s.step(.05, { throttle: 0 });
    assert.equal(s.unit('e0').bossPhase, 2);
    assert.ok(s.living(1).length <= 3);
  }
  assert.deepEqual([...patterns].sort(), ['barrage', 'charge', 'encircle', 'mortar', 'sweep']);
});

test('enemy AI does not chase supplies it cannot collect', () => {
  const a = new ArenaSim(19), b = new ArenaSim(19);
  for (const s of [a, b]) { s.pickups = []; s.unit('e0').hp = 1; s.unit('e0').ammo = 120; }
  b.spawnPickup({ x: b.unit('e0').pos.x - 50, y: b.unit('e0').pos.y }, 'repair');
  assert.deepEqual(a.aiCommand(a.unit('e0')), b.aiCommand(b.unit('e0')));
});

test('barrage damage stays inside a live warning, including its last long-range shell', () => {
  const s = bossFixture(); reachWarning(s);
  s.unit('p0').pos = { x: 0, y: -240 };
  let previousHp = s.unit('p0').hp;
  for (let i = 0; i < 100; i++) {
    s.step(.05, { throttle: 0 });
    if (s.projectiles.some(p => p.special)) assert.ok(s.hazards.some(h => h.kind === 'barrage'), 'live shells still have marked lanes');
    if (s.unit('p0').hp < previousHp) assert.ok(s.hazards.some(h => h.kind === 'barrage' && h.length >= 240), 'long-range hit is also inside the marker');
    previousHp = s.unit('p0').hp;
  }
});

test('a charging boss stops at reefs instead of pushing its damage outside the warning', () => {
  const s = bossFixture(2), boss = s.unit('e0'), player = s.unit('p0');
  boss.pos = { x: 100, y: 0 }; boss.nextBossAttack = 0;
  player.pos = { x: 100, y: -130 };
  s.rocks = [{ x: 103, y: -60, radius: 26, height: 8 }];
  reachWarning(s); player.pos = { x: 62, y: -77 };
  const hp = player.hp;
  for (let i = 0; i < 80; i++) s.step(.05, { throttle: 0 });
  assert.equal(player.hp, hp, 'being outside the fixed charge lane is safe');
});
