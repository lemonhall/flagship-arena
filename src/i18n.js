/**
 * Bilingual copy (Chinese / English).
 *
 * The game ships English-first because itch.io is the storefront, and keeps Chinese for
 * browsers that ask for it. Language is resolved once at module load:
 *
 *   ?lang=zh|en  >  localStorage['flagship-lang']  >  navigator.language  >  'en'
 *
 * Two mechanisms, deliberately:
 *   - `L(zh, en)` is inlined wherever JavaScript builds text (data tables, HUD, toasts).
 *     No key dictionary, and both languages sit side by side at the call site.
 *   - `STATIC` + `data-i18n*` attributes cover the fixed markup in index.html, including
 *     the few strings that both the markup and JS need (e.g. the BGM toggle label), which
 *     JS reads back through `s(key)`.
 */

function normalizeTag(value) {
  const tag = String(value || '').toLowerCase();
  if (tag.startsWith('zh')) return 'zh';
  if (tag.startsWith('en')) return 'en';
  return null;
}

function resolveLang() {
  try {
    const fromUrl = normalizeTag(new URLSearchParams(globalThis.location?.search || '').get('lang'));
    if (fromUrl) return fromUrl;
  } catch { /* no location: unit tests, or a blocked URL */ }
  try {
    const stored = normalizeTag(globalThis.localStorage?.getItem('flagship-lang'));
    if (stored) return stored;
  } catch { /* storage blocked */ }
  const nav = globalThis.navigator?.language || globalThis.navigator?.languages?.[0] || '';
  return normalizeTag(nav) || 'en';
}

export const LANG = resolveLang();
export const isZh = LANG === 'zh';

/** Pick the string for the active language. Both variants are written inline at the call site. */
export const L = (zh, en) => (isZh ? zh : en);

/** Copy for the fixed markup in index.html; [chinese, english]. */
const STATIC = {
  'meta.title': ['旗舰突击 · 六海征途', 'Flagship: Six Seas - 3D Naval Combat in Your Browser'],
  'meta.description': [
    '驾驶旗舰，穿越六片海域。第三人称 3D 海战，手机与浏览器即点即玩。',
    'Take command of a flagship across six seas. Third-person 3D naval combat, playable instantly in any browser.',
  ],
  'canvas.aria': ['第三人称海战画面', 'Third-person naval battle view'],

  'brand.name': ['旗舰突击', 'FLAGSHIP: SIX SEAS'],
  'brand.sub': ['FLAGSHIP / SIX SEAS', 'THIRD-PERSON NAVAL COMBAT'],
  'brand.tag': ['单机航路 · 01', 'SINGLE-PLAYER · 01'],

  'intro.eyebrow': ['掌舵、排射、破浪而行', 'STEER · BROADSIDE · BREAK THE WAVES'],
  'intro.title': ['六片海域。<br />一艘你的旗舰。', 'Six seas.<br />One flagship.'],
  'intro.body': [
    '两艘友舰伴航，敌军接踵而至。<br />击败海盗首领，把下一艘战舰收入船坞。',
    'Two escorts at your side, enemies without end.<br />Beat the pirate captains and take their ships into your dock.',
  ],

  'voyage.heading': ['选择航路', 'Choose a Route'],
  'voyage.progress': ['已征服 0 / 6', 'Cleared 0 / 6'],
  'voyage.selectAria': ['选择周目', 'Choose voyage'],
  'voyage.next': ['开启下一周目 ↗', 'Start Next Voyage ↗'],
  'voyage.stagesAria': ['六关航路', 'Six routes'],

  'loadout.hull': ['你的旗舰', 'Your Flagship'],
  'loadout.hullAria': ['选择旗舰', 'Choose flagship'],
  'loadout.gun': ['主力火炮', 'Main Battery'],
  'loadout.gunAria': ['选择火炮', 'Choose cannon'],

  'dock.parts': ['改装零件', 'Refit Parts'],
  'dock.upgrade': ['船坞强化 ↗', 'Dock Upgrades ↗'],
  'dock.balance': ['可用零件', 'Parts available'],
  'dock.keepOnDefeat': ['· 战败也保留已获得的零件', '· parts you earn survive a defeat'],

  'bgm.controlsAria': ['背景音乐控制', 'Background music controls'],
  'bgm.toggleAria': ['切换背景音乐', 'Toggle background music'],
  'bgm.volumeAria': ['背景音乐音量', 'Music volume'],
  'bgm.on': ['BGM 开', 'BGM on'],
  'bgm.off': ['BGM 关', 'BGM off'],

  'depart.start': ['起航', 'Set Sail'],
  'depart.stageName': ['翡翠浅滩', 'Jade Shoals'],
  'depart.stageDetail': ['3 波敌舰 + 首领战', '3 enemy waves + boss'],

  'menu.keys': ['WASD 掌舵 / 空格排射 / Shift 冲刺 / Q 换目标', 'WASD steer / Space broadside / Shift boost / Q switch target'],
  'menu.touch': ['手机：左手掌舵 · 右手开炮', 'Mobile: left thumb steers · right thumb fires'],

  'hud.aria': ['战斗信息', 'Battle info'],
  'hud.brand': ['旗舰突击', 'FLAGSHIP: SIX SEAS'],
  'hud.bgmAria': ['打开背景音乐设置', 'Open music settings'],
  'hud.soundAria': ['切换音效', 'Toggle sound effects'],
  'hud.soundOn': ['音效 开', 'Sound on'],
  'hud.soundOff': ['音效 关', 'Sound off'],
  'hud.pauseAria': ['暂停', 'Pause'],
  'hud.fullscreenAria': ['全屏', 'Fullscreen'],
  'hud.hull': ['船体', 'Hull'],
  'hud.ammo': ['炮弹', 'Ammo'],
  'hud.radarAria': ['战场雷达', 'Battle radar'],
  'hud.stickAria': ['航行摇杆', 'Steering joystick'],
  'hud.stick': ['掌舵', 'Steer'],
  'hud.target': ['换目标', 'Switch Target'],
  'hud.boost': ['冲刺', 'Boost'],
  'hud.fire': ['排射', 'Broadside'],
  'hud.fireHint': ['按住开炮', 'Hold to fire'],
  'hud.hint': [
    '让侧舷朝向敌舰 · 驶近木桶修船、炮弹箱补弹',
    'Turn your broadside to the enemy · barrels repair, crates reload',
  ],

  'upgrade.back': ['← 返回航路', '← Back to Route'],
  'upgrade.backAria': ['收拢战利品并结束本次出航', 'Bank your salvage and end this voyage'],
  'upgrade.eyebrow': ['战场已暂停 · 本关改装', 'Battle paused · stage refit'],
  'upgrade.title': ['火力，开始成型', 'Your firepower takes shape'],
  'upgrade.note': [
    '三选一 · 临时改装本关有效，船坞强化永久保留',
    'Pick one · refits last for this stage; dock upgrades are permanent',
  ],
  'upgrade.release': ['松开手指，稍候选择改装', 'Release, then choose your refit'],

  'shipyard.eyebrow': ['每次出航，都能更强', 'Stronger with every voyage'],
  'shipyard.title': ['船坞强化', 'Dock Upgrades'],
  'shipyard.note': [
    '进度仅保存在此浏览器。分享网址不会分享你的存档。',
    'Progress is saved in this browser only. Sharing the URL does not share your save.',
  ],
  'shipyard.close': ['整备完毕 · 返回航路', 'Ready · Back to Route'],

  'loading.eyebrow': ['整备舰队', 'Preparing the fleet'],
  'loading.title': ['船员就位中', 'Crew taking position'],
  'loading.detail': ['正在装载战舰', 'Loading warships'],
  'loading.retry': ['重新装载', 'Retry loading'],
  'loading.back': ['返回航路', 'Back to Route'],

  'pause.eyebrow': ['暂时抛锚', 'Anchored'],
  'pause.title': ['海风会等你', 'The wind will wait'],
  'pause.body': ['战斗已暂停', 'Battle paused'],
  'pause.resume': ['继续航行', 'Resume'],
  'pause.leave': ['返回航路', 'Back to Route'],

  'result.eyebrow': ['航路战报', 'Route Report'],
  'result.back': ['返回航路 · 整备船炮', 'Back to Route · Refit'],
};

/** Look up a static string by key. Unknown keys fall back to the key itself. */
export function s(key) {
  const copy = STATIC[key];
  return copy ? L(copy[0], copy[1]) : key;
}

/** Fill every `data-i18n*` node, then localize the document itself. Safe to call twice. */
export function applyStatic(root = globalThis.document) {
  const doc = root?.documentElement ? root : null;
  const scope = doc || root;
  if (!scope?.querySelectorAll) return;

  for (const node of scope.querySelectorAll('[data-i18n]')) {
    const copy = STATIC[node.dataset.i18n];
    if (copy) node.textContent = L(copy[0], copy[1]);
  }
  for (const node of scope.querySelectorAll('[data-i18n-html]')) {
    const copy = STATIC[node.dataset.i18nHtml];
    if (copy) node.innerHTML = L(copy[0], copy[1]);
  }
  for (const node of scope.querySelectorAll('[data-i18n-aria]')) {
    const copy = STATIC[node.dataset.i18nAria];
    if (copy) node.setAttribute('aria-label', L(copy[0], copy[1]));
  }

  if (!doc) return;
  doc.documentElement.lang = isZh ? 'zh-CN' : 'en';
  const title = STATIC['meta.title'];
  if (title) doc.title = L(title[0], title[1]);
  const meta = doc.querySelector('meta[name="description"]');
  const description = STATIC['meta.description'];
  if (meta && description) meta.setAttribute('content', L(description[0], description[1]));
}
