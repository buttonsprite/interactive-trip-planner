# Samples

这些 sample 是质量标尺和 feature inventory，不是视觉模板。不要照抄配色、排版或文案。每次做新目的地时，应根据目的地的空间、材料、导视、餐饮、自然条件和旅行主题重新选择视觉方向。

## 可用样例

- `urban-art-sample.json`：城市艺术 / 建筑线。关注博物馆、建筑、街区步行簇和视觉资源。
- `food-nightlife-sample.json`：吃喝夜生活线。关注餐厅角色、bar hopping、晚间安全半径和轻餐关系。
- `coastal-nature-sample.json`：海岛 / 自然 / 潜水线。关注海况、船程、潜点、禁飞缓冲、天气风险和恢复型节奏。

## Golden samples

`golden/` 里是打磨完整旅行地图用的高质量样本，不是轻量字段示例：

- `golden/barcelona-modernisme-night-atlas`：艺术建筑、预约景点、市场和夜生活。
- `golden/tokyo-rail-neon-craft`：高密度大城市、轨道交通和分区漫游。
这些目录当前只保留内容、字段和设计说明作为参考。旧地图实现已经移除，不能作为新攻略模板；新的基础地图统一从 `assets/guide-template/` 生成。

## Eval fixtures

`evals/` 只用于可重复的离线 forward test，不是可直接采用的旅行建议：

- `evals/amap-dali-public.json`：使用公开地点名与合成 provider ID，覆盖大理四站高德总览、相邻路线入口，以及 resolved、ambiguous、unresolved 三种状态。
- `evals/overseas-my-maps-public.json`：使用 5 天、30 个公开安全的合成海外地点，覆盖七站 Google Maps 拆段、正式路线与候选区分，以及酒店、用餐和交通角色。

运行 `node scripts/test-map-delivery-forward.js` 只使用本地 runtime 与临时目录，不访问 provider。真实高德验收必须显式设置 `RUN_AMAP_LIVE=1`；未设置时 `node scripts/test-amap-cli-live.js` 会清晰输出 `SKIP` 并以 0 退出。公开 fixture 不包含真实凭据、订单或私人行程。

## 使用方式

1. 先读 sample 的字段完整度和交互需求。
2. 抽取适合当前目的地的 POI 字段、itinerary 结构和 popup 信息密度。
3. 重新做目的地 design direction，不照抄 sample 视觉。
4. 用 `validate-trip-data.js` 和 `validate-map-html.js` 做检查。
