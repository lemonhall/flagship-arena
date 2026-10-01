# 独立旗舰海战 v1

2026-09-20 后续：用户试玩确认成长与压力不足，已批准 [v2](v2-index.md) 和 [ECN-0002](../ecn/ECN-0002-combat-growth.md)。以下为 v1 功能交付记录，玩法调整由 v2 接续。

2026-09-20，用户要求在 RPG 平级交付可直接游玩的 Web/手机单机，并另建房间联机项目。延续第三人称、简易操作、至少 3V3、侧舷排射、实际炮型、随机岛礁、橡木桶和炮弹箱；复用已有船模。

## 范围与验收

PRD：[PRD-0001](../prd/PRD-0001-arena.md)。执行顺序：行为测试红灯 → 纯规则 → 3D 与交互 → 单机部署 → 独立检查 → push。需求 001–004 对应 WEB。

2026-09-20 用户明确要求先验收单机，联机暂停。NET-01/02 与 REQ-0001-005/006 移出本次交付，未来规则另行设计；本轮不创建联机项目或部署联机服务。

单机按用户最新要求采用六关，每关普通波数 3/3/4/4/5/5，最后 BOSS 与两艘护卫。击沉后快速补舰，通关解锁船炮；PC 原有节奏不变。测试：`npm test` 的真实炮击完整六关；`npm run e2e` 的桌面/移动控制、进度与生产模型加载；`npm run build` 均须退出 0。

| ID | 交付 | 验证 |
|---|---|---|
| WEB-01 | Three.js 透视相机、现有 GLB 船模，运行不依赖 Godot/RPG | 系统 Chrome 截图、无运行错误；部署站直接开战 |
| WEB-02 | 固定步长纯 JS 规则；随机海域、3V3、5 炮型、AI、补给和终局 | Node 行为测试、全局自动驾驶完整对局 |
| WEB-03 | 横竖屏触控、键鼠、暂停、音效、重开/选船 | Playwright 桌面与手机尺寸、双指输入、重开和暂停验证 |
| WEB-04 | Vercel 单机生产部署 | 生产 URL 请求成功、线上真实加载船模 |
| WEB-05 | 宝船与全部船炮继承，下一周目与旧关重玩 | 进度迁移/合并测试、二周目六关真实炮击、浏览器新旧周目切换 |

反作弊验收：全关卡测试不能直接设置胜负，必须通过实际炮击完成；Web GLB 必须来自现有船模导出。用户要求尽快交付，因此采用一次有界回归和独立审阅，修复实际阻塞即可。

## 技术选择

Three.js + Vite + 原生 ES modules，复用 Godot 船模导出的 GLB。纯模拟与渲染/音频/输入分开。Canvas 用于雷达和程序生成粒子贴图，主要画面保持 3D。单机无战斗服务器开销。联机暂停，未来单独评估规则和成本。

## 状态

追加用户需求 REQ-0001-007：带宝船重玩已通关航路，或进入下一周目。永久解锁与当前周目的关卡进度分开；每个周目仍为六关，通关后显式开启下一轮。`tests/sim.test.js` 验证迁移/进度/倍率与真实炮击；`tests/browser/arena.spec.js` 验证结算→宝船二周目→刷新→旧周目重玩。无新货币、养成树或付费系统。

M1：单机全部功能、Vercel 部署、生产浏览器检查完成；done。交付 commit/push 随本记录落库，提交号见 Git 历史。

## 追溯与验收记录

计划索引即本文 WEB-01–05。ECN 索引：[ECN-0001](../ecn/ECN-0001-single-player-and-replay.md)。运行方式与玩法见 [README](../../README.md)。

| Req ID | 对应交付 | 命令与结果 | 证据 |
|---|---|---|---|
| REQ-0001-001 | WEB-02 | `npm test` 10/10，六关真实炮击胜利 | `tests/sim.test.js`，一周目 70/55/54/90/84/106 秒 |
| REQ-0001-002 | WEB-02/03 | `npm test` 与 `npm run e2e` 通过迁移、解锁、刷新 | `tests/browser/arena.spec.js`，`evidence/victory.png` |
| REQ-0001-003 | WEB-01/03 | 桌面与手机双指、释放、失焦暂停、横竖屏通过；真实 Chrome 截图核对 | `evidence/battle-desktop.png`、`battle-mobile.png`、`battle-landscape.png` |
| REQ-0001-004 | WEB-04 | `npm run build`、Vercel production READY、`node tools/verify-live.mjs` 通过 | `evidence/production.json`、`live-desktop.png`、`live-mobile.png`；<https://flagship-arena-web.vercel.app> |
| REQ-0001-007 | WEB-05 | 二周目六关真实炮击胜利；浏览器宝船开局、刷新、旧关不覆盖新进度通过 | `tests/sim.test.js`、`tests/browser/arena.spec.js`、`evidence/treasure-ship.png` |

最新全量：10 个 Node 测试、2 个完整浏览器流程通过。二周目六关 43/47/90/81/99/95 秒。GLB 9 个，36.68→6.05 MiB，按需加载。Three.js 核心块超过 Vite 默认 500KB 提示线，gzip 153.52KB；保留提示，无运行失败。

生产部署 `dpl_7MkFHfz8Fjhg8o7YTnh22GJjyfC5`。2026-09-20 桌面/手机 Chrome 均返回 HTTP 200，四个首关 GLB 均 200，无 pageerror，实际操作排射后炮弹均由 120 减至 116。生产未暴露开发验收驱动。

## 独立检查

- reviewer_context: fresh independent agent / same-model；检查者 `/root/review_flagship_design`。
- cost_profile: light；round: 1（主体）+ 2（用户追加二周目，定向复核）。
- verdict: pass；blocker_count: 0；major_count: 0；stuck_signatures: none；regression_signatures: none。
- commands_checked: `npm test`；独立以 1/60 步长验证第一、第二周目六关；实弹火力与装填倍率探针。
- 第 1 轮核对高刷新率单次输入、存储失败保留会话进度、材质回收；修复均已落盘。
- 第 2 轮确认二周目六关可完成、旧存档不覆盖新进度、可开启三周目；初始单发伤害 25，宝船 43.75，二周目宝船 49。
- residual_risks: 自动验收使用系统 Chrome 与移动设备模拟，未声称真机 Safari/低端安卓帧率验收；由用户本次试玩反馈。

## 触发审计与差异

- expected_review_triggers: 2；actual_review_runs: 2；skipped_triggers: 0。
- 本轮单机范围无未处置阻塞。联网是用户主动暂停的后续项目，不计入本次 DoD。
- PC 旗舰海战先前已于 `ec7ffe9` 推送；本次仅带上旧战棋存档兼容 guard 与浏览器资产导出器，`tactical_campaign_test.gd`、`flagship_campaign_test.gd` 均通过。
