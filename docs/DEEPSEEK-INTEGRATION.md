# DeepSeek AI 文案生成集成指南

> **当前边界（2026-08-09）**：本文是 API/Web 的可选 AI 配置说明；密钥仅通过本地环境变量或运行时配置提供，不进入源码、文档或打包产物。Windows/EXE 集成不在本轮验收范围。

## 功能说明

系统已集成 DeepSeek 大模型，用于智能生成推广文案。支持模板生成和AI生成两种模式。

## 配置步骤

### 1. 获取 DeepSeek API Key

访问 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册并获取 API Key

### 2. 配置环境变量

在 `.env` 文件中添加：

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. 重启服务

```bash
npm run dev
```

## 使用方式

### API 调用

生成文案时添加 `useAI: true` 参数：

```typescript
POST /api/content/generate

{
  "packageId": "P001",
  "channel": "wechat_group",
  "scenario": "daily_push",
  "copyCount": 3,
  "useAI": true  // 启用AI生成
}
```

### 前端集成

在生成文案页面添加开关：

```vue
<el-switch v-model="useAI" active-text="AI生成" inactive-text="模板生成" />
```

## 工作原理

1. **AI模式**：调用 DeepSeek API，根据套餐信息、推广策略、渠道特点生成个性化文案
2. **模板模式**：使用预定义规则生成文案（默认模式）
3. **降级策略**：AI调用失败时自动降级到模板模式

## 文案审核

AI生成的文案会自动经过以下审核：

- ✅ 禁用词检测（全网最低、稳赚等）
- ✅ 价格一致性校验
- ✅ 库存准确性校验
- ✅ 使用规则完整性检查

## 成本说明

DeepSeek 定价（2024年）：
- 输入：¥0.001 / 1K tokens
- 输出：¥0.002 / 1K tokens

单次文案生成约消耗 500-800 tokens，成本约 ¥0.001-0.002

## 文件说明

- `apps/api/src/content/ai-copy.service.ts` - AI服务封装
- `apps/api/src/content/content.service.ts` - 文案生成逻辑
- `apps/api/src/content/content.module.ts` - 模块配置

## 注意事项

1. API Key 请勿提交到代码仓库
2. 建议设置请求频率限制
3. 生产环境建议配置降级策略
4. 定期检查API调用量和费用
