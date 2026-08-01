# Interactive Trip Planner

一套面向对话式旅行规划的 Codex Skill：从目标与约束澄清、生活品味模板、地区来源检索、事实复核和每日路线设计，到可继续修改和重新安排的动态地图。

## 0.1.0 范围边界

0.1.0 是尚未发布的 **developer-preview contract slice**：它用来验证首次到访平衡、Hybrid Taste Model、Global Base 当地语言 query 与安全 source probe 这组运行合同，不等于 **PRD V1 public acceptance**。Public V1 仍需要 8 个海外 Regional Source Pack、每个 taste model 至少 3 个 unseen cities 的评估，以及更强的 representative evidence；在这些条件满足前，不得宣称 public V1 ready。

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

## Discovery CLI

Skill 内置三个面向 Agent 的 JSON CLI，均从 `skill/` 目录调用：

```bash
node scripts/recommend-taste-models.js --context <file>
node scripts/build-source-query-matrix.js --context <file>
node scripts/probe-source-access.js --context <file>
```

三者都只接受两种 JSON input 模式之一：`--context <file>` 读取一个 JSON 文件，或 `--stdin` 从标准输入读取 JSON；不能同时使用。stdout 只输出 JSON，错误诊断写入 stderr。

- `recommend-taste-models.js` 根据本次旅行上下文推荐 Hybrid Taste Model；未知偏好词会在结构化输出中标出。没有任何已知匹配时返回 `mode: "needs-clarification"` 与空 recommendations，不按 registry 顺序兜底。
- `build-source-query-matrix.js` 生成搜索任务单，不访问网络。`countryCode` / `destination` / `yearMonth` 缺失时返回 `needs-context` 与空 intents；类型或 country code 格式错误时拒绝输入。Spain 默认使用 `es`，显式请求 `ca` 时排在 `es` 之后。内置 lexicon 只在其 `countryCodes` 内适用；其他国家可用自己的 `localLanguageTerms`。缺词返回 `needs-local-language-terms`，所有可输出 query 都不含占位符。Spain 仍没有 Regional Source Pack。
- `probe-source-access.js` 只做有界的来源访问探测：结果不能证明地点存在、营业、可订、适合路线或安全，也不能替代事实复核。它只接受 `http` / `https` URL，并从输出中移除 query / fragment；兼容顶层 URL `fallback`，也识别正式 pack 的 `access.fallback` 字符串数组，但后者只输出选项数和 availability，不回显文本也不自动探测。

对于首次或到访史未知的普通游客语境，正式路线应把代表性景点与同方向当地生活结合：代表性景点帮助理解城市，市场、居民空间、街区咖啡、社区餐馆或短半径夜生活让路线回到当地日常；不应因为用户偏好 local 就系统性排除前者。

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
