# AI 文案生成集成指南 (DeepSeek / OpenAI)

> **当前基线（2026-08-18）**：本文说明系统 AI 智能文案生成的配置方式、调用流程与降级保护。API Key 仅通过本地环境变量或前端页面运行时配置传入，仅保存在内存中，严禁写入代码或提交到仓库。

---

## 功能说明

系统支持大模型智能生成与本地规则模板生成双轨模式：
1. **AI 智能生成模式**：基于套餐事实（标题、价格、库存、使用规则、适用门店）与渠道定位（微信社群、朋友圈、商家转发、小红书种草），生成高转化率文案。
2. **规则模板生成模式**：内置多套高转化率规则文案模板，作为默认模式与离线/失败时的自动降级兜底。
3. **内容安全与质量校验**：生成的文案自动经过禁用词过滤（如“全网最低”、“稳赚不赔”等广告法违规词）、价格一致性校验与规则完整性检查。

---

## 支持的 AI 提供商

| 提供商标识 (`AI_PROVIDER`) | 说明 | 默认 Base URL | 默认模型 |
|-----------------------------|------|---------------|----------|
| `deepseek` | DeepSeek 开放平台 | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `openai` | OpenAI 官方或兼容代理 | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `template` | 本地规则模板引擎（无需网络与 Key） | — | — |

---

## 环境变量配置

在 `.env` 文件中配置（以 DeepSeek 为例）：

```env
# 启用 DeepSeek AI 生成
AI_PROVIDER="deepseek"
AI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
AI_API_BASE_URL="https://api.deepseek.com/v1"
AI_MODEL="deepseek-chat"

# 兼容旧配置项
DEEPSEEK_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## 运行时动态配置

除环境变量外，管理员亦可在系统前端 **文案生成** 或 **系统设置** 页面动态配置 AI 接口参数：
- 动态配置仅保存在后端当前运行实例的内存中，服务重启后自动失效。
- 接口附带 SSRF 防护校验，禁止配置指向内网 IP 的恶意 Base URL。

---

## API 调用示例

```http
POST /api/content/generate
Content-Type: application/json

{
  "packageId": "P001",
  "channel": "wechat_group",
  "scenario": "daily_push",
  "copyCount": 3,
  "useAI": true
}
```

---

## 核心实现文件

- `apps/api/src/content/ai-copy/ai-copy.service.ts` — 大模型 API 封装与重试
- `apps/api/src/content/ai-copy/ai-copy.controller.ts` — 运行时配置接口
- `apps/api/src/domain/copy-rules.ts` — 本地规则模板与违禁词过滤器
- `apps/web/src/views/GenerateView.vue` — 前端文案生成交互与 AI 开关
