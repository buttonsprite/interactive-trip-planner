# 地图服务执行与交付线上逻辑

本文记录当前源码已实现的地图服务能力、外部导航交接与 Google My Maps 导出边界。

## 何时启用

- **中国大陆**：进入地点定位或正式路线复核时，才可选使用用户自己的高德 CLI（`amap-gui`）。它是可选增强，不是全局启动门；未配置时规划继续。
- **海外**：使用普通 Web 搜索、当地语言资料与官方页面发现和核实地点；地图交付使用免 Key 的 Google Maps URL 与 Google My Maps 文件。
- **边界**：生成地图链接只负责 handoff，不代表路线已经完成真实路网复核。

## 高德能力与安全执行（可选增强）

安装与申请 Key 以[高德官方 CLI 参考手册](https://developer.amap.com/api/cli/map-cli/reference)为准（控制台选择 Web 端 JS API）。安装 `@amap-lbs/amap-gui` 后，在当次终端会话中成对设置 `AMAP_KEY` 与 `AMAP_SECURITY_KEY` 环境变量并运行 `amap-gui start` 启动服务即可。

- 不要把密钥粘贴到聊天、命令参数、攻略目录、导出文件或 Git。
- 只读能力探测：`node scripts/check-amap-cli.js`（返回 `available`、`missing-cli`、`missing-credentials` 或 `partial-environment-credentials`）。
- 真实查询唯一入口：`node scripts/amap-cli.js --context <request.json>` 或 `--stdin`（二选一），直接复用已启动的 `amap-gui` 服务，不在单次查询中反复启停容器。
- 支持两种 action：
  - `search-poi`：`keyword`（必填）、`city`、`center`（GCJ-02）、`radiusMeters`、`pageSize`、`pageIndex`。
  - `route`：`origin`、`destination`（均含 `name` 与 GCJ-02 `position`）、`mode`（`driving` / `walking` / `riding` / `transit`，公交需 `city`，`waypoints` 仅限驾车且最多 16 个）。
- 执行层使用参数数组、`shell: false`、有界超时，并对输出中的凭据值做 `[REDACTED]` 脱敏。结果严格按 allowlist 规范化，并与请求起终点/途经点绑定；冲突或失败时返回 `provider-error`，保留原候选并明确标注“未完成高德路网复核”。

## 路线复核状态

相邻移动段需满足：`fromPoiId` / `toPoiId` 与当前顺序匹配、`routeStatus: "verified"`、存在 `routeProvider`、正数 `distanceMeters` 与 `routeReviewedAt`。

- 全部正式相邻段有效：`已用高德复核`（英文：`Verified with AMap`）
- 部分正式相邻段有效：`部分移动段已复核`（英文：`Partially verified`）
- 无有效路网结果或当天已被用户修改：`未完成高德路网复核；请在出发前打开高德确认。`

## 高德 URI 与 Google Maps URL

所有地图界面按钮和提示遵循地图语言 `trip.language`（默认中文，英文行程输出英文），不拼接双语斜杠。

- **高德 URI**（仅目的地 `countryCode === "CN"` 启用）：
  - 地点入口优先使用 `resolved` 高德 `poiId`，否则使用合法 GCJ-02 坐标。
  - 当天地点总览把全部安全 marker 按当前顺序连续拆分为多张，每张最多 10 个（`overviews`），不截断也不丢弃尾部地点。
  - 路线入口与地点总览独立构建：`driving` 单条最多起点 + 1 via + 终点，`walking` / `riding` / `transit` 按相邻段拆分；缺少明确交通方式时保留为手动查找项。
- **Google Maps URLs（免 API Key）**：
  - 海外地点详情主操作为“导航去这里”（`destination`-only，不固定起点和交通方式）；URL 超 2048 字符时降级为 search。
  - 当日路线单条最多 5 个地点（3 个途经点），相邻段共享边界点且总长不超过 2048 字符；未显式填写交通方式时省略 `travelmode`，由 Google Maps 打开后自由选择，不再把整天地点全部打入手动查找。
  - 当前源码不调用 Google Places API 或 Google Routes API，也不自动写入 Google Maps 收藏夹或高德收藏夹。

## Google My Maps 导出

浏览器地图导出面板读取当前编辑状态（`assignments`、`orders`、`priorities`、`dirtyDays`）：

- **主操作**：`导出全部地点并打开 My Maps`；选中某天后启用 `导出当天地点并打开 My Maps`。每次下载一个仅含 Point 的 KML，并尝试打开 `https://www.google.com/mymaps` 供用户手动导入。
- **高级导出与 CLI**：提供 `places.csv`（16 列）、`itinerary.kml`、`README.md`。命令行入口：
  ```bash
  node scripts/export-google-my-maps.js --guide <guide-directory> --output <new-directory> [--state <state.json>] [--locale zh-CN|en] [--replace]
  ```
- **坐标与隐私边界**：KML 仅写入有效 WGS84 坐标，绝不把 GCJ-02 冒充 WGS84 写入；导出前扫描字段防止密钥、Cookie 或私人路径泄露。
