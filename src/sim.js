import { HULLS, STAGES, WEAPONS, voyageRules } from './catalog.js';
import { trainingStats } from './progression.js';
import { UPGRADES, offerUpgrades, upgradedWeapon } from './upgrades.js';
import { bossCommand, dangerEscape, bossScale } from './bosses.js';
import { clamp, distance, forward, add, mul, norm, toward, wrap, segmentDistance } from './geometry.js';
export { WEAPONS } from './catalog.js';
export { clamp, distance, forward, segmentDistance } from './geometry.js';
const TAU = Math.PI * 2;
export function sanitizeInput(input = {}) {
  return { steer: Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0,
    throttle: Number.isFinite(input.throttle) ? clamp(input.throttle, -.35, 1) : .6,
    fire: input.fire === true, boost: input.boost === true, cycle: input.cycle === true };
}
class RNG {
  constructor(seed) { this.seed = seed >>> 0 || 1; }
  next() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
}

/** Fixed-step rules. Coordinates are metres on the X/Z sea plane (pos.y is Z). */
export class ArenaSim {
  constructor(seed = Math.floor(Math.random() * 0xffffffff), options = {}) {
    this.seed = seed >>> 0 || 1; this.rng = new RNG(this.seed);
    this.stage = clamp(Math.trunc(options.stage || 0), 0, 5);
    this.voyage = Number.isFinite(options.voyage) ? clamp(Math.trunc(options.voyage), 1, 999) : 1;
    this.rules = voyageRules(this.voyage);
    this.training = trainingStats(options.training);
    this.upgrades = {}; this.upgradeChoices = []; this.upgradesChosen = 0; this.normalKills = 0; this.loot = 0;
    this.hazards = []; this.bossReinforcements = 0; this.deathCause = '';
    this.time = 0; this.outcome = 'active'; this.serial = 0;
    this.units = []; this.rocks = []; this.projectiles = []; this.pickups = []; this.events = []; this.pending = [];
    this.score = [0, 0]; this.spawned = 3; this.wave = 1; this.bossPhase = false; this.supplyWave = 0;
    this.playerHull = HULLS.find(h => h.id === options.hull) || HULLS[0];
    this.playerGun = WEAPONS[options.gun] ? options.gun : 'cannon';
    for (let attempt = 0; this.rocks.length < 9 && attempt < 400; attempt++) {
      const r = { x: this.rng.range(-235, 235), y: this.rng.range(-220, 220), radius: this.rng.range(12, 26), height: this.rng.range(5, 13) };
      if (Math.hypot(r.x, r.y) > 255 || Math.abs(r.x) < 78 || this.rocks.some(o => distance(o, r) < o.radius + r.radius + 30)) continue;
      this.rocks.push(r);
    }
    for (let team = 0; team < 2; team++) for (let i = 0; i < 3; i++) {
      this.spawn(`${team ? 'e' : 'p'}${i}`, team, { x: [0, -42, 42][i], y: team ? -115 : 115 }, false);
    }
    for (let i = 0; i < 5; i++) this.spawnPickup({ x: (i - 2) * 28, y: 30 }, i === 0 ? 'repair' : 'ammo');
    this.events = [];
  }
  unit(id) { return this.units.find(u => u.id === id); }
  living(team) { return this.units.filter(u => u.team === team && u.hp > 0); }
  radius() { return 290 - 140 * clamp((this.time - 110) / 160, 0, 1); }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  spawn(id, team, pos, boss) {
    const player = id === 'p0', old = this.unit(id);
    const hull = player ? this.playerHull.id : boss ? STAGES[this.stage].hull : team ? HULLS[Math.min(1 + this.stage, 5)].id : 'brig';
    const baseHp = player ? this.playerHull.hp * this.training.hp : boss ? 1400 + this.stage * 190 : team ? 195 + this.stage * 23 : 255 + this.stage * 15;
    const hp = Math.round(baseHp * (team ? this.rules.enemyHp : 1));
    const gun = player ? this.playerGun : boss ? (this.stage % 2 ? 'mortar' : 'culverin') : ['cannon', 'light', 'grapeshot'][Number(id[1])];
    const bodyScale = boss ? bossScale(this.stage) : 1;
    const u = { id, team, pos: { ...pos }, heading: team ? Math.PI : 0, hull, gun, player, boss, bodyScale, radius: 7 * bodyScale, hp, maxHp: hp, ammo: 120,
      cooldown: team ? 1 : .1, volley: null, speed: 0, boost: 0, boostCd: 0, target: null, cycleHeld: false, generation: (old?.generation || 0) + 1,
      bossPhase: 1, attackIndex: 0, bossAttack: null, openUntil: 0, nextBossAttack: this.time + 2, burn: null, counterUntil: 0 };
    if (old) this.units[this.units.indexOf(old)] = u; else this.units.push(u);
    this.emit('spawn', { id, pos: { ...pos }, boss }); return u;
  }
  spawnPoint(team, boss = false) {
    const clearance = boss ? 7 * bossScale(this.stage) : 7;
    let best = { x: 0, y: team ? -210 : 210 }, quality = -Infinity;
    for (let i = 0; i < 70; i++) {
      const a = this.rng.range(0, TAU), r = this.rng.range(100, this.radius() - 15);
      const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      if (this.rocks.some(o => distance(o, p) < o.radius + clearance + 7)) continue;
      const d = Math.min(...this.living(1 - team).map(u => distance(u.pos, p)));
      const crowd = this.living(team).some(u => distance(u.pos, p) < 26);
      const q = -Math.abs(d - 130) - (crowd ? 150 : 0);
      if (q > quality) { quality = q; best = p; }
    }
    return best;
  }
  clearShot(a, b) { return !this.rocks.some(r => segmentDistance(r, a, b) < r.radius); }
  broadside(u, target) {
    if (u.gun === 'mortar') return true;
    const to = toward(u.pos, target.pos), f = forward(u.heading);
    return Math.abs(f.x * to.x + f.y * to.y) <= .78;
  }
  validTarget(u, target) {
    return target && target.hp > 0 && target.team !== u.team && distance(u.pos, target.pos) <= WEAPONS[u.gun].range &&
      (u.gun === 'mortar' || this.clearShot(u.pos, target.pos));
  }
  targetFor(u) {
    const enemies = this.living(1 - u.team);
    const priority = target => u.team && u.id === 'e0' && target.player ? .9 : 1;
    return enemies.sort((a, b) => distance(u.pos, a.pos) * priority(a) - distance(u.pos, b.pos) * priority(b))[0];
  }
  weaponFor(u) {
    const base = WEAPONS[u.gun];
    return u.player ? upgradedWeapon(base, this.upgrades, this.playerHull, this.rules, this.training)
      : { ...base, damage: base.damage * (u.team ? .54 * (base.pellets > 1 ? .65 : 1) * this.rules.enemyDamage : .4), reload: base.reload * (u.team ? 1 : 1.15) };
  }
  chooseUpgrade(id) {
    if (this.outcome !== 'active' || !this.upgradeChoices.includes(id) || !UPGRADES[id]) return false;
    this.upgrades[id] = (this.upgrades[id] || 0) + 1; this.upgradesChosen++; this.upgradeChoices = [];
    if (id === 'hull') { const p = this.unit('p0'); p.maxHp += 65; p.hp = Math.min(p.maxHp, p.hp + 100); }
    this.emit('upgrade_chosen', { id }); return true;
  }
  trigger(u, target) {
    const w = this.weaponFor(u);
    if (u.cooldown > 0 || u.volley || u.ammo < w.cost || !this.validTarget(u, target) || !this.broadside(u, target)) return false;
    u.cooldown = w.reload; u.volley = { left: w.barrels, clock: 0, target: target.id, weapon: w, counter: u.player && u.counterUntil > this.time ? 1.6 : 1 };
    u.counterUntil = 0; return true;
  }
  aiCommand(u) {
    const target = this.unit(u.target)?.hp > 0 ? this.unit(u.target) : this.targetFor(u);
    if (!target || u.hp <= 0) return { throttle: .4 };
    const radial = toward(u.pos, target.pos), d = distance(u.pos, target.pos), side = Number(u.id[1]) % 2 ? -1 : 1;
    const tangent = { x: -radial.y * side, y: radial.x * side }, reach = WEAPONS[u.gun].range;
    let desired = d > reach * .66 ? norm(add(radial, mul(tangent, .4))) : d < reach * .28 ? norm(add(mul(radial, -1), tangent)) : tangent;
    if (u.hp / u.maxHp < .24) desired = norm(add(mul(radial, -.6), tangent));
    const need = u.ammo < 35 ? 'ammo' : u.hp < u.maxHp * .55 ? 'repair' : null;
    const pickup = !u.team && need && this.pickups.filter(p => p.kind === need).sort((a, b) => distance(a.pos, u.pos) - distance(b.pos, u.pos))[0];
    if (pickup && distance(pickup.pos, u.pos) < 130) desired = toward(u.pos, pickup.pos);
    if (Math.hypot(u.pos.x, u.pos.y) > this.radius() - 22) desired = toward(u.pos, { x: 0, y: 0 });
    for (const rock of this.rocks) if (distance(add(u.pos, mul(desired, 34)), rock) < rock.radius + 18)
      desired = norm(add(mul(desired, .35), mul(toward(rock, u.pos), 1.3)));
    const threat = this.projectiles.find(p => p.team !== u.team && distance(p.pos, u.pos) < 24);
    if (threat) desired = norm(add(desired, mul(toward(threat.pos, u.pos), .7)));
    const escape = !u.team && this.hazards.map(h => dangerEscape(h, u.pos)).find(Boolean);
    if (escape) desired = norm(add(mul(desired, .12), escape));
    return { steer: clamp(wrap(Math.atan2(desired.x, -desired.y) - u.heading) * 2.8, -1, 1), throttle: .85, fire: true, boost: !!escape || !!pickup && d > 90 };
  }
  step(dt, input = {}) {
    this.events = [];
    if (this.outcome !== 'active' || this.upgradeChoices.length || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(.05, dt); this.time += dt;
    this.hazards = this.hazards.filter(h => h.expiresAt > this.time && this.unit(h.owner)?.hp > 0 && this.unit(h.owner).generation === h.generation);
    this.advanceSpawns();
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const enemies = this.living(1 - u.team), locked = this.unit(u.target);
      if (u.player && input.cycle && !u.cycleHeld && enemies.length) u.target = enemies[(enemies.indexOf(locked) + 1) % enemies.length].id;
      else if (!locked || locked.hp <= 0 || distance(u.pos, locked.pos) > WEAPONS[u.gun].range * 1.1) u.target = this.targetFor(u)?.id || null;
      const cmd = sanitizeInput(u.player ? input : u.boss ? bossCommand(this, u) : this.aiCommand(u));
      u.cooldown = Math.max(0, u.cooldown - dt); u.boostCd = Math.max(0, u.boostCd - dt); u.boost = Math.max(0, u.boost - dt);
      if (cmd.boost && !u.boostCd) {
        u.boost = 1.1; u.boostCd = u.player ? (this.playerHull.boostCooldown || 4.5) * this.training.boostCooldown : 4.5;
        if (u.player && this.upgrades.counter) u.counterUntil = this.time + 3;
      }
      u.heading = wrap(u.heading + cmd.steer * (u.player ? 1.65 : 1.4) * dt);
      u.speed = cmd.throttle * (u.player ? this.playerHull.speed * this.training.speed : u.boss ? 19 : 23) * (u.boost > 0 ? 1.85 : 1);
      const before = { ...u.pos };
      if (u.charge && this.time < u.charge.until) { u.speed = 85; u.heading = Math.atan2(u.charge.dir.x, -u.charge.dir.y); }
      u.pos = add(u.pos, mul(forward(u.heading), u.speed * dt));
      if (u.charge && (Math.abs(u.pos.x) > 325 || Math.abs(u.pos.y) > 325 || this.rocks.some(r => segmentDistance(r, before, u.pos) < r.radius + u.radius))) {
        u.pos = before; u.speed = 0; u.charge.until = this.time;
        this.emit('rock_hit', { pos: { ...u.pos } });
      }
      u.pos.x = clamp(u.pos.x, -325, 325); u.pos.y = clamp(u.pos.y, -325, 325);
      for (const r of this.rocks) if (distance(u.pos, r) < r.radius + u.radius) u.pos = add(r, mul(toward(r, u.pos), r.radius + u.radius));
      if (u.charge) for (const other of this.living(0)) if (!u.charge.hit.has(other.id) && segmentDistance(other.pos, before, u.pos) < u.radius + other.radius) {
        u.charge.hit.add(other.id); this.damage(other, u.charge.damage, u.id);
      }
      u.cycleHeld = cmd.cycle;
      if (cmd.fire) this.trigger(u, this.unit(u.target));
      this.advanceVolley(u, dt);
      if (Math.hypot(u.pos.x, u.pos.y) > this.radius()) this.damage(u, (9 + this.time * .03) * dt, 'storm');
      if (this.outcome !== 'active') break;
    }
    if (this.outcome !== 'active') return;
    this.moveProjectiles(dt);
    if (this.outcome !== 'active') return;
    this.tickBurns(dt);
    if (this.outcome !== 'active') return;
    this.collect(dt);
    if (Math.floor(this.time / 24) > this.supplyWave) {
      this.supplyWave++;
      const p = this.unit('p0');
      this.spawnPickup(add(p.pos, mul(forward(p.heading), 30)), 'ammo');
    }
    const earned = Math.floor(this.normalKills / 3);
    if (earned > this.upgradesChosen) {
      this.upgradeChoices = offerUpgrades(this.upgrades, this.playerGun, this.rng, this.upgradesChosen);
      this.emit('upgrade_offer', { choices: [...this.upgradeChoices] });
    }
    this.wave = Math.min(STAGES[this.stage].waves, 1 + earned);
    if (!this.bossPhase && !this.living(1).length && !this.pending.some(p => p.team === 1)) {
      this.bossPhase = true; this.pending.push({ at: this.time + 2, team: 1, bossGroup: true });
    }
    if (this.time >= 360) this.finish('defeat');
  }
  advanceSpawns() {
    const due = this.pending.filter(p => p.at <= this.time);
    this.pending = this.pending.filter(p => p.at > this.time);
    for (const p of due) {
      if (p.bossGroup) {
        for (let i = 0; i < 3; i++) this.spawn(`e${i}`, 1, this.spawnPoint(1, i === 0), i === 0);
        this.emit('boss', { name: STAGES[this.stage].boss, pos: { ...this.unit('e0').pos } });
      } else this.spawn(p.id, p.team, this.spawnPoint(p.team), false);
    }
  }
  advanceVolley(u, dt) {
    if (!u.volley) return;
    u.volley.clock -= dt;
    if (u.volley.clock > 0) return;
    const w = u.volley.weapon, target = this.unit(u.volley.target);
    if (u.ammo < w.cost || !this.validTarget(u, target) || !this.broadside(u, target)) { u.volley = null; return; }
    const f = forward(u.heading), side = { x: -f.y, y: f.x };
    const sign = side.x * (target.pos.x - u.pos.x) + side.y * (target.pos.y - u.pos.y) < 0 ? -1 : 1;
    const barrel = w.barrels - u.volley.left;
    const origin = add(add(u.pos, mul(side, sign * 3.1)), mul(f, (barrel - (w.barrels - 1) / 2) * 2.8));
    const flight = distance(origin, target.pos) / w.speed;
    const destination = add(target.pos, mul(forward(target.heading), target.speed * flight * .88));
    const aim = toward(origin, destination), travel = u.gun === 'mortar' ? distance(origin, destination) / w.speed : w.range / w.speed;
    if (this.projectiles.length + w.pellets > 256) return;
    u.ammo -= w.cost; u.volley.left--; u.volley.clock = w.gap;
    for (let i = 0; i < w.pellets; i++) {
      const spread = w.pellets === 1 ? this.rng.range(-w.spread, w.spread) : (i / (w.pellets - 1) - .5) * w.spread * 2;
      const dir = { x: aim.x * Math.cos(spread) - aim.y * Math.sin(spread), y: aim.x * Math.sin(spread) + aim.y * Math.cos(spread) };
      this.projectiles.push({ id: ++this.serial, owner: u.id, team: u.team, gun: u.gun, pos: { ...origin }, vel: mul(dir, w.speed),
        age: 0, life: Math.max(.15, travel), height: 2.2, arc: w.arc, blast: w.blast || 0,
        heated: u.player && !!this.upgrades.heated, damage: w.damage * u.volley.counter });
    }
    this.emit('shot', { id: u.id, pos: origin, dir: aim, gun: u.gun });
    if (u.volley.left <= 0) u.volley = null;
  }
  moveProjectiles(dt) {
    for (const p of this.projectiles) {
      const travelTime = Math.min(dt, Math.max(0, p.life - p.age));
      const next = add(p.pos, mul(p.vel, travelTime)); p.age += travelTime;
      const t = clamp(p.age / p.life, 0, 1); p.height = 2.2 * (1 - t) + 4 * p.arc * t * (1 - t);
      const rock = this.rocks.find(r => p.height < r.height && segmentDistance(r, p.pos, next) < r.radius);
      if (rock) { p.dead = true; this.emit('rock_hit', { pos: next }); }
      else if (p.blast) {
        if (p.age >= p.life) {
          p.dead = true; this.emit('blast', { pos: next });
          for (const u of this.living(1 - p.team)) {
            const d = Math.max(0, distance(u.pos, next) - (u.radius - 7));
            if (d < p.blast + 6) this.hitProjectile(u, p, p.damage * (1 - d / (p.blast + 14)));
          }
        }
      } else {
        const hit = this.living(1 - p.team).find(u => p.height < 8 * u.bodyScale && segmentDistance(u.pos, p.pos, next) < u.radius);
        if (hit) { p.dead = true; this.hitProjectile(hit, p, p.damage); }
        else if (p.age >= p.life) { p.dead = true; this.emit('splash', { pos: next }); }
      }
      p.pos = next;
      if (this.outcome !== 'active') break;
    }
    this.projectiles = this.projectiles.filter(p => !p.dead && p.age < p.life);
  }
  hitProjectile(u, p, amount) {
    if (p.heated) u.burn = { until: this.time + 4, damage: 7 * this.playerHull.firepower * this.training.damage, source: p.owner };
    this.damage(u, amount, p.owner);
  }
  tickBurns(dt) {
    for (const u of this.units) if (u.hp > 0 && u.burn) {
      if (u.burn.until <= this.time) u.burn = null;
      else this.damage(u, u.burn.damage * dt, u.burn.source);
    }
  }
  damage(u, amount, source, chain = false) {
    if (u.hp <= 0 || this.outcome !== 'active') return;
    if (u.boss && u.openUntil > this.time) amount *= 1.35;
    u.hp = Math.max(0, u.hp - amount);
    if (source !== 'storm' && amount > 2) this.emit('hit', { id: u.id, pos: { ...u.pos }, damage: amount, source });
    if (u.hp > 0) return;
    u.volley = null; this.score[1 - u.team]++;
    this.emit('sunk', { id: u.id, generation: u.generation, pos: { ...u.pos }, team: u.team, boss: u.boss });
    if (u.player) { this.deathCause = source === 'storm' ? '风暴' : this.unit(source)?.boss ? '首领重击' : '敌舰炮击'; this.finish('defeat'); return; }
    if (u.team === 1) {
      this.loot += 2;
      if (!u.boss && !this.bossPhase) {
        this.normalKills++;
        if (this.normalKills % 3 === 0) { this.loot += 3; this.spawnPickup(u.pos, 'repair'); }
      }
      for (let i = 0; i < 3; i++) this.spawnPickup(add(u.pos, { x: Math.cos(i * TAU / 3) * 11, y: Math.sin(i * TAU / 3) * 11 }), 'ammo');
      if (u.boss) { this.loot += 14 + this.stage * 2; this.finish('victory'); return; }
      if (u.burn && this.upgrades.chain && !chain) {
        this.emit('chain_blast', { pos: { ...u.pos } });
        for (const other of this.living(1)) if (distance(other.pos, u.pos) < 36) this.damage(other, 70 * this.playerHull.firepower, 'p0', true);
      }
    }
    if (u.team === 0) this.pending.push({ id: u.id, team: 0, at: this.time + 6 });
    else if (!this.bossPhase && this.spawned < STAGES[this.stage].waves * 3) {
      this.spawned++; this.pending.push({ id: u.id, team: 1, at: this.time + 1.8 });
    } else if (this.bossPhase && this.bossReinforcements < 4) {
      this.bossReinforcements++; this.spawnPickup(u.pos, 'repair');
      this.pending.push({ id: u.id, team: 1, at: this.time + 8 });
    }
  }
  spawnPickup(pos, kind) {
    if (this.pickups.length >= 64) this.pickups.shift();
    this.pickups.push({ id: ++this.serial, pos: { ...pos }, kind, amount: kind === 'repair' ? 38 : 28, expires: this.time + 50 });
  }
  collect(dt) {
    for (const p of this.pickups) {
      const candidates = this.living(0).filter(u => p.kind === 'repair' ? u.hp < u.maxHp : u.ammo < 120);
      const u = candidates.sort((a, b) => distance(a.pos, p.pos) - distance(b.pos, p.pos))[0];
      if (!u) continue;
      const d = distance(u.pos, p.pos);
      if (d < 34) p.pos = add(p.pos, mul(toward(p.pos, u.pos), Math.min(d, dt * 40)));
      if (distance(u.pos, p.pos) < 8) {
        if (p.kind === 'repair') u.hp = Math.min(u.maxHp, u.hp + p.amount * (u.player ? this.playerHull.repair || 1 : 1)); else u.ammo = Math.min(120, u.ammo + p.amount);
        p.expires = 0; this.emit('pickup', { id: u.id, kind: p.kind, amount: p.amount });
      }
    }
    this.pickups = this.pickups.filter(p => p.expires > this.time);
  }
  finish(outcome) { if (this.outcome !== 'active') return; this.outcome = outcome; this.emit('result', { outcome }); }
}
