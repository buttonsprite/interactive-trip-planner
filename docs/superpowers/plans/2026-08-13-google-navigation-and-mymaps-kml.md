# Google Navigation and My Maps KML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为海外 POI 增加无需起点和预设交通方式的 Google Maps 一键导航，并让用户从当前地图状态导出“全部地点”或“当天地点”的单个 KML 后直接打开 Google My Maps。

**Architecture:** 继续以 `trip-map-delivery.js` 作为唯一 provider 与 KML 序列化层；轻量模板和欧洲公开模板只负责把当前 State 投影交给共享 runtime，并处理下载、打开网页和反馈。保留现有 `buildMyMapsFiles()` 三文件 CLI 契约，同时新增面向浏览器的 scoped KML contract，避免破坏 0.3 已有导出能力。

**Tech Stack:** Vanilla JavaScript、Leaflet、Node.js contract tests、KML 2.2、Google Maps URLs、Google My Maps 手动导入。

---

### Task 1: 锁定 POI 导航与区域边界

**Files:**
- Modify: `skill/scripts/test-map-handoffs.js`
- Modify: `skill/assets/guide-template/maps/assets/trip-map-delivery.js`

- [ ] **Step 1: 写海外 POI 导航的失败测试**

在 `test-map-handoffs.js` 增加断言：`region: "OVERSEAS"` 的主链接使用 `https://www.google.com/maps/dir/`，仅包含 `api=1` 和 `destination`，不包含 `origin`、`travelmode` 或 `waypoints`；坐标不可用时以地点名与地址作为 destination。

- [ ] **Step 2: 写中国 POI provider 边界的失败测试**

断言 `region: "CN"` 仍以 AMap marker 为主链接；海外 POI 不返回 AMap manual error；完全无法定位的海外 POI 返回稳定的 Google manual item。

- [ ] **Step 3: 运行 RED**

Run: `node skill/scripts/test-map-handoffs.js`

Expected: FAIL，现有海外 POI 主链接仍为 Google search，且会生成无意义的 AMap manual item。

- [ ] **Step 4: 实现最小 Google destination-only 导航**

在 delivery runtime 新增单地点 directions builder：优先 WGS84 坐标，其次地点名与地址；URL 超过 2048 时降级为 search；`buildPlaceLinks()` 根据目的地区域只把 AMap 作为中国 provider，Google 保留中国的次级入口。

- [ ] **Step 5: 运行 GREEN 并提交**

Run: `node skill/scripts/test-map-handoffs.js`

Expected: PASS。

Commit: `feat: add destination-aware POI navigation`

### Task 2: 建立 scoped KML 数据契约

**Files:**
- Modify: `skill/scripts/test-google-my-maps-export.js`
- Modify: `skill/assets/guide-template/maps/assets/trip-map-delivery.js`

- [ ] **Step 1: 写“全部地点”单文件 KML 的失败测试**

新增 `buildMyMapsKmlExport({ trip, state, locale, scope: "all" })` contract：文件名为 `<slug>-all-places.kml`；每个 POI 最多出现一次；已安排点进入对应日期文件夹；多个日期候选但未安排的点只进入最早候选日期，并在 description 写出其他候选日期；其余进入“未安排行程”。

- [ ] **Step 2: 写“当天地点”失败测试**

对 `scope: "day", dayId` 断言只包含该日正式安排，以及该日候选中当前未被安排到任何日期的点；安排到其他日期的候选必须排除；正式地点保持当前 `orders` 顺序；文件名包含日期。

- [ ] **Step 3: 写坐标与隐私边界失败测试**

断言仅 WGS84 写入 `<Point>`；GCJ-02-only/缺坐标计入 `manualCount`；无任何可写点时拒绝生成空 KML；隐私扫描发生在返回文件内容之前，且 day scope 不因范围外 POI 的敏感字段被阻断。

- [ ] **Step 4: 运行 RED**

Run: `node skill/scripts/test-google-my-maps-export.js`

Expected: FAIL with `TripMapDelivery.buildMyMapsKmlExport is not a function`。

- [ ] **Step 5: 实现 scoped entry projection 与 KML builder**

新增只读 `buildMyMapsKmlExport()`，返回 `{ fileName, content, stats }`；复用 `currentTripView()`，不回写 assignments/orders/priorities/dirtyDays；候选日期、folder、manual count 都从当前投影计算。保留 `buildMyMapsFiles()` 的 `places.csv`、`itinerary.kml`、`README.md` 兼容输出。

- [ ] **Step 6: 运行 GREEN 并提交**

Run: `node skill/scripts/test-google-my-maps-export.js`

Expected: PASS。

Commit: `feat: add scoped My Maps KML exports`

### Task 3: 接入轻量地图 UI

**Files:**
- Modify: `skill/scripts/test-map-delivery-ui.js`
- Modify: `skill/assets/guide-template/maps/itinerary-map.html`
- Modify: `skill/assets/guide-template/maps/assets/trip-map-core.js`
- Modify: `skill/assets/guide-template/maps/assets/trip-map-core.css`

- [ ] **Step 1: 写导出 dialog 与 POI action 的失败测试**

要求 dialog 包含“导出全部地点并打开 My Maps”“导出当天地点并打开 My Maps”“打开 Google My Maps”和折叠的高级导出；总览时当天按钮 disabled，选择日期后启用并携带当前 day id；POI 详情渲染“导航去这里 / Navigate here”。

- [ ] **Step 2: 写下载与 popup 失败路径测试**

VM 测试必须证明一次点击先调用 `buildMyMapsKmlExport()`，再创建一个 Blob、下载动态文件名并尝试 `window.open("https://www.google.com/mymaps")`；popup 被拦截时下载仍完成并显示手动打开链接；privacy error 时不创建 Blob、不打开页面。

- [ ] **Step 3: 运行 RED**

Run: `node skill/scripts/test-map-delivery-ui.js`

Expected: FAIL，模板尚无 scoped KML action，Core 只支持固定三文件下载。

- [ ] **Step 4: 实现轻量 UI**

重构导出 dialog 主操作与高级导出；从 `state.view.activeDayId` 读取当天；复用现有 native `<dialog>` focus/Escape 行为；按钮和链接在 390px 下保持至少 44px 可点击区域。

- [ ] **Step 5: 运行 GREEN 并提交**

Run: `node skill/scripts/test-map-delivery-ui.js`

Expected: PASS。

Commit: `feat: add one-click My Maps export controls`

### Task 4: 接入欧洲公开完整地图

**Files:**
- Modify: `skill/scripts/test-europe-public-template.js`
- Modify: `skill/scripts/test-mobile-map-interaction.js`
- Modify: `skill/scripts/build-europe-public-template.js`
- Modify: `skill/assets/guide-template-europe-public/maps/itinerary-map.html`

- [ ] **Step 1: 写公开模板失败测试**

断言公开地图只引用/内联一次 canonical Delivery runtime；`currentDeliveryState()` 仍是唯一状态投影；导出操作从 `appState.dayView.selectedDayId` 读取日期；总览禁用当天导出；POI provider action 使用共享 `buildPlaceLinks()`。

- [ ] **Step 2: 写公开模板移动交互失败测试**

在 390px contract 中要求主导出按钮、关闭按钮、My Maps 链接和两个 KML action 都满足 44px；native dialog 仍支持 cancel 和 focus return。

- [ ] **Step 3: 运行 RED**

Run: `node skill/scripts/test-europe-public-template.js && node skill/scripts/test-mobile-map-interaction.js`

Expected: FAIL，公开模板仍展示旧三文件 dialog。

- [ ] **Step 4: 实现公开模板 adapter 与 UI**

只在公开模板实现状态读取、下载和 popup 编排；所有导航 URL、scope 过滤、KML、隐私与坐标判断继续调用 canonical Delivery runtime。构建脚本保持 deterministic copy/inline。

- [ ] **Step 5: 运行 GREEN 并提交**

Run: `node skill/scripts/build-europe-public-template.js && node skill/scripts/test-europe-public-template.js && node skill/scripts/test-mobile-map-interaction.js`

Expected: PASS，且 public delivery copy 与 canonical runtime byte-identical。

Commit: `feat: add public map KML delivery workflow`

### Task 5: 更新 Skill 文档与线上逻辑

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `skill/references/map-provider-delivery.md`
- Modify: `skill/assets/guide-template/docs/online-logic/map.md`
- Modify: `skill/assets/guide-template-europe-public/docs/online-logic/map.md`
- Modify: `docs/REDSKILL_INSTALL.template.md`
- Modify: `skill/scripts/test-skill-contract.js`
- Modify: `skill/scripts/test-redskill-package.js`

- [ ] **Step 1: 写文档 contract 的失败测试**

逐文档要求说明：Google 单 POI directions 不带起点/强制 mode；My Maps 仍需用户导入本地 KML，不自动同步 Google 账号；全量/当天 KML 的内容边界；仅 WGS84；高级 CSV/README 兼容；popup blocked 与隐私失败文案。

- [ ] **Step 2: 运行 RED**

Run: `node skill/scripts/test-skill-contract.js && node skill/scripts/test-redskill-package.js`

Expected: FAIL，当前文档只描述旧三文件流程。

- [ ] **Step 3: 更新当前行为文档**

写清当前实际线上流程、区域判断依据、数据状态来源、错误分支和 Google/My Maps 能力边界；不宣称 Google API 自动写入或 Saved Lists 同步。

- [ ] **Step 4: 运行 GREEN 并提交**

Run: `node skill/scripts/test-skill-contract.js && node skill/scripts/test-redskill-package.js`

Expected: PASS。

Commit: `docs: explain Google navigation and KML delivery`

### Task 6: Fresh verification 与视觉验收

**Files:**
- Verify only: all modified files
- Generated then restore: `releases/redskill-0.3.0/`

- [ ] **Step 1: 运行 focused 与完整测试**

Run:

```bash
node skill/scripts/test-map-handoffs.js
node skill/scripts/test-google-my-maps-export.js
node skill/scripts/test-map-delivery-ui.js
node skill/scripts/test-europe-public-template.js
node skill/scripts/test-mobile-map-interaction.js
npm run test:skill
```

Expected: all exit 0；live AMap test 仅在未提供 opt-in credential 时明确 SKIP。

- [ ] **Step 2: 构建并验证 REDSkill**

Run: `npm run build:redskill && npm run test:redskill`

Expected: exit 0；发布包只有 supported formats，包含两张 standalone map，canonical Delivery runtime 只内联一次。

- [ ] **Step 3: 浏览器验收 source 与 built maps**

在 1280×720 和 390×844 验证：页面和地图非空；海外 POI 显示 Google 导航；总览的当天导出 disabled；选择日期后 enabled；点击全量/当天动作会下载一个 KML；popup blocked fallback 可见；高级导出折叠；console 相关 error/warn 为 0；无横向溢出。

- [ ] **Step 4: 清理生成物并做工作区审查**

精确恢复 `releases/redskill-0.3.0/` 的测试生成变化；运行 `node --check` 覆盖修改的 JavaScript、`git diff --check`、`git status --short`；逐项对照 design spec 检查隐私、坐标、状态 truth 与文件范围。

- [ ] **Step 5: 提交最终修正**

只提交验收发现的必要修正和证据，不 push、不 merge main。
