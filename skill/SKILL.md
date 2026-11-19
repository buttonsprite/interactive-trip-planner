---
name: interactive-trip-planner
description: Use when 用户想规划旅行、制作旅游攻略、根据小红书收藏夹或单篇笔记整理地点与路线、寻找适合自己的地点、设计每日路线、复核酒店/餐厅/景点/交通/节庆、生成可点击动态地图、让地图内容跟随对话语言，或希望在地图中调整地点并让 Agent 重新安排行程。
---

# Interactive Trip Planner

把旅行想法制作成一套有设计思路、有事实依据、可以在地图中浏览和修改、并能继续迭代的旅行计划。

核心原则：先理解用户想怎样旅行，再寻找地点和规划路线；地图是主要使用界面，交付不是终点。所有给旅行者看的内容使用自然语言，并跟随用户当前主要对话语言；内部数据和开发术语不出现在聊天和地图界面。

## 情境化启动介绍

一次完整规划的首次实质回复中，先回应用户已经提供的内容：复述已知目的地、日期、玩法或资料，并给出一项有用的初步判断。不要先播放固定欢迎语，也不要重复询问已经提供的信息。

回应之后，用 Markdown 列表介绍 2–4 项与当前请求直接相关的能力。首次完整规划且用户尚未提供小红书资料时，必须包含：

- 你可以把小红书收藏夹链接或单篇笔记链接粘贴到这里，我会根据里面的内容整理地点和路线。

其余 1–3 项按需选用：
- 我会结合目的地当地语言和可靠来源，补充并复核适合你的地点。
- 我会按街区、营业时间、交通、体力和安全安排每日动线。
- 我可以生成一张能继续加入、移除、排序和重新安排的交互地图。

之后只询问当前缺少的 1–3 组、并且会改变路线骨架的信息（目的地与日期/天数、进出方式、同行人与体力、喜好与避雷、已定住宿）；明确告诉用户不需要一次填完整。

高德增强不是全局启动门：只有用户给出中国大陆目的地并进入地点定位或路线复核时，才检查 `node scripts/check-amap-cli.js`；未配置也可以继续规划。用户直接粘贴小红书、旧攻略或地图时，先整理资料，再问最少补充信息。已有旅行的局部修改不重复展示启动介绍。

先读取当前目录或上级 `AGENTS.md`。没有旅行工作区规则时，按 `references/workspace-bootstrap.md` 建立。

## 用户带来小红书资料时

用户粘贴 `xiaohongshu.com/board/` 收藏夹、`xiaohongshu.com/explore/` 单篇笔记或 `xhslink.com` 分享链接时，先读取 `references/xiaohongshu-import.md`。

- 先匿名读取；收藏夹匿名结果不完整时，说明数量并提供“登录态只补齐链接清单 / 只导入匿名部分 / 改贴单篇链接”三个选择。只有用户明确同意风险说明后，才允许使用已登录标签页枚举链接，绝不静默读 Cookie 或高速抓取。
- 整理结果默认写入工作区 `travel-library/xiaohongshu/`，不进入 Git 或公开地图。小红书内容只作发现与体验线索，营业、票务、交通和安全仍需在阶段二复核。

## 六阶段完整流程

### 阶段一：理解并确认旅行方向

1. 整理已有信息，第一轮最多追问 1–3 组会改变路线骨架的问题。
2. 必要时轻量搜索季节、城市关系和大型节庆，此时不深挖单个地点。
3. 给出旅行设计提案（用户方向不明确时给 3–5 个差异明显的主题候选），说明：旅行主线、行程段、同期活动、核心取舍、酒店逻辑、吃饭逻辑、每日骨架（每天 1–3 个主锚点）、游客与在地平衡、2–5 项待确认事项。
4. 判断生活品味模板（Taste Model）是否显著改变选点；需要时推荐 1–3 个，允许单选、跳过或一主一辅。
5. 确认 visitor mode（`first-visit` / `return-visit` / `landmark-light` / `local-only` / `balanced-visitor`）。未告知到访史时记为未知并暂定 `balanced-visitor`；不能因“想更 local”而直接排除代表性景点。

详细规则见 `references/planning-workflow.md`、`references/theme-library.md`、`references/theme-narrative.md` 和 `references/hybrid-taste-models.md`。

### 阶段二：寻找适合用户的地点

执行前按需读取 `references/source-verification.md`、`references/regional-source-packs.md` 和 `references/map-provider-delivery.md`。

1. 按“先发现、后核实”执行：结合 Global Base 与匹配地区包，组合中文、英文和目的地当地语言检索；官方来源核实营业、票务、交通、节庆与安全。
2. 同期活动写入 `data/events.json`（`venue` / `hosted` / `citywide`），字段按 `references/event-schema.md`。
3. 按体验角色补候选（主锚点、代表性景点、当地生活、住宿基地、正式餐、地方经典、小吃、咖啡甜品、夜间体验、休息点、交通与雨天/闭馆替代）。每个完整旅行日准备约 12–18 个候选（仅 1–3 个主锚点），抵达/移动日 6–10 个。
4. 为地点分配 `contentTier`（`deep` / `standard` / `compact`）。正式路线地点必须具备具体的 `whyWorthIt`、类型化 `detailSections`（到场做什么、看什么）和可追溯 `sourceIds`，禁止“感受当地生活”“随便逛逛”等空话。
5. 易变信息标注复核日期；只有真实未确认或冲突时才标“需要临近复核”。
6. 中国大陆且 `check-amap-cli.js` 为 `available` 时，可用 `node scripts/amap-cli.js --context <file>`（`action: "search-poi"`）定位消歧；不可用或失败时保留原候选并标明未完成高德定位。

结构化辅助脚本（支持 `--context <file>` 或 `--stdin`）：
```bash
node scripts/recommend-taste-models.js --context <context.json>
node scripts/build-source-query-matrix.js --context <context.json>
node scripts/probe-source-access.js --context <sources.json>
```

产物写入 `data/pois.json`、`data/events.json`、`data/sources.json`、`docs/sources.md`、`docs/hotels.md`、`docs/reservations.md`。

### 阶段三：规划每日行程

1. 先排硬约束（航班、火车、已预约、`confirmed` 活动、闭馆日），再定城市段和酒店基地。
2. 每天 1–3 个主锚点；首次或未知到访史的城市，每天最多 1 个重型代表性景点，并与同方向当地生活角色（市场、社区广场、街区咖啡、社区小馆等）顺路串联。
3. 把酒店作为每天出发、午休和夜间回程锚点；把正餐、轻餐、咖啡休息和天气/闭馆替代编进连续时间线。
4. 4 个以上正式停靠点时比较至少两种可行顺序；中国大陆且高德可用时，对相邻段调用 `amap-cli.js` 的 `route` action 复核距离与耗时，否则明确标注“未完成高德路网复核；请在出发前打开高德确认”。
5. 向用户解释每天在体验什么、为什么这样排序、吃住休息如何衔接、备选怎么替换。

产物写入 `data/itinerary.json` 与 `docs/planning-principles.md`。

### 阶段四：制作动态地图

完整攻略统一使用公开母版 `assets/guide-template-europe-public/`（Europe direct-copy interaction v1）。

1. **优先用构建脚本生成地图，不要手改 1.4 万行 HTML**：维护好 `guides/<trip-slug>/data/` 后运行：
   ```bash
   node scripts/build-trip-map.js --guide guides/<trip-slug>
   ```
   它会自动复制公开母版壳、同步 `trip-map-delivery.js`、注入 `PUBLIC_TRIP_DATA` 并更新标题。
2. 确保 `trip.language` 跟随用户对话语言（中文地图补齐通行译名 `zh`），地图所有文案、按钮和状态保持单语自然语言。
3. 完整保留母版交互：真实底图、全程总览、每日有序列表、段间移动提示、动态顺路候选、统一地点详情、分类图层、搜索筛选、加入/移出、优先级、44px 手柄拖拽排序、撤销和刷新恢复。
4. 外部地图与导出：海外地点主操作为“导航去这里”（Google Maps 免 Key destination-only 链接），中国大陆优先高德；全程与单日支持一键导出 Google My Maps KML（仅含可靠 WGS84 点），高级导出提供 `places.csv`、`itinerary.kml`、`README.md`（CLI 入口：`node scripts/export-google-my-maps.js`）。
5. 视觉微调只在单文件 `<style>` 的 design token 中进行，或通过 `assets/themes/index.json` 选择兼容的 UI theme 与目的地 preset（旅行叙事主题、taste model 与 UI theme 相互独立）；不破坏布局与交互。轻量模板 `assets/guide-template/` 仅用于 3 天以内的极简原型。
6. 完整攻略地图运行 `node scripts/validate-europe-derived-map.js <itinerary-map.html>`，轻量模板运行 `node scripts/validate-map-html.js <itinerary-map.html>`，并在真实浏览器核验桌面与移动端。

### 阶段五与阶段六：地图修改与反馈重排闭环

- 用户可在地图中调整优先级、增删地点和拖拽排序；高影响修改（住宿、已预约、固定时间、跨城、超容量）须先解释影响再确认。
- 修改后受影响日期自动降为“路线待重新复核”，点击“请Agent重新安排”生成自然语言修改汇总。
- Agent 收到汇总后重新核实营业、预约、交通、容量和吃住衔接，说明改了什么、为什么这样排、产生了什么新取舍，然后更新 `data/*.json`、重新运行 `build-trip-map.js` 与校验脚本。

## 面向旅行者的语言

默认替换内部术语：`POI` → `地点`、`candidate` → `当天备选/顺路备选`、`unassigned` → `尚未安排行程`、`draft/needs reroute` → `需要重新安排`、`resource drawer` → `地点详情`、`export change set` → `请Agent重新安排`、`localStorage` → `地图已经记住你的选择`。不向旅行者暴露 `schema`、`renderer`、`token`、`hash`、`JSON` 等术语。

## 输出目录

```text
AGENTS.md
guides/<trip-slug>/
  README.md
  docs/ (design-language.md, planning-principles.md, hotels.md, reservations.md, sources.md, online-logic/map.md)
  data/ (design-tokens.json, pois.json, events.json, itinerary.json, sources.json)
  maps/itinerary-map.html
```

## 按阶段按需读取参考

- 阶段一 / 三：`references/planning-workflow.md`、`references/theme-library.md`、`references/theme-narrative.md`、`references/hybrid-taste-models.md`
- 阶段二 / 三：`references/source-verification.md`、`references/regional-source-packs.md`、`references/hotel-selection.md`、`references/poi-schema.md`、`references/event-schema.md`、`references/map-provider-delivery.md`
- 阶段四 / 五：`references/map-standards.md`、`references/core-interaction-contract.md`、`references/map-feature-contract.md`、`references/design-language.md`
- 通用：`references/user-facing-language.md`、`references/xiaohongshu-import.md`、`references/workspace-bootstrap.md`

## 验证与交付

```bash
node scripts/validate-trip-data.js --pois <pois.json> --itinerary <itinerary.json> --sources <sources.json> --require-route-evidence --strict-routes
node scripts/validate-trip-events.js --events <events.json> --pois <pois.json> --itinerary <itinerary.json> --sources <sources.json>
node scripts/validate-design-tokens.js <design-tokens.json>
node scripts/validate-europe-derived-map.js <itinerary-map.html>
```

静态验证不能替代浏览器验收。最终交付用自然语言说明旅行主线与取舍、酒店与吃饭逻辑、关键路线、资料来源、临近复核事项、地图路径和实际验证结果。
