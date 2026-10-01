# 独立旗舰海战 v2：压力与成长

2026-09-20。依据 [PRD-0002](../prd/PRD-0002-combat-growth.md)、[ECN-0002](../ecn/ECN-0002-combat-growth.md)、[复盘](../combat-design-review.md)。用户已批准实现全部六关。

## 里程碑与执行计划

本轮一个完整里程碑 M1，状态 done。先让首关形成可验证的战斗，再将同一系统贯穿六关；交付包含 UI、存档和生产发布。

| 步骤 | Req | 文件 | 验收命令与证据 |
|---|---|---|---|
| 1. 红测：成长、改装、首领、压力 | 001–004 | `tests/growth.test.js`、`tests/combat.test.js`、`tests/sim.test.js` | `npm test`，先记录缺失行为的红灯 |
| 2. 纯规则和存档 | 001–004 | `src/progression.js`、`src/upgrades.js`、`src/bosses.js`、`src/sim.js`、`src/catalog.js` | Node 行为测试全部通过；模拟使用真实炮击，不允许直接写胜负 |
| 3. 界面和海面预警 | 005/007 | `src/main.js`、`src/view.js`、`src/audio.js`、`index.html`、`src/style.css` | `npm run e2e`，旧存档、改装冻结/选择、强化、失败再战、BGM、横竖屏截图、两个浏览器上下文存档隔离 |
| 4. 六关与对照调校 | 001/006 | `tools/analyze-balance.mjs`、`tests/`、`evidence/` | 种子 1–12 对照；初始停船 ≤1 胜、固定转圈 ≤8 胜；熟练策略与成长后有效提升；六关实弹完成 |
| 5. 收口 | 006 | README、本文、生产验证工具 | build 成功；一次完整独立 Review，必要时定向复查；Vercel 生产检查；commit/push |

## DoD 与 Doc QA

DoD 绑定上表命令、Req 和证据；首关完成不是本轮完成。反作弊：不能通过删除败局/改种子、注入胜负、只渲染红圈不造成伤害、只改文案不改变实弹能力通过验收。测试模式只能加速真实规则、发送正常控制和选择真实选项。

风险：叠加伤害导致必败；补给不足导致弹药枯竭；新界面复发遮挡；旧存档丢失或重复发奖。分别使用多策略对照、完整战役测试、短视口 E2E 和迁移/结算幂等测试限制。范围与术语已同步 PRD，Doc QA/DoD 自检通过。

## Review 与触发

cost_profile: standard。交付前由新鲜上下文的独立 reviewer 检查文档、代码、测试与当前 diff；首轮完整，后续仅修复项，最多 3 轮。触发使用代理工作流与交付检查，仓库暂无自动 hook。未获得检查通过前不得标记 done。

expected_review_triggers: 1（M1 与 v2 完成合并）；actual_review_runs: 3；skipped_triggers: 0。

| 轮次 | 独立检查 | 发现与处置 | verdict |
|---|---|---|---|
| 1 | `review_combat_v2`，新鲜上下文，同模型风险保留 | 0 BLOCKER / 2 MAJOR：排射超出预警、冲撞被礁石挤出航道；先红测后修复 | blocked |
| 2 | 同一 reviewer 定向复查并补查浏览器接线 | 两项旧 MAJOR 关闭，13 项定向规则绿；新 MAJOR：暂停时震动累加，已红测确认并改为基准位置加瞬时偏移 | blocked |
| 3 | 仅镜头修复与恢复航行的回归 | 独立 Chrome 桌面/手机等待改装 1.5 秒、暂停 1 秒，镜头和模拟时间严格固定，恢复后正常推进，无页面错误；0 BLOCKER / 0 MAJOR / 0 MINOR | pass |

稳定签名：`boss::REQ-0002-004::barrage-outside-warning`、`boss::REQ-0002-004::charge-rock-deflection`、`ui::REQ-0002-002::frozen-camera-shake-drift`，全部关闭；镜头问题由 `growth.spec.js` 的改装/暂停连续帧坐标回归覆盖。没有跳过检查或以同一 maker 自评代替独立检查。最终 verdict: pass；blocker_count: 0；major_count: 0；stuck_signatures: none；regression_signatures: none。

## 验证与差异

### 追溯与验证

| Req ID | 实现与验证入口 | 结果与证据 |
|---|---|---|
| REQ-0002-001 | `sim.js`、`combat.test.js`、`node tools/analyze-balance.mjs` | 首关停船 0/12 胜，固定转圈开炮 1/12；原版分别 7/12、12/12 |
| REQ-0002-002 | `upgrades.js`、`sim.js`、`combat.test.js`、浏览器 `growth/arena` | 每关 3/3/4/4/5/5 次三选一，真实炮弹/燃烧/连爆/反击生效，选择时冻结；`evidence/upgrade-*.png` |
| REQ-0002-003 | `progression.js`、`growth.test.js`、浏览器 `growth.spec.js` | 迁移、买强化、失败收益、再次结算、再战和刷新；旧周目不回退；`evidence/shipyard-mobile.png` |
| REQ-0002-004 | `bosses.js`、`view.js`、`combat.test.js` | 三种招式真实伤害可躲、半血变招、破绽实伤增加、遇礁停止冲撞；`evidence/boss-desktop.png` |
| REQ-0002-005 | `main.js`、`style.css`、`npm run e2e` | 8/8 浏览器测试通过，横竖屏、双指、BGM、失败与完整战役；新增 LAN 缺少 UUID API 红→绿；镜头漂移修复后定向复跑 |
| REQ-0002-006 | `tests/sim.test.js`、`tools/campaign.mjs`、`tools/verify-live.mjs` | 23/23 Node 测试、build 通过；新存档六关及宝船六关实弹完成；生产 READY、正式域名验证通过，提交随本文落库 |
| REQ-0002-007 | `progression.js`、浏览器 `growth.spec.js`、生产验证脚本 | 两个隔离上下文同网址：A 迁移与购买，B 为 0 进度；无进度上传；不是服务器共享存档 |

基线：`evidence/combat-balance-baseline.json`，源码 `6caf020`，144 场。v2：`evidence/combat-balance-v2.json`，240 场与完整战役，记录各源码 SHA-256，保留所有败局。普通敌伤害最终系数 0.54、友舰 0.4；维修桶 38，按波有限提供。取消敌军无效补给追逐，统一导航与射击目标。初期曾试用 0.68，导致成长前失败过密，已按同一固定种子和行为目标调回。

| 同一策略，同一首关种子 1–12 | 通关 | 友军输出中位占比 | 首领阶段耗时中位数 |
|---|---:|---:|---:|
| 初始 AI 驾驶 | 4/12 | 34.70% | 32.70 秒 |
| 三项各一级 | 8/12 | 33.96% | 27.63 秒 |
| 三项各三级 | 10/12 | 30.71% | 28.17 秒 |

新存档完整战役使用种子 `101 + stage + runSerial × 997`；共 8 场，包含第 2 / 第 4 关各一败，靠本次战役真实收入购买训练，六关成功场耗时 88/67/89/112/105/115 秒。没有注入通关、排除失败或赠送无法赚到的训练。浏览器完整战役由正常点击购买/改装驱动，实时帧影响局部轨迹，因此有不同但保留的失败记录。宝船二周目六关均通过。

### 红绿与剩余差异

- 初版成长/首领规则与浏览器船坞测试先红后绿；旧战役循环停在改装，已改为选择真实候选且限定步数，不能无限挂起。
- 排射预警与冲撞路径先复现失败，再修源码，规则回归通过。
- LAN HTTP 无 `randomUUID`：浏览器无法开战的红测 → 使用 `getRandomValues` 回退 → 失败结算/再战测试绿。
- 暂停镜头回归先红：500 ms 内镜头 Y 从 45.07 漂至 56.09；改为独立的基础位置与震动偏移后，成长浏览器 3/3、build 和独立复查通过。
- 规则、存档和界面范围已实现；本地 Chrome 手机模拟不能代替真机 Safari 与用户对趣味性的判断，不宣称真人胜率或手感已保证。
- 联机按用户指令暂停，不属于 v2。没有修改 Godot RPG。

### 发布收口

独立第 3 轮已通过。Vercel production `dpl_BMhYVRXN6WcecMRgRPkczsG5SGmS` 为 READY；2026-09-20 `node tools/verify-live.mjs` 正式域名检查为 `PRODUCTION_OK`。桌面 1440×900、手机 390×667 均 HTTP 200、GLB 200、BGM 206，实际排射弹药 120→117，无页面异常。音乐循环、25% 音量和关闭记忆正常；生产没有开发验收驱动。

生产隔离验证中，仅给桌面测试上下文写入合成的旧存档：迁移 48 零件、买一级火炮后 36，刷新仍保留；同网址手机新上下文仍为 0 关 / 0 零件 / 0 强化。两个上下文上传请求均为空。报告在 `evidence/production.json`，使用合成验收数据，不包含用户本人的存档；`evidence/` 不在发布内容中。

本里程碑源码、文档与证据在同一 `v2: feat` 提交交付并推送 `origin/main`，提交号以 Git 历史为准。没有未处置 BLOCKER / MAJOR 或范围内待办。无自动 hook 的环境以本记录、独立审阅和命令结果共同检查交付。
