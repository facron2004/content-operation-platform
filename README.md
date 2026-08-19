# 内容运营与增长中台 (Content Operations Platform)

本地生活套餐推广运营与经营增长中台，基于 JeeSite 实时业务数据实现套餐销售监测、推广优先级排序、AI/规则文案生成、人工审核、社群分发、经营驾驶舱、用户生命周期管理、财务对账与提货分管理的全链路闭环。

> **当前系统状态（2026-08-18）**：
> - **架构与全栈基线**：全栈 TypeScript Monorepo，34 个后端 NestJS 领域模块，前端 Vue 3 + Pinia + Element Plus + ECharts（50+ 业务视图与特性分层），前后端共享 `@content/shared` 类型与工具包。
> - **金钱精度真源**：全链路采用分整数（`BigInt` / `*Fen`）与 `MoneyView` 响应拦截器对外输出格式化金额，`OrderHeader` 作为经营金额唯一真源，`DailyMetrics` 范围重算与商家日汇总保持 0 分差异。
> - **用户中心与会员目录**：全量会员目录采用后台受控串行分页抓取与新代 staging 写入，增量同步读到活动快照的最新旧用户即停止，单事务更新活动快照指针；支持服务启动自动同步（`USER_CENTER_REFRESH_ON_STARTUP`）与前端接续轮询，新增用户按北京时间自然天/自然周/自然月精准统计。
> - **商品中心与三库存模型**：砍价商品结构适配对象与 JSON 字符串两种形态，拆分初始库存（`initialStock`）、现在库存（`currentStock`）与当日库存（`dailyStock`）；列表默认按剩余量降序展示，状态筛选（待售/销售中/已回收）全链路贯通；收口重复套餐入口，组合套餐独立维护。
> - **门店与区域分布**：门店管理串行抓取 JeeSite 合作商店铺数据，按外部门店 ID 幂等落库经纬度与区域编码，GMV 区域分析优先按门店坐标归属深圳 9 个行政区。
> - **商家提货分与财务中心**：提货分从合作商账户记录聚合有效可用分（分整数储存），采用活动快照机制只读呈现；订单中心拆分展示线上支付、余额支付与实付合计，严格保留只读安全边界。
> - **幂等写入与 Outbox 事务**：关键写接口（任务/活动/回填/社群导入）要求 `Idempotency-Key` 守卫，Outbox 事务事件分发与指数退避重试实现强一致副作用。
> - **开发与构建验证**：全量源码导入完整性校验（1,221 源码文件，0 未解析导入）、Prisma 模式校验、TypeScript 类型检查及 ESLint 均已通过。

---

## 目录

- [核心功能模块](#核心功能模块)
- [系统技术架构](#系统技术架构)
- [快速开始](#快速开始)
- [启动脚本说明](#启动脚本说明)
- [环境变量配置](#环境变量配置)
- [金钱数据真源与精度规范](#金钱数据真源与精度规范)
- [API 接口概览](#api-接口概览)
- [角色与权限体系](#角色与权限体系)
- [项目目录结构](#项目目录结构)
- [常用开发与测试命令](#常用开发与测试命令)
- [安全设计规范](#安全设计规范)
- [详细专项文档](#详细专项文档)

---

## 核心功能模块

### 1. 经营看板与作战台
- **经营驾驶舱 (Overview / GMV Cockpit)**：全景展示总 GMV、今日实时成交、实付/余额支付拆分、退款率、核销率、品类分布与区域热力分布。
- **今日运营 (Today Operations)**：实时监控今日必推套餐、异常风险、爆品动销机会与社群推送日程。
- **动销分析 (Movement Analysis)**：动销与不动销 SKU 深度监控，15 天/30 天未销滞销预警与库存风险下钻。

### 2. 套餐推荐与智能创作
- **套餐推荐排序 (Recommendations)**：基于推广评分、库存健康度、转化率、区域画像等多维算法，实时生成推荐权重与运营标签。
- **单套餐深度分析 (Package Analysis)**：套餐详情富文本抓取与 HTML 结构化解析（分组、品名、数量），全生命周期销量与动销漏斗。
- **AI 智能文案生成 (Generate)**：接入 DeepSeek / OpenAI / 本地规则引擎，支持微信群、朋友圈、商家群等多渠道定制文案，内置违禁词过滤与事实校验。
- **文案审核中心 (Audit)**：机器初审 + 人工复审双轨制，保证推广文案合规与转化质量。

### 3. 用户中心与生命周期
- **会员目录增量同步**：从源站第 1 页开始串行抓取，读取到活动快照的最新旧用户后停止，只写入边界之前的新用户；网络异常或边界缺失时不宣称同步完成。
- **全量会员目录快照**：串行分页抓取源站会员目录，新代暂存 + 原子快照切换，网络异常时保留上一次成功快照。
- **用户生命周期分层**：基于付费行为与活跃度将用户分层（新客、高潜、成熟、沉睡、流失）。
- **规则标签管理 (User Tags)**：基于全量会员事实进行动态规则评估与打标，自动补齐未建档会员。
- **新增用户精准看板**：北京时间维度自然日（今日）、自然周（周一至今）、自然月（1日至今）新增会员统计。

### 4. 商品中心与库存中台
- **三库存口径模型**：明确区分初始库存（`initialStock`）、现在库存（`currentStock`）与当日库存（`dailyStock`）。
- **商品状态流转**：支持 `pending`（待售）、`selling`（销售中）、`recycle`（已回收）三种状态筛选与 URL 同步。
- **组合套餐管理 (Package Combinations)**：独立的组合套餐创建、关联品类与启停控制。

### 5. 订单中心与交易审计
- **订单金额透明化**：拆分展示线上支付金额、余额抵扣金额与实付合计，杜绝前端浮点精度损失。
- **只读中台边界**：订单中心、履约物流、卡批次与卡券页面专注数据聚合与交易流水审计，写操作严格收敛。

### 6. 门店与商家中台
- **门店经纬度与区域归属**：从 JeeSite 合作商店铺同步门店主数据，精准匹配深圳 9 大行政区。
- **商家销售看板 (Merchant Sales)**：商家维度 GMV、订单量、退款率、核销率排行与多周期对比。
- **商家评分体系 (Merchant Scores)**：基于履约表现、动销率和退款指标对商家进行健康度打分。
- **提货分快照管理 (Pickup Points)**：聚合合作商有效账户记录，只读呈现商家提货分快照。

### 7. 营销增长与任务分发
- **任务中心 (Task Center)**：分发任务创建、审核、发布与执行进度跟踪，支持批量发布与模板复用。
- **社群分发库 (Community Library)**：社群画像匹配、群主对接与精准推送计划。
- **私域营销与 CRM 线索 (Marketing Private & CRM Leads)**：私域线索跟进、客户触达任务与转化漏斗分析。
- **福利点与会员积分 (Welfare & Integral)**：积分流水、福利点发放与兑换明细监控。

---

## 系统技术架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Vue 3 + Element Plus + ECharts                     │
│  Dashboard │ Operation │ Products │ Orders │ Users │ Finance │ Marketing │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ /api  (Vite Proxy → :3101)
┌────────────────────────────────────┴────────────────────────────────────┐
│                    NestJS API Application (Port 3101)                   │
│                                                                         │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌────────────────┐  │
│  │   Idempotency Guard   │ │   Auth / Desktop     │ │ MoneyView      │  │
│  │   (@RequireIdempotency) │ (Cookie-only / HMAC) │ │ (Integer Fen)  │  │
│  └───────────────────────┘ └──────────────────────┘ └────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 核心领域模块 (34 Modules):                                        │  │
│  │ • content / gmv / overview / movement / operation / refund       │  │
│  │ • product-center / order-center / user-center / finance-center    │  │
│  │ • merchant / merchant-sales / stores / gap-center                │  │
│  │ • distribution-task / campaign / community / marketing-private    │  │
│  │ • welfare-point / member-integral / audit-log / user-access      │  │
│  │ • ai-copy / package-detail / jobs / outbox                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│  ┌─────────────────────────────────┴─────────────────────────────────┐  │
│  │ 外部服务与基础设施集成:                                            │  │
│  │ • DataSourceService / AutoLoginService ── JeeSite REST API        │  │
│  │ • AICopyService ── DeepSeek / OpenAI / 本地模版引擎               │  │
│  │ • OutboxProcessor ── 事务消息持久化与重试调度                     │  │
│  │ • Prisma Client (LibSQL / SQLite Adapter) ── prisma/dev.db        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **前端架构**：Vue 3 Composition API + TypeScript + Vite + Pinia + Vue Router + Element Plus + ECharts。组件与页面采用样式解耦分层（`src/styles/views/` 与 `src/styles/components/`）。
- **后端架构**：NestJS 模块化分层架构 + class-validator DTO 强校验 + 全局拦截器（BigInt 序列化、MoneyView 金额视图）。
- **数据存储**：SQLite 数据库，Prisma Client 访问，数据库唯一结构真源为 `prisma/migrations`（已完成 0001 至 0029 号迁移）。
- **前后端共享**：`@content/shared` 提供统一的类型定义、枚举、金额分转换函数与只读校验器。

---

## 快速开始

### 依赖环境要求

- **Node.js**：`>=20.0.0 <23`
- **npm**：`>=10.0.0`
- **操作系统**：Windows 10/11 / macOS / Linux

### 一键启动（Windows）

项目根目录下提供了多套开箱即用的批处理脚本：

- `start.bat` — **完整一键启动**：自动检测环境、安装依赖、初始化数据库并启动开发服务器，随后打开浏览器。
- `start-quick.bat` — **快速免安装启动**：跳过依赖安装，直接启动前后端。
- `stop-quick.bat` — **一键停止**：安全终止端口 3100 与 3101 的服务进程。
- `start-api-3101.bat` — **独立启动后端**（端口 3101）。
- `start-web-3100.bat` — **独立启动前端**（端口 3100，代理 `/api` 到 3101）。

### 手动命令行启动

```bash
# 1. 克隆代码并安装依赖（使用 npm workspaces）
npm install

# 2. 复制环境变量文件
cp .env.example .env

# 3. 初始化数据库表结构与迁移
npm run prepare:db

# 4. 启动前后端联合开发服务器
npm run dev
```

启动完成后，访问 **`http://localhost:3100`** 即可进入系统。

---

## 环境变量配置

复制 `.env.example` 为 `.env`，按需配置以下环境变量：

### 1. 外部 JeeSite 数据源（必填）

| 变量名 | 说明 | 默认值 / 示例 |
|--------|------|---------------|
| `EXTERNAL_API_BASE_URL` | JeeSite API 基础地址 | `https://zdm.zhsh1.cn/a` |
| `EXTERNAL_API_USERNAME` | JeeSite 登录账号 | `your_username` |
| `EXTERNAL_API_PASSWORD` | JeeSite 登录密码 | `your_password` |
| `EXTERNAL_API_COOKIE` | 可选的手动 Cookie 兜底 | `""` |
| `EXTERNAL_PARTNER_SHOPS_PATH` | 合作商店铺数据路径 | `/core/corePartnerShop/listData` |
| `EXTERNAL_PARTNER_ACCOUNT_RECORDS_PATH` | 合作商账户记录路径 | `/core/corePartnerAccountRecord/listData` |

### 2. 会员目录与后台同步配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `USER_CENTER_REFRESH_ON_STARTUP` | API 启动后是否自动触发一次受控会员目录同步 | `true` |
| `PARTNER_SHOP_REFRESH_PAGE_SIZE` | 门店数据单页抓取数量 | `100` |
| `PARTNER_ACCOUNT_REFRESH_PAGE_SIZE` | 提货分账户记录单页抓取数量 | `100` |

### 3. AI 文案模型配置（可选）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `AI_PROVIDER` | AI 提供商标识 (`deepseek` / `openai` / `template`) | `template` |
| `AI_API_KEY` / `DEEPSEEK_API_KEY` | 大模型 API Key | `""` |
| `AI_API_BASE_URL` | 大模型 API Base URL | `https://api.deepseek.com/v1` |
| `AI_MODEL` | 使用的模型名称 | `deepseek-chat` |

### 4. 缓存与抓取性能调优

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CONTENT_CACHE_TTL_MS` | 业务内存缓存有效期（毫秒） | `300000` (5分钟) |
| `EXTERNAL_FETCH_TIMEOUT_MS` | 外部 API 单次请求超时时间（毫秒） | `8000` (8秒) |
| `EXTERNAL_FETCH_CONCURRENCY` | 外部抓取并发数（默认 2，硬上限 4） | `2` |

### 5. 服务监听配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | API 内部服务端口 | `3101` |
| `HOST` | 监听地址（生产绑定回环地址） | `127.0.0.1` |
| `DATABASE_URL` | SQLite 数据库路径 | `file:./prisma/dev.db` |

---

## 金钱数据真源与精度规范

系统严格遵循分整数（`BigInt` / `*Fen`）金钱精度规范，消除 JavaScript 浮点数计算误差：

```
┌────────────────────────────────────────────────────────┐
│ 数据存储: SQLite 数据库 (*Fen 字段存储为 BigInt 整数)    │
│   ├── OrderHeader.paidAmountFen                        │
│   ├── OrderHeader.paidAmountWalletFen (余额抵扣)        │
│   └── DailyMetrics.totalGmvFen                         │
├────────────────────────────────────────────────────────┤
│ 数据读出: MoneyView 全局拦截器                          │
│   ├── 保留 *Fen: string (防止前端 64 位整数溢出)        │
│   └── 自动注入 *Display: string (格式化为两位小数 "39.90")│
├────────────────────────────────────────────────────────┤
│ 统计口径: OrderHeader 为唯一真源                        │
│   ├── 今日 KPI: 实时直读 OrderHeader                   │
│   ├── 历史趋势: 优先读取 DailyMetrics 预聚合数据        │
│   └── 单数口径: 退款率/核销率按订单单数计算             │
└────────────────────────────────────────────────────────┘
```

- **对账校验工具**：
  ```bash
  npm run db:reconcile        # 扫描 10 个金钱模型，输出对账报告
  npm run db:reconcile:fix    # 自动修复差异并补齐分字段
  ```

---

## API 接口概览

| 模块域 | 请求方法 | 路由路径 | 接口功能与描述 |
|--------|----------|----------|----------------|
| **套餐与推荐** | GET | `/api/content/packages/recommend` | 获取推荐套餐列表（支持多维评分与角色过滤） |
| | GET | `/api/content/packages/categories` | 获取套餐全部分类 |
| | GET | `/api/content/packages/:id/analysis`| 单套餐深度动销分析 |
| | GET | `/api/content/packages/:id/detail`  | 套餐详情抓取与解析 |
| **文案与审核** | POST | `/api/content/generate` | 生成推广文案（AI 或模板引擎） |
| | GET | `/api/content/copies` | 获取文案列表（支持状态过滤） |
| | POST | `/api/content/copies/:id/audit` | 人工审核文案 |
| **经营作战台** | GET | `/api/content/ops/today` | 今日运营作战台核心指标 |
| | GET | `/api/content/ops/review` | 昨日运营数据复盘 |
| | GET | `/api/overview` | 全景经营概览 |
| | GET | `/api/operation/workbench` | 运营工作台数据 |
| **GMV 与分析** | GET | `/api/gmv/summary` | GMV 汇总指标（实付/余额拆分） |
| | GET | `/api/gmv/trend` | GMV 历史趋势分析 |
| | GET | `/api/gmv/merchants/top` | Top 商家 GMV 排行 |
| | POST | `/api/gmv/backfill` | 历史 GMV 数据回填（需幂等键） |
| | GET | `/api/data-analysis/trend` | 多维运营数据分析 |
| **用户与会员** | GET | `/api/user-center/summary` | 用户中心汇总（含日/周/月新增） |
| | GET | `/api/user-center/lifecycle` | 用户生命周期分层数据 |
| | POST | `/api/user-center/members/refresh` | 触发会员目录后台同步任务 |
| | POST | `/api/user-center/members/refresh/incremental` | 读取旧库最新用户并增量同步新增会员 |
| | GET | `/api/user-center/members/refresh/active` | 查询当前正在运行的同步任务 |
| | GET | `/api/user-center/members/refresh/:jobId` | 查询同步任务实时进度 |
| **商品中心** | GET | `/api/product-center/packages` | 商品 SKU 列表（三库存模型与状态筛选） |
| | GET | `/api/product-center/summary` | 商品库存与在售汇总 |
| | POST | `/api/gap-center/package-combinations` | 组合套餐创建与管理 |
| **订单中台** | GET | `/api/order-center/orders` | 订单列表与交易明细（只读） |
| | GET | `/api/order-center/summary` | 订单金额汇总（线上/余额/合计） |
| **财务与提货分**| GET | `/api/finance-center/pickup-points` | 商家提货分快照列表 |
| | POST | `/api/finance-center/pickup-points/refresh`| 启动提货分同步任务 |
| | GET | `/api/finance-center/summary` | 财务资产概览与流水 |
| **门店与商家** | GET | `/api/stores` | 门店列表（含经纬度与区域归属） |
| | POST | `/api/stores/refresh` | 触发合作商店铺目录后台刷新 |
| | GET | `/api/merchant-sales/ranking` | 商家销售多维排行榜 |
| | GET | `/api/gap-center/merchant-scores` | 商家综合健康评分 |
| **任务与营销** | GET | `/api/distribution-tasks` | 任务中心分发任务列表 |
| | POST | `/api/distribution-tasks` | 创建任务（需幂等键） |
| | POST | `/api/distribution-tasks/:id/publish`| 发布任务并触发 Outbox 事件 |
| | GET | `/api/marketing-private/leads` | 私域客户线索列表 |
| **积分与福利** | GET | `/api/member-integral/records` | 会员积分变动明细 |
| | GET | `/api/welfare-points/summary` | 福利点发放与兑换汇总 |
| **系统与健康** | GET | `/api/health` | 系统健康与数据库连接检查 |
| | GET | `/api/ready` | 生产环境就绪检查 |

---

## 角色与权限体系

系统内置 5 大运营角色，前端与后端统一进行数据过滤与权限收口：

1. **平台运营 (Platform Ops)**：全局视角，跨区域、跨商家查看所有套餐、活动与经营数据。
2. **区域运营 (Regional Ops)**：按负责的行政区域进行数据隔离，聚焦本地生活套餐推广。
3. **商家运营 (Merchant Ops)**：按归属商家进行数据过滤，关注特定商家的商品与销售动态。
4. **审核人员 (Auditor)**：专注于文案审核队列与合规风险复核。
5. **系统管理员 (Admin)**：拥有全量数据访问、权限分配、系统参数与任务触发权限。

---

## 项目目录结构

```
Content Operation Platform/
├── apps/
│   ├── api/                     # NestJS 后端服务
│   │   ├── src/
│   │   │   ├── content/         # 核心套餐推荐与文案生成
│   │   │   ├── gmv/             # GMV 分析与回填
│   │   │   ├── user-center/     # 用户中心与会员目录快照
│   │   │   ├── product-center/  # 商品中心与三库存模型
│   │   │   ├── order-center/    # 订单中心与交易审计
│   │   │   ├── finance-center/  # 财务中心与提货分管理
│   │   │   ├── stores/          # 门店管理与地理坐标
│   │   │   ├── distribution-task/# 任务分发与状态流转
│   │   │   ├── marketing-private/# 私域营销与线索
│   │   │   ├── idempotency/     # 幂等性守卫与拦截器
│   │   │   ├── outbox/          # Outbox 事务事件引擎
│   │   │   ├── prisma/          # 数据库服务与扩展
│   │   │   └── main.ts          # API 启动入口
│   │   └── test/                # 单元测试与集成测试套件
│   ├── web/                     # Vue 3 前端应用
│   │   ├── src/
│   │   │   ├── features/        # 业务特性模块（composables / components）
│   │   │   ├── views/           # 页面视图组件（50+ 业务视图）
│   │   │   ├── services/        # API 接口定义与 HTTP 拦截管线
│   │   │   ├── stores/          # Pinia 状态管理
│   │   │   ├── styles/          # 解耦的全局、页面与组件样式
│   │   │   └── router-routes.ts # 路由树与权限映射
│   │   └── vite.config.ts       # Vite 构建与代理配置
│   └── desktop/                 # Electron 桌面端主进程（架构已就绪）
├── packages/
│   └── shared/                  # 前后端共享类型库与金额工具函数
├── prisma/
│   ├── schema.prisma            # Prisma 数据模型契约
│   ├── migrations/              # 数据库迁移历史（0001 - 0029）
│   └── create-schema.ts         # 数据库初始化脚本
├── scripts/                     # 运维、测试与构建脚本
├── docs/                        # 专项技术文档
├── start.bat                    # 一键启动脚本
├── package.json                 # Monorepo 依赖与脚本
└── .env.example                 # 环境变量模板
```

---

## 常用开发与测试命令

```bash
# 联合开发
npm run dev                      # 启动前后端联合开发服务器
npm run typecheck                # 全栈 TypeScript 类型检查
npm run build                    # 构建 shared → api → web

# 质量与安全检查
npm run lint:check               # 运行 ESLint 静态代码检查
npm run format:check             # 运行 Prettier 代码格式检查
npm run check:integrity          # 检查源码导入完整性（0 未解析）

# 数据库管理
npm run db:validate              # 校验 Prisma Schema
npm run db:migrate               # 应用数据库迁移
npm run db:drift-check           # 检查数据库 Schema 漂移
npm run db:reconcile             # 执行金钱分精度对账
npm run db:purge-mock            # 清除测试 Mock 数据

# 自动化测试
npm run test:unit -w @content/api        # 后端单元测试
npm run test:integration -w @content/api # 后端集成测试
npm run test:behavior -w @content/web    # 前端行为回归测试
npm test                                 # 完整测试套件执行
```

---

## 安全设计规范

- **网络隔离与回环绑定**：API 默认绑定 `127.0.0.1`，仅允许本地或经由前端代理访问，防止局域网直接暴露。
- **全方位 SSRF 防护**：外部抓取与 AI 请求实施 IP 白名单/黑名单校验与 DNS 解析拦截，拒绝私有网段探测。
- **DTO 严格白名单校验**：所有 API 请求均经过 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` 过滤，严禁多余字段注入。
- **写入幂等与并发锁**：关键写接口强制校验 `Idempotency-Key`，数据库唯一约束防重放，防止并发脏写。
- **敏感凭证防泄漏**：真实 `.env`、数据库文件、Cookie 缓存已在 `.gitignore` 与源码包打包脚本中严格排除。

---

## 详细专项文档

- [开发者指南](开发者指南.md) — 详细架构设计、编码规范与开发全流程指南
- [文档对齐总览](docs/DOCUMENTATION-STATUS.md) — 系统各模块最新实现状态与验证证据
- [自动登录机制](docs/AUTO_LOGIN.md) — JeeSite 会话管理、Cookie 轮转与重试机制
- [AI 文案集成指南](docs/DEEPSEEK-INTEGRATION.md) — DeepSeek / OpenAI 模型集成与降级策略
- [性能优化总结](docs/PERFORMANCE.md) — 多级缓存、并发控制与响应时间优化
- [用户体验优化总结](docs/UX_IMPROVEMENTS.md) — 错误隔离、加载骨架屏与交互设计
- [打包与桌面端规范](docs/PACKAGING.md) — Windows 发布流程与运行时隔离设计
- [Codex CLI 接入指南](docs/CODEX-AISENYU.md) — 本地 AI 辅助编程与网关配置
