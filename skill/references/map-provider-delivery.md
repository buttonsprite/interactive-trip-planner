# 地图服务执行与交付线上逻辑

本文只记录当前源码已经实现的地图服务能力。它不是地图 API 的安装手册，也不承诺实时路况、营业、票务或账号同步。

## 何时启用

- 中国大陆：进入 POI 定位或正式路线复核时，才介绍用户自己的高德 CLI。它是可选增强，不是全局启动门；不可用时规划继续。
- 海外：继续用普通 Web 搜索、当地语言资料与官方页面发现和核实地点；地图交付使用免 Key 的 Google Maps URL 与 Google My Maps 文件。
- 地图链接只负责 handoff。生成链接不等于 provider 已经解析地点，也不等于路线已经完成路网复核。

## 高德能力与安全执行

安装和申请 Key 以[高德官方 CLI 参考手册](https://developer.amap.com/api/cli/map-cli/reference)为准。本 Skill 不维护未经验证的安装命令。完成安装和本地环境配置后，先启动服务：

```bash
amap-gui start
```

需要人工排查时可以运行 `amap-gui status`；这是可选诊断，不是 Skill 的自动 readiness probe。

先运行：

```bash
node scripts/check-amap-cli.js
```

探测只确认 `amap-gui` 命令存在，并读取 `AMAP_KEY`、`AMAP_SECURITY_KEY`，检查它们是 trim 后非空的本地环境变量。它不会执行查询，不输出变量值，**不会确认高德服务容器正在运行**，也不能证明任何地点或路线。结果是 `available`、`missing-credentials` 或 `unavailable`；后两种进入降级。即使是 `available`，真实执行仍可能因服务未启动或 provider 故障返回 `provider-error`，此时继续规划、保留原候选或顺序，并保持未复核。

真实查询通过以下唯一入口执行：

```bash
node scripts/amap-cli.js --context <request.json>
node scripts/amap-cli.js --stdin
```

两种输入方式必须二选一。CLI 只接受一个 JSON object：

```json
{
  "action": "search-poi",
  "keyword": "菜市场",
  "city": "大理",
  "center": { "lng": 100.1602, "lat": 25.7001 },
  "radiusMeters": 1500,
  "pageSize": 10,
  "pageIndex": 1
}
```

`city`、`center` 与分页字段可选。城市关键词搜索省略 `center` / `radiusMeters`；锚点周边搜索增加 GCJ-02 center 与正整数半径；同名消歧使用带区域、商场或分店信息的精确 keyword 重新查询。

```json
{
  "action": "route",
  "origin": {
    "name": "大理古城南门",
    "position": { "lng": 100.165, "lat": 25.689 }
  },
  "destination": {
    "name": "北门市场",
    "position": { "lng": 100.1602, "lat": 25.7001 }
  },
  "mode": "walking"
}
```

route mode 只接受 `driving`、`walking`、`riding`、`transit`。公交必须给 `city`；`waypoints` 只允许 driving，最多 16 个，每个途经点也必须有 name 与 GCJ-02 position。

执行层用参数数组启动 `amap-gui`，`shell: false`，超时 35 秒，并继承本地环境。进程会读取继承环境中的值，用于能力检查、传给本地 provider 和精确脱敏；凭据值在生成参数前、序列化后和返回结果中都会被替换为 `[REDACTED]`。它不会回显、持久化或把凭据写入旅行文件、导出、日志、Git 或发布包。无效输入写固定 stderr 并以 2 退出；能力不可用、缺凭据或 provider 失败以结构化 fallback 返回，不泄露 provider stderr、进程错误或凭据。

## Provider 事实边界

搜索成功只允许返回：查询条件、分页、`poiId`、名称、类型、地址、电话、与锚点距离、行政区、GCJ-02 position 和 `reviewedAt`。路线成功只允许返回：起终点、途经点、方式、距离、预计时间、费用、步骤与 `reviewedAt`。照片、header、raw polyline、任意 provider 字段和原始错误不会进入结果。

- `status: "ok"` 且 `performed: true`：本次调用产生了可用的 allowlist provider 事实。
- `missing-credentials` / `unavailable`：没有执行 provider 请求。
- `provider-error`：请求没有形成可用事实；保留原候选或顺序并进入公开地图人工复核。

搜索结果解决召回、具体分店、地址和平台定位；不证明营业、预约、菜单、活动、体验质量或安全。路线结果是查询时的规划事实，不是出发当天的实时承诺。

## 地点与路线状态

只有 `mapProviderRefs.amap.status: "resolved"` 且具有高德 `poiId` 或合法 GCJ-02 position 的地点，才生成直接高德地点入口。`ambiguous`、`unresolved` 和缺少安全定位的地点进入手动查找项，不能静默替换为同名分店。

相邻移动段只有同时满足以下条件才算 verified：当前相邻 `fromPoiId` / `toPoiId` 完全匹配，`routeStatus: "verified"`，存在 `routeProvider`、正数 `distanceMeters` 与 `routeReviewedAt`。当天声明和当前段证据取更保守状态：

- 全部正式相邻段有效：已用高德复核 / Verified with AMap。
- 只有部分正式相邻段有效：部分移动段已复核 / Partially verified。
- 没有有效路网结果，或当天已被用户修改：未完成高德路网复核；请在出发前打开高德确认。 / AMap road-network verification was not completed. Recheck in AMap before departure.

用户加入、移出、换日或调整同日顺序后，受影响日期立即变为 unverified。链接会按当前顺序重新生成，但旧移动段不会匹配新的相邻关系；只有重新安排并再次执行适用的真实 route 查询后才能恢复 verified / partial。

## 高德 URI 与 Google Maps URL

高德 URI：

- 地点入口使用 resolved 高德 `poiId`，否则使用合法 GCJ-02 position。
- 当天地点总览只包含当前顺序中前 10 个具有安全高德定位的 marker，**不会自动拆分**成多张总览；第 11 个起不进入 overview，仍可使用单点入口、适用的路线分段或手动查找。
- 路线入口与地点总览独立构建，可以按交通方式与 provider 限制拆成多个 route chunks；路线分段不受 overview 的 10-marker 截断影响，但仍要求合法定位和明确交通方式。
- driving 路线单条最多为起点、一个 via、终点；walking、riding、transit 按相邻起终点拆分。
- 缺少交通方式时不默认驾车，也不生成假的路线入口；相关地点保留为手动查找项。

Google Maps URLs 不需要 API Key / Google Maps URLs do not require an API key：

- 地点入口优先使用有效 WGS84 坐标；没有坐标时使用可搜索的名称和地址。
- 单条 directions 最多 3 个中间停靠点；更长路线拆成最多 5 个地点的短段，前一段终点与后一段起点重叠。
- mixed mode 按连续相同交通方式拆分；未知 mode 不猜测。
- Google Maps 在用户打开链接后重新计算路线，因此链接存在不表示“已由 Google 验证”。

当前源码不调用 Google Places API / does not call Google Places API，也不调用 Google Routes API / does not call Google Routes API。它不会自动写入高德收藏夹，也不会自动同步普通 Google Maps Saved Lists。

## Google My Maps 文件

浏览器地图的导出窗口从现有 Core 当前状态读取 `assignments`、`orders`、`priorities` 和 `dirtyDays`，每次点击只下载一个文件并立即撤销临时 Blob URL：

```text
places.csv
itinerary.kml
README.md
```

- `places.csv` 包含固定 16 列：名称、当地名称、城市、区域、地址、纬度、经度、日期、当天顺序、路线角色、分类、优先级、计划状态、为什么值得去、注意事项和地图入口。正式路线、候选和未安排地点明确区分。
- `itinerary.kml` 按旅行日建立 Folder，并增加候选 Folder；只写 Point，不在缺少真实道路几何时输出 LineString。
- `README.md` 说明手动导入、路线重算、坐标边界和需要人工定位的地点数量。

KML 与 Google My Maps 只接受 POI `coords: [lat, lng]` 中的有效 WGS84。只有高德 GCJ-02 position 或缺少可靠坐标的地点仍保留在 CSV 中，用名称和地址人工定位；GCJ-02 绝不冒充 WGS84 写入 KML。

导出不会自动写入普通 Google Maps 收藏夹 / not automatically added to regular Google Maps saved lists。Google My Maps 与普通 Google Maps Saved Lists 是不同产品面；导入需要用户手动完成，也不会自动导入高德收藏夹。

## 命令行导出与文件安全

不打开浏览器时可以运行：

```bash
node scripts/export-google-my-maps.js \
  --guide <guide-directory> \
  --output <new-directory> \
  [--state <state.json>] \
  [--locale zh-CN|en] \
  [--replace]
```

`--guide` 必须包含 `data/pois.json` 与 `data/itinerary.json`；itinerary 支持 canonical day array，或带 `days`、可选 `defaultAssignments` 的 public object。`--state` 是可选的已规范化当前状态。默认语言是 `zh-CN`。

输出目录不能等于文件系统根、用户主目录、仓库根、Skill 根或攻略根；symlink 别名也会按 canonical path 拒绝。默认不覆盖任何已存在的三个目标文件。`--replace` 只替换 `README.md`、`places.csv`、`itinerary.kml`，保留其他文件；生成使用同父目录 staging 与 rollback，提交失败时恢复旧的三个文件。

成功 stdout 只有 status、文件名和地点/KML/manual-location 计数，不输出绝对路径或旅行正文。失败 stderr 固定为 `Google My Maps export failed.`，不回显路径、JSON、凭据或内部错误。

## 隐私、发布与降级

- `AMAP_KEY` 与 `AMAP_SECURITY_KEY` 的值只保存在用户本地环境中；执行进程会读取继承环境中的值用于检查、传递和脱敏，但不会回显、持久化或写入旅行文件、导出、截图、日志、Git、REDSkill 或 release。文档可以出现环境变量名称，不能出现值。
- Google Maps URL 和 My Maps 导出不需要 Google API key，也不会登录用户账号。
- 导出只包含当前攻略允许进入 POI 数据的字段；小红书原文、Cookie、订单号、同行人身份和私人浏览器状态不自动进入公开样例或发布包。
- REDSkill 构建会包含 JavaScript CLI、共享 delivery runtime 与本文档，但不包含凭据、私人资料库或用户当前浏览器状态；两个地图模板内联 delivery runtime，单 HTML 仍需联网加载底图和远程图片。
- 任何 provider 能力、位置、路线或导出失败都不能阻断旅行研究和候选保留；降级结果必须告诉旅行者哪些事实未完成、仍可使用什么，以及出发前在哪里人工确认。
