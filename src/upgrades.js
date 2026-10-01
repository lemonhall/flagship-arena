import { L } from './i18n.js';

export const UPGRADES = {
  battery: { name: L('扩充炮架', 'Extended Battery'), description: L('每轮增加 2 门炮，逐门轰出更长排射。', '+2 barrels per volley for a longer broadside.'), tag: L('排射', 'BARRAGE'), max: 1 },
  loader: { name: L('熟练装填', 'Drilled Crew'), description: L('装填时间减少 20%，更快打出下一轮。', 'Reload time -20%, so the next volley comes sooner.'), tag: L('速射', 'RAPID'), max: 2 },
  heated: { name: L('烧红铁弹', 'Heated Shot'), description: L('命中点燃敌舰，持续 4 秒灼烧。', 'Hits set the enemy alight, burning for 4 seconds.'), tag: L('燃烧', 'FIRE'), max: 1 },
  chain: { name: L('火药殉爆', 'Powder Detonation'), description: L('燃烧的敌舰沉没时爆炸，伤害周围敌舰。', 'Burning ships explode as they sink, damaging their neighbours.'), tag: L('连爆', 'CHAIN'), max: 1, requires: 'heated' },
  counter: { name: L('冲刺反击', 'Counter Charge'), description: L('冲刺后 3 秒内的下一轮排射伤害 +60%。', 'The next broadside within 3s of a boost deals +60% damage.'), tag: L('反击', 'COUNTER'), max: 1 },
  powder: { name: L('精制火药', 'Refined Powder'), description: L('炮弹伤害增加 22%。', 'Shell damage +22%.'), tag: L('火力', 'POWER'), max: 2 },
  hull: { name: L('战地加固', 'Field Reinforcement'), description: L('船体上限 +65，并立即修复 100 船体。', '+65 max hull, and 100 hull repaired at once.'), tag: L('生存', 'SURVIVAL'), max: 2 },
  payload: { name: L('扩散装药', 'Dispersal Charge'), description: L('散弹增加 2 颗；臼炮爆炸半径增加 7 米。', '+2 grapeshot pellets; mortar blast radius +7 m.'), tag: L('覆盖', 'SPREAD'), max: 2, guns: ['grapeshot', 'mortar'] },
};
export function offerUpgrades(levels, gun, rng, count) {
  const pool = Object.keys(UPGRADES).filter(id => {
    const u = UPGRADES[id]; return (levels[id] || 0) < u.max && (!u.requires || levels[u.requires]) && (!u.guns || u.guns.includes(gun));
  });
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  // A first wave always demonstrates a visible weapon change; later offers remain seeded.
  const anchor = count === 0 && pool.includes('battery') ? 'battery' : levels.heated && !levels.chain ? 'chain' : null;
  return anchor ? [anchor, ...pool.filter(id => id !== anchor).slice(0, 2)] : pool.slice(0, 3);
}
export function upgradedWeapon(base, levels, hull, rules, training) {
  return { ...base,
    barrels: base.barrels + (levels.battery || 0) * 2 + (hull.extraBarrels || 0),
    reload: base.reload * rules.reload * (hull.reload || 1) * .8 ** (levels.loader || 0),
    damage: base.damage * hull.firepower * rules.playerDamage * training.damage * (1 + .22 * (levels.powder || 0)),
    pellets: base.pellets + (base.pellets > 1 ? (levels.payload || 0) * 2 : 0),
    blast: base.blast ? base.blast + (levels.payload || 0) * 7 : 0,
  };
}
