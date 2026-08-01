# Interactive Trip Planner

一套面向对话式旅行规划的 Codex Skill：从目标与约束澄清、生活品味模板、地区来源检索、事实复核和每日路线设计，到可继续修改和重新安排的动态地图。

仓库同时维护两个发布面：

- GitHub / Codex：完整源码位于 `skill/`，包含 `agents/openai.yaml`、模板源码和验证脚本。
- REDSkill：兼容包生成到 `releases/redskill-<version>/`，仅包含平台支持的文件格式，两套地图均为内联依赖的单 HTML。

## 目录

```text
interactive-trip-planner/
  skill/                         # 唯一源码事实层
  scripts/                       # 仓库级构建与验证入口
  docs/                          # 发布说明模板
  releases/redskill-<version>/   # 自动生成的 REDSkill 发布包
```

不要直接修改 `releases/`。所有功能更新先改 `skill/`，验证后重新生成发布包。

## 本地使用

把 `skill/` 复制到 Codex skills 目录并命名为 `interactive-trip-planner`，重新打开任务后即可使用：

```text
请使用 $interactive-trip-planner 帮我规划一趟旅行。
```

## 开发与验证

需要 Node.js 18 或更高版本。

```bash
npm run build:redskill
npm test
```

`npm test` 会验证 Core 路线与状态规则、两套地图模板、Hybrid Taste Model、Regional Source Pack、skill contract，以及 REDSkill 的格式和隐私边界。

## 发布

当前版本由根目录 `package.json` 管理。修改版本后运行：

```bash
npm run build:redskill
npm test
```

然后：

- GitHub 发布 `skill/` 源码与版本化 `releases/`。
- REDSkill 上传 `releases/redskill-<version>/interactive-trip-planner/` 的完整内容。

公开发布前必须确认示例中不含真实订单、航班、住宿、身份信息或私人行程。OpenStreetMap 底图与 Wikimedia Commons 图片仍需要浏览器联网加载。
