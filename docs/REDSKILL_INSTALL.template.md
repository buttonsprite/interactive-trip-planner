# Interactive Trip Planner {{VERSION}} 安装说明

这是 `interactive-trip-planner` 的 REDSkill {{VERSION}} 专用发布包。它可以帮助用户把小红书收藏与单篇笔记整理为本地旅行资料，确认旅行方向、寻找适合自己的地点、复核资料、安排每日路线，并生成可以继续修改和重新安排的动态旅行地图。

## 安装

1. 解压发布包。
2. 将其中的 `interactive-trip-planner` 文件夹复制到：

   ```text
   ~/.codex/skills/interactive-trip-planner
   ```

3. 重新打开对应的 Skills 环境或新建任务，让技能列表刷新。

不要只复制 `SKILL.md`。模板、验证脚本和参考文件都是完整功能的一部分。

通过 REDSkill 上传时，选择 `interactive-trip-planner` 文件夹中的完整内容，不要上传外层 `.DS_Store`。本包只包含 REDSkill 当前允许的 Markdown、HTML、CSS、JavaScript 和 JSON 文件；Codex 专属的 `agents/openai.yaml` 已省略。

两套 `maps/itinerary-map.html` 都已经内联 Leaflet CSS/JS；轻量模板还内联了本地 Core CSS/JS。复制单个 HTML 即可保留地图界面和交互，不再依赖 `maps/vendor/leaflet/`。OpenStreetMap 底图与 Wikimedia Commons 图片仍需要浏览器联网加载。

`{{VERSION}}` 使用严格的地图路线边界：城市中心、航班节点和地点坐标不会被直接连成看似可执行的路线；只有带真实路径几何、交通方式、可信来源、复核日期和人工复核说明的数据才会显示道路路线。

`{{VERSION}}` 也不会把私人资料库打进发布包。安装后才会在用户选择的旅行工作区创建 `travel-library/xiaohongshu/`；`INDEX.md` 是供人浏览的总入口，`library.json` 和每篇笔记的 `record.json` 是结构化事实源。素材默认不下载，启用时也会受文件格式、大小、路径和来源边界限制。

## 开始使用

可以在 Codex 中直接说：

```text
请使用 $interactive-trip-planner 帮我规划一趟旅行。
```

如果已经有小红书资料，也可以说：

```text
请使用 $interactive-trip-planner 整理这个小红书收藏夹，不要默认下载素材，并把适合这次旅行的线索保存到本地资料库。
```

Skill 会先尝试不带 Cookie 的公开读取。完整收藏夹若必须使用登录态，只有在用户明确确认风险说明后，才允许当次使用登录态枚举笔记链接；不会读取 Cookie、导出账号信息或执行点赞、关注、评论。拒绝这项风险时，改为粘贴单篇分享链接即可。

建议同时提供已经确定的信息，例如日期、出发地、目的地、同行人、体力、交通偏好、预算范围、已订酒店，以及必去或明确不想去的地点。信息不足时，skill 会先询问真正影响路线的关键问题。

## 可选地图增强与导出

高德增强只在规划中国大陆地点和路线时出现，不是安装后的全局启动门。按[高德官方 CLI 参考手册](https://developer.amap.com/api/cli/map-cli/reference)安装 `amap-gui` 并创建 Web端（JS API）Key 后，普通用户运行一次 `node scripts/amap-credentials.js setup`。它会把完整凭据对写入 macOS Keychain、Windows DPAPI 或 Linux Secret Service，并执行真实 POI + 路线验证；成功后查询会自动启动、检查并停止 request-scoped provider session。可用 `node scripts/amap-credentials.js status` 检查安全状态，用 `node scripts/amap-credentials.js update` 原子替换，用 `node scripts/amap-credentials.js remove` 删除本 Skill 的本机配置。

Linux 没有 Secret Service 时不会明文保存，也不会默认创建 `.env`；请启用系统 Keyring，或只为当前会话使用高级/CI 的完整 `AMAP_KEY` + `AMAP_SECURITY_KEY` 覆盖。环境变量只配置一项时会拒绝混用系统存储。不要把 Key 粘贴到聊天或命令参数。`amap-gui status/start/stop` 仅用于故障排查；普通使用不需要手动维护容器。不配置仍可继续规划，真实请求失败时保持未复核。

路线状态只使用三档：已用高德复核 / Verified with AMap；部分移动段已复核 / Partially verified；未完成高德路网复核；请在出发前打开高德确认。 / AMap road-network verification was not completed. Recheck in AMap before departure.

Google Maps URLs 不需要 API Key / Google Maps URLs do not require an API key。本包不调用 Google Places API / does not call Google Places API，也不调用 Google Routes API / does not call Google Routes API；路线在用户打开 Google Maps 后重新计算。

地图可逐个下载 `places.csv`、`itinerary.kml`、`README.md`，用于手动导入 Google My Maps。导出不会自动写入普通 Google Maps 收藏夹 / not automatically added to regular Google Maps saved lists，也不会自动写入高德收藏夹。仅有高德 GCJ-02 坐标的地点不会冒充 WGS84 写入 KML，会保留在 CSV 中供人工定位。

## 运行条件

- 支持 Skills 的运行环境。
- 搜索节庆、营业时间、交通和预约等最新事实时需要网络访问。
- 生成和校验完整动态地图时建议具备 Node.js 和现代浏览器。
- 包内不包含 API key、个人行程或用户浏览器中保存的修改状态。
- 包内不包含用户导入的小红书笔记、收藏夹、素材或登录信息。

安装后可在 skill 目录运行：

```bash
node scripts/check-amap-cli.js
node scripts/amap-cli.js --help
node scripts/export-google-my-maps.js --guide <guide-directory> --output <new-directory>
node scripts/test-redskill-package.js
node scripts/test-redskill-release.js .
node scripts/test-core-map-route.js
node scripts/test-skill-contract.js
```

## 更新

更新前先备份自己修改过的 skill。然后用新版 `interactive-trip-planner` 文件夹替换旧目录，并重新打开 Codex。

## 发布提醒

本发布包没有替你选择开源许可证。上传 GitHub 并允许他人复制、修改或再发布前，应根据自己的开放范围补充合适的 `LICENSE`。公开展示生成的旅行攻略时，也应再次检查其中是否包含真实姓名、订单、航班号、酒店订单或其他个人信息。
