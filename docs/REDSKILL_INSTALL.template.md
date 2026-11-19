# Interactive Trip Planner {{VERSION}} 安装说明

这是 `interactive-trip-planner` 的 REDSkill {{VERSION}} 专用发布包。它可以帮助用户把小红书收藏与单篇笔记整理为本地旅行资料，确认旅行方向、寻找适合自己的地点、复核资料、安排每日路线，并生成可以继续修改和重新安排的动态旅行地图。

## 安装

1. 解压发布包。
2. 将其中的 `interactive-trip-planner` 文件夹复制到当前 Agent 的 Skills 目录：

   ```text
   WorkBuddy: ~/.workbuddy/skills/interactive-trip-planner
   Codex:     ~/.codex/skills/interactive-trip-planner
   ```

3. 重新打开对应的 Skills 环境或新建任务，让技能列表刷新。

不要只复制 `SKILL.md`。模板、验证脚本和参考文件都是完整功能的一部分。

通过 REDSkill 或 SkillHub 上传时，选择 `interactive-trip-planner` 文件夹中的完整内容，不要上传外层 `.DS_Store`。本包只包含 Markdown、HTML、CSS、JavaScript 和 JSON 文件；Codex 专属的 `agents/openai.yaml` 已省略。

两套 `maps/itinerary-map.html` 都已经内联 Leaflet CSS/JS；轻量模板还内联了本地 Core CSS/JS。复制单个 HTML 即可保留地图界面和交互，不再依赖 `maps/vendor/leaflet/`。OpenStreetMap 底图与 Wikimedia Commons 图片仍需要浏览器联网加载。

`{{VERSION}}` 使用严格的地图路线边界：城市中心、航班节点和地点坐标不会被直接连成看似可执行的路线；只有带真实路径几何、交通方式、可信来源、复核日期和人工复核说明的数据才会显示道路路线。

`{{VERSION}}` 也不会把私人资料库打进发布包。安装后才会在用户选择的旅行工作区创建 `travel-library/xiaohongshu/`；`INDEX.md` 是供人浏览的总入口，`library.json` 和每篇笔记的 `record.json` 是结构化事实源。素材默认不下载，启用时也会受文件格式、大小、路径和来源边界限制。

## 开始使用

可以在支持 Skills 的 Agent 客户端中直接说：

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

高德增强只在规划中国大陆地点和路线时出现，不是安装后的全局启动门。按[高德官方 CLI 参考手册](https://developer.amap.com/api/cli/map-cli/reference)安装 `amap-gui` 并创建 Web 端（JS API）Key 后，在当次终端会话中设置 `AMAP_KEY` 和 `AMAP_SECURITY_KEY` 环境变量并运行 `amap-gui start` 即可。不要把 Key 粘贴到聊天、命令参数或提交进 Git。不配置仍可继续规划，真实请求失败时保持未复核。

Google Maps URLs 不需要 API Key，本包不调用 Google Places API 或 Google Routes API；路线在用户打开 Google Maps 后重新计算。

地图主操作是“导出全部地点并打开 My Maps”和“导出当天地点并打开 My Maps”（下载仅含可靠 WGS84 点的 KML，供用户手动导入 My Maps）；`places.csv`、`itinerary.kml`、`README.md` 位于高级导出。导出不会自动写入普通 Google Maps 收藏夹，也不会自动写入高德收藏夹。海外地点详情的“导航去这里”只传 Google destination，不包含起点或强制交通方式。

## 运行条件

- 支持 Skills 的运行环境。
- 搜索节庆、营业时间、交通和预约等最新事实时需要网络访问。
- 生成和校验完整动态地图时建议具备 Node.js 和现代浏览器。
- 包内不包含 API key、测试脚本、个人行程或用户浏览器中保存的修改状态。
- 包内不包含用户导入的小红书笔记、收藏夹、素材或登录信息。

安装后可在 skill 目录运行：

```bash
node scripts/check-amap-cli.js
node scripts/amap-cli.js --help
node scripts/build-trip-map.js --guide <guide-directory>
node scripts/export-google-my-maps.js --guide <guide-directory> --output <new-directory>
```

## 更新

更新前先备份自己修改过的 skill。然后用新版 `interactive-trip-planner` 文件夹替换旧目录，并重新打开当前 Agent 客户端。

## 发布提醒

本发布包没有替你选择开源许可证。上传 GitHub 并允许他人复制、修改或再发布前，应根据自己的开放范围补充合适的 `LICENSE`。公开展示生成的旅行攻略时，也应再次检查其中是否包含真实姓名、订单、航班号、酒店订单或其他个人信息。
