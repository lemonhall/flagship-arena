# 移动端连续炮击触发网页缩放

2026-09-20，用户提供 iPhone 截图：连续点击排射后，画面、文字和按钮整体放大并被视口裁切。属于浏览器页面缩放，不是 Three.js 相机变焦。

## 诊断与修复

原版已有 `touch-action: none`，但只在 Pointer Events 的按下阶段调用 `preventDefault()`；原生 `touchstart/move/end` 与 WebKit `gesture*` 仍未取消。Chrome 移动模拟中，连续触摸均可取消却没有被取消；Chrome 自身遵守 CSS，因此未复现 iPhone 原生缩放。截图是实际症状证据，自动化红灯定位到默认手势处理边界，不能冒充真机 Safari 复现。

战场画布、摇杆、排射、冲刺和换目标现在以非 passive 监听处理原生触摸，并取消默认行为。战斗中的 WebKit 缩放手势也会取消；按钮内文字不再独立参与触控命中。菜单、改装和暂停面板继续允许滑动及音量操作。

取消原生触摸会影响浏览器合成 click，因此换目标改为 pointerdown，另保留键盘 click；每次触控、鼠标、Enter / Space 只切一次目标。存档格式与数值规则不变。

## 验证

- `npm run e2e -- tests/browser/touch-zoom.spec.js`：修复前两项红灯，修复后两项通过。真实 CDP 双指输入，保持掌舵并连点排射 12 次，再单指点 6 次；验证松手清空、原生事件已取消、`visualViewport.scale === 1`、目标切换和手势拦截范围。
- 相关六项浏览器回归通过：新增两项、手机双指与横竖屏、短屏菜单触摸滚动、BGM 两项。增强换目标键鼠断言后定向两项再次通过。
- `npm run build` 通过；保留 Three.js 既有 chunk 大小提示。
- Vercel 部署 `dpl_5xx8DJAKNZU2YmzEhoMmRRgsu67d` 为 READY；正式域名 `node tools/verify-live.mjs` 返回 `PRODUCTION_OK`。12 次连点共记录 26 次触摸开始/结束事件，均取消默认行为，页面比例始终为 1；桌面/手机开炮、音乐与本地存档隔离仍通过。结果记录在 `evidence/production.json`。

限制：本机为 Windows，验证使用系统 Chrome 移动模拟；WebKit 专有手势以可取消事件验证接线，未宣称真机 Safari 已验收。重新加载页面即可获取修复，无需清理网站数据，避免误删本地存档。
