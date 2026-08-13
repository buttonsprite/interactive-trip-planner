# Interactive Trip Planner

**中文** | [English](README.en.md)

## 把你的生活品味带到陌生城市

它不只是生成景点清单，而是根据你想怎样旅行，结合当地语言资料、代表性景点、社区生活和现实营业信息，安排成一条舒服、可信、可以继续修改的路线。

![西班牙行程中的圣安东尼市场、每日路线和 Market Roof 交互地图](docs/assets/readme/spain-market-roof-map.png)

> 请使用 interactive-trip-planner，帮我规划一趟既有第一次到访重点、也能体验当地生活的旅行。

## 它和普通 AI 攻略有什么不同

| 常见攻略 | Interactive Trip Planner |
| --- | --- |
| 根据热门榜单拼景点 | 先理解旅行方式和取舍，再筛地点 |
| 只使用中文或英文搜索 | 根据目的地生成当地语言检索任务 |
| 收藏的攻略仍散落在平台里 | 把收藏夹或单篇笔记整理成可浏览的本地旅行资料库 |
| “local”与著名景点二选一 | 第一次到访时平衡代表性景点与当地生活 |
| POI 只有泛泛推荐语 | 说明到现场做什么、看什么和地点故事 |
| 按热度堆满一天 | 按街区、时间、体力和夜间安全安排动线 |
| 输出静态文字 | 输出可继续加入、移除、排序和保存的交互地图 |

## 你最终会得到什么

- 一份明确旅行主线、取舍和节奏的行程简报。
- 一个经过来源筛选、带选择理由的地点候选池。
- 每天 1–3 个主要锚点，以及同街区的吃喝、休息和替换选项。
- 对节庆、展览、闭馆、预约和易变化事实的复核提醒。
- 一张保留全程总览、每日顺序和编辑状态的交互地图。
- 可一键打开的高德 / Google Maps 地点与路线入口，以及可长期保存的 Google My Maps 文件。
- 一个可用 Finder 或编辑器直接浏览、默认不下载素材的小红书旅行资料库。

地图不是把所有候选都塞进路线。你可以按日期浏览，加入或移除地点，修改优先级和同日顺序，再把变化交给 Codex 复核并重新安排。

## 先把收藏变成可用资料

如果你已经收藏了很多小红书旅行笔记，可以先粘贴收藏夹链接或一组单篇笔记链接。Skill 会优先尝试不带 Cookie 的公开读取，把正文、地点、体验线索和原始链接整理到本地；公开读取失败时，不会悄悄切换到你的登录态。

完整收藏夹往往需要登录态才能列出其中的笔记。只有在你明确同意一段风险说明后，Skill 才能在当次导入中使用登录态，而且只允许枚举笔记链接：不读取 Cookie、不导出账号信息、不点赞、不关注、不评论，也不自动翻页或高速抓取。若你不接受这项风险，可以继续复制单篇笔记分享链接；两条路径最后都会进入同一套资料库。

```text
travel-library/xiaohongshu/
  INDEX.md                         # 所有收藏夹、笔记、导入批次和行程选材入口
  library.json                     # 机器可读总目录
  collections/<board-id>/          # 一个收藏夹的说明和笔记清单
  notes/<note-id>/                 # 一篇笔记的正文、结构化记录与可选素材
  imports/<date>-<import-id>/       # 一次导入的结果、失败项和风险记录
  trips/<trip-slug>/               # 某趟行程实际采用了哪些笔记
```

每篇笔记以 `record.json` 作为事实源，同时生成便于阅读的 `note.md`；根目录 `INDEX.md` 使用相对链接，因此整个文件夹移动后仍能查找。图片、视频封面等素材默认不下载；用户主动开启时，只接受受限格式和大小，保存到对应笔记的 `media/`，记录来源和 SHA-256，并拒绝带签名参数的临时地址。资料库默认写入旅行工作区且建议加入 `.gitignore`，不会打进公开 Skill 发布包。

小红书内容仍属于“发现和体验证据”：它可以帮助提取地点、推荐品类、排队感受和中文游客提醒，但营业时间、票务、交通、节庆和安全仍要回到官方或近期可信来源复核。完整操作和风险边界见[小红书收藏与笔记导入](skill/references/xiaohongshu-import.md)。

## 从品味到陌生城市

Hybrid Taste Model（混合生活品味模型）记录的是可以迁移到新目的地的选择逻辑：你重视什么、避开什么、一天喜欢怎样推进、怎样判断一家店或一个街区值得去，以及偏好的资料和视觉语言。它不会照抄一条固定路线，也不会复制某个人未经整理的购买记录。

你可以直接使用官方模型，让 Skill 根据目的地和旅行方式推荐 1–3 个方向，或选择一主一辅；主模型决定选点和节奏，辅模型只补充一个领域或视觉倾向。当前内置两个官方模型：

- `city-craft-rhythm`：城市手艺、建筑、市场、缓慢街区和留白。
- `food-nightlife-locality`：地方饮食、市场、晚餐与短半径夜生活。

贡献者也可以把满意行程背后的选择理由、反偏好和可迁移原则整理成新的版本化模型，而不是提交一份要被复制的店名清单。

## 当地语言和数据源

地点发现遵循五个阶段：

1. 用官方来源建立票务、营业、节庆、交通和安全等事实骨架。
2. 用目的地当地语言寻找本地媒体、论坛和生活方式讨论，发现仅靠中文或英文容易漏掉的线索。
3. 用本次旅行的 Taste Model 筛选真正符合品味、节奏和路线角色的候选。
4. 对进入路线的候选回到近期、官方和可追溯资料逐项核实。
5. 对仍有冲突或临近变化的内容标明检查日期和再次复核的时间。

当前源码提供 Global Base、中国大陆、日本，以及法国/比利时法语区四套 Regional Source Pack（地区来源包）；它们描述当地的信息生态、检索方法和事实边界。西班牙语和加泰罗尼亚语词库只提供稳定检索词，不等于地区来源包。西班牙目前使用 Global Base 加这两套当地语言词条，尚未拥有独立的 Regional Source Pack。

社媒、论坛和本地编辑来源用于发现与体验语境，不会单独证明营业时间、票务、交通或安全。详细规则见[地区来源包](skill/references/regional-source-packs.md)与[来源复核](skill/references/source-verification.md)。

## 地图不是只看，还能带走

中国大陆行程进入 POI 定位或路线复核时，可以选择使用你自己的高德 CLI。安装 `@amap-lbs/amap-gui` 并在高德控制台创建 Web端（JS API）Key 后，普通用户只需运行一次：

```bash
node skill/scripts/amap-credentials.js setup
```

setup 会把两项凭据成对存入 macOS Keychain、Windows DPAPI 或 Linux Secret Service，并完成真实 POI 与路线验证；验证成功后，后续搜索和路线复核会自动建立并清理 request-scoped provider session，不再要求用户手动运行 `amap-gui start`。Linux 没有可用 Secret Service 时不会明文保存，可安装系统 Keyring 支持，或仅在当次会话使用高级/CI 环境变量覆盖。

```bash
node skill/scripts/amap-credentials.js status
node skill/scripts/amap-credentials.js update
node skill/scripts/amap-credentials.js remove
```

`status` 不显示 Key 值或片段；`update` 只有在新凭据同时通过真实 POI 与路线验证后才替换旧配置；`remove` 只删除本 Skill 的本机配置。`AMAP_KEY` 与 `AMAP_SECURITY_KEY` 仍是高级/CI 的完整成对覆盖入口，不与系统存储混用，也不会写入旅行文件、导出、日志、Git 或发布包。`amap-gui status/start/stop` 只保留给故障排查。不配置也可以继续规划，只是路线会明确显示：**未完成高德路网复核；请在出发前打开高德确认。**

路线状态不会因为“搜索到了地点”或“生成了链接”而升级。全部正式相邻段得到有效结果时显示“已用高德复核”，只有部分完成时显示“部分移动段已复核”；你在地图里加入、移出、换日或调整顺序后，受影响日期会重新回到未复核，等待 Codex 重排和复查。

海外行程继续使用普通 Web 搜索、当地语言资料和官方页面。**Google Maps URLs 不需要 API Key**，地点和路线会在点击后交给 Google Maps 打开并重新计算；当前源码不调用 Google Places API 或 Google Routes API，也不要求 Google Cloud Billing。

需要长期保存时，可以逐个下载或用 CLI 生成：

```text
places.csv
itinerary.kml
README.md
```

地图页面优先提供“导出全部地点并打开 My Maps”；选择某天后还会启用“导出当天地点并打开 My Maps”。一次点击下载一个 KML 并尝试打开 My Maps，用户仍需在 My Maps 中手动导入。上面的三个文件保留为高级导出和 CLI 兼容能力。KML 只使用可靠 WGS84 坐标；只有高德 GCJ-02 坐标的地点保留在 CSV 中，按名称和地址人工定位。导出**不会自动写入普通 Google Maps 收藏夹**，也不会自动写入高德收藏夹。海外地点详情的主操作是“导航去这里”，Google URL 只携带 destination，不包含起点或强制交通方式。完整输入、状态、链接限制、文件安全与降级规则见[地图服务执行与交付](skill/references/map-provider-delivery.md)。

## 如何开始

告诉 Skill 目的地、日期、同行人、预算、体力和你真正关心的体验；不知道选哪种路线也没关系，它会先提出少量会改变选点与节奏的方向。

```text
请使用 $interactive-trip-planner，帮我规划 7 天西班牙旅行。我第一次去，喜欢市场、建筑、甜品和鸡尾酒，但不想每天排满。
```

也可以从自己的资料开始：

```text
请使用 $interactive-trip-planner，先整理这个小红书收藏夹；不要默认下载图片，并把适合云南秋季旅行的线索存进本地资料库。
```

确认方向后，它会建立事实底座和候选池，安排每日路线，生成可编辑地图，并在你修改后重新核实受影响的营业、预约、交通和容量。

## 当前源码能做什么、还不能保证什么

当前源码是 developer preview，可在有人监督的情况下用于真实旅行规划、当地语言研究、每日路线设计和交互地图生成。它包括小红书收藏夹/单篇链接导入、登录态风险门禁、可浏览的本地资料库、可选素材保存和导入校验，以及高德真实查询、双地图 handoff 与 Google My Maps 导出。

它还不能保证每个国家都有专属地区来源包，也不保证搜索结果天然正确或所有路线都经过真实路网复核。节庆、营业、价格、交通、预约、天气和安全信息仍需在出发前按提醒复核；社媒和论坛不能作为这些事实的唯一证据。

当前版本也不等于 Public V1：仍需 8 个海外 Regional Source Pack、每个 Taste Model 至少 3 个 unseen cities 的评估，以及更强的 representative evidence；[详细验收边界见线上逻辑文档](skill/references/taste-and-source-online-logic.md)。公开样例、截图和发布包不得包含真实订单、航班、住宿、姓名、账号、凭据或私人行程；OpenStreetMap 底图与 Wikimedia Commons 图片需要浏览器联网加载。

## 贡献你的品味与地区知识

非开发者可以从一份满意行程开始：说明为什么选择、哪些不适合、怎样控制节奏，以及哪些判断能迁移到别的城市。开发者可以把这些内容提交为受版本控制、可验证的文件：

- Taste Model：遵循[混合生活品味模型规则](skill/references/hybrid-taste-models.md)和现有 [`taste-models`](skill/assets/taste-models/) 结构。
- 地区知识与当地语言：遵循[地区来源包规则](skill/references/regional-source-packs.md)，在 [`source-packs`](skill/assets/source-packs/) 中补充具名来源、检索入口、事实边界、fallback 与词库。
- 视觉主题与目的地 preset：遵循[主题库](skill/references/theme-library.md)、[设计语言](skill/references/design-language.md)和现有 [`themes`](skill/assets/themes/) 结构。
- 代表性行程与样例：遵循[样例约定](skill/assets/samples/README.md)，明确授权、代表理由和隐私复核。

自由文本和社区线索不会直接成为可信事实；贡献必须保留 owner、license、版本、可追溯来源和仓库验证。新增功能或修复可通过 GitHub issue / pull request 提交。

## 安装

**Codex / GitHub 完整版**

1. Clone 或下载此仓库。
2. 将 [`skill/`](skill/) 复制到 Codex skills 目录，并命名为 `interactive-trip-planner`（默认路径为 `~/.codex/skills/interactive-trip-planner/`）。
3. 重新打开 Codex task，然后用 `$interactive-trip-planner` 调用。

**小红书 REDSkill**

从 [`releases/`](releases/) 选择最新版本目录，使用其中 `interactive-trip-planner/` 的完整内容，并按同目录的 `INSTALL.zh-CN.md` 操作。这个发布面排除了 Codex metadata 和私人资料库，只保留平台支持的文件格式；不要把根目录源码与旧版本发布包混合上传。

## 开发与验证

开发需要 Node.js 18 或更高版本。`skill/` 是源码；`releases/` 是构建产物，请勿直接修改。

```bash
npm run build:redskill
npm test
```

`npm test` 会验证 Core 路线与状态、地图模板、Taste Model、Regional Source Pack、发现脚本、小红书导入与资料库、主题合同、Skill contract，以及 REDSkill 的格式和隐私边界。

供 Agent 使用的 JSON CLI 位于 `skill/scripts/`：

```bash
node skill/scripts/recommend-taste-models.js --context <context.json>
node skill/scripts/build-source-query-matrix.js --context <context.json>
node skill/scripts/probe-source-access.js --context <sources.json>
node skill/scripts/check-amap-cli.js
node skill/scripts/amap-cli.js --context <amap-request.json>
node skill/scripts/export-google-my-maps.js --guide <guide-directory> --output <new-directory>
node skill/scripts/fetch-xhs-public.js --context <xiaohongshu-link.json>
node skill/scripts/import-xhs-library.js --workspace <travel-workspace> --context <normalized-import.json>
node skill/scripts/validate-xhs-library.js --library <library-directory>
node skill/scripts/summarize-xhs-import.js --library <library-directory> --import <import-id>
```

导入类命令与 `amap-cli.js` 一次只接受 `--context <file>` 或 `--stdin`，并用固定结构输出，不回显 Cookie、token、地图凭据或抓取页面正文。Query matrix 只生成检索任务，不访问网络；source probe 只报告有界的访问状态，不能证明地点存在、营业、可订、适合路线或安全。My Maps CLI 默认拒绝覆盖，`--replace` 也只替换三个已知文件。详细输入输出见[生活品味与地区来源线上逻辑](skill/references/taste-and-source-online-logic.md)、[地图服务执行与交付](skill/references/map-provider-delivery.md)与[小红书导入说明](skill/references/xiaohongshu-import.md)。

## 仓库结构

```text
interactive-trip-planner/
  skill/                         # Codex Skill 源码、模板、参考与验证脚本
  scripts/                       # 仓库级 REDSkill 构建与验证入口
  docs/                          # 产品设计与发布文档
  releases/redskill-<version>/   # 生成的 REDSkill 发布包
```

旅行规划的六阶段工作流和地图交互合同位于 [`skill/references/`](skill/references/)；可复用模板、Taste Model、Source Pack、主题和公开样例位于 [`skill/assets/`](skill/assets/)。
