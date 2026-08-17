# 内容运营平台

本地生活套餐推广运营中台，基于 JeeSite 实时数据实现套餐销售监测、推广优先级排序、AI/规则文案生成、人工审核、社群分发和效果回流的全链路闭环。

> **当前状态（2026-08-17）**：用户目录、用户生命周期和规则标签已统一使用最近一次成功的 JeeSite 会员目录快照；API 启动后默认自动触发一次受控串行同步（可用 `USER_CENTER_REFRESH_ON_STARTUP=false` 关闭），同步完成后才原子切换活动快照，失败或重启中断会继续保留旧快照，两个页面会接续显示活动任务进度。商品管理刷新会等待商家同步完成后再读取本地快照，商品冲突更新会覆盖最新售卖起止时间，详情按北京时间显示到时分，库存列表优先展示有剩余量的 SKU；商品中心保留商品管理和独立的组合套餐入口，原与商品管理重复的套餐管理入口已收口，旧 `/packages` 路径跳转到 `/products`。订单、履约和卡券关联页面保持只读。门店管理的“刷新外部门店数据”现在串行抓取 `core/corePartnerShop/listData`，按外部门店 ID 幂等写入门店坐标，完整成功后才切换本地门店快照；GMV 区域分布优先使用门店坐标匹配深圳区中心点。生命周期页的“同步并刷新”仍支持手动立即触发，规则标签可覆盖目录中的完整用户集合。P0-03 迁移基线与 P0-04 关键写入幂等已完成并通过非 EXE 门禁；Windows Desktop、EXE、安装器、`win-unpacked` 和安装后真实进程验收明确延期，详见 [文档对齐总览](docs/DOCUMENTATION-STATUS.md)。

## 核心功能

**运营作战台** — 一屏看清今日必推、风险、爆品机会、滞销套餐和社群任务，60 秒自动刷新，支持按角色切换视角。

**套餐推荐排序** — 综合推广分、库存健康度、销售转化率、区域匹配度等多维指标，为每个套餐生成优先级排序和推荐策略。

**AI 文案生成** — 集成 DeepSeek 等大模型，根据套餐事实（价格、库存、明细、使用规则）和渠道特点（微信群、朋友圈、商家转发）生成个性化推广文案，内置禁用词审核和质量校验。

**套餐详情解析** — 自动抓取并解析套餐详情页富文本，提取结构化套餐内容（分组、品名、数量），支持三种解析策略择优。

**预警与审核** — 自动识别高危/警告级运营风险，提供文案审核工作流，支持机器初审 + 人工复审。

**社群运营** — 基于社群画像（人群类型、偏好品类、历史转化）自动匹配今日推荐套餐，生成推送时间表和作战卡。

**效果看板** — 追踪文案生成量、审核通过率、GMV、转化率等关键指标，支持昨日复盘和趋势分析。

**用户中心与生命周期** — 用户中心保留完整 JeeSite 会员目录快照，用户看板展示用户总数及按源站注册时间统计的今日、本周（周一至今）、本月（每月 1 日至今）新增用户；生命周期按付费行为和目录活动时间分层。服务启动和显式同步都采用后台串行分页，先写入新代暂存区，成功后原子切换，失败时保留上一次成功快照。

**标签管理** — 规则预览、创建、评估和定时同步都基于最近一次成功的完整会员目录，目录中尚未进入本地 `Member` 表的用户会在建立标签关系前补齐最小档案。

**门店与区域分析** — 门店管理可从 JeeSite `corePartnerShop/listData` 后台串行同步完整合作商店铺目录；外部门店 ID、商家 ID、地址、状态和经纬度幂等写入本地，失败时保留旧数据，GMV 区域分析优先按门店坐标归属深圳行政区。

**商家提货分** — 提货分页面从 JeeSite `corePartnerAccountRecord/listData` 读取合作商账户记录 JSON，按 `corePartnerId` 聚合 `availableCommodityPoint`，只计入 `state=1` 的有效记录；同步任务串行分页，完整成功后原子切换本地快照，外部接口失败不会清空上次成功数据。提货分以两位小数的整数单位保存，页面只读展示，不提供本地创建或调整账户。

**商品与订单数据中台** — 商品 SKU 列表从本地 `ContentPackage` 快照读取，手动同步采用单飞等待并在持久化完成后重新加载；商品中心保留商品管理和独立的组合套餐入口，原重复的套餐管理入口不再展示；砍价商品的 `bargainCommodityDynamic` 支持对象和 JSON 字符串两种返回形态，并明确拆分为 `initialInventoryTotal`（初始库存）、`inventoryTotal`（现在库存）和 `hasInventory`（当日库存）；商品页提供 `pending`、`selling`、`recycle` 三种状态筛选，售卖时间从外部字段同步更新并在详情显示到时分。订单中心拆分展示线上支付、余额支付和实付合计；订单中心、物流单、卡批次和卡券页只展示订单相关数据，不提供核销、退款、库存回补、发货或卡券状态写操作。

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
│              Prisma Client  →  SQLite (prisma/dev.db)  │
└────────────────────────────────────────────────────────┘
```

前端使用 Vue 3 + TypeScript + Vite 构建，Element Plus 组件库按需自动导入，ECharts 绘制图表，Pinia 管理角色状态。后端使用 NestJS 框架，Prisma Client 访问 SQLite 数据库，支持运行时 AI 配置和自动登录。项目通过 npm workspaces 管理三个包：`@content/shared`（共享类型）、`@content/api`（后端）、`@content/web`（前端）。

## 快速开始

### 一键启动（Windows）

双击项目根目录下的 `start.bat`，脚本会自动完成环境检查、依赖安装、数据库初始化和服务启动，最后自动打开浏览器访问 `http://localhost:3100`。

### 手动启动

```bash
# 使用 npm（与 CI 一致；package-lock.json 为唯一锁文件）
npm install
npm run prepare:db       # 初始化 SQLite 表结构
npm run dev              # 启动前后端开发服务器
```

访问 `http://localhost:3100`。开发时后端 API 运行在内部端口 3101，前端通过 Vite 代理统一从 3100 端口提供 `/api` 访问。

### Windows Desktop / EXE（当前延期）

Windows 打包、安装器、`win-unpacked` 和 EXE smoke 不属于当前优化范围，本轮不执行 `build:exe` 或 `package:exe`。后续恢复桌面发布时，以 [打包优化文档](docs/PACKAGING.md) 的运行时配置、用户目录数据库和安全扫描要求为准；不要把 `.env`、Cookie 或数据库复制到安装包。

## 环境变量

复制 `.env.example` 为 `.env`，按需配置以下变量：

### 必须配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EXTERNAL_API_BASE_URL` | JeeSite 后台地址 | `https://zdm.zhsh1.cn/a` |
| `EXTERNAL_API_USERNAME` | JeeSite 登录用户名 | — |
| `EXTERNAL_API_PASSWORD` | JeeSite 登录密码 | — |

配置用户名密码后系统会自动处理登录和 Cookie 刷新，详见 [自动登录文档](docs/AUTO_LOGIN.md)。

门店管理刷新默认读取 `/core/corePartnerShop/listData?pageSize=100&pageNo=1`；如外部部署路径不同，可用 `EXTERNAL_PARTNER_SHOPS_PATH` 覆盖。`PARTNER_SHOP_REFRESH_PAGE_SIZE` 和 `PARTNER_SHOP_REFRESH_INTERVAL_MS` 控制门店目录的串行分页大小与页间等待。

提货分同步默认读取 `/core/corePartnerAccountRecord/listData?pageSize=100&pageNo=1`；如外部部署路径不同，可用 `EXTERNAL_PARTNER_ACCOUNT_RECORDS_PATH` 覆盖。`PARTNER_ACCOUNT_REFRESH_PAGE_SIZE` 和 `PARTNER_ACCOUNT_REFRESH_INTERVAL_MS` 控制提货分目录的串行分页大小与页间等待。

### 用户目录同步（可选开关）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `USER_CENTER_REFRESH_ON_STARTUP` | API 启动后是否自动触发一次受控会员目录同步；设为 `false` 可关闭 | `true` |

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
| `EXTERNAL_FETCH_CONCURRENCY` | 分页并发数（默认 2，硬上限 4） | `2` |

### 服务配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | API 服务端口 | `3100` |
| `HOST` | 监听地址 | `127.0.0.1` |
| `DATABASE_URL` | SQLite 数据库路径 | `file:./prisma/dev.db` |

`HOST` 默认绑定 `127.0.0.1` 防止局域网暴露。如需局域网访问，设置 `HOST=0.0.0.0`。

## 金钱数据真源（GMV / Overview / 退款）

运营看板金额统一口径（**bonus 不进 GMV 分母**）：

| 层级 | 角色 |
|------|------|
| **OrderHeader** | 真源。今日 KPI 始终直读；历史日无缓存时回退到 OH |
| **DailyMetrics** | 预聚合缓存。历史趋势优先读 DM；GMV 刷新 / `etl-orders` 写 OH 后会 **range recompute** |
| **PackageSalesDaily.salesAmount** | 套餐日金额，由 OH 按 `packageId` + 北京日汇总写入（库存 diff 只负责 `salesQty`） |
| **SalesSnapshot** | **不参与** GMV / Overview / 退款金钱读路径（内容推荐内存形状可保留） |

刷新方式（无内置定时调度）：

1. 前端 GMV 看板「刷新 / 回填」→ 拉 JeSite 订单 → recompute DM + PSD.salesAmount + 商家日指标  
2. `npx tsx scripts/etl-orders.ts <start> <end>`（需绝对 `DATABASE_URL` 与 JeSite cookie）  
3. `npx tsx scripts/backfill-daily-metrics.ts` / `backfill-sales-daily.ts`（金额 pass 含在后者）

分账结算入口为建设中占位，不代表已有结算真源。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动前后端开发服务器 |
| `npm run build` | 构建 shared → api → web 三个包 |
| `npm run typecheck` | API、Web 和 shared 类型检查 |
| `npm run test:unit -w @content/api` | API 单元测试 |
| `npm run test:integration -w @content/api` | API 集成测试 |
| `npm run test:behavior -w @content/web` | Web 行为回归 |
| `npm run test:legacy -w @content/web` | Web 兼容/历史 pin 回归 |
| `npm run lint:check` | ESLint 静态检查 |
| `npm run format:check` | Prettier 格式检查 |
| `npm run check:integrity` | 源码导入完整性检查 |
| `npm run db:validate` | Prisma Schema 校验 |
| `npm run db:drift-check` | 迁移、Schema、实际数据库三路径漂移检查 |
| `npm test` | 完整测试入口；结果以当次输出和持续优化报告为准 |
| `npm run prepare:db` | 初始化 / 更新 SQLite 表结构 |
| `npm run db:purge-mock` | 清除数据库中的 mock 数据 |

## API 接口概览

核心套餐与文案接口前缀为 `/api/content`；活动、任务、GMV、IAM、数据分析、商家和社群等平台域使用各自的 `/api/*` 前缀，返回 JSON。以各模块 Controller 和当前 OpenAPI/测试契约为准。

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
| 用户中心 | GET | `/user-center/lifecycle` | 用户生命周期汇总与分层列表 |
| 用户中心 | POST | `/user-center/members/refresh` | 启动后台串行刷新 JeeSite 会员目录 |
| 用户中心 | GET | `/user-center/members/refresh/active` | 查询当前活动的会员目录刷新任务 |
| 用户中心 | GET | `/user-center/members/refresh/:jobId` | 查询会员目录刷新进度 |
| 预警 | GET | `/alerts` | 运营预警列表（支持分页） |
| 预警 | POST | `/alerts/:id/resolve` | 处理单条预警 |
| 社群 | GET | `/communities` | 社群匹配列表 |
| AI | GET | `/ai-copy/status` | AI 配置状态 |
| AI | POST | `/ai-copy/config` | 更新 AI 配置（运行时） |
| 库存 | POST | `/inventory/daily-crawl` | 触发每日库存抓取 |
| 健康 | GET | `/health` | 系统健康检查 |

关键写入接口（任务创建/批量创建/发布、活动启动、社群批量导入、GMV 回填）要求 `Idempotency-Key`，同一业务意图重试会重放成功结果，负载不同时返回 `409`；详见持续优化报告中的 P0-04 条目。

会员目录的普通列表和生命周期读取不在请求内重新扫描 JeeSite；API 启动后会自动触发一次受控全量同步，也可由有权限用户通过 `/user-center/members/refresh` 手动触发，页面通过 `/user-center/members/refresh/active` 接续任务，只有任务完成后才读取新的活动快照。外部接口凭证、Cookie 和实际外部数据质量仍需在目标环境单独验收。

商品管理的刷新会等待商家数据同步的最终结果，再读取更新后的 `ContentPackage`；商品读取接口发送 no-cache 请求。商品页同时展示初始库存、现在库存和当日库存，其中 `stockTotal/stockLeft` 继续兼容旧的总量/余量读路径，`currentStock` 持久化 `inventoryTotal`。商品列表按 `stockLeft` 降序展示，避免售罄 SKU 把第一页全部占满；这只是展示排序，不会改写库存。商品状态筛选通过 URL 和 API 查询贯通 `pending`、`selling`、`recycle` 三种状态。订单相关页面及其 API 只保留查询和历史流水读取，业务核销、退款、库存调整、发货和卡券状态变更不属于当前中台操作范围。

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
│   │   │   └── prisma/          # 数据库服务（启动只读结构检查）
│   │   └── test/                # API unit / integration / legacy 测试
│   └── web/                     # Vue 3 前端
│       ├── src/
│       │   ├── components/      # 通用组件（布局、骨架屏、空状态等）
│       │   ├── composables/     # 组合式函数
│       │   ├── services/        # API 调用层
│       │   ├── stores/          # Pinia 状态管理
│       │   └── views/           # 页面视图（9 个）
│       └── vite.config.ts       # Vite 配置（代理、分包策略）
├── packages/
│   └── shared/                  # 前后端共享类型定义
├── prisma/
│   ├── schema.prisma            # 数据模型契约
│   ├── seed-data.ts             # 重放未应用迁移（不含运行时 DDL）
│   └── create-schema.ts         # 数据库初始化脚本
├── scripts/
│   ├── dev-unified.js           # 统一开发服务器
│   └── package-exe.js           # Windows 打包脚本（当前延期）
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
- [打包与优化](docs/PACKAGING.md) — Windows 发布流程和运行时要求（当前延期）
- [性能优化](docs/PERFORMANCE.md) — 缓存策略、并发控制和调优建议
- [开发者指南](开发者指南.md) — 项目结构、开发规范、测试和贡献流程
- [文档对齐总览](docs/DOCUMENTATION-STATUS.md) — 当前状态、验证证据、历史文档与延期边界
