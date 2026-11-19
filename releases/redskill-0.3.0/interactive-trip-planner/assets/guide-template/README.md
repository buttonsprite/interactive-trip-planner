# Trip Guide Core Template

本目录是 `interactive-trip-planner` 的唯一地图实现起点。复制整个目录后，先替换旅行数据并通过 Core 验收，再决定是否深化图片和目的地视觉。

## 使用顺序

1. 复制整个 `assets/guide-template/` 到 `guides/<trip-slug>/`。
2. 替换 `maps/itinerary-map.html` 内的 `TRIP_DATA`。
3. 同步更新 `data/pois.json` 和 `data/itinerary.json`，确保与页面内嵌数据一致。
4. 运行数据、地图和合同验证。
5. 在桌面和手机浏览器完成总览、日期、详情、修改、撤销和重新安排测试。
6. Core 通过后，按需要补充图片、专题信息、`docs/design-language.md` 和 `data/design-tokens.json`。

不要先替换地图技术，也不要在每个攻略中重写状态规则。REDSkill 发布版的 `maps/itinerary-map.html` 已内联 Leaflet 与 Core CSS/JS，是可单独复制和打开的单个 HTML；`maps/assets/` 只保留为源码与验证参考，不再依赖单独的 Leaflet vendor 目录。

## 入口

- 地图：`maps/itinerary-map.html`
- 地点数据：`data/pois.json`
- 每日路线：`data/itinerary.json`
- 规划原则：`docs/planning-principles.md`
- 预约事项：`docs/reservations.md`
- 资料来源：`docs/sources.md`
- 当前地图行为：`docs/online-logic/map.md`

示例中的巴黎地点只用于验证功能，不是实时旅行建议。生成正式攻略时必须重新复核营业、预约、交通、同期活动和安全信息。

## 导出到 Google My Maps

准备好 `data/pois.json` 和 `data/itinerary.json` 后，在仓库根目录运行：

```bash
node skill/scripts/export-google-my-maps.js \
  --guide skill/assets/guide-template \
  --output /明确指定的输出目录/google-my-maps \
  --locale zh-CN
```

如果要导出地图中已经保存的调整，补充 `--state <saved-state.json>`。输出目录中已有 `README.md`、`places.csv` 或 `itinerary.kml` 时，命令默认停止；确认只替换这三个文件后再加 `--replace`。CLI 只在 stdout 返回文件名和数量摘要，不会输出旅行正文或密钥。

浏览器 runtime 也提供同一套纯导出方法：

```js
const files = TripMapDelivery.buildMyMapsFiles({
  trip: TRIP_DATA,
  state: normalizedSavedState, // 不传时使用初始路线
  locale: "zh-CN",            // 或 "en"
});
```

`files` 只包含 `README.md`、`places.csv` 和 `itinerary.kml`，由页面下载逻辑分别保存。这个方法不会修改旅行数据或地图状态。

在 [Google My Maps](https://www.google.com/mymaps) 中新建地图，先导入 `places.csv` 并选择经纬度或地址作为定位字段，再导入 `itinerary.kml` 查看按日期和候选地点分组的图层。只有 GCJ-02 坐标的地点会保留在 CSV，需按名称和地址手动定位，不会把 GCJ-02 数值误写成 KML 的 WGS84 坐标。

Google My Maps 项目和 Google Maps 的“已保存地点 / Saved Lists”是两套产品；这些文件不会自动写入个人 Saved List。地图中的 route links 也不是冻结的路线几何，打开 Google Maps 后会按当时路况、交通方式和可用道路重新计算。
