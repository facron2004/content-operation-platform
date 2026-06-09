# 内容运营 AI 文案生成系统

本地生活套餐推广运营中台，基于 JeeSite 实时数据实现套餐销售监测、推广优先级排序、AI/规则文案生成、人工审核、社群分发和效果回流的全链路闭环。

## 核心功能

**运营作战台** — 一屏看清今日必推、风险、爆品机会、滞销套餐和社群任务，60 秒自动刷新，支持按角色切换视角。

**套餐推荐排序** — 综合推广分、库存健康度、销售转化率、区域匹配度等多维指标，为每个套餐生成优先级排序和推荐策略。

**AI 文案生成** — 集成 DeepSeek 等大模型，根据套餐事实（价格、库存、明细、使用规则）和渠道特点（微信群、朋友圈、商家转发）生成个性化推广文案，内置禁用词审核和质量校验。

**套餐详情解析** — 自动抓取并解析套餐详情页富文本，提取结构化套餐内容（分组、品名、数量），支持三种解析策略择优。

**预警与审核** — 自动识别高危/警告级运营风险，提供文案审核工作流，支持机器初审 + 人工复审。

**社群运营** — 基于社群画像（人群类型、偏好品类、历史转化）自动匹配今日推荐套餐，生成推送时间表和作战卡。

**效果看板** — 追踪文案生成量、审核通过率、GMV、转化率等关键指标，支持昨日复盘和趋势分析。

## 技术架构

```
┌────────────────────────────────────────────────────────┐
│                    Vue 3 + Element Plus + ECharts      │
│    Dashboard │ Recommendations │ Generate │ Communities │
│              │ Audit │ Alerts │ Performance             │
└──────────────────────┬─────────────────────────────────┘
                       │ /api  (Vite Proxy → :3101)
┌──────────────────────┴─────────────────────────────────┐
│              NestJS API  (Port 3100 / 3101)            │
│                                                        │
│  ContentService ── DataSourceService ── JeeSite API    │
│       │                  │                             │
│       ├── CopyService    └── AutoLoginService          │
│       ├── AlertService                                 │
│       ├── DashboardService                             │
│       ├── AICopyService ── DeepSeek / OpenAI API       │
│       └── PackageDetailService ── cheerio HTML parser  │
│                                                        │
│              Prisma Client  →  SQLite (dev.db)          │
└────────────────────────────────────────────────────────┘
```

前端使用 Vue 3 + TypeScript + Vite 构建，Element Plus 组件库按需自动导入，ECharts 绘制图表，Pinia 管理角色状态。后端使用 NestJS 框架，Prisma Client 访问 SQLite 数据库，支持运行时 AI 配置和自动登录。项目通过 npm workspaces 管理三个包：`@content/shared`（共享类型）、`@content/api`（后端）、`@content/web`（前端）。

## 快速开始

### 本地开发

```bash
npm install
npm run prepare:db       # 初始化 SQLite 表结构
npm run dev              # 启动前后端开发服务器
```

访问 `http://localhost:3100`。开发时后端 API 运行在内部端口 3101，前端通过 Vite 代理统一从 3100 端口提供 `/api` 访问。

### 打包为 Windows exe

```bash
npm run build:exe
```

进入 `dist` 目录，复制 `.env.example` 为 `.env` 并配置后，双击 `content-ops.exe` 启动。首次运行会自动创建数据库并初始化表结构，不需要额外复制 `dev.db`。

## 环境变量

复制 `.env.example` 为 `.env`，按需配置以下变量：

### 必须配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EXTERNAL_API_BASE_URL` | JeeSite 后台地址 | `https://zdm.zhsh1.cn/a` |
| `EXTERNAL_API_USERNAME` | JeeSite 登录用户名 | — |
| `EXTERNAL_API_PASSWORD` | JeeSite 登录密码 | — |

配置用户名密码后系统会自动处理登录和 Cookie 刷新，详见 [自动登录文档](docs/AUTO_LOGIN.md)。

### AI 文案生成（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_API_KEY` / `DEEPSEEK_API_KEY` | AI 模型 API Key | — |
| `AI_PROVIDER` | AI 提供商标识 | `template` |

也可在系统运行后通过前端页面实时配置 AI 接口（仅本次运行生效）。

### 性能调优

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CONTENT_CACHE_TTL_MS` | 数据缓存有效期（毫秒） | `300000` |
| `EXTERNAL_FETCH_TIMEOUT_MS` | 外部 API 请求超时（毫秒） | `8000` |
| `EXTERNAL_FETCH_CONCURRENCY` | 分页并发数 | `6` |

### 服务配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | API 服务端口 | `3100` |
| `HOST` | 监听地址 | `127.0.0.1` |
| `DATABASE_URL` | SQLite 数据库路径 | `file:./dev.db` |

`HOST` 默认绑定 `127.0.0.1` 防止局域网暴露。如需局域网访问，设置 `HOST=0.0.0.0`。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动前后端开发服务器 |
| `npm run build` | 构建 shared → api → web 三个包 |
| `npm run build:exe` | 构建并打包为 Windows exe |
| `npm test` | 运行后端单元测试（60 个用例） |
| `npm run prepare:db` | 初始化 / 更新 SQLite 表结构 |
| `npm run db:purge-mock` | 清除数据库中的 mock 数据 |

## API 接口概览

所有接口前缀为 `/api/content`，返回 JSON。

| 模块 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 套餐 | GET | `/packages/recommend` | 推荐套餐列表（支持分页、筛选、角色过滤） |
| 套餐 | GET | `/packages/categories` | 分类列表 |
| 套餐 | GET | `/packages/:id/analysis` | 单套餐深度分析 |
| 套餐 | GET | `/packages/:id/detail` | 套餐详情（抓取 + 解析） |
| 文案 | POST | `/generate` | 生成推广文案（AI 或规则兜底） |
| 文案 | GET | `/copies` | 文案列表（支持审核状态筛选） |
| 文案 | POST | `/copies/:id/audit` | 审核文案 |
| 作战台 | GET | `/ops/today` | 今日运营作战台 |
| 作战台 | GET | `/ops/review` | 昨日运营复盘 |
| 看板 | GET | `/dashboard/summary` | 仪表盘汇总 |
| 看板 | GET | `/performance` | 效果数据 |
| 预警 | GET | `/alerts` | 运营预警列表（支持分页） |
| 预警 | POST | `/alerts/:id/resolve` | 处理单条预警 |
| 社群 | GET | `/communities` | 社群匹配列表 |
| AI | GET | `/ai-copy/status` | AI 配置状态 |
| AI | POST | `/ai-copy/config` | 更新 AI 配置（运行时） |
| 库存 | POST | `/inventory/daily-crawl` | 触发每日库存抓取 |
| 健康 | GET | `/health` | 系统健康检查 |

## 角色体系

系统支持五种运营角色，切换角色会影响数据过滤维度：

- **平台运营** — 查看全部套餐，跨区域跨商家
- **区域运营** — 按区域过滤，关注本区域套餐推广
- **商家运营** — 按商家过滤，关注本商家套餐
- **审核人员** — 关注文案审核队列
- **管理员** — 全量数据 + 系统配置

## 目录结构

```
内容运营/
├── apps/
│   ├── api/                     # NestJS 后端
│   │   ├── src/
│   │   │   ├── main.ts          # 应用入口（ValidationPipe、CORS、静态资源）
│   │   │   ├── app.module.ts    # 根模块
│   │   │   ├── config/          # 环境变量加载
│   │   │   ├── content/         # 核心业务模块
│   │   │   ├── domain/          # 领域规则（推广评分、运营标签、文案规则）
│   │   │   └── prisma/          # 数据库服务（含自动迁移）
│   │   └── test/                # 单元测试（13 个文件，60 个用例）
│   └── web/                     # Vue 3 前端
│       ├── src/
│       │   ├── components/      # 通用组件（布局、骨架屏、空状态等）
│       │   ├── composables/     # 组合式函数
│       │   ├── services/        # API 调用层
│       │   ├── stores/          # Pinia 状态管理
│       │   └── views/           # 页面视图（8 个）
│       └── vite.config.ts       # Vite 配置（代理、分包策略）
├── packages/
│   └── shared/                  # 前后端共享类型定义
├── prisma/
│   ├── schema.prisma            # 数据模型契约
│   ├── seed-data.ts             # 建表 SQL + 自动迁移
│   └── create-schema.ts         # 数据库初始化脚本
├── scripts/
│   ├── dev-unified.js           # 统一开发服务器
│   └── package-exe.js           # exe 打包脚本
├── docs/                        # 专项文档
└── .env.example                 # 环境变量模板
```

## 安全设计

- **监听地址** — 默认绑定 `127.0.0.1`，防止局域网未授权访问
- **CORS 白名单** — 仅允许 `localhost` 和 `127.0.0.1` 来源的跨域请求
- **DTO 校验** — 所有接口入参通过 `class-validator` + `ValidationPipe` 严格校验，非法参数被拒绝
- **AI Key 运行时配置** — 仅存内存，重启失效，前端明确提示"仅本次运行生效"
- **敏感文件隔离** — 日志、数据库、构建产物已排除出源码包

## 详细文档

- [自动登录机制](docs/AUTO_LOGIN.md) — Cookie 管理、自动登录流程和故障排查
- [AI 文案集成](docs/DEEPSEEK-INTEGRATION.md) — DeepSeek 配置、降级策略和成本说明
- [打包与优化](docs/PACKAGING.md) — exe 打包流程、体积优化和运行时要求
- [性能优化](docs/PERFORMANCE.md) — 缓存策略、并发控制和调优建议
- [开发者指南](开发者指南.md) — 项目结构、开发规范、测试和贡献流程
