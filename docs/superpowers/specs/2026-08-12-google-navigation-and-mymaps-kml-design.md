# Google 地点导航与 My Maps KML 收藏设计

**日期：** 2026-08-12  
**状态：** 待用户书面审核  
**目标版本：** `interactive-trip-planner` 0.3.0  
**需求级别：** L2  
**范围：** 单地点地图交接、当天路线链接、全部/当天 KML、Google My Maps 半自动导入、双语文案、隐私与发布验收

## 一、需求文档变更记录

| 变更时间 | 修改人/来源 | 变更内容 |
| --- | --- | --- |
| 2026-08-12 | 用户确认 + Codex | 创建设计规格；确认按地点所属地区选择地图服务，海外地点提供 Google Maps 导航，My Maps 提供全部地点与当天地点两种 KML，并将正式安排与顺路候选分层 |

## 二、背景

### 2.1 当前问题

当前地图已经具备以下能力：

- 单个地点可以在 Google Maps 或高德地图打开。
- 当天正式路线可以生成 Google Maps / 高德地图 handoff 链接。
- Google My Maps 导出会分别下载 `places.csv`、`itinerary.kml` 与 `README.md`。

但交付体验仍有三处割裂：

- 单地点主入口写成“在地图打开”，没有直接回答旅行者临场最常见的“从我现在的位置怎么去”。
- 当天导航链接与 My Maps 导出分散在不同界面，用户不容易理解一个用于现场导航、另一个用于长期收藏。
- My Maps 弹窗把三个技术文件并列展示，用户需要自己判断文件作用；也无法只收藏当前选中的一天。

### 2.2 已确认的外部边界

以下为 2026-08-12 复核的 Google 官方产品边界：

- Google Maps URLs 可以免 API Key 跨平台打开地点、路线与导航预览；单条 URL 最长 2,048 字符，移动浏览器最多支持 3 个中间停靠点。参考：[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)。
- Google My Maps 支持人工导入 KML、KMZ、CSV、TSV、GPX、XLSX 与 Google Sheet。参考：[Import map features from a file](https://support.google.com/mymaps/answer/3024836?co=GENIE.Platform%3DDesktop&hl=en)。
- Google 当前没有面向本场景的公开 My Maps 写入 API，也没有可携带本地文件直接完成 Import 的官方深链。Drive API 只能把文件上传到用户 Drive，不能替用户创建或更新 My Maps 图层。

因此，本需求可以把现场导航做到一键打开，但把地图永久收藏到 My Maps 仍只能做到“生成文件、开始下载、打开 My Maps”的半自动流程。不得把它描述为自动同步或一键写入用户账号。

### 2.3 核心场景

- 旅行途中：从地点详情直接打开适合目的地的地图服务，并以用户当前位置为起点重新规划。
- 当天出发前：按当天正式顺序打开 Google Maps / 高德路线；地点较多时使用连续短段。
- 旅行准备期：把全部地点或当前一天保存为一个 KML，再导入 Google My Maps 长期浏览和分享。
- 地图调整后：导出结果反映当前保存的日期归类、顺序、优先级与候选状态，而不是初始模板。

## 三、目标和收益预估

### 3.1 产品目标

- 把地点详情的首要地图操作从“查看地点”升级为“导航去这里”。
- 把 Google Maps 现场导航与 Google My Maps 收藏明确拆成两个心智模型。
- 把 My Maps 的主要流程从三个技术文件简化成两个用户任务：收藏全部、收藏当天。
- 保持路线事实、坐标体系、隐私和账号授权边界真实，不用“自动同步”制造错误预期。

### 3.2 可观察的完成标准

- 海外地点详情一键打开 Google Maps 的 destination-only directions；中国大陆地点使用高德主入口。
- 每个非空正式行程日都有可理解的地图交接结果，超出 provider 限制时连续分段且不丢地点。
- 用户可从地图导出“全部地点 KML”和“当前一天 KML”；当前一天未选择时不会导出错误范围。
- 当天 KML 清楚分开正式安排与当天候选；全部 KML 中每个地点只出现一次。
- KML 下载后尝试打开 Google My Maps；被浏览器拦截时仍有明确的手动打开入口。
- 修改日期、顺序或优先级后，导出内容与当前状态一致。

### 3.3 非目标

- 不调用 Google Places API、Routes API 或付费 Google Maps Platform API。
- 不建设 Google OAuth、Google Drive 自动上传或自有云端中转。
- 不自动写入 Google Maps Saved Lists，也不自动创建或修改用户 My Maps。
- 不根据用户 IP、浏览器语言或当前物理位置判断地图服务。
- 不把 KML 当作正式路网几何；首版 KML 只保存地点、分组与说明。

## 四、产品思路

### 4.1 方案比较

#### （1）Maps URL 导航 + KML 半自动收藏（采用）

- 地点与当天路线使用免 Key URL 打开地图服务。
- 收藏时生成一个 KML，同时打开 Google My Maps，用户只完成最终 Import。
- 优点：无需账号授权、跨平台、隐私面小、与静态 HTML 能力匹配。
- 限制：My Maps 最后一步仍需人工操作。

#### （2）Google Drive OAuth 上传 KML（暂不采用）

- 可以把 KML 自动放入 Drive，但 My Maps 仍需用户选择 Import。
- 增加 OAuth consent、token 存储、权限解释与撤销机制，收益只减少一次选文件操作。
- 对当前静态 Skill 来说成本与风险明显高于收益。

#### （3）自动操作已登录的 My Maps 页面（不采用）

- 依赖登录态、页面 DOM 与浏览器权限，容易失效，并增加账号风控与误操作风险。
- 不作为公开 Skill 的正式能力。

### 4.2 核心判断

- 地图服务按**地点所属地区**选择，不按用户当前 IP 判断。用户在国内规划西班牙行程时，西班牙地点仍默认 Google Maps。
- “导航去这里”只是 destination handoff：地图服务打开后根据用户当前位置和偏好重新计算，不能继承或提升攻略的路线复核状态。
- My Maps 的 KML 用于收藏与分层浏览，不用于证明路线可走、移动时间正确或地点正在营业。

## 五、详细方案

### 5.1 地区与地图服务规则

- 目的地 `countryCode` / destination region 明确为中国大陆时，单地点主入口使用高德地图。
- 其他国家和地区默认使用 Google Maps。
- 不使用 IP、GPS、浏览器语言或系统时区推断目的地。
- 数据缺少地区时，沿用攻略级目的地配置；攻略级配置也缺失时使用 Google Maps，并明确这是普通地图交接而非 provider 验证。
- 中国大陆的 Google Maps 次级入口可以保留在“更多地图”中，但不能比高德主入口更突出；海外地点不展示无意义的高德主入口。

### 5.2 单地点“导航去这里”

#### （1）海外地点

- 地点详情主按钮：`导航去这里`。
- 打开 destination-only Google Maps directions，不预填 origin；Google Maps 使用当前设备位置或让用户选择起点。
- 不预设 `travelmode`。地点详情脱离某一条相邻路段，强行继承驾车、步行或公交会产生错误默认；由用户在 Google Maps 中选择。
- 有可靠 WGS84 坐标时优先使用坐标；否则使用地点名称 + 地址搜索。
- 无法形成 directions 时降级为 `在 Google Maps 搜索`，不能显示“导航”。

#### （2）中国大陆地点

- 已有可靠高德定位时主按钮为 `在高德地图打开`；由高德使用当前位置并让用户选择出行方式。
- 首版不把高德 marker handoff 改名为“已开始导航”，避免在没有明确 mode 时让高德默认成驾车。
- 没有可靠高德定位时降级为复制地点名称和地址，并显示“需要在高德手动搜索”。

#### （3）共同边界

- 链接存在不等于地点已经由 Google/高德验证，也不改变 POI 或路线状态。
- 所有外部链接在新标签页或对应 App 打开；原旅行地图状态保留。
- 按钮必须满足键盘可达、移动端至少 44×44 px，链接文本必须说明目标地图服务。

### 5.3 当天路线 handoff

- 当天路线只包含当前状态下正式安排到该日的地点，保持保存后的顺序。
- 顺路候选不进入路线 directions，避免被误认为必须停靠。
- Google Maps 每条路线最多 5 个地点（起点、终点、最多 3 个中间点），且完整编码 URL 不超过 2,048 字符；更长路线按顺序拆段，前一段终点与后一段起点重叠。
- 单一相邻地点对本身无法安全编码时不截断 URL，改为手动查找项。
- 不同交通方式不能混进同一条 directions；按连续相同 mode 分段。
- 路线链接文案为 `在 Google Maps 打开今日路线` 或 `Google Maps 路线 1/2`；中国大陆按现有高德限制生成对应短段。
- 打开链接后由地图服务重新计算，因此路线链接本身不显示为“已用 Google Maps 复核”。只有结构化 route evidence 满足既有合同才能显示 verified。

### 5.4 My Maps 导出入口

现有“导出到 Google My Maps”弹窗调整为任务导向结构。

#### （1）主要操作

- `导出全部地点并打开 My Maps`
  - 生成 `all-places.kml`。
  - 从总览和任意一天均可使用。
- `导出 MM-DD 当天地点并打开 My Maps`
  - 生成日期化文件名，例如 `2026-10-13-barcelona.kml`。
  - 只在用户已经选中某一天时可用；总览状态显示 `先选择一天` 并置灰。
- `打开 Google My Maps`
  - 独立兜底入口，打开 `https://mymaps.google.com/`。
  - 当浏览器阻止自动打开新标签页时保持可见。

一次用户点击先完整构建并通过隐私检查，再在该用户手势内开始 KML 下载并尝试打开 My Maps。任一步失败都不能把未生成的文件描述为成功；popup 被拦截不影响已下载 KML，并提示用户点击独立入口。

#### （2）高级导出

默认折叠“高级导出”：

- `places.csv`：保留完整表格字段，便于 My Maps 自定义样式、筛选与人工定位。
- `README.md`：保留坐标和导入边界说明。

高级文件继续按单文件下载，避免浏览器批量下载拦截。原 `itinerary.kml` 入口由新的全部/当天 KML 替代，不在主要界面保留三个同权按钮。

### 5.5 当天 KML 结构

当天 KML 使用两个顶层文件夹：

1. `当天安排`
   - 当前状态下正式分配到该日的地点。
   - 按当前保存顺序排列。
   - 包含酒店/交通锚点时保留其角色，不自动从 KML 删除。
2. `当天候选`
   - 来自该日顺路候选池、且当前没有正式分配到任何一天的地点。
   - 已经正式安排到其他日期的地点不再作为当天候选导出，避免同一地点同时看起来属于两个正式日程。

文件说明必须标明：候选不是必去，KML 不包含路线几何，实际导航应回到旅行地图打开当天路线。

### 5.6 全部地点 KML 结构与去重

全部 KML 中每个 POI 最多出现一次，按以下优先级归类：

1. 已正式分配到某一天：进入 `正式行程 / <日期 · 标题>`，按当天顺序排列。
2. 尚未正式分配、但属于一个或多个日期的候选：进入 `顺路候选 / <最早候选日期>`；描述中列出它同时适合的其他日期。
3. 尚未安排且不属于任何日期候选：进入 `尚未安排`。

该规则避免同一地点因属于多个候选日而在 My Maps 中产生多个重叠 marker，同时保留多日可替换信息。

### 5.7 数据与坐标边界

- KML 只写入有效 WGS84 `coords: [lat, lng]`，输出顺序为 KML 所需的 `lng,lat,0`。
- 只有高德 GCJ-02 position、坐标缺失或坐标不合法的地点不得写入 KML Point，也不得做自动坐标转换后冒充来源事实。
- 导出前显示“可写入 KML 的地点数 / 需要手动定位的地点数”。手动定位项保留在高级 CSV 中；KML 主操作不得声称包含这些地点。
- 地点名称、地区、角色、优先级、为什么值得去和注意事项可以进入 KML description；不嵌入 HTML/JavaScript。
- KML 不绘制 `LineString`，避免把行程顺序、旧路线或引导线误当作可导航路网。

### 5.8 当前地图状态

所有导出都读取地图当前保存状态：

- 日期归类使用当前 assignments。
- 正式顺序使用当前 orders。
- 优先级使用当前 priorities。
- 日期被修改后仍可导出，但 KML description 标为“路线待重新复核”。
- 撤销或刷新恢复后，导出必须与界面显示一致。
- 导出只做只读投影，不创建第二套地图状态，也不回写用户的行程选择。

### 5.9 状态与异常

| 状态 | 用户看到的结果 |
| --- | --- |
| 当前一天有效且有地点 | 当天 KML 可下载，并显示正式/候选数量 |
| 位于总览 | 当天 KML 置灰，提示先选择一天；全部 KML 可用 |
| 当前一天没有可写入 KML 的 WGS84 地点 | 不生成空 KML；说明有多少地点需要手动定位，并保留 CSV 入口 |
| 隐私扫描命中 | 整体阻止生成，不创建 Blob、不下载、不打开 My Maps；只显示安全的地点/日期序号与字段名 |
| 自动打开 My Maps 被拦截 | KML 下载继续；显示“文件已下载，请点击打开 My Maps” |
| KML 生成失败 | 不下载、不打开 My Maps，显示固定安全错误 |
| 外部地图链接缺少可靠目的地 | 降级为搜索或复制地点信息，不生成失真的 directions |

### 5.10 页面文案与多语言

中文核心文案：

- `导航去这里`
- `在 Google Maps 搜索`
- `在高德地图打开`
- `在 Google Maps 打开今日路线`
- `导出全部地点并打开 My Maps`
- `导出 {date} 当天地点并打开 My Maps`
- `先选择一天`
- `高级导出`
- `打开 Google My Maps`
- `文件已下载；浏览器没有自动打开 My Maps，请点击上方入口。`
- `KML 仅用于收藏地点，不代表路线已经复核。`

英文核心文案：

- `Navigate here`
- `Search in Google Maps`
- `Open in AMap`
- `Open today's route in Google Maps`
- `Export all places and open My Maps`
- `Export {date} and open My Maps`
- `Select a day first`
- `Advanced export`
- `Open Google My Maps`
- `The file was downloaded, but the browser did not open My Maps. Use the link above.`
- `KML is for saving places; it does not mean the route was verified.`

### 5.11 隐私与安全

- 延续共享 My Maps builder 的全量输出字段扫描，必须在创建任何文件或 Blob 前完成。
- 禁止把高德 Key、Google `AIza` key、Cookie、Authorization、token、用户绝对路径、小红书分享参数或现有私密样本写入 KML/CSV/README。
- 外部地图 URL 不携带用户当前位置、Google 账号、浏览器 Cookie 或旅行者身份；当前位置由打开后的地图服务自行处理。
- `target="_blank"` 链接使用 `noopener noreferrer`。
- My Maps 导出不登录账号、不上传文件、不写入 Saved Lists；页面必须明确该边界。

### 5.12 影响范围

- 共享 Delivery runtime：地点 directions、My Maps scope 与 KML 分组。
- 轻量模板与 Europe public template：地点详情入口、当天路线、导出弹窗和响应式样式。
- 完整公开母版构建：继续从 canonical Delivery runtime 内联，不能维护第二套逻辑。
- CLI 导出：保留现有三文件兼容入口；新增 scope 时必须显式选择全部或某一天，不能靠隐含当前页面状态。
- Skill 与对外文档：说明现场导航、半自动导入和账号边界。
- REDSkill：两个单文件地图包含同一行为，发布包不包含用户生成的 KML。

### 5.13 验收标准

#### （1）功能合同

- 海外 POI 有 WGS84 坐标时生成 destination-only Google directions，URL 有 `api=1`、无 origin、无强制 travelmode、长度不超过 2,048。
- 海外 POI 缺少可用目的地时降级搜索；中国大陆地点按地区规则使用高德主入口。
- 当天路线不包含候选，长路线连续分段、不丢点、不混 mode。
- 全部 KML 每个 POI 最多一次；正式安排、顺路候选、尚未安排分层正确。
- 当天 KML 只有当天正式安排与仍未正式分配的当天候选；顺序与当前地图一致。
- 不合法/WGS84 缺失地点不写 KML Point，计入 manual count。

#### （2）交互验收

- 总览、当天和地点详情三个界面均能到达对应导航/收藏入口。
- 桌面与 390×844 移动端按钮可点击、无横向溢出，dialog 支持 Escape、焦点进入和关闭后焦点返回。
- 下载成功、popup blocked、隐私阻止、空日和无坐标状态均显示正确文案。
- 调整日期、顺序、优先级后立即导出，文件内容与当前界面一致；刷新恢复后仍一致。

#### （3）发布验收

- editable Skill 全量合同通过。
- 两个源模板完成桌面/移动浏览器验收，console 无相关 error/warn。
- REDSkill 构建后两个 standalone HTML 行为一致，不依赖新的本地脚本文件。
- release 隐私扫描通过，生成 release 精确恢复，不把构建产物混入功能提交。

## 六、数据方案

本版本不引入联网 analytics 或用户行为上传。验收只记录本地自动测试和浏览器 QA 证据，不收集用户地点、Google 账号或导出内容。

## 七、文案与多语言

- 地图主语言继续跟随攻略语言；本需求所有新增界面文案提供中文与英文。
- Provider 名称保留官方英文品牌：`Google Maps`、`Google My Maps`、`AMap`。
- “导航”“路线已复核”“收藏”必须保持不同语义，任何语言都不能用一个词替代三种状态。
- 其他语言目的地可以继续使用中文或英文 UI；本需求不新增完整第三语言界面。
