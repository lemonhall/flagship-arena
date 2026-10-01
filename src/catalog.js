import { L } from './i18n.js';

export const HULLS = [
  { id: 'caravel', name: L('卡拉维尔', 'Caravel'), hp: 440, speed: 29, firepower: 1, unlock: 0, trait: L('均衡船体', 'Balanced hull') },
  { id: 'brig', name: L('双桅快船', 'Brigantine'), hp: 470, speed: 32, firepower: 1.1, unlock: 1, boostCooldown: 3.6, trait: L('冲刺冷却 3.6 秒', 'Boost cooldown 3.6s') },
  { id: 'galleon', name: L('大帆船', 'Galleon'), hp: 610, speed: 26, firepower: 1.22, unlock: 2, repair: 1.25, trait: L('维修收益 +25%', 'Repairs +25%') },
  { id: 'xebec', name: L('地中海快舰', 'Xebec'), hp: 490, speed: 36, firepower: 1.28, unlock: 3, boostCooldown: 2.9, trait: L('冲刺冷却 2.9 秒', 'Boost cooldown 2.9s') },
  { id: 'frigate', name: L('巡航舰', 'Frigate'), hp: 620, speed: 31, firepower: 1.4, unlock: 4, reload: .9, trait: L('装填时间 -10%', 'Reload -10%') },
  { id: 'ship_of_line', name: L('战列舰', 'Ship of the Line'), hp: 780, speed: 27, firepower: 1.55, unlock: 5, extraBarrels: 1, trait: L('每轮额外 1 门炮', '+1 barrel per volley') },
  { id: 'zhenghe_baochuan', name: L('宝船', 'Treasure Ship'), hp: 850, speed: 28, firepower: 1.75, unlock: 6, extraBarrels: 2, trait: L('每轮额外 2 门炮', '+2 barrels per volley') },
];
export const STAGES = [
  { name: L('翡翠浅滩', 'Jade Shoals'), waves: 3, boss: L('灰帆船长', 'Captain Grey Sail'), hull: 'brig', reward: L('双桅快船 · 葡萄弹散炮', 'Brigantine · Grapeshot'), color: '#50c8bc' },
  { name: L('珊瑚水道', 'Coral Channel'), waves: 3, boss: L('铁钩船长', 'Captain Ironhook'), hull: 'galleon', reward: L('大帆船 · 曲射臼炮', 'Galleon · Mortar'), color: '#54bdd4' },
  { name: L('断桅群岛', 'Broken Mast Isles'), waves: 4, boss: L('疾风海盗', 'Gale Corsair'), hull: 'xebec', reward: L('地中海快舰 · 长管炮', 'Xebec · Culverin'), color: '#dfbd71' },
  { name: L('风暴边缘', "Storm's Edge"), waves: 4, boss: L('赤潮舰长', 'Red Tide Captain'), hull: 'frigate', reward: L('巡航舰', 'Frigate'), color: '#a2a3df' },
  { name: L('沉船海峡', 'Sunken Straits'), waves: 5, boss: L('黑旗提督', 'Black Flag Admiral'), hull: 'ship_of_line', reward: L('战列舰', 'Ship of the Line'), color: '#e19a70' },
  { name: L('王者航路', 'Sovereign Route'), waves: 5, boss: L('深海霸主', 'Abyssal Overlord'), hull: 'zhenghe_baochuan', reward: L('宝船 · 航路征服者', 'Treasure Ship · Route Conqueror'), color: '#e9c876' },
];
export const WEAPONS = {
  cannon: { name: L('加农舷炮', 'Carronade'), range: 230, reload: 2.6, damage: 25, barrels: 4, gap: .15, speed: 140, arc: 2.5, pellets: 1, spread: .008, cost: 1, unlock: 0 },
  light: { name: L('速射轻炮', 'Quick-Firer'), range: 190, reload: 1.65, damage: 19, barrels: 3, gap: .13, speed: 150, arc: 2, pellets: 1, spread: .01, cost: 1, unlock: 0 },
  grapeshot: { name: L('葡萄弹散炮', 'Grapeshot'), range: 115, reload: 2.5, damage: 9, barrels: 3, gap: .18, speed: 145, arc: 2, pellets: 7, spread: .19, cost: 1, unlock: 1 },
  mortar: { name: L('曲射臼炮', 'Siege Mortar'), range: 290, reload: 3.8, damage: 65, barrels: 2, gap: .45, speed: 85, arc: 42, blast: 24, pellets: 1, spread: .006, cost: 2, unlock: 2 },
  culverin: { name: L('长管炮', 'Culverin'), range: 330, reload: 3.2, damage: 34, barrels: 3, gap: .2, speed: 175, arc: 2, pellets: 1, spread: .006, cost: 1, unlock: 3 },
};
export { normalizeProgress, mergeProgress, readProgress, saveProgress, recordVictory, nextVoyage } from './progression.js';
export function voyageRules(voyage = 1) {
  const level = Number.isFinite(voyage) ? Math.min(5, Math.max(0, Math.trunc(voyage) - 1)) : 0;
  return { enemyHp: 1 + level * .2, enemyDamage: 1 + level * .12, playerDamage: 1 + level * .12, reload: 1 - level * .07 };
}
