# 套餐详情解析能力提升

## 改进概述

对 `package-detail.service.ts` 进行了全面升级，大幅提升了套餐详情的解析能力和可维护性。

## 主要改进

### 1. 扩展的分类标题识别

**之前**: 仅支持 7 个关键词（选、必备、欢乐送、镇店、人气、特色、时蔬）

**现在**: 支持 30+ 关键词和多种模式匹配
- 新增关键词：主食、主菜、配菜、小吃、甜品、饮品、酒水、凉菜、热菜、汤品、素菜、荤菜、海鲜、肉类、招牌、推荐、精选、经典、新品、限定、季节、套餐、组合、搭配、自选、任选、赠送、加购
- 支持模式：
  - 数字选择模式：`\d+选\d+` (如 "2选1", "3选2")
  - 中文序号：`第[一二三四五六七八九十]+部分`
  - 字母/数字编号：`A.`, `1.`, `一.`
  - 括号标记：`【主食类】`

### 2. 多策略商品解析

**之前**: 仅支持单一的嵌套 section 结构

**现在**: 支持 6 种解析策略，按优先级依次尝试：

1. **标准嵌套结构**: `<section><section>菜名</section><section>数量</section></section>`
2. **冒号分隔**: `菜名：数量` 或 `菜名:数量`
3. **括号格式**: `菜名（数量）` 或 `菜名(数量)`
4. **Span/Div结构**: `<span>菜名</span><span>数量</span>`
5. **列表项**: `<li>菜名 × 数量</li>` 或 `<ul><li>菜名</li></ul>`
6. **乘号分隔**: `菜名 × 数量` 或 `菜名 x 数量`

### 3. 增强的日志记录

新增详细的调试日志：
- 套餐标题识别日志
- 每个分类的创建和保存日志
- 每个商品的添加日志
- 解析统计摘要（分类数、商品总数）
- 空结果警告

### 4. 新增 API 功能

#### 强制刷新
```
POST /api/content/packages/:packageId/detail/refresh
```
强制重新获取并解析套餐详情，绕过缓存

#### 查询参数增强
```
GET /api/content/packages/:packageId/detail?forceRefresh=true&saveRawHtml=true
```
- `forceRefresh`: 强制刷新缓存
- `saveRawHtml`: 保存原始 HTML 用于调试

#### 缓存统计
```
GET /api/content/packages/cache/stats
```
返回详细的缓存统计信息：
```json
{
  "totalCached": 5,
  "packages": [
    {
      "packageId": "123",
      "packageTitle": "豪华套餐",
      "sectionsCount": 3,
      "itemsCount": 12,
      "fetchedAt": "2026-05-12T10:00:00Z",
      "expiresAt": "2026-05-13T10:00:00Z"
    }
  ]
}
```

#### 缓存清理
```
POST /api/content/packages/cache/clear?packageId=123
```
清理指定套餐或全部缓存

### 5. 调试支持

- 解析失败时自动记录警告
- 可选保存原始 HTML 用于问题诊断
- 详细的解析过程日志（debug 级别）

## 使用示例

### 获取套餐详情（使用缓存）
```bash
curl http://localhost:3000/api/content/packages/123/detail
```

### 强制刷新套餐详情
```bash
curl -X POST http://localhost:3000/api/content/packages/123/detail/refresh
```

### 获取带原始 HTML 的详情（用于调试）
```bash
curl http://localhost:3000/api/content/packages/123/detail?saveRawHtml=true
```

### 查看缓存统计
```bash
curl http://localhost:3000/api/content/packages/cache/stats
```

### 清理特定套餐缓存
```bash
curl -X POST http://localhost:3000/api/content/packages/cache/clear?packageId=123
```

### 清理所有缓存
```bash
curl -X POST http://localhost:3000/api/content/packages/cache/clear
```

## 兼容性

所有改进都向后兼容，现有的 API 调用不受影响。新功能通过可选参数和新端点提供。

## 性能影响

- 多策略解析增加了少量 CPU 开销，但对于单个套餐解析仍在毫秒级
- 缓存机制保持不变（24小时 TTL）
- 新增的日志在生产环境可通过日志级别控制

## 后续建议

1. **监控解析成功率**: 通过日志分析哪些套餐解析失败或返回空结果
2. **收集失败案例**: 使用 `saveRawHtml=true` 收集解析失败的原始 HTML
3. **持续优化**: 根据实际数据调整关键词和解析策略
4. **性能监控**: 监控解析时间，必要时添加超时保护
