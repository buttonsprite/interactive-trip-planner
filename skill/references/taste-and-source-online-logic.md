# 生活品味与地区来源线上逻辑

## 产品验收边界

当前源码是 **developer-preview contract slice**，不等于 **PRD V1 public acceptance**。它在早期 taste/source 能力上增加用户主动提供的小红书收藏资料输入、地图服务交接和可移植导出，但 Public V1 仍需 8 个海外 Regional Source Pack、每个 taste model 至少 3 个 unseen cities 的评估，以及更强的 representative evidence；三项未全部满足前，任何运行或发布说明都不得宣称 public V1 ready。

## 当前已实现

### 情境化启动介绍

- 首次完整规划时，先回应用户已经提供的目的地、日期、偏好、同行人或资料，再根据当前情境列出 2–4 项相关能力，并只追问 1–3 组真正会改变路线骨架、仍然缺失的信息；不要先重复通用 onboarding。
- 用户粘贴小红书收藏夹、单篇长链、分享短链或多条单篇链接时，直接进入 `xiaohongshu-import.md` 的导入流程，不要求用户重新描述链接中的资料。
- 用户已经在本地攻略、地图或路线中提出局部编辑时，不重复启动介绍，直接确认受影响日期、地点或路线并处理修改。
- 登录态补齐的账号风控或封禁风险 gate 保持延后：只有匿名读取不完整且用户选择登录态补齐时才展示并请求本次明确确认。

- 用户提供小红书收藏夹、单篇长链、分享短链或多条单篇链接时，Skill 会先读取 `xiaohongshu-import.md`。收藏夹先匿名读取首批与声明总数；匿名不完整时提供登录态补齐链接、只导入匿名部分、改贴单篇链接三个选择。
- 登录态补齐必须展示账号风控或封禁风险并获得本次明确确认。宿主浏览器只读取收藏夹已渲染的链接清单，每批最多 50 篇；不会读取或保存 Cookie，也不在登录标签页逐篇打开、互动、下载或绕过验证码。
- `fetch-xhs-public.js` 只执行匿名公开请求，限制域名、3 次重定向、30 秒超时与 5 MiB 页面；不发送 Cookie/Authorization，输出前移除分享参数、fragment 和 signed token。登录页、风控页、异常内容类型、超限和页面结构变化返回固定失败状态，不伪造成功。
- `import-xhs-library.js` 将规范化笔记写入工作区 `travel-library/xiaohongshu/`。`record.json` 是唯一机器记录；`INDEX.md`、收藏夹页、`note.md`、导入摘要和旅行选集是自动生成的相对链接视图，可随整库迁移。
- 素材默认不下载。显式 staging 只接受经过文件签名验证的 JPEG、PNG、WebP 和 UTF-8 文本，限制 15 MiB/文件、200 MiB/导入，并拒绝路径穿越、symlink 和 Skill/release 内资料库。
- `validate-xhs-library.js` 检查 schema、引用、规范化 URL、敏感字段、素材 manifest 和 symlink；`summarize-xhs-import.js` 输出不含正文的导入摘要。真实用户资料不进入 Git、REDSkill、公开地图或测试 fixture。
- 小红书笔记只能产生 `discovery`、`recommendation`、`experience` 线索；营业、票务、交通、安全和当期活动仍需官方复核。

### 继承的 0.1.0 能力

- 阶段一可根据目的地、玩法、节奏、同行人与兴趣推荐最多 3 个生活品味模板；用户可单选、不选或选择一主一辅。
- Agent 可运行 `node skill/scripts/recommend-taste-models.js --context <context.json>` 或把同一 JSON 传给 `--stdin`。至少一个已知词命中时，结果包含推荐、inputVocabulary 与 unknownTerms；没有 known match 或没有有效偏好时返回 `mode: needs-clarification`、空 recommendations 和 explanation，不会按 registry 顺序推荐第一项。
- `node skill/scripts/build-source-query-matrix.js --context <context.json>` 要求有效 `countryCode`、`destination` 与 `yearMonth`。缺失时返回 `status: needs-context`、`missingContextFields` 与空 intents，错误类型或 country code 格式则抛错；`tasteTerms` 可选且默认为空。`localLanguageTags` 只接受合法字符串 tag；`localLanguageTerms` 及每个 tag 的词表必须是 plain object，token 和 value 必须合法，value 必须是不含占位符的非空字符串。拒绝输入时只输出固定 schema 错误，不回显 fragment 或 secret。所有输出 query 在 token 替换后再统一压缩 whitespace，`ready` 与 `needs-local-language-terms` 不会输出 `{...}` 或中文伪占位符。
- 阶段一记录 visitor mode：`first-visit`、`return-visit`、`landmark-light`、`local-only` 或 `balanced-visitor`；第一次使用 Skill、第一次咨询或第一次规划不等于到访史，未知时记录“到访史未知”并只暂定 `balanced-visitor`。每座两天以上城市会至少评估 3 个代表性景点并写明采用或舍弃理由；该城市停留段内的保留主锚点与同方向当地生活角色（市场、居民广场、社区空间、街区咖啡、社区饭馆、传统商业或短半径夜间体验）连接，除非有记录的 mode、预约或绕路例外。
- 一主一辅时，主模板拥有选点与节奏；辅模板只能补一个领域或视觉倾向。
- 0.1.0 必须保留“城市手艺与缓慢街区”和“地方风味与夜间半径”两个官方模板，但 registry 可追加 `curator-owned` community 模板；贡献者使用独立 owner、license 与 semantic version，不需要修改 Core validator。
- 城市手艺模板关联 Tokyo golden sample；地方风味模板关联 Barcelona golden sample。Barcelona 的 2 个 market、1 个 food、2 个 bar 与 local-food/market/nightlife 行程角色只构成最低代表证据，不声明完整 food-first 覆盖。
- 每个模板使用 JSON + Markdown，并关联完整 docs + data 代表行程；样本标为 owner 确认的代表性规划或已完成回顾，写明代表理由、授权和脱敏，不冒充亲历。两个 `official-playstyle` 可以继续引用项目共享 golden sample。
- `curator-owned` 的每个代表行程都必须位于自己的 model directory 内，推荐 `examples/<trip-id>/`，不得引用共享 golden、其他 model 或目录外样本。example 会随 model directory 一起递归执行 JSON/Markdown 扩展名、隐私、symlink 和可执行文件扫描；非法 owner、授权/隐私声明、受禁评分字段或外部样本引用都会被 validator 拒绝。
- 模板只提供轻量视觉偏好，不含地图 HTML。Europe direct-copy interaction v1 和既有地图状态合同未改变。
- 阶段二按 Global Base 与目的地地区选择来源包。Global、中国大陆、日本、法语区（法国与比利时）是 0.1.0 required subset；registry 可追加满足同一 JSON 合同的新地区包，首发包仍有固定回归。
- 每个来源包提供 10 类中文、英文和当地语言查询意图；来源记录包含 A/B/C 可访问性合同、检索方法、依赖、agentAccess、fallback、事实边界、复核日期与限制。
- Global Base 的当地语言模板以 `{local:<token>}` 解析为 `{ languageTag, query }` 变体。Lexicon 用 `countryCodes` 限定可用国家，用 `defaultCountryCodes` 定义每国唯一默认语言：Spain 默认 `es`，显式 `ca` 追加在其后；Brazil 显式 `es` 不复用 Spain 内置词。调用方仍可通过 `localLanguageTerms` 提供自己的任意 language tag 词条。词条不完整的变体不会输出，并在 `missingLocalTerms` 中报告；地区包自己的无 token 模板继续使用其首个当地语言 tag。
- `probe-source-access.js` 从 `--context <file>` 或 `--stdin` 读取 `{ sources, timeoutMs?, concurrency? }`，先校验全部 `http`/`https` URL（拒绝内嵌用户名/密码），保留原 URL 仅供内部请求、单独安全化输出 URL（移除 query/fragment），再以最多 4 并发执行 HEAD/manual redirect；仅 405/501 以 `Range: bytes=0-1023` 的 GET 降级并取消、不读取 body。输出为 `{ checkedAt, results }`；401/407 与其他非 404/429 的 4xx 是 `access-blocked`，只有 5xx 是 `server-error`。顶层 URL `fallback` 保持兼容并仅输出安全 URL；正式 `source.access.fallback` 字符串数组只输出 status、availability 和 optionCount，不回显原文。两种 fallback 都不自动访问；主访问 `reachable` 标为 `available`，其他状态标为 `fallback-required`。不会输出 headers、body、cookie、authorization 或 credentials。
- Probe 的状态只表示当时的有限网络访问结果：`reachable`、`redirected`、`rate-limited`、`access-blocked`、`server-error`、`not-found` 或 `network-error`。它不能证明 POI 或商家存在、营业、可订、符合行程或安全，且不能取代各来源的事实复核。
- 中国大陆进入地点定位或路线复核时，用户先运行 `amap-gui start` 启动本地服务，再运行 `check-amap-cli.js` 探测可选增强；两个凭据变量必须是 trim 后非空字符串。探测会读取继承环境中的值来检查是否非空，但不输出密钥、不执行路线，**不会确认高德服务容器正在运行**。缺变量、空字符串、全空白、CLI 缺失时均返回结构化降级；探测为 `available` 后的真实请求仍可能返回 `provider-error` 并保持未复核。
- 地点说明使用“为什么符合这个模板”和“为什么安排在这里”；只在真实异常时显示“需要临近复核”，不增加常驻来源 badge。

### 地图服务交接与导出

- 中国大陆只有在 POI 定位或路线复核阶段才提示 `amap-gui start` 并探测 `amap-gui`、`AMAP_KEY` 与 `AMAP_SECURITY_KEY`。能力 `available` 后，`amap-cli.js` 才真实执行城市关键词、锚点周边、同名消歧或路线请求；探测成功、搜索成功、URI 存在都不能冒充路线已复核。执行进程会读取继承环境中的密钥值用于传递和脱敏，但不回显、持久化或写入旅行文件、导出、日志、Git 或发布包。
- 高德请求结果先归一化为 allowlist 事实。CLI 不输出凭据、provider stderr、raw polyline、照片、header 或任意原始字段；失败返回可继续规划的固定降级。完整边界见 `map-provider-delivery.md`。
- 路线状态只使用三档：已用高德复核 / Verified with AMap；部分移动段已复核 / Partially verified；未完成高德路网复核；请在出发前打开高德确认。 / AMap road-network verification was not completed. Recheck in AMap before departure. 用户改变日期归类或同日顺序后，受影响日期无条件回到未复核，直到新的相邻关系再次完成真实路网查询。
- 地图生成高德 URI 和 Google Maps URL。Google Maps URLs 不需要 API Key / Google Maps URLs do not require an API key；不调用 Google Places API / does not call Google Places API，也不调用 Google Routes API / does not call Google Routes API。链接只负责打开地点或路线，Google Maps 会在打开后重新计算。
- Google My Maps 导出包含 `places.csv`、`itinerary.kml` 与 `README.md`。仅有 GCJ-02 的地点不会作为 WGS84 写入 KML，而是在 CSV 与导出说明中保留为人工定位项。导出不会自动写入普通 Google Maps 收藏夹 / not automatically added to regular Google Maps saved lists，也不会自动写入高德收藏夹。

## 保持不变

- 六阶段 Core、Europe direct-copy interaction v1、地图日期/详情/修改/撤销/排序/重新安排和刷新恢复合同。
- 安全、法律、当前事实、预约、用户硬约束和真实路网始终高于模板。
- REDSkill 继续排除 Codex metadata，并只发布支持的文本与代码文件。

## 后续而非当前能力

- 更多经过资料维护的海外地区包、城市差异包，以及社区审核与发布流程。
- 在样本以外城市进行跨地区 blind evaluation。
- 社区在线目录、订阅、远程训练或自动学习。

这些内容不能在当前运行或发布说明中写成已完成。
