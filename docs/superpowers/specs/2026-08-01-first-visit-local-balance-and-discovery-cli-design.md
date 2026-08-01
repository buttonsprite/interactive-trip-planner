# First-Visit Balance and Discovery Runtime Design

**Date:** 2026-08-01  
**Status:** Approved direction, pending implementation  
**Target:** `interactive-trip-planner` 0.1.0 feature branch

## Goal

修正首次使用验收暴露出的两个偏差：

1. `local` 不能被理解成系统性排除目的地代表性景点。第一次到访一座重要城市时，正式路线需要同时提供游客理解城市所需的主锚点，以及同街区的市场、居民公共空间、社区餐饮和日常生活。
2. Global Base 的当地语言查询和 Hybrid Taste Model 推荐需要成为 agent 可直接调用、失败可理解的运行能力，不能依赖阅读源码后手写 Node import，也不能把未替换的当地语言占位符静默送进搜索。

本次旅行的验收场景采用 Barcelona 4 晚 + Madrid 3 晚。它是行为测试场景，不加入官方代表样本，也不把这两个城市固化为默认西班牙路线。

## Product Decision: Tourist Anchors and Local Life Are Complementary

### Visitor context

阶段一新增独立的游客语境判断：`first-visit`、`return-visit`、`landmark-light`、`local-only` 或 `balanced-visitor`。不能因为“第一次使用 Skill”推断“第一次去这个城市”。用户未说明到访史、但仍以游客身份规划时，默认使用 `balanced-visitor`；只有用户明确说去过、不要经典景点或选择纯社区玩法时才降低代表性主锚点。

对于停留至少两个完整日的 `first-visit` 或 `balanced-visitor` 城市：

- 搜索阶段至少评估 3 个目的地代表性景点，记录采用或舍弃理由。
- 正式路线通常纳入 2–4 个代表性主锚点；重型景点每天最多 1 个，彼此紧邻且属于同一体验时可以组合。
- 每个游客主锚点必须与同方向的一个当地生活角色连接，例如市场、居民广场、街区咖啡、社区饭馆、公共空间、旧商业或夜间生活。
- 市场和社区地点不能仅作为景点之间的填充；著名景点也不能仅因“游客多”被自动降级。
- 用户明确要求避开经典景点、已经去过、预约失败或动线代价过高时，可以不采用，但必须说明原因。

这是一条规划规则，不进入地图 Core，不改变每天 1–3 个主锚点和少折返约束。

### Barcelona–Madrid acceptance scenario

在 2026-10-13 至 2026-10-20、偏好当地生活但第一次去西班牙的输入下，合理输出应能形成：

- Barcelona 4 晚：Sagrada Família / Recinte Modernista de Sant Pau、Park Güell、Ciutat Vella 或 Montjuïc 中的 2–4 个主锚点，分别与 Gràcia、Sant Antoni、Poble-sec、Poblenou 等同方向生活街区组合。
- Madrid 3 晚：Prado / Retiro 等首次到访主锚点，与 Madrid Otra Mirada、El Rastro、La Latina 或 Chamberí 的同期活动和社区生活组合。
- 全程只进行一次城市基地切换；不为了覆盖 Valencia 增加第三次入住。

验收不锁定具体餐厅，也不把尚未发布的活动场次写成确定事实。

## Local-Language Query Resolution

### Context contract

`buildQueryMatrix` 接收 `countryCode`、可选的 `localLanguageTags` 与可选的 `localLanguageTerms`。runtime 先按 `countryCode` 加载内置轻量 lexicon，再按 `localLanguageTags` 选择语言，最后用调用方提供的 terms 覆盖同名词。Spain 默认提供 `es`；Barcelona 场景显式请求 `ca` 作为第二个当地语言变体：

```json
[
  {
    "languageTag": "es",
    "terms": {
      "festival": "festival",
      "events-calendar": "agenda cultural",
      "municipal-market": "mercado municipal",
      "neighborhood-life": "vida de barrio"
    }
  },
  {
    "languageTag": "ca",
    "terms": {
      "festival": "festival",
      "events-calendar": "agenda cultural",
      "municipal-market": "mercat municipal",
      "neighborhood-life": "vida de barri"
    }
  }
]
```

Global Base 的当地语言模板改用稳定 token，而不是自然语言占位文本。runtime 为每个当地语言生成 query variant：

```json
{
  "queries": {
    "zh": "...",
    "en": "...",
    "local": [
      {"languageTag": "es", "query": "..."},
      {"languageTag": "ca", "query": "..."}
    ]
  }
}
```

西班牙语和加泰罗尼亚语提供内置轻量 lexicon，服务 Barcelona 验收场景；lexicon 只提供查询词，不冒充 Spain Regional Source Pack，也不包含未核实来源。

每个 lexicon 由 validator 检查：语言 tag 唯一；模板实际引用的 token 全部存在；不允许未使用的自由文本字段、URL 或可执行内容。Global Base 新增查询 token 时，缺少对应词的 lexicon 必须在测试中失败。

### Failure behavior

- 目的地没有匹配地区包、且未提供可解析的当地语言词时，runtime 返回 `status: needs-local-language-terms`、缺失 token 列表和中文/英文查询；不得输出带占位符的伪当地语言查询。
- 提供部分词表时，逐意图报告缺失 token；完整的 query variant 可继续使用，缺失 variant 不进入默认搜索。
- 已有地区包的固定当地语言查询继续可直接使用，不要求调用方重复传词表。
- 所有输出不得包含密钥、cookie、authorization header 或页面正文。

## Agent-facing CLI

新增两个薄 CLI，复用现有 pure runtime，不复制推荐或 query 逻辑：

### `recommend-taste-models.js`

```bash
node scripts/recommend-taste-models.js --context context.json
node scripts/recommend-taste-models.js --stdin
```

- 输入结构化目的地、玩法、节奏、同行人与兴趣。
- 输出 1–3 个推荐、强化项、舍弃项和合法枚举提示。
- 未识别标签不会静默得到 0 分；输出 `unknownTerms`，完全无法匹配时返回可理解的 fallback。
- 支持 `--help`，错误输入使用非零退出码；stdout 只输出 JSON，诊断写 stderr。

### `build-source-query-matrix.js`

```bash
node scripts/build-source-query-matrix.js --context context.json
node scripts/build-source-query-matrix.js --stdin
```

- 输出实际选择的 source pack、十类意图、中英及已完成替换的当地语言 query variants。
- 当当地语言词缺失时输出结构化 `needs-local-language-terms`，不得静默搜索占位符。
- CLI 不访问网络；它只负责可复现地生成搜索任务单。

## Safe Source Access Probe

新增独立 `probe-source-access.js`，输入 URL 列表或结构化来源文件：

- 默认并发不超过 4，每个 URL 设短 timeout，先尝试 `HEAD`，不支持时降级为带字节上限的 `GET`。
- 不登录、不绕验证码、不执行浏览器自动化、不保存响应正文。
- 只接受 `http` 与 `https`；拒绝 URL 内嵌用户名或密码。输出 URL 必须移除 query 与 fragment，避免回显签名、token 或追踪参数。
- 分类为 `reachable`、`redirected`、`rate-limited`、`access-blocked`、`server-error`、`not-found` 或 `network-error`。
- 根据来源记录中的 fallback 输出 `fallback-required`，但不自动把 fallback 当作已访问成功。
- stdout 仅输出 URL、状态、HTTP code、检查时间和 fallback；不回显 request headers、cookie、token 或 response body。

网络探测不进入默认单元测试。测试使用本地 HTTP server 覆盖 200、302、404、403、429、500、timeout 和 HEAD 不支持后的有限 GET。

## Files and Boundaries

预计修改：

- `skill/SKILL.md`
- `skill/references/planning-workflow.md`
- `skill/references/source-verification.md`
- `skill/references/regional-source-packs.md`
- `skill/references/taste-and-source-online-logic.md`
- `skill/assets/source-packs/global-base.json`
- `skill/assets/source-packs/local-language-lexicons/es.json`
- `skill/assets/source-packs/local-language-lexicons/ca.json`
- `skill/scripts/source-pack-runtime.js`
- `skill/scripts/taste-model-runtime.js`
- 新增的三个 CLI 与对应测试
- `package.json`、REDSkill contract 和 release-copy tests

不修改：

- Europe direct-copy map Core、状态和交互。
- 两个 official taste model 的 owner、代表样本和授权。
- 当前四个 Regional Source Pack 的 required-subset 身份。
- 用户消费记录、私人账号、支付信息或定位数据。
- 自动抓取社交平台、自动登录或规避访问限制。

## Test Strategy

按 RED → GREEN 执行：

1. 首次到访规划合同测试：Skill 文档必须同时要求代表性景点评估、游客主锚点和同方向当地生活组合。
2. Local query tests：ES + Spanish、Barcelona + Spanish/Catalan 均生成无占位符 query；缺词返回结构化状态；JP/FR/CN 既有 pack 不回归。
3. Taste CLI tests：stdin/file/help、未知枚举、合法推荐、一主一辅边界和错误退出码。
4. Query CLI tests：source pack 选择、十类意图、多当地语言 variant、缺词状态和 JSON-only stdout。
5. Probe tests：使用本地 HTTP server 覆盖全部状态与 timeout，断言不输出 header/body/secret。
6. 完整 `npm test`、Skill quick validation、临时 REDSkill build/test。
7. 确认地图 Core diff 为空，工作树不包含生成 release。

## Success Criteria

- 第一次去 Barcelona/Madrid 且偏好 local 时，Skill 不再生成“只有社区、没有代表景点”的路线。
- Global Base 不再把 `[当地语言...]` 占位符送入搜索。
- Agent 不读 runtime 源码即可运行模板推荐和 query matrix。
- Spain 场景可以生成 Spanish 与 Catalan query variants，但不会被错误标记为已有 Spain Regional Source Pack。
- 来源访问失败得到明确分类和 fallback 提示，不被误判为停业或成功。
- 现有 taste model、source pack、地图和 REDSkill release 合同全部通过。

## Non-goals

- 本轮不新增完整 Spain/Iberia Regional Source Pack。
- 本轮不制作或发布 Barcelona–Madrid 地图。
- 本轮不承诺 2026 年尚未发布的餐厅时段、活动场次或车次。
- 本轮不训练新的模型权重，也不自动读取用户历史消费数据。
