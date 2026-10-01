export const UPGRADES = {
  battery: { name: '扩充炮架', description: '每轮增加 2 门炮，逐门轰出更长排射。', tag: '排射', max: 1 },
  loader: { name: '熟练装填', description: '装填时间减少 20%，更快打出下一轮。', tag: '速射', max: 2 },
  heated: { name: '烧红铁弹', description: '命中点燃敌舰，持续 4 秒灼烧。', tag: '燃烧', max: 1 },
  chain: { name: '火药殉爆', description: '燃烧的敌舰沉没时爆炸，伤害周围敌舰。', tag: '连爆', max: 1, requires: 'heated' },
  counter: { name: '冲刺反击', description: '冲刺后 3 秒内的下一轮排射伤害 +60%。', tag: '反击', max: 1 },
  powder: { name: '精制火药', description: '炮弹伤害增加 22%。', tag: '火力', max: 2 },
  hull: { name: '战地加固', description: '船体上限 +65，并立即修复 100 船体。', tag: '生存', max: 2 },
  payload: { name: '扩散装药', description: '散弹增加 2 颗；臼炮爆炸半径增加 7 米。', tag: '覆盖', max: 2, guns: ['grapeshot', 'mortar'] },
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
