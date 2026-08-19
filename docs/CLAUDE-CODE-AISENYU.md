# Claude Code 接入 aisenyu 中转站

> **文档边界（2026-08-18）**：这是本机 AI 工具接入说明，不是内容运营平台的运行时或发布验收文档。密钥必须通过本机配置注入，示例中的占位符不得替换为真实凭证后提交。

目标客户端：**Claude Code**（Anthropic 兼容协议）

## 网关信息

| 项 | 值 |
| --- | --- |
| Anthropic Base URL | `https://api.aisenyu.com`（**不要**手动追加 `/v1`） |
| OpenAI 兼容 Base URL | `https://api.aisenyu.com/v1` |
| Gemini 兼容 Base URL | `https://api.aisenyu.com/v1beta` |
| 认证 | `Authorization: Bearer <API_KEY>` / Claude Code 用 `ANTHROPIC_AUTH_TOKEN` |
| 推荐文本模型 | `grok-4.5` |

## 1. Claude Code 配置（推荐）

Claude Code 从 `~/.claude/settings.json` 的 `env` 字段读取网关变量（本机实际路径：`E:\AI_Caches\.claude\settings.json`，因 `CLAUDE_CONFIG_DIR` 指向该目录）。

需要的环境变量：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.aisenyu.com",
    "ANTHROPIC_AUTH_TOKEN": "<your-key>",
    "ANTHROPIC_MODEL": "grok-4.5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "grok-4.5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "grok-4.5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "grok-4.5"
  },
  "model": "grok-4.5"
}
```

密钥只允许写在：

- 本机 Claude Code 私密配置（`settings.json` / `settings.local.json`）
- 本地未跟踪的 `.env`（已在 `.gitignore`）
- 系统/用户环境变量

**不要**把真实密钥提交到 git、文档或日志。

### Windows（PowerShell，会话级）

```powershell
$env:ANTHROPIC_BASE_URL = "https://api.aisenyu.com"
$env:ANTHROPIC_AUTH_TOKEN = "<your-key>"
$env:ANTHROPIC_MODEL = "grok-4.5"
claude
```

### Windows（用户级持久）

```powershell
[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", "https://api.aisenyu.com", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", "<your-key>", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", "grok-4.5", "User")
```

### macOS / Linux

```bash
export ANTHROPIC_BASE_URL=https://api.aisenyu.com
export ANTHROPIC_AUTH_TOKEN=<your-key>
export ANTHROPIC_MODEL=grok-4.5
claude
```

可写入 `~/.bashrc` / `~/.zshrc`，或继续使用 `~/.claude/settings.json` 的 `env` 字段。

## 2. 连通性测试

项目内脚本（会读本地 `.env`，不打印完整密钥）：

```bash
node scripts/test-aisenyu-gateway.js
```

成功时大致输出：

```text
=== aisenyu gateway connectivity ===
ANTHROPIC_BASE_URL = https://api.aisenyu.com
MODEL              = grok-4.5
TOKEN              = sk-bcc...xxxx (len=N)

[1/3] GET /v1/models
  OK HTTP 200  models=...  sample=[...]
[2/3] POST /v1/chat/completions
  OK HTTP 200  content="pong"
[3/3] POST /v1/messages (Anthropic-compatible)
  OK HTTP 200  type=message  content="pong"

Result: OK — gateway is reachable with the configured key/model.
```

也可手动验证：

```bash
# models
curl -sS https://api.aisenyu.com/v1/models \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN"

# OpenAI chat
curl -sS https://api.aisenyu.com/v1/chat/completions \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4.5","messages":[{"role":"user","content":"Reply with exactly: pong"}],"max_tokens":16}'
```

## 3. 图片生成（OpenAI 兼容，可选）

中转站提供：

- `POST https://api.aisenyu.com/v1/images/generations` — 文生图
- `POST https://api.aisenyu.com/v1/images/edits` — 参考图编辑

### 同步文生图示例

```bash
curl -sS https://api.aisenyu.com/v1/images/generations \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "a red apple on a white table",
    "n": 1,
    "size": "1024x1024"
  }'
```

从响应读取图片地址：

```js
const json = await res.json();
const url = json.data?.[0]?.url; // response.data[].url
console.log(url);
```

### 可选参考图（edits）

```bash
curl -sS https://api.aisenyu.com/v1/images/edits \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -F "image=@./ref.png" \
  -F "prompt=make the background blue" \
  -F "n=1"
```

## 4. 与本项目 AI 文案模块的关系

- **Claude Code 自身对话**：走 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`（本文档主体）。
- **业务 AI 文案**（`apps/api` DeepSeek/OpenAI 客户端）：可选用同一中转的 OpenAI 兼容面，环境变量为 `AI_API_BASE_URL` / `AI_API_KEY` / `AI_MODEL`（见 `.env.example`）。默认仍保留原有 DeepSeek / template 配置，**不会**强制替换。

## 5. 注意

1. Claude Code 的 `ANTHROPIC_BASE_URL` 使用根地址 `https://api.aisenyu.com`，客户端会自己拼 `/v1/messages`。
2. 当前若通过 **Claude Desktop 托管会话** 运行，主机可能覆盖 `ANTHROPIC_BASE_URL`（例如指向本机 proxy）。独立 CLI（`claude`）或重启后按 `settings.json` 生效。
3. 更换密钥时，同步更新 `~/.claude/settings.json` 的 `env.ANTHROPIC_AUTH_TOKEN` 与本地 `.env`，不要提交到仓库。
