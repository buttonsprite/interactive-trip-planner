# Interactive Trip Planner 0.1.0 安装说明

这是 `interactive-trip-planner` 的 REDSkill 0.1.0 专用发布包。它可以帮助用户确认旅行方向、寻找适合自己的地点、复核资料、安排每日路线，并生成可以继续修改和重新安排的动态旅行地图。

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

`0.1.0` 使用严格的地图路线边界：城市中心、航班节点和地点坐标不会被直接连成看似可执行的路线；只有带真实路径几何、交通方式、可信来源、复核日期和人工复核说明的数据才会显示道路路线。

## 开始使用

可以在 Codex 中直接说：

```text
请使用 $interactive-trip-planner 帮我规划一趟旅行。
```

建议同时提供已经确定的信息，例如日期、出发地、目的地、同行人、体力、交通偏好、预算范围、已订酒店，以及必去或明确不想去的地点。信息不足时，skill 会先询问真正影响路线的关键问题。

## 运行条件

- 支持 Skills 的运行环境。
- 搜索节庆、营业时间、交通和预约等最新事实时需要网络访问。
- 生成和校验完整动态地图时建议具备 Node.js 和现代浏览器。
- 包内不包含 API key、个人行程或用户浏览器中保存的修改状态。

安装后可在 skill 目录运行：

```bash
node scripts/test-redskill-package.js
node scripts/test-redskill-release.js .
node scripts/test-core-map-route.js
node scripts/test-skill-contract.js
```

## 更新

更新前先备份自己修改过的 skill。然后用新版 `interactive-trip-planner` 文件夹替换旧目录，并重新打开 Codex。

## 发布提醒

本发布包没有替你选择开源许可证。上传 GitHub 并允许他人复制、修改或再发布前，应根据自己的开放范围补充合适的 `LICENSE`。公开展示生成的旅行攻略时，也应再次检查其中是否包含真实姓名、订单、航班号、酒店订单或其他个人信息。
