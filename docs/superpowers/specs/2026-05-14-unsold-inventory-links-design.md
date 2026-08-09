# 未售罄链接库存标注设计

> **设计状态（2026-08-09）**：该设计已实现并继续作为业务口径来源；实现已按当前模块边界拆分，文件名和编排可能比原设计更细。不要用本设计稿的旧执行统计替代当前验证结果；统一状态见 [文档对齐总览](../../DOCUMENTATION-STATUS.md)。

## 背景

运营中台当前从 JeeSite 后台读取套餐列表，并已经把后台剩余库存字段映射为 `stockLeft` 和 `SalesSnapshot.remainingStock`。现有推荐逻辑主要按当天实时库存、销售数据和推广分排序，不能稳定识别“昨天或前几天还没售罄、需要继续处理”的链接。

本次策略调整为：每天读取 JeeSite 剩余库存，沉淀为库存快照，再按最近几天库存变化给套餐链接打标，帮助运营优先处理没售罄或库存下降慢的链接。

## 目标

- 每天保存每个套餐链接的剩余库存快照。
- 在推荐列表中标出今日未售罄、连续 2 天未售罄、连续 3 天库存下降慢的链接。
- 支持“只看未售罄链接”筛选。
- 在套餐详情页展示最近几天库存变化，方便判断是否继续推、换文案、改价或下架。

## 非目标

- 不重做 JeeSite 登录、鉴权、列表抓取机制。
- 不引入新的复杂任务调度系统；先利用现有数据加载链路沉淀快照。
- 不自动改价、下架或修改 JeeSite 后台数据。本期只做识别和标注。

## 数据来源

JeeSite 适配器继续优先读取以下剩余库存字段：

- `hasInventory`
- `bargainCommodityDynamic.hasInventory`
- `stockLeft`
- `surplusStock`
- `remainingStock`
- `leftStock`

适配器输出保持当前口径：

- `ContentPackage.stockLeft`：当前剩余库存
- `SalesSnapshot.remainingStock`：当前快照的剩余库存
- `SalesSnapshot.snapshotTime`：库存读取时间

## 快照沉淀

推荐接口每次从 JeeSite 拉到实时数据后，把当天每个套餐的库存快照写入数据库。

同一天同一个 `packageId` 只保留一条库存快照：

- 如果当天没有快照，创建一条 `SalesSnapshot`。
- 如果当天已有快照，更新这条记录的 `remainingStock`、`snapshotTime` 和其他销售指标。

这样前端刷新不会制造大量重复历史，同时每天能留下一个稳定的库存点位。

## 标注规则

新增库存标注字段：

- `inventoryFlag`
- `inventoryFlagLabel`
- `inventoryFlagLevel`
- `inventoryTrend`

标注值：

- `normal`：不需要特别提示。
- `unsold_today`：今天剩余库存 `> 0`，但历史不足以判断连续天数。
- `unsold_2d`：最近连续 2 天剩余库存都 `> 0`。
- `unsold_3d_slow`：最近连续 3 天及以上剩余库存都 `> 0`，且最近 3 天库存总下降 `<= 1` 份。

优先级：

1. `unsold_3d_slow`
2. `unsold_2d`
3. `unsold_today`
4. `normal`

如果套餐已下架、回收或今日库存为 0，则不进入未售罄筛选。

## API 设计

`GET /api/content/packages/recommend` 返回的每个 `RecommendPackageItem` 增加：

- `inventoryFlag`
- `inventoryFlagLabel`
- `inventoryFlagLevel`
- `inventoryUnsoldDays`
- `inventoryTrend`

新增查询参数：

- `inventoryFlag=unsold`：只返回未售罄相关链接。

`GET /api/content/packages/:packageId/analysis` 增加：

- `inventoryTrend`：最近几天库存变化，如 `12 -> 12 -> 11`。
- `inventoryFlag`：当前库存标注。

## 前端展示

推荐列表：

- 新增“库存标记”列。
- 标签展示：
  - 今日未售罄
  - 连续2天未售罄
  - 连续3天库存慢
- 新增筛选开关“只看未售罄链接”。
- 默认排序把库存风险高的链接排在前面。

套餐详情页：

- 在基础信息中展示库存标记。
- 在销售趋势或库存区域展示最近几天库存变化。

## 异常处理

- 如果历史快照不足，只显示“今日未售罄”，不误判连续多天。
- 如果 JeeSite 缺少剩余库存字段，不生成连续状态。
- 如果某天没有抓取到某个套餐，不把缺失日当作库存为 0；连续判断从可用快照重新计算。
- 如果实时数据源请求失败，保持现有错误行为，不回退到旧种子数据冒充线上数据。

## 测试范围

- JeeSite 剩余库存字段映射仍以后台字段为准。
- 同一天同一套餐只保留一条库存快照。
- 连续 2 天剩余库存 `> 0` 时返回 `unsold_2d`。
- 连续 3 天剩余库存 `> 0` 且库存总下降 `<= 1` 时返回 `unsold_3d_slow`。
- `inventoryFlag=unsold` 只返回未售罄相关链接。
- 推荐列表按库存标注优先级排序。
- 套餐详情页返回最近库存变化。
