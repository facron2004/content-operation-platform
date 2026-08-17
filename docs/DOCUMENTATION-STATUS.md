# 文档对齐总览

> 状态基线：2026-08-17（Asia/Shanghai）

本文档是当前代码与文档的统一入口。历史审计、设计稿和执行计划保留原始日期与结论；当历史记录与本文档冲突时，以当前代码、当前验证命令和本文档为准。

## 当前工作范围

本轮继续优化只覆盖 API、Web、shared、Prisma、脚本和文档。Windows Desktop、EXE、安装器、`win-unpacked` 以及安装后真实进程验收明确延期，不属于本轮完成证据；相关说明仅作为后续发布参考，不能当作当前已验收能力。

## 当前实现状态

| 项目 | 当前状态 | 证据 |
|------|----------|------|
| P0-03 数据库迁移基线 | 0015、0027、0028 源码/schema/policy 与实际开发库已对齐应用 | `npm run db:validate`、迁移策略校验通过；0027 增加会员目录 staging 与活动快照指针，0028 增加 `ContentPackage.currentStock`。`db:drift-check` 仍报告既有 15 张表的重定义漂移，未由本次库存字段引入 |
| P0-04 关键写入幂等 | 已完成 | `@RequireIdempotency`、400 缺失键、409 负载冲突、同键重放、竞态保护、失败记录重取、每日清理任务及前端业务意图键 |
| P1-05 Outbox 真闭环 | 代码与聚焦验收完成，开发库迁移待应用 | handler registry、`task.published` 事务 producer、真实审计 handler、失败重试/`nextRetryAt`/`failed`；API 聚焦 `26/26`，API build 通过 |
| API 行为 | 单元与 legacy 回归通过，集成有既有残差 | API unit `158` 文件 / `1139/1139`、legacy `103` 文件 / `410/410`；integration `8/9` 文件 / `38/39`，失败为既有 Excel 导出 zip 测试 |
| Web 行为 | 有无关残差 | behavior `90/91` 文件、`423/424` 测试通过；失败为既有 GMV 积分支付组合断言，未触及用户目录改动；本轮未因该失败进入 Web legacy |
| 类型、构建、完整性 | 当前非 EXE 门禁通过 | `npm run typecheck`、API build、Web build、`npm run check:integrity`（1199 个源码文件，未解析导入 0）和 `npm run db:validate` 通过 |
| 格式与静态检查 | ESLint 通过，保留既有格式/WIP边界 | `npm run lint:check` 为 `0 errors`、3 个既有 warning；本轮新增启动器与文档定向 Prettier 通过，未对用户已有脏文件整文件重排 |
| Windows 发布 | 延期 | 不执行 `build:exe`、`package:exe`、安装器、`win-unpacked` 或 EXE smoke |

## 2026-08-15 用户目录、生命周期与标签数据口径

本次问题修复已落地，新增活动刷新查询接口和 0027 原子快照迁移：

- **用户生命周期与用户管理**：`GET /api/user-center/lifecycle` 和用户管理列表均读取最近一次成功的会员目录活动快照；生命周期页和用户管理页的“同步用户数据”复用 `POST /api/user-center/members/refresh` 后台任务，并通过 `GET /api/user-center/members/refresh/active` 接续服务重启后的活动任务，完成后重新加载数据。API 启动默认自动发起一次同步，可用 `USER_CENTER_REFRESH_ON_STARTUP=false` 关闭；普通列表请求仍不会在请求内重新扫描 JeeSite。
- **低负载与失败保护**：目录任务保持单线程串行分页；新代数据先写 `MemberDirectoryRefreshEntry`，全部页面校验通过后，短事务只推进 `MemberDirectorySnapshotState` 活动指针，列表、看板、生命周期、规则标签、积分和福利回填按指针读取对应代数据，旧 `MemberDirectoryEntry` 作为迁移期间的兼容回退。外部分页异常、返回空集或服务重启中断时，不切换旧快照，页面继续显示上一次成功数据；旧 staging 清理在指针切换事务外执行，失败不会回滚新快照。
- **标签管理**：规则预览、规则标签创建/评估和活动规则定时同步均从最近一次成功的完整目录快照生成行为事实，并使用快照中的积分余额；匹配到但尚未进入本地 `Member` 表的用户，会在写入 `UserTagRelation` 前按批次补齐最小 `Member` 档案。手动打标签也支持目录中仅存在于快照的用户。

### 本次验证边界

| 层级 | 状态 | 证据或剩余动作 |
|------|------|----------------|
| 代码与回归 | 已实现 | 本轮 API unit `158` 文件 / `1139/1139`、legacy `103` 文件 / `410/410`、用户目录聚焦 `22/22` 通过；root `typecheck`、`db:validate`、迁移策略测试通过；API integration 有 1 个既有 Excel 导出 zip 残差 |
| 浏览器接线 | 待重跑 | 既有浏览器验证覆盖生命周期旧的 POST/轮询链路；本轮新增启动自动同步、活动任务接续和原子切换尚未在真实浏览器与目标实例重跑 |
| 外部 JeeSite 全量刷新 | 待目标环境验收 | 本次未在运行实例再次启动十万级真实全量拉取，避免重复给外部源制造负载；需由有权限用户在目标环境点击“同步并刷新”，确认任务完成、快照数量和外部数据时间 |
| Web 全量行为回归 | 有无关残差 | behavior `90/91` 文件、`423/424` 测试通过，1 个既有 GMV 积分支付组合断言失败；失败未触及本次用户目录/标签改动 |

## 2026-08-17 用户管理新增用户看板

用户管理看板新增“新增用户”指标卡，分别展示今日、本周和本月新增。统计使用北京时间的半开区间：今日从当日 00:00 起，本周从周一 00:00 起，本月从当月 1 日 00:00 起，均统计至下一自然日边界；外部会员模式只读取最近一次成功的 `MemberDirectoryEntry.sourceCreatedAt` 全量快照，本地回退使用 `Member.firstSeenAt`，没有完整外部快照时不显示伪造的 0。

### 本次验证边界

| 层级 | 状态 | 证据或剩余动作 |
|------|------|----------------|
| 日期口径 | 已通过 | 北京时间跨日、周一自然周起点、自然月起点聚焦测试覆盖 |
| API 与 Web 接线 | 已通过 | 用户中心聚焦测试 `15/15`、root typecheck、API build、Web build、定向 ESLint 和 `git diff --check` 通过；API summary 类型、活动目录聚合查询和用户看板卡片已接入 |
| 外部实时数据 | 待目标环境验收 | 需要在最近一次完整目录刷新完成后核对源站注册时间统计与 JeeSite 原始数据 |

## 2026-08-17 会员目录同步发布修复

本次修复解决了十六万级会员目录在发布阶段因 Prisma 5 秒交互事务超时而“全量已抓取、活动数据未变化”的问题：

- **发布流程**：抓取和分批写入 `MemberDirectoryRefreshEntry` 保持串行；发布时不再删除/复制整张 `MemberDirectoryEntry`，只在短事务中更新 `MemberDirectorySnapshotState`，切换后再在事务外清理旧 staging。
- **用户管理接线**：用户管理页新增“同步用户数据”按钮，启动后台全量任务并轮询进度；“刷新当前页”仍只做当前页查询，不会冒充全量同步。任务完成后重新拉取列表和今日/本周/本月新增看板。

### 本次验证边界

| 层级 | 状态 | 证据或剩余动作 |
|------|------|----------------|
| API 聚焦回归 | 已通过 | 用户目录、生命周期、规则标签、积分、福利和刷新任务共 `42/42`；发布测试确认事务只更新活动指针 |
| 类型、构建与 schema | 已通过 | root `typecheck`、API build、Web build、`db:validate`、定向 ESLint 和 `git diff --check` 通过 |
| 真实外部全量刷新 | 待目标环境验收 | 本次未重复拉取十六万级 JeeSite 数据以避免再次制造外部负载；部署/重启新代码后点击“同步用户数据”，确认任务完成、活动指针代次、总数和新增统计 |

## 2026-08-17 商品中心重复入口收口

商品中心保留“商品管理”作为商品与库存列表入口；原“套餐管理”与商品管理共用 `ProductCenterView.vue`，现已从侧栏和业务路由中移除。为兼容旧书签，访问 `/packages` 会跳转到 `/products`。“组合套餐”页面 `/packages/combinations` 是独立的组合创建与启停能力，继续保留。

### 本次验证边界

| 层级 | 状态 | 证据或剩余动作 |
|------|----------|----------------|
| 导航与路由 | 已实现 | 侧栏移除 `/packages`；旧路径重定向 `/products`；`/packages/combinations` 保留 |
| 回归验证 | 已通过 | `shell-layout-nav.spec.ts` 与 `router-permissions.spec.ts` 共 `12/12`；root `npm run typecheck`、Web build、定向 ESLint 和 `git diff --check` 通过；Prettier 仅保留基线已有的 `route-permissions.ts` 整文件格式提示 |

## 2026-08-16 商品库存与订单只读边界

本次商品管理与订单中台修复已落地：

- **商品刷新时序**：商家同步改为单飞 Promise；并发刷新会等待同一份同步结果，前端在同步持久化完成后才重新读取 `ContentPackage`，商品 GET 请求附带 no-cache 约束，避免“接口已更新但页面仍停留在旧快照”。完整外部分页成功后还会把本次目录中不存在的旧 `selling` SKU 标记为 `pending`，同步结果返回清理数量。
- **剩余库存口径**：砍价适配器读取 `bargainCommodityDynamic` 的对象或 JSON 字符串形态；`hasInventory` 优先作为剩余库存，`initialInventoryTotal`、`inventoryTotal` 等作为总库存候选，并保留顶层字段兜底。商品列表改为 `stockLeft DESC`，所以第一页先看到有余量 SKU；这不会把售罄 SKU 从统计中删除。
- **三库存口径**：外部 `initialInventoryTotal` 写入初始库存（兼容字段 `stockTotal`），`inventoryTotal` 写入现在库存（新增 `ContentPackage.currentStock`），`hasInventory` 写入当日库存（兼容字段 `stockLeft`）。商品列表、详情和汇总同时返回/展示 `initialStock`、`currentStock`、`dailyStock`；没有 `inventoryTotal` 的旧数据按当日库存回填，下一次完整同步会纠正。
- **商品状态筛选**：商品管理和库存中心共用 `pending`（待售）、`selling`（销售中）、`recycle`（已回收）三种状态筛选；筛选值同步写入 URL，并由 API 传入后端查询，默认“全部状态”不传伪造的 `all` 状态。
- **售卖时间一致性**：JeeSite 的顶层 `startDate/expireDate` 与 `bargainCommodityDynamic` 嵌套时间字段统一解析，兼容日期文本及秒/毫秒时间戳；商品同步保留 `pending/selling/recycle` 三种外部状态，冲突更新会同步覆盖 `ContentPackage.startTime/endTime`，不再因只更新库存和状态而保留旧时间。详情页按北京时间显示到时分。当前实例全量同步成功写入 `2874/2874`，本地状态为 `pending=1089`、`selling=747`、`recycle=1039`；其中部分外部商品本来就是同日售卖，不能仅凭起止日期相同判定为错误。
- **订单相关只读**：订单中心移除核销、退款申请、退款完成和库存回补写路由；物流单、卡批次、卡券页移除发货、创建、激活、冻结和核销写操作，只保留查询、筛选、详情及历史流水展示。商品编辑申请仍是商品资料流程，不属于订单写操作。

### 本次验证边界

| 层级 | 状态 | 证据或剩余动作 |
|------|------|----------------|
| API 聚焦回归 | 已通过 | 商品中心状态筛选测试 `2/2` 通过；API build、root typecheck、`db:validate`、迁移策略 `6/6` 通过 |
| Web 构建与受影响行为 | 已通过 | Web build 通过；商品/订单只读权限与物流/卡券只读静态行为测试通过 |
| 浏览器商品页 | 已验证 | 最新同步后状态接口返回 `pending=145`、`selling=747`、`recycle=42`，每个结果页只含对应状态；页面点选待售后后仍保留 `?saleStatus=pending`。三库存和只读边界继续通过 |
| 售卖时间对账 | 已验证 | JeeSite 适配器与同步写入聚焦回归 `15/15`；三状态全量同步返回 `2874/2874`；原始外部样本与本地详情起止时间一致；浏览器详情显示 `2026/05/28 00:00 – 2027/05/28 00:00` |
| 订单写接口 | 已关闭 | 核销、退款、库存调整、物流写入和卡券写入的本地 POST/PATCH 验证返回 `404`；历史订单/交易记录仍可读 |
| 外部 JeeSite 实时数据 | 当前实例已验证 | 当前本地运行实例完整同步成功：`packagesCount=747`、`packagesPersisted=747`、`stalePackagesDeactivated=0`（此前残留已清理）；目标环境仍需按其有效 Cookie 再确认数据质量 |
| Web 全量行为回归 | 有无关残差 | 本次全量结果为 `90` 个文件、`422/423` 个用例通过；唯一失败仍是既有 GMV 积分支付组合断言，未触及本次商品/订单改动 |

## 2026-08-16 合作商店铺目录与 GMV 区域坐标

门店管理的外部刷新已接入 JeeSite 合作商店铺页对应的 `GET /core/corePartnerShop/listData`：后台任务按页串行抓取，外部认证失效会由服务端自动登录重试；全部页面成功后才在一个数据库事务中幂等更新 `Store` 与 `Merchant`，网络失败、空快照或写入失败均不清空旧门店数据。门店记录使用 `jeesite:<外部门店 id>` 作为稳定主键，来源标记为 `jeesite_partner_shop`，因此外部刷新记录为只读展示，不开放门店编辑覆盖。

GMV 区域分布会优先用 `ContentPackage.shopId` 对应的外部门店坐标，再回退到商家坐标；坐标交给深圳区中心点分类器，缺失或已知兜底中心坐标进入“未分区”。多店铺套餐只选第一个稳定店铺 ID，避免一笔订单因多个候选门店被重复计入。

### 本次验证边界

| 层级 | 状态 | 证据 |
|------|------|------|
| 外部 listData 结构 | 已验证 | 服务器端自动登录后返回 `count=1953`，字段包含 `id`、`corePartnerId`、`longitude`、`latitude`、`areaCode`、`areaName` |
| 完整门店落库 | 已验证 | 20 页串行、`1953/1953` 门店、`1075` 个商家坐标更新、`0` 跳过、`0` 错误；门店坐标 `1953/1953` |
| GMV 区域口径 | 已验证 | 实际开发库今日查询返回南山、福田、罗湖、龙华、宝安、盐田、坪山、光明、龙岗 9 个深圳区，非全量“未分区” |
| 浏览器接线 | 已验证 | 门店页点击刷新发出 `POST /api/stores/refresh`，随后轮询任务状态，最终显示“外部门店已同步：1,953 家”并重新加载带坐标的门店列表 |
| 只读边界 | 已实现 | 本链路只写 `Store`/`Merchant` 门店主数据，不调用订单、核销、退款、库存或物流写接口 |

## 2026-08-16 订单中心余额支付展示

订单中心已从 `OrderHeader.paidAmountWalletFen` 读取余额抵扣金额，并在订单汇总、列表和详情统一展示“线上支付”“余额支付”“实付合计”。实付合计由线上支付与余额支付的分整数相加得到，前端不做浮点金额运算。该改动仅扩展查询 DTO 和只读页面，不新增订单、核销、退款或库存写操作。

### 本次验证边界

| 层级 | 状态 | 证据 |
|------|------|------|
| API 回归 | 已通过 | `order-center.spec.ts` `1/1`，校验余额字段映射和汇总 |
| 类型与构建 | 已通过 | root `npm run typecheck`、API build、Web build、Prettier、`git diff --check` |
| 浏览器接线 | 已验证 | 真实订单列表显示余额支付；抽查余额订单显示线上 `¥50.65`、余额 `¥10.33`、实付合计 `¥60.98` |
| 只读边界 | 已验证 | 页面仅请求订单列表、订单详情和交易流水 GET；没有新增写请求 |

## 当前推荐验证顺序

```bash
npm run typecheck
npm run build
npm run lint:check
npm run format:check
npm run test:unit -w @content/api
npm run test:integration -w @content/api
npm run test:behavior -w @content/web
npm run test:legacy -w @content/web
npm run check:integrity
npm run db:validate
npm run db:migrate
npm run db:drift-check
```

`db:migrate` 与 `db:drift-check` 必须在 API 停止、数据库可获得迁移锁的维护窗口执行。本次已停止本地 API 后用项目根路径解析的 `npm run db:push` 应用 0027、0028；Prisma CLI 对当前相对 `DATABASE_URL` 的解析会落到 `prisma/prisma/dev.db`，不要用该错误路径作为运行库验收依据。`db:drift-check` 的 15 张重定义表属于既有 schema 漂移残差，需单独治理。

`npm test` 仍是完整测试入口，但不能用历史文档中的固定文件/用例数量替代实际输出；当前 API legacy 中若出现历史静态 pin 失败，应按持续优化报告中的残差说明单独归因，不把它误报成 P0-03/P0-04 回归。

## 数据库与运行时口径

- Prisma Schema 的唯一结构真源是 `prisma/migrations`；`prisma/schema.prisma` 是模型声明，启动阶段只做只读结构自检。
- 默认开发库为 `prisma/dev.db`（`.env.example` 中的 `file:./prisma/dev.db`）。不要把开发库、真实 `.env`、Cookie 缓存或密钥放进源码/评审包。
- `EXTERNAL_FETCH_CONCURRENCY` 默认值为 `2`，代码硬上限为 `4`；文档中的旧 `MAX_CONCURRENT_PAGES=5` 已废弃。
- 金额、退款和 GMV 的业务口径以现行代码与持续优化报告为准；退款分析统一使用订单 `paidTime` 窗口。

## 文档地图

### 当前规范

- [README](../README.md)：用户和开发者快速入口、环境变量、常用非 EXE 命令。
- [开发者指南](../开发者指南.md)：架构、数据库迁移、测试和编码约定。
- [持续优化收束报告](CONTINUOUS-OPTIMIZATION-SUMMARY.md)：按日期记录实现与验证证据。
- [V0.11 稳定与可信 PRD](PRD-2026-08-03-V011-STABILITY-TRUST.md)：稳定性/可信发布的范围与门禁。

### 历史记录或专项说明

- [审计报告](../AUDIT_REPORT.md)：2026-07-07 历史审计快照，保留当时的范围和统计。
- [性能优化](PERFORMANCE.md)：历史基准与当前并发配置说明。
- [UX 优化](UX_IMPROVEMENTS.md)：历史用户体验改进摘要。
- [自动登录](AUTO_LOGIN.md)、[DeepSeek 集成](DEEPSEEK-INTEGRATION.md)：外部服务和本地配置说明。
- `docs/superpowers/`：设计与执行计划归档，不自动代表最新验收状态。

### 明确延期

- [打包优化](PACKAGING.md)：保留 Windows 发布流程、隔离数据库和安全扫描要求；当前不执行其 EXE/安装器验收。
- 外部审查 PRD：`C:\Users\Facron\Downloads\code-review-optimization-prd-2026-08-08.md`，原始问题保留，当前状态与延期边界已在文件顶部补充。

## 更新规则

新增实现或验证时，先更新当前规范和持续优化报告，再更新历史专项文档中的“当前状态”提示。固定测试数量、构建模块数量、产物大小和日期必须来自同一次实际命令输出；历史数字只能保留在带日期的历史记录中。
