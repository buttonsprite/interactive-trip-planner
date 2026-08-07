# 地图线上逻辑

本文记录 Core 模板当前代码的实际行为。

地图服务执行、URI/URL 限制、坐标边界和 CLI 导出的共享事实见 `../../../../references/map-provider-delivery.md`；本文只记录轻量模板如何消费这些能力。

## 数据和启动

- `maps/itinerary-map.html` 内嵌 `TRIP_DATA`，因此直接打开文件或通过本地服务打开都能读取旅行数据。
- `data/pois.json` 和 `data/itinerary.json` 保存同一份结构化内容，供 Agent 规划和验证。
- 脚本加载顺序是本地 Leaflet、`trip-map-state.js`、`trip-map-delivery.js`、`trip-map-core.js`，最后挂载页面。Delivery 只消费现有 Core 状态，不另建行程状态。
- 真实底图来自 OpenStreetMap 瓦片；瓦片需要网络，地点、路线和列表不依赖远端脚本。

## 三级浏览

1. 全程总览显示旅行摘要、每日路线和地点速查。
2. 点击日期卡片进入某一天，左侧日期栏可以连续切换或返回全程。
3. 地图标记、当天列表、候选和速查地点都会打开同一个地点详情区。

进入当天后，其他日期地点仍保留在地图上并降低强调；尚未安排地点使用空心标记。住宿显示“宿”，不占游玩编号。

## 筛选

地点速查支持搜索、城市/区域、类别、优先级和行程归类。筛选同时作用于列表与地图标记。清空筛选不会清除行程修改。

## 路线和交通

- 只绘制 `routeGeometry` 中已有的路径。
- `transitSegments` 存在时显示已提供的相邻交通说明。
- 缺少相邻交通时，用两点球面距离乘 1.25 生成“规划估算”，并要求出发前复核。
- 用户修改某天后，原路线降低透明度并改成虚线；新增地点不会自动连接到路线。旧相邻交通和规划估算同时失效，统一显示“顺序或安排已调整，交通待复核”。

## 地图交接与路线状态

- 地点详情通过 `buildPlaceLinks` 生成地图入口；`countryCode: "CN"` 时优先高德，其他地区优先 Google Maps。高德只有 `mapProviderRefs.amap.status: "resolved"` 时才生成直接入口；两种 provider 都没有安全链接时显示“复制地点名称和地址”的手动搜索降级。
- 每日摘要下通过 `buildDayHandoffs` 显示路线复核状态、可直接打开的路线分段和需要手动查找的地点。拆分后的每一段保留 runtime 返回的序号和 provider，不会因为部分地点缺少 provider 定位而隐藏 `manualItems`。
- 当天顺序或归类被用户修改后，界面无条件显示“路线待重新复核”，即使原路线曾标记为已复核；外部路线链接只使用当前 `orders` 生成，打开后仍由对应地图重新计算。
- 地点和路线链接都是浏览器 handoff，不调用付费 API、不携带 API key，也不会把静态地图中的修改写回高德或 Google 账号。
- 中国大陆行程向旅行者解释 provider 状态时使用固定三档：已用高德复核 / Verified with AMap；部分移动段已复核 / Partially verified；未完成高德路网复核；请在出发前打开高德确认。 / AMap road-network verification was not completed. Recheck in AMap before departure. 模板中的短标签“路线已复核 / 路线部分复核 / 路线待复核”只是同一状态的紧凑显示，不会单独证明 provider。
- Google Maps URLs 不需要 API Key / Google Maps URLs do not require an API key。当前 runtime 不调用 Google Places API / does not call Google Places API，也不调用 Google Routes API / does not call Google Routes API；Google 路线在打开后由 Google Maps 重新计算。

## Google My Maps 导出

- 总览中的“导出到 Google My Maps”通过原生 `dialog.showModal()` 进入浏览器 modal top layer；背景内容在窗口打开时不可聚焦，Tab / Shift+Tab 由浏览器限制在导出窗口内。Escape 触发 `cancel` 后关闭窗口，并把焦点回到原触发按钮。
- `places.csv`、`itinerary.kml` 和 `README.md` 必须逐个下载。每次点击都即时用 `buildMyMapsFiles({ trip, state, locale })` 读取当前保存的 `assignments`、`orders`、`priorities` 和 `dirtyDays`，不会导出页面初始顺序或另存一份状态。
- 浏览器每次只创建一个 Blob URL，触发单个文件下载后立即撤销；失败时在 dialog 内显示可见错误，不影响继续浏览和修改地图。
- 导出文件用于手动导入 Google My Maps，不等于 Google Maps Saved Lists，也不会自动更新个人地图。
- `itinerary.kml` 只写入有效 WGS84 坐标并按日期加候选文件夹；仅有 GCJ-02 或缺少可靠坐标的地点仍保留在 `places.csv`，由 `README.md` 报告需要人工定位的数量。导出不会自动写入普通 Google Maps 收藏夹 / not automatically added to regular Google Maps saved lists，也不会自动导入高德收藏夹。
- 命令行导出使用 `node scripts/export-google-my-maps.js --guide <guide-directory> --output <new-directory>`，可选 `--state <state.json>`、`--locale zh-CN|en` 与 `--replace`。它只读取指定攻略的 `data/pois.json`、`data/itinerary.json` 和可选 state；输出目录不能等于文件系统根、用户主目录、仓库根、Skill 根或攻略根。默认拒绝覆盖；`--replace` 只替换三个已知导出文件并保留无关文件，整个提交可回滚。成功 stdout 只包含文件名与计数，失败 stderr 只有固定错误，不回显路径、旅行正文或密钥。

## 修改和确认

普通修改立即保存：普通地点优先级、把同城候选加入未满日期、同日排序。

同日排序由每张普通地点卡片左侧的 44px 专用手柄启动，卡片正文仍只负责打开详情，右侧上移/下移按钮保留为精确和无拖拽降级操作。按住手柄 160ms 后卡片浮起并跟随指针，当前位置显示插入线；进入路线列表顶部或底部 48px 时只自动滚动该列表，速度按距离边缘的程度增加，最高每帧 14px。松手后使用绝对目标位置提交 `move-order`；未移动、`pointercancel` 或按 `Escape` 都不会保存。

以下修改先打开统一影响确认：住宿、固定时间、已预约、当前必去、跨城市和超容量。取消确认不改变状态，确认后才提交。

每次提交保存一个修改前快照。“撤销上一步”恢复优先级、日期归类、排序、修改记录和受影响日期，并清除该次撤销能力。

## 修改汇总和正式重排

有修改时显示修改数量和受影响日期。页面明确说明正式路线尚未重排。

“请 Codex 重新安排”生成包含旅行名称、全部修改、受影响日期和复核要求的自然语言请求。复制优先使用浏览器剪贴板；失败时自动选中完整文本并提示手动复制。静态页面不会声称已把请求发送到 Codex。

## 状态恢复

浏览器保存当前日期、地点详情、筛选、优先级、日期归类、排序、修改记录和撤销快照。恢复时通过当前旅行数据过滤失效地点和日期。关闭地点详情后会立即保存关闭状态。

## 错误降级

- 浏览器存储不可用时，当前页面仍可浏览和修改，但刷新后不会保留选择。
- 图片不属于 Core；没有图片时保留官网、地图和体验线索入口。
- 没有正式路径几何时只显示地点，不画推测路线。

## 验证

- `test-core-map-state.js` 验证影响判断、提交、撤销、请求生成和恢复清洗。
- `test-core-map-template.js` 验证页面容器、共享资源、用户语言和响应式合同。
- `test-map-delivery-ui.js` 在 VM 中挂载轻量 Core，验证日期切换、重排后的 route status、当前状态导出和 Blob URL 回收。
- `test-route-reorder-interaction.js` 验证两套模板共用的长按、44px 手柄、边缘自动滚动、插入线、交通失效、绝对位置提交与撤销合同。
- `validate-map-html.js` 把 Core 缺失作为错误，把图片和目的地视觉缺失作为非阻塞提醒。
- REDSkill 构建会按 State → Delivery → Core 的顺序把三个 runtime 各内联一次，发布版轻量地图不依赖外部 delivery script。
- 发布前仍需实际完成桌面和手机浏览器验证。
