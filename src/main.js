import { ArenaSim, WEAPONS, clamp } from './sim.js';
import { HULLS, STAGES, readProgress, saveProgress, recordVictory, nextVoyage, mergeProgress, voyageRules } from './catalog.js';
import { BattleView, loadModels } from './view.js';
import { Controls } from './controls.js';
import { SelectionGuard } from './selection-guard.js';
import { BattleAudio } from './audio.js';
import { TRAINING, partsBalance, awardRun, buyTraining, trainingStats } from './progression.js';
import { UPGRADES } from './upgrades.js';
import { BOSS_LABELS } from './bosses.js';
import { L, s, applyStatic } from './i18n.js';
import './style.css';

const $ = id => document.getElementById(id);
let progress = readProgress(), selectedStage = Math.min(progress.voyageCleared, 5), selectedVoyage = progress.voyage, sim = new ArenaSim(17);
let mode = 'menu', ready = false, toastUntil = 0, resultAt = 0, last = performance.now(), accumulator = 0, hudClock = 0;
let loadJob = null, pilot = false;
let runId = null, runSettled = true, damageFlashUntil = 0, testRunSerial = 0;
const audio = new BattleAudio();
const controls = new Controls(force => pause(force), () => audio.unlock());
const upgradeGuard = new SelectionGuard($('upgrade-menu'));
let view;
try { view = new BattleView($('battle')); }
catch { showLoadError(new Error(L('浏览器未能启动 3D 画面，请启用硬件加速后重新打开。', 'The browser could not start 3D. Enable hardware acceleration and reopen.'))); }

function menuChoices() {
  const previousHull = $('hull').value || HULLS[Math.min(progress.cleared, 6)].id, previousGun = $('gun').value || 'cannon';
  const completed = selectedVoyage < progress.voyage ? 6 : progress.voyageCleared;
  selectedStage = Math.min(selectedStage, completed, 5);
  $('stages').innerHTML = STAGES.map((s, i) => `<button class="stage-card ${selectedStage === i ? 'selected' : ''}" data-stage="${i}" style="--stage-color:${s.color}" ${i > completed ? 'disabled' : ''} aria-label="${L(`第 ${i + 1} 关`, `Route ${i + 1}:`)} ${s.name}"><span class="num">0${i + 1}</span><em>${i < completed ? L('已征服', 'Cleared') : i > completed ? L('待解锁', 'Locked') : L('启航', 'Sail')}</em><strong>${s.name}</strong><span class="stage-wave">${s.waves} WAVES + BOSS</span></button>`).join('');
  $('progress-label').textContent = L(`已征服 ${completed} / 6`, `Cleared ${completed} / 6`);
  $('voyage-strip').hidden = progress.cleared < 6;
  $('voyage').innerHTML = Array.from({ length: progress.voyage }, (_, i) => `<option value="${i + 1}">${i === 0 ? L('初始航路 · 自由重玩', 'First voyage · free replay') : L(`第 ${i + 1} 周目 · 船炮继承`, `Voyage ${i + 1} · ships and guns carried over`)}</option>`).join('');
  $('voyage').value = String(selectedVoyage);
  $('new-voyage').hidden = selectedVoyage !== progress.voyage || progress.voyageCleared < 6 || progress.voyage >= 999;
  $('hull').innerHTML = HULLS.map(h => `<option value="${h.id}" ${h.unlock > progress.cleared ? 'disabled' : ''}>${h.name}${h.unlock > progress.cleared ? ` · ${L(`${h.unlock} 关解锁`, `unlocks at route ${h.unlock}`)}` : ''}</option>`).join('');
  $('gun').innerHTML = Object.entries(WEAPONS).map(([id, w]) => `<option value="${id}" ${w.unlock > progress.cleared ? 'disabled' : ''}>${w.name}${w.unlock > progress.cleared ? ` · ${L(`${w.unlock} 关解锁`, `unlocks at route ${w.unlock}`)}` : ''}</option>`).join('');
  $('hull').value = previousHull; $('gun').value = previousGun; selectionInfo();
  $('menu-parts').textContent = partsBalance(progress);
}
function selectionInfo() {
  const s = STAGES[selectedStage], h = HULLS.find(h => h.id === $('hull').value), w = WEAPONS[$('gun').value];
  const rules = voyageRules(selectedVoyage), training = trainingStats(progress.training);
  const hull = Math.round(h.hp * training.hp), power = Math.round(h.firepower * rules.playerDamage * training.damage * 100);
  $('stage-name').textContent = s.name;
  $('stage-detail').textContent = `${selectedVoyage > 1 ? L(`第 ${selectedVoyage} 周目 · `, `Voyage ${selectedVoyage} · `) : ''}${L(`${s.waves} 波敌舰 + ${s.boss}`, `${s.waves} enemy waves + ${s.boss}`)}`;
  $('loadout-info').textContent = L(`${hull} 船体 · ${power}% 火力 · ${h.trait}`, `${hull} hull · ${power}% firepower · ${h.trait}`);
}
$('stages').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (b && !b.disabled) { selectedStage = Number(b.dataset.stage); menuChoices(); } });
$('hull').addEventListener('change', selectionInfo); $('gun').addEventListener('change', selectionInfo);
$('voyage').addEventListener('change', () => { selectedVoyage = Number($('voyage').value); selectedStage = 0; menuChoices(); });
function beginNextVoyage() {
  progress = nextVoyage(mergeProgress(progress, readProgress())); saveProgress(progress);
  selectedVoyage = progress.voyage; selectedStage = 0; menuChoices(); $('hull').value = 'zhenghe_baochuan'; selectionInfo();
}
$('new-voyage').addEventListener('click', beginNextVoyage);
$('start').addEventListener('click', () => { audio.unlock(); startBattle(); });

async function loading(job) {
  loadJob = job; controls.clear(); controls.enabled = false; $('loading').hidden = false; $('load-retry').hidden = true; $('load-back').hidden = true;
  $('loading-title').textContent = s('loading.title'); $('loading-detail').textContent = s('loading.detail'); $('loading-bar').style.width = '0%';
  try { await job(); $('loading').hidden = true; }
  catch (e) { showLoadError(e); }
}
function showLoadError(e) {
  $('loading').hidden = false; $('loading-title').textContent = L('暂时无法出航', 'Cannot set sail right now');
  $('loading-detail').textContent = /硬件加速|hardware acceleration/i.test(e.message || '')
    ? e.message : L('船舶资产装载失败，请检查网络后重试。', 'Ship assets failed to load. Check your connection and retry.');
  $('load-retry').hidden = false; $('load-back').hidden = !view; console.error(e);
}
const loadProgress = n => { $('loading-bar').style.width = `${n * 100}%`; $('loading-detail').textContent = L(`船队整备 ${Math.round(n * 100)}%`, `Fleet ready ${Math.round(n * 100)}%`); };
$('load-retry').addEventListener('click', () => { if (!view) location.reload(); else loading(loadJob); });
$('load-back').addEventListener('click', () => { $('loading').hidden = true; returnToMenu(); });
async function startBattle() {
  upgradeGuard.close();
  mode = 'loading'; $('result').hidden = true; $('pause-menu').hidden = true; $('upgrade-menu').hidden = true;
  const hull = $('hull').value, gun = $('gun').value, stage = selectedStage, voyage = selectedVoyage;
  await loading(async () => {
    await loadModels([hull, 'brig', HULLS[Math.min(1 + stage, 5)].id, STAGES[stage].hull], loadProgress);
    const seed = import.meta.env.DEV && new URLSearchParams(location.search).has('test') ? Number(new URLSearchParams(location.search).get('seed') || 1) + stage + testRunSerial++ * 997 : undefined;
    sim = new ArenaSim(seed, { stage, hull, gun, voyage, training: progress.training }); view.setArena(sim); ready = true;
    runId = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
    runSettled = false;
    mode = 'battle'; controls.enabled = true; controls.clear(); accumulator = 0; last = performance.now();
    $('menu').hidden = true; $('hud').hidden = false; $('ship-labels').innerHTML = '';
    $('battle').focus();
    notify(L('每清一波，选择一次改装\n转舵排射，躲开敌炮', 'Clear a wave, choose a refit\nTurn broadside, dodge the shells'), 4); updateHud();
  });
}
function pause(force = false) {
  if (mode === 'battle') { mode = 'paused'; controls.enabled = false; controls.clear(); $('pause-menu').hidden = false; }
  else if (mode === 'paused' && !force) resume();
}
function resume() { if (mode !== 'paused') return; mode = 'battle'; controls.clear(); controls.enabled = true; accumulator = 0; last = performance.now(); $('pause-menu').hidden = true; $('battle').focus(); }
function persistProgress() {
  const saved = saveProgress(progress);
  $('save-status').hidden = saved;
  $('save-status').textContent = saved ? '' : L('浏览器禁止保存：当前进度仅在本次打开期间保留', 'Saving is blocked: this progress lasts only for this session');
  return saved;
}
function settleRun() {
  if (runSettled || !runId) return true;
  progress = mergeProgress(progress, readProgress());
  if (sim.outcome === 'victory') progress = recordVictory(progress, sim.stage, sim.voyage);
  progress = awardRun(progress, runId, sim.loot); runSettled = true;
  return persistProgress();
}
function returnToMenu() {
  upgradeGuard.close();
  settleRun();
  mode = 'menu'; controls.enabled = false; controls.clear(); pilot = false; $('hud').hidden = true; $('result').hidden = true; $('pause-menu').hidden = true; $('upgrade-menu').hidden = true; $('menu').hidden = false;
  progress = mergeProgress(progress, readProgress()); menuChoices();
}
$('pause').addEventListener('click', () => pause()); $('resume').addEventListener('click', resume); $('leave').addEventListener('click', returnToMenu); $('back').addEventListener('click', returnToMenu);
$('sound').addEventListener('click', () => { $('sound').textContent = audio.toggle() ? s('hud.soundOn') : s('hud.soundOff'); });
document.querySelectorAll('[data-bgm-volume]').forEach(input => input.addEventListener('input', e => { audio.setBgmVolume(e.target.value); syncBgmControls(); }));
document.querySelectorAll('[data-bgm-toggle]').forEach(button => button.addEventListener('click', () => { audio.toggleBgm(); syncBgmControls(); }));
$('music').addEventListener('click', () => { pause(); $('bgm-toggle').focus(); });
$('upgrade-leave').addEventListener('click', () => { if (mode === 'upgrade' && upgradeGuard.ready) returnToMenu(); });
$('upgrade-options').addEventListener('click', e => {
  const button = e.target.closest('[data-upgrade]');
  if (!button || mode !== 'upgrade' || !upgradeGuard.ready || !sim.chooseUpgrade(button.dataset.upgrade)) return;
  upgradeGuard.close();
  $('upgrade-menu').hidden = true; mode = 'battle'; controls.clear(); controls.enabled = true;
  accumulator = 0; last = performance.now(); $('battle').focus();
  notify(L(`${UPGRADES[button.dataset.upgrade].name} · 已装配`, `${UPGRADES[button.dataset.upgrade].name} · installed`), 2); updateHud();
});
function offerUpgrade() {
  mode = 'upgrade'; controls.enabled = false; controls.clear(); $('upgrade-menu').hidden = false;
  $('upgrade-detail').textContent = L(`第 ${sim.upgradesChosen + 1} 波已击破 · 已收获 ${sim.loot} 零件 · 船体 ${Math.ceil(sim.unit('p0').hp)}`, `Wave ${sim.upgradesChosen + 1} broken · ${sim.loot} parts salvaged · ${Math.ceil(sim.unit('p0').hp)} hull`);
  $('upgrade-options').innerHTML = sim.upgradeChoices.map(id => {
    const u = UPGRADES[id];
    return `<button data-upgrade="${id}" class="upgrade-card"><span>${u.tag}</span><strong>${u.name}</strong><p>${u.description}</p><small>${sim.upgrades[id] ? L(`当前 ${sim.upgrades[id]} 级 → 再强化`, `Level ${sim.upgrades[id]} → upgrade again`) : L('装配改装 →', 'Install refit →')}</small></button>`;
  }).join('');
  upgradeGuard.arm();
}
function renderShipyard() {
  $('parts-balance').textContent = partsBalance(progress);
  $('training-options').innerHTML = Object.entries(TRAINING).map(([id, track]) => {
    const level = progress.training[id], cost = track.costs[level];
    return `<div class="training-row"><div><strong>${track.name} <small data-training-level="${id}">${level} / 3</small></strong><p>${track.description}</p></div><button data-training="${id}" ${cost === undefined || partsBalance(progress) < cost ? 'disabled' : ''}>${cost === undefined ? L('已满级', 'Maxed') : L(`${cost} 零件 · 强化`, `${cost} parts · upgrade`)}</button></div>`;
  }).join('');
}
$('shipyard').addEventListener('click', () => { progress = mergeProgress(progress, readProgress()); renderShipyard(); $('shipyard-menu').hidden = false; $('shipyard-close').focus(); });
$('shipyard-close').addEventListener('click', () => { $('shipyard-menu').hidden = true; menuChoices(); $('shipyard').focus(); });
$('training-options').addEventListener('click', e => {
  const button = e.target.closest('[data-training]'); if (!button) return;
  progress = buyTraining(mergeProgress(progress, readProgress()), button.dataset.training);
  persistProgress(); renderShipyard(); menuChoices();
});
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { notify(L('当前浏览器不支持全屏，可直接游玩', 'This browser has no fullscreen; you can still play'), 3); }
});
function syncBgmControls() {
  document.querySelectorAll('[data-bgm-volume]').forEach(input => { input.value = String(audio.bgmVolume); });
  document.querySelectorAll('[data-bgm-value]').forEach(output => { output.textContent = `${Math.round(audio.bgmVolume * 100)}%`; });
  document.querySelectorAll('[data-bgm-toggle]').forEach(button => {
    button.textContent = audio.bgmEnabled ? s('bgm.on') : s('bgm.off');
    button.setAttribute('aria-pressed', String(audio.bgmEnabled));
  });
  $('music').textContent = audio.bgmEnabled && audio.bgmVolume > 0 ? 'BGM' : s('bgm.off');
}
$('next').addEventListener('click', () => {
  if (sim.outcome === 'victory') {
    if (sim.stage === 5 && sim.voyage === progress.voyage && progress.voyageCleared === 6) beginNextVoyage();
    else { selectedStage = (sim.stage + 1) % 6; selectedVoyage = sim.voyage; menuChoices(); $('hull').value = HULLS[Math.min(progress.cleared, 6)].id; }
  }
  startBattle();
});
function notify(text, seconds = 2) { $('toast').textContent = text; toastUntil = sim.time + seconds; $('toast').style.opacity = '1'; }
function afterStep() {
  view.events(sim.events); audio.events(sim.events, sim.unit('p0'));
  for (const e of sim.events) {
    if (e.type === 'boss') notify(L(`${e.name}\n首领舰队抵达！`, `${e.name}\nThe boss fleet has arrived!`), 3);
    if (e.type === 'pickup' && e.id === 'p0') notify(e.kind === 'ammo' ? L(`炮弹 +${e.amount}`, `Ammo +${e.amount}`) : L(`船体 +${e.amount}`, `Hull +${e.amount}`), 1.3);
    if (e.type === 'hit' && e.id === 'p0') damageFlashUntil = performance.now() + 260;
    if (e.type === 'boss_phase') notify(L('首领暴怒 · 火力全开\n转舵变向，留好冲刺', 'Boss enraged · all guns\nTurn hard and save your boost'), 2.5);
    if (e.type === 'boss_open') notify(L('首领装填中 · 破绽伤害 +35%', 'Boss reloading · +35% weak-point damage'), 2);
    if (e.type === 'upgrade_offer') offerUpgrade();
    if (e.type === 'result') {
      mode = 'ending'; controls.enabled = false; controls.clear(); resultAt = performance.now() + 1700;
      const saved = settleRun();
      const cause = sim.deathCause === 'storm' ? L('风暴封锁', 'The storm') : sim.deathCause === 'boss' ? L('首领重击', 'A boss strike') : L('敌舰炮击', 'Enemy fire');
      const reward = e.outcome === 'victory'
        ? sim.voyage === 1
          ? L(`已解锁：${STAGES[sim.stage].reward}`, `Unlocked: ${STAGES[sim.stage].reward}`)
          : L(`第 ${sim.voyage} 周目航路推进 · 全部船炮保留`, `Voyage ${sim.voyage} advanced · all ships and guns kept`)
        : L(`${cause}结束了本次出航，零件已带回船坞`, `${cause} ended this voyage; your parts came back to the dock`);
      $('reward').textContent = L(`${reward} · 获得 ${sim.loot} 零件（可用 ${partsBalance(progress)}）`, `${reward} · ${sim.loot} parts earned (${partsBalance(progress)} available)`)
        + (saved ? '' : L('（无法写入存档，仅本次打开可用）', ' (save unavailable this session)'));
      $('result-eyebrow').textContent = `${String(sim.stage + 1).padStart(2, '0')} / ${STAGES[sim.stage].name}`;
      $('result-title').textContent = e.outcome === 'victory'
        ? sim.stage === 5 ? L('六海，尽在掌握', 'Six seas, mastered') : L('航路已征服', 'Route conquered')
        : sim.unit('p0').hp <= 0 ? L('旗舰沉没', 'Flagship sunk') : L('风暴封锁了航路', 'The storm closed the route');
      $('result-detail').textContent = L(`${Math.floor(sim.time / 60)} 分 ${Math.floor(sim.time % 60)} 秒 · 击沉 ${sim.score[0]} 艘敌舰 · ${sim.upgradesChosen} 次本关改装`, `${Math.floor(sim.time / 60)}m ${Math.floor(sim.time % 60)}s · ${sim.score[0]} ships sunk · ${sim.upgradesChosen} refits this stage`);
      $('next').textContent = e.outcome === 'victory'
        ? sim.stage === 5
          ? sim.voyage === progress.voyage ? L(`宝船出航 · 第 ${progress.voyage + 1} 周目`, `Treasure Ship sails · voyage ${progress.voyage + 1}`) : L('宝船重巡 · 旧航路', 'Treasure Ship · old route')
          : L('驶向下一海域 →', 'Sail to the next sea →')
        : L('重整旗鼓 · 再战', 'Regroup and fight again');
    }
  }
}
const radar = $('radar').getContext('2d');
function updateHud() {
  const p = sim.unit('p0'), w = sim.weaponFor(p), target = sim.unit(p.target), stage = STAGES[sim.stage];
  $('stage-title').textContent = `${String(sim.stage + 1).padStart(2, '0')} / ${stage.name}${sim.voyage > 1 ? L(` · ${sim.voyage} 周目`, ` · voyage ${sim.voyage}`) : ''}`;
  $('wave-label').textContent = sim.bossPhase ? L('首领战', 'Boss fight') : L(`第 ${sim.wave} / ${stage.waves} 波`, `Wave ${sim.wave} / ${stage.waves}`);
  $('counts').textContent = L(`友舰 ${sim.living(0).length} · 敌舰 ${sim.living(1).length}  /  击沉 ${sim.score[0]}`, `Allies ${sim.living(0).length} · Enemies ${sim.living(1).length}  /  Sunk ${sim.score[0]}`);
  $('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`; $('ammo-text').textContent = `${p.ammo} / 120`;
  $('hp-bar').style.width = `${p.hp / p.maxHp * 100}%`; $('ammo-bar').style.width = `${p.ammo / 120 * 100}%`;
  $('reload').textContent = p.volley ? L('逐门排射', 'Firing by barrel') : p.cooldown > 0 ? L(`${p.cooldown.toFixed(1)}s 装填`, `reloading ${p.cooldown.toFixed(1)}s`) : s('hud.fireHint');
  $('boost').firstChild.textContent = p.boostCd > 0 ? `${p.boostCd.toFixed(1)}s` : L('冲刺', 'Boost');
  $('aim-status').textContent = Math.hypot(p.pos.x, p.pos.y) > sim.radius()
    ? L('驶回圈内！风暴正在损伤船体', 'Get back inside the ring! The storm is tearing your hull')
    : p.ammo < w.cost ? L('炮弹不足 · 驶近炮弹箱', 'Out of ammo · sail to a crate')
      : !target ? L('下一支舰队正在抵达', 'The next fleet is arriving')
        : !sim.validTarget(p, target) ? L('接近敌舰，绕开岛礁', 'Close on the enemy and steer around the reefs')
          : !sim.broadside(p, target) ? L('向左或向右转舵，让侧舷朝向目标', 'Turn to bring your broadside onto the target')
            : L(`${w.name} · 可以开火`, `${w.name} · ready to fire`);
  const boss = sim.units.find(u => u.boss && u.hp > 0);
  $('boss-hud').hidden = !boss; if (boss) {
    $('boss-name').textContent = L(`${stage.boss} · ${boss.bossPhase === 2 ? '暴怒' : '巨舰'}`, `${stage.boss} · ${boss.bossPhase === 2 ? 'Enraged' : 'Dreadnought'}`); $('boss-bar').style.width = `${boss.hp / boss.maxHp * 100}%`;
    $('boss-action').textContent = boss.bossAttack ? BOSS_LABELS[boss.bossAttack.kind] : boss.openUntil > sim.time ? L('装填破绽 · 伤害 +35%', 'Reloading · +35% damage') : L('准备下一轮攻击', 'Preparing the next attack');
  }
  $('danger-warning').hidden = !boss?.bossAttack;
  if (boss?.bossAttack) $('danger-warning').textContent = BOSS_LABELS[boss.bossAttack.kind];
  $('build-status').textContent = L(`${w.barrels} 门排射 · ${w.reload.toFixed(1)}s 装填 · 零件 ${sim.loot}`, `${w.barrels} barrels · ${w.reload.toFixed(1)}s reload · ${sim.loot} parts`)
    + (sim.upgrades.heated ? L(' · 燃烧', ' · Burning') : '') + (sim.upgrades.chain ? L(' · 连爆', ' · Chain') : '') + (p.counterUntil > sim.time ? L(' · 反击就绪', ' · Counter ready') : '');
  $('toast').style.opacity = sim.time < toastUntil ? '1' : '0';
  radar.clearRect(0, 0, 240, 240); radar.save(); radar.translate(120, 120); const scale = .37;
  radar.strokeStyle = '#c8dfc350'; radar.lineWidth = 2; radar.beginPath(); radar.arc(0, 0, sim.radius() * scale, 0, Math.PI * 2); radar.stroke();
  for (const r of sim.rocks) { radar.fillStyle = '#819b86'; radar.beginPath(); radar.arc(r.x * scale, r.y * scale, r.radius * scale, 0, Math.PI * 2); radar.fill(); }
  for (const pickup of sim.pickups) { radar.fillStyle = pickup.kind === 'ammo' ? '#ddc18a' : '#91d6ab'; radar.fillRect(pickup.pos.x * scale - 1, pickup.pos.y * scale - 1, 2, 2); }
  for (const u of sim.units) if (u.hp > 0) { radar.save(); radar.translate(u.pos.x * scale, u.pos.y * scale); radar.rotate(u.heading); radar.fillStyle = u.player ? '#ffdd98' : u.team ? '#f3856b' : '#8dd9c6'; radar.beginPath(); radar.moveTo(0, -6); radar.lineTo(4, 4); radar.lineTo(-4, 4); radar.closePath(); radar.fill(); radar.restore(); }
  radar.restore();
}
function labels() {
  for (const u of sim.units) {
    let el = $(`label-${u.id}`);
    if (!el) { el = document.createElement('div'); el.id = `label-${u.id}`; el.className = `ship-label ${u.player ? 'player' : u.team ? 'enemy' : ''}`; el.innerHTML = '<span></span><div class="bar"><i></i></div>'; $('ship-labels').append(el); }
    const pos = view.screenPosition(u.pos, u.boss ? 17 * u.bodyScale : 18); el.hidden = !pos.visible || u.hp <= 0;
    el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; el.querySelector('span').textContent = u.player ? L('你的旗舰', 'Your flagship') : u.boss ? STAGES[sim.stage].boss : u.team ? L('敌舰', 'Enemy') : L('友舰', 'Ally');
    el.querySelector('i').style.width = `${u.hp / u.maxHp * 100}%`;
  }
}
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, .1); last = now;
  if (ready) {
    if (mode === 'battle') {
      accumulator += dt;
      const cmd = accumulator >= 1 / 60 ? (pilot ? sim.aiCommand(sim.unit('p0')) : controls.read()) : null;
      while (accumulator >= 1 / 60 && mode === 'battle') { sim.step(1 / 60, cmd); afterStep(); accumulator -= 1 / 60; }
    }
    if (mode === 'ending' && now >= resultAt) { mode = 'result'; $('result').hidden = false; }
    $('damage-flash').style.opacity = performance.now() < damageFlashUntil ? '.7' : '0';
    view.render(sim, ['paused', 'upgrade'].includes(mode) ? 0 : dt, mode === 'menu');
    if (!['menu', 'loading'].includes(mode)) { hudClock += dt; if (hudClock > .09) { updateHud(); hudClock = 0; } labels(); }
  }
  requestAnimationFrame(frame);
}
applyStatic();
menuChoices();
syncBgmControls();
persistProgress();
if (view) loading(async () => { await loadModels(['caravel', 'brig'], loadProgress); view.setArena(sim); ready = true; });
requestAnimationFrame(frame);
// Development-only acceptance driver: advances the real simulation using the normal AI controls.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) window.__arena = {
  get sim() { return sim; }, get mode() { return mode; }, get controls() { return controls; }, stats: () => view.stats(),
  get audio() { return audio; },
  get progress() { return progress; },
  pilot(value) { pilot = value; },
  advance(seconds, input) { for (let i = 0; i < seconds * 60 && mode === 'battle'; i++) { sim.step(1 / 60, input || sim.aiCommand(sim.unit('p0'))); afterStep(); } view.setArena(sim); updateHud(); },
};
