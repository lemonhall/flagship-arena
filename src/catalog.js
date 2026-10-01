export const HULLS = [
  { id: 'caravel', name: '卡拉维尔', hp: 440, speed: 29, firepower: 1, unlock: 0, trait: '均衡船体' },
  { id: 'brig', name: '双桅快船', hp: 470, speed: 32, firepower: 1.1, unlock: 1, boostCooldown: 3.6, trait: '冲刺冷却 3.6 秒' },
  { id: 'galleon', name: '大帆船', hp: 610, speed: 26, firepower: 1.22, unlock: 2, repair: 1.25, trait: '维修收益 +25%' },
  { id: 'xebec', name: '地中海快舰', hp: 490, speed: 36, firepower: 1.28, unlock: 3, boostCooldown: 2.9, trait: '冲刺冷却 2.9 秒' },
  { id: 'frigate', name: '巡航舰', hp: 620, speed: 31, firepower: 1.4, unlock: 4, reload: .9, trait: '装填时间 -10%' },
  { id: 'ship_of_line', name: '战列舰', hp: 780, speed: 27, firepower: 1.55, unlock: 5, extraBarrels: 1, trait: '每轮额外 1 门炮' },
  { id: 'zhenghe_baochuan', name: '宝船', hp: 850, speed: 28, firepower: 1.75, unlock: 6, extraBarrels: 2, trait: '每轮额外 2 门炮' },
];
export const STAGES = [
  { name: '翡翠浅滩', waves: 3, boss: '灰帆船长', hull: 'brig', reward: '双桅快船 · 葡萄弹散炮', color: '#50c8bc' },
  { name: '珊瑚水道', waves: 3, boss: '铁钩船长', hull: 'galleon', reward: '大帆船 · 曲射臼炮', color: '#54bdd4' },
  { name: '断桅群岛', waves: 4, boss: '疾风海盗', hull: 'xebec', reward: '地中海快舰 · 长管炮', color: '#dfbd71' },
  { name: '风暴边缘', waves: 4, boss: '赤潮舰长', hull: 'frigate', reward: '巡航舰', color: '#a2a3df' },
  { name: '沉船海峡', waves: 5, boss: '黑旗提督', hull: 'ship_of_line', reward: '战列舰', color: '#e19a70' },
  { name: '王者航路', waves: 5, boss: '深海霸主', hull: 'zhenghe_baochuan', reward: '宝船 · 航路征服者', color: '#e9c876' },
];
export const WEAPONS = {
  cannon: { name: '加农舷炮', range: 230, reload: 2.6, damage: 25, barrels: 4, gap: .15, speed: 140, arc: 2.5, pellets: 1, spread: .008, cost: 1, unlock: 0 },
  light: { name: '速射轻炮', range: 190, reload: 1.65, damage: 19, barrels: 3, gap: .13, speed: 150, arc: 2, pellets: 1, spread: .01, cost: 1, unlock: 0 },
  grapeshot: { name: '葡萄弹散炮', range: 115, reload: 2.5, damage: 9, barrels: 3, gap: .18, speed: 145, arc: 2, pellets: 7, spread: .19, cost: 1, unlock: 1 },
  mortar: { name: '曲射臼炮', range: 290, reload: 3.8, damage: 65, barrels: 2, gap: .45, speed: 85, arc: 42, blast: 24, pellets: 1, spread: .006, cost: 2, unlock: 2 },
  culverin: { name: '长管炮', range: 330, reload: 3.2, damage: 34, barrels: 3, gap: .2, speed: 175, arc: 2, pellets: 1, spread: .006, cost: 1, unlock: 3 },
};
export { normalizeProgress, mergeProgress, readProgress, saveProgress, recordVictory, nextVoyage } from './progression.js';
export function voyageRules(voyage = 1) {
  const level = Number.isFinite(voyage) ? Math.min(5, Math.max(0, Math.trunc(voyage) - 1)) : 0;
  return { enemyHp: 1 + level * .2, enemyDamage: 1 + level * .12, playerDamage: 1 + level * .12, reload: 1 - level * .07 };
}
