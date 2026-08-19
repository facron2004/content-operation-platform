# Codex CLI 接入 aisenyu 中转站

> **文档边界（2026-08-18）**：这是本机 AI 工具接入说明，不是内容运营平台的运行时或发布验收文档。密钥必须通过本机配置注入，示例中的占位符不得替换为真实凭证后提交。

目标客户端：**Codex CLI**（OpenAI 兼容 `/v1/responses` 协议）

## 网关信息

| 项 | 值 |
| --- | --- |
| OpenAI 兼容 Base URL | `https://api.aisenyu.com/v1` |
| Anthropic Base URL（其它客户端） | `https://api.aisenyu.com`（不要手动追加 `/v1`） |
| Gemini 兼容 Base URL | `https://api.aisenyu.com/v1beta` |
| 认证 | `Authorization: Bearer <API_KEY>` |
| Codex wire | `wire_api = "responses"` → `POST /v1/responses` |
| 推荐文本模型 | `grok-4.5` |

## 1. Codex 本机配置（推荐）

Codex 读取 `~/.codex/config.toml` 与 `~/.codex/auth.json`。
本机实际路径（`CODEX_HOME`）：`E:\AI_Caches\.codex`（`~/.codex` 为指向该目录的符号链接）。

### `config.toml` 关键字段

```toml
model_provider = "custom"
model = "grok-4.5"
review_model = "grok-4.5"

[model_providers.custom]
name = "AISENYU"
base_url = "https://api.aisenyu.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

说明：

- `base_url` 必须带 `/v1`（Codex 会请求 `{base_url}/responses`）。
- `wire_api = "responses"`：网关接收 Codex 的 HTTP `/v1/responses`，再桥接到 Grok 上游。
- `requires_openai_auth = true`：使用 `auth.json` 里的 `OPENAI_API_KEY`。
- `model` 与 `review_model` 都设为 `grok-4.5`。
- **不要**在 `config.toml` 里写明文密钥。`experimental_bearer_token = "PROXY_MANAGED"` 仅在 CC Switch 代理接管 Live 配置时由工具写入，直连网关时不要手动加。

### 写入 API Key（私密凭据）

```bash
# 从 stdin 写入 ~/.codex/auth.json 的 OPENAI_API_KEY（不会进 git）
printenv OPENAI_API_KEY | codex login --with-api-key
# 或：
printf '%s' "$OPENAI_API_KEY" | codex login --with-api-key
codex login status
```

Windows PowerShell：

```powershell
$env:OPENAI_API_KEY = "<your-key>"
$env:OPENAI_API_KEY | codex login --with-api-key
codex login status
```

密钥只允许写在：

- `~/.codex/auth.json`（Codex 私密凭据，已通过 `codex login`）
- 本地未跟踪的 `.env`（项目 `.gitignore` 已忽略）
- 系统/用户环境变量 `OPENAI_API_KEY`

**不要**把真实密钥提交到 git、文档或日志。

### 环境变量（可选，会话级）

#### Windows（PowerShell）

```powershell
$env:OPENAI_API_KEY = "<your-key>"
$env:OPENAI_BASE_URL = "https://api.aisenyu.com/v1"   # 可选；Codex 以 config.toml 为准
codex
```

#### Windows（用户级持久）

```powershell
[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "<your-key>", "User")
```

#### macOS / Linux

```bash
export OPENAI_API_KEY=<your-key>
# 可选
export OPENAI_BASE_URL=https://api.aisenyu.com/v1
codex
```

## 2. 连通性测试

项目内脚本（读本地 `.env`，**不打印完整密钥**）：

```bash
# Codex 路径：/v1/models + /v1/responses
node scripts/test-codex-aisenyu.js

# 通用网关（models + chat + Anthropic messages）
node scripts/test-aisenyu-gateway.js
```

成功时大致输出：

```text
=== aisenyu Codex (responses) connectivity ===
OPENAI_BASE = https://api.aisenyu.com/v1
MODEL       = grok-4.5
TOKEN       = sk-bcc...xxxx (len=N)

[1/2] GET /v1/models
  OK HTTP 200  models=...  sample=[...]
  model "grok-4.5" is listed
[2/2] POST /v1/responses
  OK HTTP 200  content="pong"

Result: OK — Codex gateway path is reachable.
```

也可手动验证：

```bash
# models
curl -sS https://api.aisenyu.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# responses（Codex wire）
curl -sS https://api.aisenyu.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4.5","input":"Reply with exactly: pong","max_output_tokens":16}'

# 启动 Codex（应显示 API key 登录 + custom provider）
codex login status
codex doctor
codex "Reply with exactly: pong"
```

## 3. 图片生成（OpenAI 兼容，可选）

中转站提供：

- `POST https://api.aisenyu.com/v1/images/generations` — 同步文生图
- `POST https://api.aisenyu.com/v1/images/edits` — 可选参考图编辑

### 同步文生图

```bash
curl -sS https://api.aisenyu.com/v1/images/generations \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
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
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "image=@./ref.png" \
  -F "prompt=make the background blue" \
  -F "n=1"
```

### Windows / macOS·Linux 环境变量

| 平台 | 设置方式 |
| --- | --- |
| Windows PowerShell（会话） | `$env:OPENAI_API_KEY = "<key>"` |
| Windows 用户级 | `[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "<key>", "User")` |
| macOS / Linux | `export OPENAI_API_KEY=<key>`（可写入 `~/.bashrc` / `~/.zshrc`） |

## 4. CC Switch 配置（本机推荐）

本机用 **CC Switch** 管理 Codex 供应商时，有两层配置，不要混：

| 层 | 路径 | 作用 |
| --- | --- | --- |
| CC Switch 供应商库 | `E:\AI_Caches\.cc-switch\cc-switch.db` → `providers`（`app_type=codex`） | 上游真实 `base_url`、密钥、`model` / `review_model` |
| CC Switch 设置 | `E:\AI_Caches\.cc-switch\settings.json` | `currentProviderCodex`、是否开本地代理 |
| Codex 运行时 | `E:\AI_Caches\.codex\config.toml` + `auth.json` | 实际被 Codex 读取；代理开启时 `base_url` 会被写成本地代理 |

### 供应商侧（上游，写入 DB）

- `id`：`aisenyu-1784290120908`（名称 AISENYU）
- `auth.OPENAI_API_KEY`：中转站密钥（仅存本地 DB，勿提交）
- `config` 关键字段：

```toml
model_provider = "custom"
model = "grok-4.5"
review_model = "grok-4.5"

[model_providers.custom]
name = "AISENYU"
base_url = "https://api.aisenyu.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

- `meta.apiFormat`：`openai_responses`
- `meta.isFullUrl`：`false`（Codex 会在 `base_url` 后追加 `/responses`，所以 base 必须是 `.../v1`，不要写成完整 `/v1/responses`）
- `provider_endpoints.url`：`https://api.aisenyu.com/v1`

### 代理接管时的 Live 文件

开启 CC Switch 本地代理（`127.0.0.1:15721`）后，Live `config.toml` 会变成：

```toml
model_provider = "custom"
model = "grok-4.5"
review_model = "grok-4.5"

[model_providers.custom]
name = "AISENYU"
base_url = "http://127.0.0.1:15721/v1"
wire_api = "responses"
requires_openai_auth = true
experimental_bearer_token = "PROXY_MANAGED"
```

代理会把请求转发到供应商里的 `https://api.aisenyu.com/v1`，并注入 DB 里的 API Key。  
因此：**供应商配置写公网网关；Live 文件写本地代理是正常现象**，不要把 Live 的 `127.0.0.1` 误改回公网后还指望 CC Switch 热切换。

### 一键对齐脚本

从项目 `.env` 读取密钥，写回 CC Switch 供应商 + Codex `auth.json` / `config.toml`：

```bash
python scripts/setup-codex-aisenyu.py
```

脚本会备份 DB / config / auth 后再改写，并**不打印完整密钥**。

### UI 操作核对

1. 打开 **CC Switch** → Codex 供应商 → 选中 **AISENYU**
2. 确认 Base URL = `https://api.aisenyu.com/v1`，模型 = `grok-4.5`，协议 = Responses
3. 开启本地代理（若使用热切换 / 用量统计）
4. 终端执行 `codex login status` 应显示 API key 登录；`codex "Reply with exactly: pong"`

## 5. 与本项目其它 AI 配置的关系

| 用途 | 配置位置 | 变量 / 字段 |
| --- | --- | --- |
| **Codex CLI** | `~/.codex/config.toml` + `auth.json` | `base_url`、`OPENAI_API_KEY`、`model=grok-4.5` |
| **CC Switch（Codex）** | `E:\AI_Caches\.cc-switch\` | 供应商 `aisenyu-*`、`currentProviderCodex` |
| **Claude Code** | `~/.claude/settings.json` 或 `.env` | `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`（见 [CLAUDE-CODE-AISENYU.md](./CLAUDE-CODE-AISENYU.md)） |
| **业务 AI 文案**（`apps/api`） | `.env` | 可选 `AI_API_BASE_URL` / `AI_API_KEY` / `AI_MODEL`；默认仍保留 DeepSeek / template，**不强制替换** |

## 6. 注意

1. Codex 的 `base_url` 使用 `https://api.aisenyu.com/v1`，与 Claude Code 的 `ANTHROPIC_BASE_URL=https://api.aisenyu.com`（无 `/v1`）不同。
2. 使用 **CC Switch 本地代理** 时：Live `config.toml` 的 `base_url` 为 `http://127.0.0.1:15721/v1` 是预期行为；上游地址在 CC Switch 供应商配置里。
3. 若**不**走 CC Switch、要 Codex 直连网关：把 Live `base_url` 改为 `https://api.aisenyu.com/v1`，去掉 `experimental_bearer_token`，并保证 `auth.json` 为 API key 模式。
4. 更换密钥时：更新本地 `.env` 的 `OPENAI_API_KEY` / `AI_API_KEY`，再运行 `python scripts/setup-codex-aisenyu.py`，或 `printf '%s' "$NEW_KEY" | codex login --with-api-key`；**不要提交到仓库**。
5. 项目内连通性脚本优先读 `.env`；Codex 进程本身优先读 `~/.codex/auth.json`。
