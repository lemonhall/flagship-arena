import { add, mul, norm, toward, distance, wrap, clamp, forward } from './geometry.js';
import { L } from './i18n.js';

export const BOSS_PATTERNS = [
  ['barrage', 'mortar'], ['mortar', 'sweep'], ['charge', 'barrage'],
  ['sweep', 'mortar', 'barrage'], ['charge', 'encircle', 'sweep'], ['encircle', 'sweep', 'charge', 'mortar'],
];
export const BOSS_LABELS = {
  barrage: L('扇形封锁 · 转舵冲出红线', 'Fan barrage · turn hard out of the red line'),
  mortar: L('预判曲射 · 改变航向', 'Leading mortar · change heading'),
  charge: L('巨舰冲撞 · 横向冲刺', 'Ram · boost sideways'),
  sweep: L('横扫排射 · 穿过炮火间隙', 'Sweeping broadside · slip through the gaps'),
  encircle: L('包夹轰炸 · 从缺口突围', 'Encirclement · break out through the opening'),
};
export const bossScale = stage => 2.6 + stage * .18;
const rotate = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

function warning(sim, boss, data) {
  const marker = { id: ++sim.serial, owner: boss.id, generation: boss.generation, createdAt: sim.time, ...data };
  sim.hazards.push(marker); return marker;
}
function beginAttack(sim, boss, target) {
  const patterns = [...BOSS_PATTERNS[sim.stage]];
  if (boss.bossPhase === 2) patterns.push(['sweep', 'encircle', 'mortar', 'encircle', 'mortar', 'barrage'][sim.stage]);
  const kind = patterns[boss.attackIndex++ % patterns.length];
  const enraged = boss.bossPhase === 2, prepare = kind === 'charge' ? (enraged ? 1.1 : 1.35) : (enraged ? .95 : 1.2);
  // Snapshot a bounded lead once. Never move an already-visible warning to follow the player.
  const leadTime = clamp((prepare + distance(boss.pos, target.pos) / 150) * .65, .6, 1.35);
  const aim = add(target.pos, mul(forward(target.heading), clamp(target.speed * leadTime, -18, 42)));
  const origin = { ...boss.pos }, dir = toward(origin, aim), fireAt = sim.time + prepare;
  const attack = { kind, origin, dir, fireAt, round: 0, phase: boss.bossPhase, shots: [] };
  const muzzle = add(origin, mul(dir, boss.radius * .75));
  const addMortar = (pos, delay) => {
    const at = fireAt + delay, life = 1.05, blast = 24;
    const marker = warning(sim, boss, { kind, shape: 'circle', pos, radius: blast + 6,
      impactAt: at + life, expiresAt: at + life + .15 });
    attack.shots.push({ at, origin: muzzle, dir: toward(muzzle, pos), speed: distance(muzzle, pos) / life,
      life, blast, damage: 110 + sim.stage * 10, warningId: marker.id });
  };
  const addLane = (direction, at, rounds, gap) => {
    const speed = kind === 'sweep' ? 165 : 145, life = 330 / speed;
    const marker = warning(sim, boss, { kind, shape: 'lane', pos: muzzle, dir: direction, length: 330, radius: 9,
      impactAt: at, expiresAt: at + (rounds - 1) * gap + life + .15 });
    for (let i = 0; i < rounds; i++) attack.shots.push({ at: at + i * gap, origin: muzzle, dir: direction,
      speed, life, damage: 30 + sim.stage * 4, warningId: marker.id });
  };
  if (kind === 'encircle') {
    // Five/six perimeter blasts leave a visible opening; the centre detonates last.
    const count = enraged ? 7 : 6, gap = Math.floor(count / 4), radius = enraged ? 72 : 64;
    for (let i = 0; i < count; i++) if (i !== gap) addMortar(add(aim, mul(rotate(dir, i * Math.PI * 2 / count), radius)), i * .1);
    addMortar(aim, .75);
    if (enraged) addMortar(add(aim, mul(dir, 40)), 1.0);
  } else if (kind === 'mortar') {
    const side = { x: -dir.y, y: dir.x };
    const points = [aim, add(aim, mul(side, -46)), add(aim, mul(side, 46)), add(aim, mul(dir, 44)), add(aim, mul(dir, -44))];
    if (enraged) points.push(add(aim, mul(side, -88)), add(aim, mul(side, 88)));
    points.forEach((pos, i) => addMortar(pos, i * .16));
  } else if (kind === 'charge') {
    attack.chargeRadius = boss.radius + 7;
    warning(sim, boss, { kind, shape: 'lane', pos: origin, dir, length: 85 * 1.65, radius: attack.chargeRadius,
      impactAt: fireAt, expiresAt: fireAt + 1.8 });
  } else if (kind === 'sweep') {
    const count = enraged ? 7 : 5, order = boss.attackIndex % 2 ? 1 : -1;
    for (let i = 0; i < count; i++) addLane(rotate(dir, (i - (count - 1) / 2) * .15 * order), fireAt + i * .24, 3, .12);
  } else {
    const count = enraged ? 7 : 5;
    for (let i = 0; i < count; i++) addLane(rotate(dir, (i - (count - 1) / 2) * .13), fireAt, enraged ? 5 : 4, .22);
  }
  attack.shots.sort((a, b) => a.at - b.at);
  boss.bossAttack = attack;
  sim.emit('boss_warning', { id: boss.id, kind, phase: boss.bossPhase });
}
function shell(sim, boss, shot) {
  if (sim.projectiles.length >= 256) return;
  sim.projectiles.push({ id: ++sim.serial, owner: boss.id, team: 1, gun: shot.blast ? 'mortar' : 'culverin',
    pos: { ...shot.origin }, vel: mul(shot.dir, shot.speed), age: 0, life: shot.life, height: 2.2,
    arc: shot.blast ? 42 : 2, blast: shot.blast || 0, special: true, warningId: shot.warningId,
    damage: shot.damage * sim.rules.enemyDamage });
  sim.emit('shot', { id: boss.id, pos: shot.origin, dir: shot.dir, gun: shot.blast ? 'mortar' : 'culverin', heavy: true });
}

/** Boss state belongs to the unit; hazards and shells use the normal simulation clock. */
export function bossCommand(sim, boss) {
  const player = sim.unit('p0');
  if (!player || player.hp <= 0) return { throttle: 0 };
  if (boss.hp <= boss.maxHp * .5 && boss.bossPhase === 1) {
    boss.bossPhase = 2; sim.emit('boss_phase', { id: boss.id, phase: 2 });
  }
  const radial = toward(boss.pos, player.pos), tangent = { x: -radial.y, y: radial.x };
  const desired = distance(boss.pos, player.pos) > 150 ? norm(add(radial, mul(tangent, .25))) : tangent;
  if (!boss.bossAttack && sim.time >= boss.nextBossAttack) beginAttack(sim, boss, player);
  const attack = boss.bossAttack;
  if (!attack) return { steer: clamp(wrap(Math.atan2(desired.x, -desired.y) - boss.heading) * 2.5, -1, 1), throttle: .8 };
  const heading = Math.atan2(attack.dir.x, -attack.dir.y) - (attack.kind === 'charge' ? 0 : Math.PI / 2);
  if (sim.time < attack.fireAt) return { steer: clamp(wrap(heading - boss.heading) * 4, -1, 1), throttle: 0 };
  let complete = false;
  if (attack.kind === 'charge') {
    if (!attack.round) {
      attack.round = 1; boss.charge = { dir: attack.dir, until: sim.time + 1.65, hit: new Set(), damage: (115 + sim.stage * 10) * sim.rules.enemyDamage };
      boss.heading = Math.atan2(attack.dir.x, -attack.dir.y);
      sim.emit('boss_charge', { id: boss.id, pos: { ...boss.pos } });
    }
    complete = sim.time >= boss.charge.until;
  } else {
    while (attack.round < attack.shots.length && sim.time >= attack.shots[attack.round].at)
      shell(sim, boss, attack.shots[attack.round++]);
    complete = attack.round >= attack.shots.length;
  }
  if (complete) {
    boss.bossAttack = null; boss.charge = null;
    boss.openUntil = sim.time + (boss.bossPhase === 2 ? 2.6 : 3.2);
    boss.nextBossAttack = sim.time + (boss.bossPhase === 2 ? 3.25 : 4.25);
    sim.emit('boss_open', { id: boss.id });
  }
  return { throttle: 0 };
}

export function dangerEscape(hazard, pos) {
  if (hazard.shape === 'circle') return distance(pos, hazard.pos) < hazard.radius + 14 ? toward(hazard.pos, pos) : null;
  const rel = { x: pos.x - hazard.pos.x, y: pos.y - hazard.pos.y };
  const along = rel.x * hazard.dir.x + rel.y * hazard.dir.y;
  const across = rel.x * -hazard.dir.y + rel.y * hazard.dir.x;
  return along > -12 && along < hazard.length + 12 && Math.abs(across) < hazard.radius + 14
    ? { x: -hazard.dir.y * (across < 0 ? -1 : 1), y: hazard.dir.x * (across < 0 ? -1 : 1) } : null;
}
