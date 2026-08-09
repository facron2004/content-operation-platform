# V0.11 稳定可信交付记录

本文是 `C:\Users\Facron\Downloads\PLAN (2).md` 对应的项目内交付记录。它记录实现边界、验证证据和未完成验收项；旧的审计报告与历史打包说明不作为本轮运行时行为的依据。

## 目标与边界

- 目标版本：`0.11.0`。在安全扫描、数据库迁移和 Windows 发布验收完成前，工作树版本暂不提前改号。
- 保留 SQLite、桌面端、旧 `/api/users` 兼容入口和现有业务域，不在本轮引入 PostgreSQL、Redis 或新的中台域。
- 现有脏工作树、截图、数据库和发布目录均视为用户资产；本轮不通过删除或回滚共享 `prisma/dev.db` 来解决问题。

## 当前状态（2026-08-09）

本文件下方按日期追加的切片是不可改写的历史证据；其中较早记录的测试数量、构建模块数和迁移 checksum 失败均以记录当日为准，不覆盖本节当前结论。

| 领域 | 当前结论 |
|------|----------|
| 本轮范围 | API、Web、shared、Prisma、脚本和文档；不执行 Windows Desktop、EXE、安装器、`win-unpacked` 或安装后真实进程验收 |
| P0-03 迁移基线 | `npm run db:validate` 与 `npm run db:drift-check` 当前通过；迁移历史、Schema、实际数据库三路径无漂移，源码与数据库均登记 14 条迁移，兼容基线策略已记录 |
| P0-04 写入幂等 | 已完成：关键命令使用 `@RequireIdempotency`，缺失键 400、负载冲突 409、成功重放、竞态保护、失败记录重取、每日清理和前端业务意图键均已实现并回归 |
| 当前回归 | P0-04 API focused `34/34`；Web behavior `360/360`；Web legacy `351/351`；typecheck、API/Web build、源码完整性 `1077/0` 已通过 |
| Windows 发布 | 明确延期；本文件中的桌面/安装器条目保留为后续发布门禁，不能当作本轮完成证据 |

## 已落地的运行时契约

### 安全配置与打包

- 打包扫描拒绝真实 `.env`、Cookie 缓存、数据库/WAL/SHM 和常见密钥模式；仅允许 `.env.example`。
- 开发环境才加载 `.env` / `.env.local`；桌面配置写入用户目录，敏感值只通过 Electron `safeStorage` 加密保存。
- 外部数据源未配置时进入“待配置”状态，不读取桌面开发机的 Cookie 缓存，也不因自动登录失败而崩溃。

### 桌面数据库

- 唯一运行数据库为 `app.getPath('userData')/data/content-operations.db`。
- 首次导入和已有库升级均使用一致性快照、临时库、完整性/迁移历史/关键表行数复验和原子切换。
- 迁移锁使用用户目录文件锁；锁定、损坏、导入失败和缺少旧库时停止启动并提供重试、手工选择旧库、新建库和退出入口。
- 导入前和迁移前生成备份；旧库不被直接覆盖，失败时临时库保留以便重试。

### 就绪与故障恢复

- `/health` 仍是轻量存活检查；`/ready` 同时检查数据库、迁移指纹、Web `index.html`、`bootId` 和发布清单。
- Electron 每次启动生成 `bootId`，只接受对应实例的就绪响应；配置变更通过受控后端重启后重新验证 `/ready`。
- API 和桌面主进程记录未处理异常后退出；`JobRun` 遗留的 `running` 状态恢复为 `interrupted`，不自动重试非幂等任务。
- JobRun、Outbox 和幂等记录的读取使用显式字段投影，避免后续 schema 内部字段通过服务返回泄漏。
- `ReleaseManifest` 包含版本、提交、构建时间、schema SHA-256 和每个 migration 的 SHA-256；打包校验与运行时使用同一份清单。
- `HealthController` 对 `ReadinessService` 使用显式注入，兼容 `tsx` 开发运行时不生成设计时参数元数据的问题；readiness 失败时保持 503，不降级为假 ready。
- ReleaseManifest 的 schema/migration 文件读取异常按不可用处理，readiness fail closed 为 `not_ready`，避免损坏资源把 `/ready` 变成 500。
- 生产环境缺少生成的 `RELEASE_MANIFEST_PATH` 时，ReleaseManifest 状态按无效处理，`/ready` fail closed 为 `not_ready`；开发/测试环境仍允许使用源码迁移指纹进行本地校验。

### 数据库迁移可信度

- `RolePermission.updatedAt` 的 SQLite 可空历史定义已由 `0013_role_permission_updated_at_required` 通过临时表重建为非空列，迁移时使用 `COALESCE` 保护既有数据。
- `db:drift-check` 现在覆盖三条只读路径：迁移历史 → Schema、实际数据库 → Schema、实际数据库 `_prisma_migrations` → 源码 migration checksum；2026-08-09 三条路径均通过。
- 当前源码和数据库均登记 14 条迁移；`0004` 的尾换行、`0005` 的手工幂等记录、`0014` 的编码规范化均按已记录兼容基线校验，不通过改写 checksum 绕过检查。
- 新增只读 `db:history-report` 证据报告：同时记录源码 migration 清单、数据库登记行、数据库/WAL/SHM 文件状态和处置结论；缺失数据库不会被命令创建，报告不会写入 `_prisma_migrations`，checksum 异常只输出“需备份、来源复核和干净 Windows 证据”的建议，不执行修复。

### 数据分析查询分层

- 概览、趋势/时段、排行、详情分别由独立查询模块负责；旧 `data-analysis-query.ts` 仅保留兼容导出，所有分析窗口继续统一使用订单 `paidTime` 和金额转换规则。
- 报告查询编排已由 `data-analysis-report.ts` 独立负责；`DataAnalysisService` 保留摘要缓存、重型聚合门禁、导出单飞与兼容入口，仅委托报告构建，保持 `paidTime`、限制项、详情截断和导出契约不变。
- 退款/核销 KPI、趋势和商家排行统一按订单 `paidTime` 归属；核销金额仅累计 `verifyTime` 非空订单，避免核销时间跨日导致窗口漏算或把未核销金额计入。

### IAM 双轨兼容

- 旧 `/api/users`、`UserRoleBinding` 和新租户/组织/角色/权限投影继续双写；旧权限码在授权边界显式展开为 canonical 权限，`users:write` 保留创建/停用语义，不扩大为资料更新权限。
- 角色创建、访问投影和权限守卫都经过同一份别名目录；系统角色模板、组织主归属、shadow 零差异和 tokenVersion 失效规则保持不变。

### Web/API 浏览器认证兼容

- 兼容 API 的登录、本地会话和刷新接口继续返回 `access_token`，同时写入 `content_ops_auth` HttpOnly Cookie（`Path=/api`、`SameSite=Lax`，生产环境增加 `Secure`）；面向浏览器的 `browser-login`、`browser-local-session`、`browser-refresh` 只返回认证身份并写入/续期 Cookie。`JwtStrategy` 同时保留 Bearer 提取器，兼容现有 API 客户端和桌面运行时。
- Web/API 请求启用 `withCredentials`；Web 运行时不再把 JWT 持久化到 `localStorage`、内存或 `Authorization` 请求头，仅保留展示用户名/角色信息，并在 401 后通过 Cookie 会话恢复；公开 logout 接口清除认证 Cookie。
- env-admin 冷启动兼容路径已退役：口令登录、local-session、refresh 和 JWT 均必须解析到 `AppUser`；正常启动仍由 `UserAccessModule.onModuleInit()` 写入真实管理员用户，旧 API 接口契约保持不变。

## 当前验证证据

以下命令在当前工作树已实跑，失败项按实际阻塞原因单独记录：

- `npm.cmd run typecheck`
- `npm.cmd run format:check`
- `npm.cmd run lint:check`（本轮缓存全量实测 5.73 秒；此前无缓存全量 ESLint 实测 18.83 秒）
- `npm.cmd run build`
- `npm.cmd run db:validate`
- `npx prisma migrate diff ...`（由 `npm.cmd run db:drift-check` 执行）：迁移历史 → Schema、实际数据库 → Schema 均 `No difference detected`；项目 `prisma/dev.db` 已应用 `0014_add_merchant_daily_metrics_counts`
- `npm.cmd run test:migration-history`：迁移历史完整匹配、缺失/多余/未完成/回滚/checksum 异常、相对数据库 URL 解析和真实 SQLite 只读查询 4 个测试通过
- `npm.cmd run test:migration-history-report`：checksum 异常证据、源码/登记行快照、WAL/SHM 状态、缺失数据库不创建和只读处置结论 3 个测试通过
- `DATABASE_URL=file:<临时 SQLite> npm.cmd run db:history-report`：CI 临时库输出完整迁移证据并通过；历史库报告仍是只读证据，不执行修复
- `npm.cmd run test:db-backup`：临时 SQLite 源库/备份完整性、SHA-256 审计记录、reason 解析、备份名冲突和远程 URL 拒绝 2 个测试通过；未执行真实开发库备份
- 新建空 SQLite fixture 后执行 `db:migrate` + `db:drift-check`：14 个 migration 全部应用，三条检查均通过；CI schema job 已采用同样的临时 fixture 门禁
- `npm.cmd run db:drift-check`：迁移历史 → Schema、实际数据库 → Schema、实际数据库 → 迁移历史均通过；兼容基线记录为 `0004`、`0005`、`0014`，未改写数据库元数据
- `npm.cmd run iam:backfill:report`：`users=2`、`memberships=3`、`assignments=2`、`unknownRoles=0`、`invalidScopes=0`、`missingAssignments=0`、`ready=true`
- `npm.cmd run check:integrity`：1077 个源文件、0 个未解析导入
- 2026-08-08 首次非 EXE 工作树复跑证据：本轮任务绩效查询拆分聚焦行为 `4/4`、相关 legacy `25/25`、typecheck、API integration `7/32`、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、Lint（0 errors，1 条既有 warning）通过；API unit `115/932` 中 `928` 通过、4 个既有净 GMV/退款失败；API legacy `103/408` 中 `407` 通过、1 个既有 refund top-merchants 静态契约失败；全量 format check 仍有 10 个既有金额/退款文件未格式化；本轮未触碰 EXE/Desktop/打包发布代码
- 2026-08-08 非 EXE 金额/退款测试契约收口复跑：按当前统一的 `refundCount / paidOrderCount`、`verifyCount / paidOrderCount` 口径迁移 3 个遗留净 GMV 测试断言并补齐 `MerchantDailyMetrics` SQLite 夹具；residual #72 已同步带周期、无分页参数的 refund top-merchants cache key；API unit `115/932`、API legacy `103/408`、API integration `7/32`、`test:coverage`、typecheck、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`963/0`）和 Lint（0 errors，1 条既有 warning）均通过；全量 format check 仍有 10 个既有金额/退款文件未格式化；本轮未触碰 EXE/Desktop/打包发布代码
- 2026-08-08 非 EXE Content 商家同步职责分层复跑：新增 `content-merchant-sync.service.ts`，将 JeeSite 商家同步、单飞保护、商家 upsert 和当前 fen-only `ContentPackage` 批量持久化从 `ContentService` 收敛出去；保留 `ContentService.syncMerchantsFromJeeSite()` 兼容入口及刷新参数、跳过返回值、日志和 SQL 语义；同步行为 `2/2`、API unit `116/935`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`964/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮目标文件定向格式化通过，全量 format check 仍有 10 个既有金额/退款文件未格式化；本轮未触碰 EXE/Desktop/打包发布代码
- 2026-08-08 非 EXE Content 推荐分析职责分层复跑：将推荐计算、库存趋势合并、推荐评分前置过滤与套餐分析从 `content-facade.ts` 收敛至 `content-recommendation-facade.ts`；旧 facade 继续 re-export 原函数，`ContentService`、推荐缓存/限额、社群与 Battle Card 调用入口保持兼容，社区业务实现未改动；推荐纯逻辑行为 `36/36`、推荐 cap legacy `8/8`、API unit `116/935`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`965/0`）和 Lint（0 errors，1 条既有 warning）通过；拆分后两个普通 TypeScript 模块分别为 `250` 与 `187` 行；本轮未触碰 EXE/Desktop/打包发布代码
- `npm.cmd run test:unit -w @content/api`：114 个行为文件、924 个测试；任务状态命令 canonical 行为测试 4/4；任务更新冻结策略行为测试 4/4；桌面数据库路径隔离测试 2/2；JobRun 最新状态 SQLite 行为测试 1/1；Outbox/幂等显式投影行为测试 2/2；幂等缓存回放、null 响应、operation 路由和 pending 并发保护行为测试 4/4；IAM 权限别名行为测试 9/9；JWT 租户缓存失效行为测试 1/1；`/ready` 数据库/迁移/Web 失败模式、ReleaseManifest 资源读取失败与 Nest 注入测试 8/8；ReleaseManifest 运行时校验测试 4/4；退款 paidTime 跨日趋势行为覆盖支付窗口、全量支付分母和退款率计算，并显式覆盖支付窗口内但 refundTime 窗口外应计入、支付窗口外但 refundTime 窗口内应排除；旧 `/api/users` 仓储租户条件行为测试 2/2；system-version 运行态版本解析测试 1/1；历史 DailyMetrics 日 GMV 读取行为测试覆盖毛 GMV 减退款后与 OrderHeader 净 GMV 口径一致；商家销售汇总/趋势/CSV 与排行净 GMV 口径 SQLite 行为测试 1/1；GMV 商家 fen 排行防止净 GMV 二次扣退款行为测试 1/1；GMV 趋势与分布渠道金额保持 fen 级净 GMV 对账行为测试 3/3；DailyMetrics 历史退款/核销净 GMV 与净比例读模型行为测试 2/2；GMV DailyMetrics/OrderHeader 趋势及周聚合按净 GMV 计算退款率/核销率行为测试 9/9；DailyMetrics 重算写入净比例行为测试 1/1；GMV fen 读取路径超过 JavaScript 安全整数边界仍保持精确行为测试 1/1；IAM 委派范围防扩权行为测试 1/1；Dashboard 推荐源覆盖元数据行为测试 1/1；DTO 白名单全局/显式管道行为测试 3/3；严格 CSP 响应头行为测试 1/1；GMV 查询 DTO cache-control 行为测试 2/2；认证 Cookie 序列化/解析行为测试 2/2；认证 AppUser-only 边界行为测试 15/15（AuthService 4/4、JwtStrategy 11/11）
- 本轮非 EXE 任务切片：`DistributionTaskService` 移除 create/batchCreate 及 publish/fail/cancel/schedule/complete/reassign 六组重复职责，控制器直接使用 `CreateTaskService`、`PublishTaskService` / `CancelTaskService`；本轮进一步将更新/删除与三类元数据探针收敛到 `task.repository`，将更新/reassign 的单用户指派解析收敛到 `distribution-task-fk`（创建路径仍保留批量 map 解析），并将更新冻结策略提取到 `domain/task-update-policy`，删除状态复用状态机定义；保留服务层兼容入口和 NotFound 语义；FK/创建/状态行为共 35/35 通过，策略行为 4/4，相关静态契约同步通过
- 本轮 Web IAM 行为修复：授权范围切换至 `ALL/NONE` 时清除残留 `orgUnitId`，组织范围切换保留 `orgUnitId`；新增行为测试 2/2，并将 residual #181 对齐当前 `controller -> CancelTaskService` 状态命令边界
- 本轮 IAM 组织树缓存一致性修复：`IamAccessService` 与 `JwtStrategy` 增加租户级缓存失效，组织单元创建/更新后立即清理访问与 JWT 状态缓存；新增行为测试 3/3，IAM 集成测试 11/11
- 本轮统一 Web IAM 授权范围处理：新增共享 `features/iam/assignment.utils.ts`，权限中心与用户管理授权抽屉均在切换至 `ALL/NONE` 时清除残留 `orgUnitId`，避免双入口行为分叉
- 本轮旧 `/api/users` 兼容路径租户边界修复：列表、详情、创建、资料更新、角色变更和停用均从当前 JWT 租户传入过滤条件；异租户用户在列表中不可见，详情不返回资料，三类写入均返回 404；IAM HTTP 集成行为测试覆盖 4/4 条边界断言
- 本轮 IAM 委派范围边界修复：非 admin 操作者不能把自身 `ORG_ONLY` 范围升级为 `ORG_TREE` 或 `ALL`；`ORG_TREE` 委派必须落在操作者自身组织树根覆盖范围内；新增 HTTP 集成边界断言 2/2，失败写入保持目标用户原授权不变
- 本轮 Dashboard 摘要推荐源诚实度修复：`statusDistribution` / `topPackages` 随推荐头部返回 `sourceMatchedCount`、`sourceLimit`、`sourceTruncated`；Web 内容漏斗在源被截断时显示来源范围提示；API 行为测试 1/1、Web 行为测试 2/2
- 本轮 Attribution 未匹配订单 SPA：新增类型化 Attribution API 客户端、近 90 天分页列表、fen 金额展示、`attribution:read/manage` 权限感知导航、重算确认和手工绑定对话框；Web 行为测试 3/3，路由权限测试 1/1
- 本轮 Generate 套餐选择器优化：沿用现有推荐 API 的 `page/pageSize` 分页，合并可加载的推荐头部并去重；保留服务端 cap 与分页失败的范围提示，现有 `filterable` 下拉可搜索完整已加载候选；Web 行为测试 2/2
- 本轮 API DTO 白名单收紧：全局 `ValidationPipe` 与 `createDtoPipe` 默认开启 `forbidNonWhitelisted`，未知字段返回 400；Web 不再向文案/规则接口发送由 JWT 生成的 `createdBy`；HTTP 集成测试覆盖真实客户端契约；DTO 白名单行为 3/3
- 本轮 Residual #295 CSP 收紧：API 响应头移除 `unsafe-inline` / `unsafe-eval`，脚本和样式仅允许同源资源；新增响应头行为测试 1/1；Playwright 访问 Dashboard 时入口、分包、登录和业务请求全部成功，控制台 `0 errors / 0 warnings`
- 本轮 Residual #296 Cookie 认证基础：API 登录/local-session/refresh 写入 `content_ops_auth` HttpOnly Cookie，JWT Strategy 增加 Cookie 提取并保留 Bearer 兼容，Web 请求开启 credentials 且移除 localStorage JWT 持久化；logout 清除 Cookie；Cookie 单测 2/2、Auth HTTP 集成 5/5
- 本轮 Residual #297 浏览器 Cookie-only 收口：新增浏览器专用 login/local-session/refresh 契约，Web 认证状态改为 Cookie 会话布尔状态，移除内存 JWT、`Authorization: Bearer` 注入和 JWT 刷新调度；保留旧 API token 返回作为兼容边界；Auth HTTP 集成 6/6
- 本轮 API 认证平台债收口：空表 env-admin 口令/JWT 兜底已完全退役，认证统一依赖模块初始化写入的真实 `AppUser`；AuthService 4/4、JwtStrategy 11/11、模块初始化认证集成 6/6；不涉及 EXE/Desktop/打包发布代码
- 本轮 Web 客户端清理：移除无运行时调用方的单用户 `getUser` 和单条 `resolveAlert` 导出，保留 IAM/列表用户读取、批量预警处理和服务端兼容接口；搜索未发现残留调用方。
- 本轮 Web IAM 新建流程修复：角色复制/组织编辑后再次点击“新建”会清空旧草稿并回到创建态；新增 composable 行为测试 2/2，未改变现有视觉和 API 契约。
- 本轮 Web IAM 刷新一致性修复：权限中心刷新后会清除已从列表移除的角色/用户选择及授权草稿，并在有新用户时重新加载授权；新增行为测试 1/1。
- 本轮 Web 用户授权抽屉加载一致性修复：角色/组织/用户授权加载收敛到独立状态 loader；加载失败清空旧授权草稿并禁用保存，切换用户时丢弃迟到响应；新增行为测试 2/2。
- 本轮 Web 权限中心用户选择一致性修复：用户列表使用服务端关键词搜索并展示 `total` 超过 100 条时的截断提示；用户授权请求增加过期响应丢弃，避免切换用户时旧授权覆盖当前用户；新增行为测试 2/2。
- 本轮 Web 预警列表请求稳定性修复：显式翻页/刷新会取消已排队的筛选防抖，避免一次用户操作触发两次网络请求；新增行为测试 1/1。
- 本轮 Web 请求去重一致性修复：响应/错误只在仍持有对应 `AbortController` 时释放 in-flight 槽位，避免旧响应清掉新请求控制器；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 认证生命周期稳定性修复：登出使在途刷新/本地会话响应失效，刷新调度器在 `clear` 后不再重排，互斥请求的旧清理回调不会误清新请求；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web IAM 成员关系一致性修复：移除用户的主组织成员后立即清除主组织草稿，避免提交时违反“主组织必须属于成员关系”的 API 约束；新增行为测试 1/1；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 权限中心刷新一致性修复：连续刷新时以请求代际保护角色、权限和组织列表，旧响应晚返回不会覆盖最新结果，也不会提前清除最新 loading 状态；新增行为测试 1/1；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API IAM shadow fail-open 稳定性修复：legacy projection 查询失败时只记录结构化 `iam_shadow_skipped` 并计入 `skipped`，不冒泡阻断 PermissionGuard；只有两侧投影均成功才计入 `comparisons`，新增行为测试 1/1；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API IAM shadow 入口可观测性补强：IAM access 读取异常现在同样记录包含路径、用户、租户和原因的结构化 `iam_shadow_skipped`，并计入全局/路径 `skipped`，继续 fail-open；新增行为测试 1/1，本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API PermissionGuard shadow fail-open 防御：即使未预期的 shadow `inspect` 异常逃逸服务层，guard 也记录结构化 `iam_shadow_guard_skipped` 后继续执行正常 IAM 授权；新增行为测试 1/1；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API IAM legacy projection 边界修复：`ORG_TREE` 兼容投影固定在直接授权组织节点的 `areaId/merchantId`，不再把子商家重复展开到旧绑定表；新增单元回归 1/1、区域树 HTTP shadow 回归 1/1（IAM 集成文件 13/13），本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API IAM shadow 可信度修复：shadow 现在读取持久化 `UserRoleBinding` 与 IAM 派生兼容投影进行比较，不再把 JWT 中已由 IAM 重投影的 bindings 当作旧侧证据；`ALL/NONE` 无范围 assignment 与兼容表行对齐，新增回归 1/1，IAM shadow 单测 5/5，区域树 HTTP shadow 仍为零差异；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Cookie 状态轮询一致性修复：ShellLayout 已提供全局 30 秒状态轮询，CookieConfigDialog 不再额外启动永久轮询，只在打开和保存后刷新；新增行为测试 1/1；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web ShellLayout 轮询稳定性修复：Cookie 状态轮询增加单飞保护，慢请求不会与下一周期叠加；组件卸载后迟到响应不再回写状态；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API ContentService 推荐预热生命周期修复：保存启动延迟定时器并在模块销毁时清理；预热任务增加单飞保护，慢预热不会被周期任务重复启动；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 套餐分析页请求生命周期修复：API 拒绝不再形成未处理 Promise，重复加载以请求代际保护最新分析，卸载后的迟到响应被丢弃；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 推荐列表请求生命周期修复：推荐/分类请求在页面卸载后不再回写状态，卸载后再次触发 `load` 不再发起新请求；初始化改为显式处理的非 async mounted 回调；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮共享 Web `useApiFetch` 请求生命周期修复：旧成功/失败响应不能覆盖最新请求，作用域销毁会使在途请求失效并阻止新请求；新增行为测试 3/3，覆盖社群/效果等共享消费者；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Dashboard 角色切换请求生命周期修复：旧角色成功/失败响应不会覆盖当前角色数据，作用域销毁后迟到响应被丢弃且不再发起新请求；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Dashboard 内容漏斗请求生命周期修复：旧请求成功/失败响应不会覆盖最新漏斗，作用域销毁后迟到响应被丢弃且不再发起新请求；保留失败时显示空漏斗语义；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Overview 请求生命周期修复：KPI、趋势、分布和零动销商家请求按独立代际保护最新数据与错误，作用域销毁后迟到响应被丢弃且不再发起请求；保留现有软失败、Top-N 截断诚实度和 as-of 日期语义；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Task Center KPI 请求生命周期修复：重复刷新时旧 KPI/错误不能覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；不改变任务列表分页和 KPI 业务口径；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Audit Queue 列表请求生命周期修复：筛选/分页/审核后刷新产生的旧列表响应不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留当前列表错误透传、选中项保留和分页语义；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Dashboard 任务 KPI 请求状态分层：`DashboardTaskMetrics` 的 API 请求从组件脚本收敛到 composable，旧 KPI 响应/旧 finally 不会覆盖最新加载状态，作用域销毁后迟到响应被丢弃且不再发起新请求；保持权限判断、指标展示和失败静默语义；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Movement 时间线请求生命周期修复：切换 SKU/天数时旧时间线响应和旧错误不会覆盖最新结果，关闭抽屉或作用域销毁后迟到响应被丢弃且不再发起新请求；保留时间线错误提示、天数裁剪和抽屉交互语义；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Movement 主列表/KPI 请求生命周期修复：筛选、分页、Tab 切换和日期刷新产生的旧列表/KPI 响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留筛选、分页、日期和错误语义；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 退款/核销验证请求生命周期修复：重复刷新、切换退款/核销、趋势窗口和商家榜分页产生的旧 KPI/趋势/榜单响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；继续统一沿用订单 `paidTime` 日期参数、趋势 `endDate` 和商家榜分页/限额诚实度；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Attribution 未匹配订单请求/操作生命周期修复：旧分页响应不会覆盖最新订单，作用域销毁后迟到列表、手工绑定和归因重算结果均不再回写、提示或触发刷新；保留权限、fen 金额、分页和归因业务语义；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Zero-Sales 页面请求生命周期修复：商家/SKU 列表、Tab 切换刷新、总览 KPI、未销分布和区域/品类维度切换产生的旧响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留现有分页、筛选、Top-N 截断诚实度和零动销业务口径；新增行为测试 7/7；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 商家页请求生命周期修复：商家列表、商家详情、详情天数切换和路由初始化产生的旧响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留现有筛选、排序、分页、详情窗口和 LIMIT 截断诚实度；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 数据分析页请求生命周期修复：摘要刷新、日期/预设切换和 Excel 导出在作用域销毁后不再回写、提示或发起新请求；保留现有 `paidTime`、金额转换、分层查询和导出契约；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web GMV cockpit 请求生命周期修复：KPI、趋势、分时、分布、商家榜和日期切换以请求代际保护最新数据；作用域销毁后迟到响应、刷新轮询和回填进度不再回写、弹出提示或发起新请求；重复回填被阻止；保留现有 GMV fen 对账、退款 `paidTime`、Top-N 截断诚实度和刷新重试语义；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Generate 套餐详情请求生命周期修复：详情 GET 与强制刷新 POST 使用请求代际和 Vue 作用域销毁保护，迟到详情不会覆盖最新数据，迟到刷新不会弹出成功/失败提示，卸载后不再发起新请求；保留现有强制刷新 POST、价格/明细展示和 Generate 业务契约；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 任务详情请求生命周期修复：详情与任务级 performance 并行加载使用请求代际保护，状态变更统一经过单一 mutation runner，旧操作不会覆盖新详情或弹出过期提示，作用域销毁后不再回写、刷新时间线或发起新请求；保留任务状态机、状态变更后时间线重读、reassign body-only 合并和任务性能口径；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 任务创建/批量创建提交生命周期修复：单个创建/编辑与批量创建增加重复提交保护、请求代际和 Vue 作用域销毁保护，迟到提交不会继续提示、关窗或触发 `onSaved`；保留现有校验、payload、状态规则、创建/编辑和批量创建契约；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API 幂等写入边界修复：任务单创建挂载 `IdempotencyGuard`；已完成幂等响应由 interceptor 直接回放，不再重复执行 handler；同 key 的 pending 请求返回冲突，失败记录可复用；现有任务、活动和社群幂等路由统一接入回放 interceptor；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 API 幂等缓存边界补强：JSON `null` 响应通过显式 replay 标记正确回放；operation 推断使用完整 URL，避免动态路由丢失 controller 前缀；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web IAM 用户授权保存生命周期修复：新增共享 `features/iam/useIamAccessMutation`，对用户管理授权抽屉的重复保存、抽屉关闭/用户切换和 Vue 作用域销毁后的迟到成功/失败结果统一丢弃；保存 payload 在请求前快照，保留原有 `api.replaceIamUserAccess`、组织成员关系校验、角色范围校验和成功事件契约；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web IAM 权限中心用户授权保存生命周期修复：复用共享 `features/iam/useIamAccessMutation`，阻止重复保存，切换用户/刷新/作用域销毁后丢弃迟到成功/失败结果，并在请求前快照保存 payload；保留现有 IAM 授权、组织成员关系和主组织校验契约；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web IAM 权限中心角色/组织写入生命周期修复：抽取通用 `features/iam/useIamMutation`，角色权限保存、角色创建、组织创建/编辑均阻止重复提交，保存 payload 在请求前快照；切换角色、打开其他编辑态、刷新、关闭对话框或 Vue 作用域销毁后丢弃迟到成功/失败结果；新增行为测试 5/5；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 旧 `/api/users` 兼容入口写入生命周期修复：用户创建/编辑和启停操作阻止重复提交，创建/编辑 payload 在请求前快照；关闭或切换表单、Vue 作用域销毁后丢弃迟到成功/失败结果；legacy #183 pin 改为验证稳定用户 ID 捕获；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 商家销售页查询生命周期修复：汇总/趋势/排行刷新按请求代际丢弃迟到数据，分页排行与整页刷新分开管理 loading，Vue 作用域销毁后停止回写和新请求；手动重算阻止重复触发，销毁后不再提示成功或继续 reload；新增行为测试 5/5；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Generate 文案生成提交生命周期修复：生成入口阻止重复提交，响应仅在当前 Vue 作用域和请求代际仍有效时写回文案、结束 loading 或提示成功；作用域销毁后清理生成状态并丢弃迟到结果；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Generate AI 配置请求生命周期修复：AI 配置状态刷新按请求代际丢弃旧结果，保存阻止重复提交并快照 payload；保存开始前的旧刷新不能覆盖保存结果，Vue 作用域销毁后清理 saving 状态并丢弃迟到状态/成功提示；新增行为测试 4/4；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Generate 初始化读请求生命周期修复：套餐推荐多页加载以请求代际和 Vue 作用域 guard 丢弃旧/卸载响应，不发布部分多页结果；作战卡请求阻止重复触发，套餐切换和作用域销毁会使旧响应失效并清理 loading；新增行为测试 6/6；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 商家热力图请求生命周期修复：热力图读取增加单飞、Vue 作用域销毁和迟到成功/失败响应保护；KeepAlive 失活期间不继续初始化或刷新 Leaflet 地图；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 规则配置页请求/提交生命周期修复：规则列表与默认值读取以请求代际和 Vue 作用域 guard 丢弃旧/卸载响应；规则创建阻止重复提交并快照表单，激活/删除操作共享 `mutating` 单飞并在销毁后抑制旧提示与刷新；新增行为测试 6/6；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 路由懒加载预热生命周期修复：`prefetchNavPaths` 返回 owner cleanup，同时可取消 `requestIdleCallback`/降级 `setTimeout`；ShellLayout 卸载时取消导航预热，避免离开页面后继续拉取整棵导航的异步组件；新增行为测试 2/2；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 审核写入生命周期修复：审核提交增加单飞保护并快照标题/正文/备注；切换文案、重复选择或 Vue 作用域销毁会使旧审核结果失效，旧结果不会触发成功提示或列表刷新；审核面板按钮在提交期间禁用；新增行为测试 3/3；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 操作审计详情请求生命周期修复：详情读取从 `AuditLogView` 收敛到 `features/audit-log/useAuditLogDetail`，以请求代际、对话框关闭和 Vue 作用域销毁丢弃迟到详情；过期失败不再提示；新增行为测试 3/3，并将 legacy #185 静态契约同步到新的 composable 边界；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Task Center 行级操作生命周期修复：排期/发布/完成/失败/取消/转派统一收敛到 `features/task-center/composables/useTaskCenterActions`；发布/失败对话框增加关闭失效边界；同任务重复提交、任务切换和 Vue 作用域销毁后的迟到结果不再提示或刷新；保留任务状态机、取消原因和失败 `evidenceUrl` 等既有契约；新增行为测试 5/5，legacy #175/#180/#204/#242 同步新的职责边界；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 操作审计列表生命周期修复：列表请求从 `AuditLogView` 收敛到 `features/audit-log/useAuditLogList`，以请求代际保护列表行与有效日期窗口，筛选、分页、重置共享同一安全入口；Vue 作用域销毁后停止 loading、丢弃迟到响应并阻止新请求；新增行为测试 3/3，legacy #185/#193 同步新的 composable 边界；Web behavior `50/214`、Web legacy `85/345`，Web 全量 `135/559`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Task Center 列表生命周期修复：共享 `usePagedList` 在 Vue 作用域销毁后阻止所有新列表操作、结束 loading，并通过 `requestId` 与当前分页筛选 key 防止迟到/已变更筛选响应写回；`useTaskCenter` 仅允许当前列表请求投影有效日期窗口；新增行为测试 4/4；Web behavior `50/218`、Web legacy `85/345`，Web 全量 `135/563`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web Cookie 配置弹窗生命周期修复：Cookie 状态打开请求按代际保留最新结果，保存阻止重复提交并快照已提交字符串；保存开始前的旧状态请求不能覆盖结果，Vue 作用域销毁后不再回写、提示、关闭弹窗或发起新请求；新增行为测试 4/4；Web behavior `50/221`、Web legacy `85/345`，Web 全量 `135/566`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 权限中心编排生命周期修复：`usePermissionCenter` 在 Vue 作用域销毁时使角色/权限/组织刷新、用户列表、用户授权读取和 IAM 写入代际失效；迟到响应不再回写状态或弹出错误，销毁后的读写入口直接 no-op；`onMounted` 初始化改为显式处理的非 async 回调；新增行为测试 2/2；Web behavior `50/223`、Web legacy `85/345`，Web 全量 `135/568`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 预警主路径生命周期修复：`useAlerts` 使用 Vue 作用域级 dispose 使列表/筛选/批量处理入口在销毁后 no-op；作用域销毁会使迟到列表和处理响应失效、清理 loading，且不再产生过期成功/失败审计提示；watcher 也受 active guard 保护；新增行为测试 2/2；Web behavior `51/225`、Web legacy `85/345`，Web 全量 `136/570`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 套餐分析页请求生命周期修复：`usePackageAnalysisPage` 改用 Vue 作用域级 dispose，销毁后清理 loading、使迟到分析响应失效，并阻止后续 `load()` 再发起请求；保留现有套餐分析数据和路由返回契约；新增行为测试 1/1（文件内生命周期测试共 4/4）；Web behavior `51/226`、Web legacy `85/345`，Web 全量 `136/571`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 推荐列表作用域生命周期修复：`useRecommendationsPage` 从组件 `onUnmounted` 收敛到 Vue 作用域级 dispose；保留现有请求代际与 `isDisposed` guard，effect scope 销毁后迟到推荐/分类响应不再回写，刷新入口不再发起新请求；复用现有行为测试 2/2；Web behavior `51/226`、Web legacy `85/345`，Web 全量 `136/571`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 商家路由初始加载生命周期修复：`bindMerchantRoute` 将初始列表/详情加载改为显式捕获 Promise 的 mounted 回调，初始请求拒绝不再形成未处理 Promise，同时保留 `isCurrent` 作用域与请求代际保护；新增行为测试 1/1（商家生命周期文件共 5/5）；Web behavior `51/227`、Web legacy `85/345`，Web 全量 `136/572`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web ShellLayout 作用域生命周期修复：Cookie 状态轮询、延迟重排定时器和导航预取清理从组件 `onUnmounted` 收敛到 Vue 作用域级 `onScopeDispose`；现有 3 个行为测试改为真实 `effectScope().stop()` 验证慢响应、轮询和预取取消；Web behavior `51/227`、Web legacy `85/345`，Web 全量 `136/572`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 可复用浏览器资源生命周期收口：`useKeyboardShortcuts`、`useNotificationCenter`、`useResponsiveDrawerSize` 的事件监听/通知订阅清理从组件 `onUnmounted` 收敛到 Vue 作用域级 `onScopeDispose`；新增行为规格以真实 `effectScope().stop()` 验证键盘监听、窗口 resize 监听和通知订阅均成对释放，3/3 通过；Web behavior `52/230`、Web legacy `85/345`，Web 全量 `137/575`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（929 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web IAM 用户授权读取生命周期收口：`useUserAccessLoader` 增加 Vue 作用域销毁失效保护，销毁时停止 loading、清空授权草稿，迟到成功/失败响应不再写回或进入抽屉错误提示，销毁后的新读取直接 no-op；保留切换用户的请求代际保护；新增行为回归 1/1（文件内 3/3）；Web behavior `52/231`、Web legacy `85/345`，Web 全量 `137/576`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（929 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web IAM 当前租户展示一致性修复：权限中心编排 composable 改用登录会话 `roleStore.tenantId` 作为当前租户的唯一展示来源，不再在首次渲染时写死 `tenant_default` 或等待用户授权读取后才更新；新增行为回归 1/1（权限中心文件内 19/19）；Web behavior `52/232`、Web legacy `85/345`，Web 全量 `137/577`；API unit `113/922`、API integration `7/32`；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（929 个源文件、0 个未解析导入）和 `build:web` 均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮非 EXE 浏览器只读验收：在现有 `3100/3101` 开发服务上打开权限中心与数据分析页，角色、组织、用户三面板及净 GMV 视图均正常渲染；`/api/users/me`、IAM 角色/权限/组织/用户/授权读取和数据分析 summary 均返回 `200`，两页最终控制台均为 `0 errors / 0 warnings`；旧会话首次 `browser-refresh` 的 `401` 随后由既有恢复路径以 `201` 成功刷新，未执行业务写入；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮非 EXE IAM 管理服务职责分层：将原 `IamAdminService` 的角色、组织、用户授权与范围策略分别收敛至 `IamRoleAdminService`、`IamOrganizationAdminService`、`IamUserAccessAdminService`，保留 `IamAdminService` 兼容 facade 供现有控制器及旧 `/api/users/:id/access` 入口使用；不改变控制器路由、旧入口或权限/异常语义；IAM alias 单测 `9/9`、IAM 集成 `13/13`、API unit `113/922`、API legacy `103/408`、API integration `7/32`、Web behavior `52/232`、Web legacy `85/345`、`test:coverage`、typecheck、Lint、格式、治理（静态 pin `188/188`）、源码完整性（933 个源文件、0 个未解析导入）和全栈 `build`（Web 3167 modules）均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮非 EXE Dashboard 职责分层：将原 `DashboardService` 的平台摘要聚合、今日运营作战台与效果分析/分块加载分别收敛至 `DashboardSummaryService`、`DashboardOperationsService` 与共享 `dashboard-ops-support`，保留 `DashboardService` 兼容 facade 供现有控制器和调用方使用；保持 Dashboard 路由、范围缓存键、重型聚合 gate、SQL 时间窗口、全局 top-N、来源/面板截断诚实度与异常语义不变；Dashboard 行为 `14/14`、相关治理契约 `80/80`、API unit `113/922`、API legacy `103/408`、API integration `7/32`、Web behavior `52/232`、Web legacy `85/345`、`test:coverage`、typecheck、Lint、格式、治理（静态 pin `188/188`）、源码完整性（936 个源文件、0 个未解析导入）和全栈 `build`（Web 3167 modules）均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮复跑非 EXE 门禁：API unit `113/922`、API integration `7/32`、Web behavior `49/211`、Web legacy `85/345` 全部通过；`test:coverage`、typecheck、Lint、格式、治理、源码完整性（925 个源文件、0 个未解析导入）和 `build:web` 均通过；治理静态 pin 仍为 API 103 + Web 85 = 188；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮复跑非 EXE 门禁：API unit `113/922`、API integration `7/32`、Web behavior `48/206`、Web legacy `85/345` 全部通过；typecheck、Lint、格式、治理、源码完整性（923 个源文件、0 个未解析导入）和 `build:web` 均通过；API legacy `103/408` 沿用此前已通过记录；本轮未触碰 EXE/Desktop/打包发布代码
- `npm.cmd run test:coverage` 已实跑通过：API unit `113/922`、API integration `7/32`、Web behavior `48/206` 均分别生成 `.tmp/coverage-api-unit`、`.tmp/coverage-api-integration`、`.tmp/coverage-web` 报告；任务及商家销售测试的 SQLite 使用私有内存连接，避免 coverage 下跨文件共享数据库。
- 本轮测试可信度时限复核：无缓存全量 ESLint 18.83 秒、缓存全量 lint 5.73 秒，均满足 PRD 冷启动不超过 90 秒、缓存/变更不超过 20 秒的门槛；本轮未触碰 EXE/Desktop/打包发布代码
- `npm.cmd run test:legacy -w @content/api`：103 个 legacy 文件、408 个测试；剩余源码 pin 仍可运行但不计入行为套件
- `npm.cmd run test:integration -w @content/api`：7 个文件、32 个测试；集成 setup 隔离开发机 `.cookie.cache`
- `npm.cmd run test:integration -w @content/api -- test/iam-api.spec.ts`：13 个 IAM 行为测试，包含停用用户授权读取、旧权限码角色创建、平台聚合与任务/仪表盘/动销/零动销/活动/社群/套餐/文案/预警/商家读取权限门禁、区域树子商家 shadow 零差异、tokenVersion 失效、旧 `/api/users` 跨租户隔离和委派范围防扩权
- `npm.cmd run test:behavior -w @content/web`：48 个行为文件、206 个测试
- `npm.cmd run test:legacy -w @content/web`：85 个 legacy 文件、345 个测试
- `npm.cmd run test -w @content/web`：行为 + legacy 合计 133 个文件、551 个测试
- 本轮 Web 分页请求稳定性修复：显式搜索/刷新会取消待执行的筛选防抖，避免一次筛选触发两次网络请求；新增行为测试 1/1；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮 Web 分页生命周期稳定性修复：`usePagedList` 在 Vue 作用域销毁时清理待执行筛选防抖，并使已发出的迟到响应失效；新增行为测试 1/1；本轮未触碰 EXE/Desktop/打包发布代码
- `npm.cmd run test:governance`：API 103 + Web 85 = 188 个静态 pin，较初始基线减少 63 个；已达到不高于 188 个的目标
- `node --test scripts/test-governance-budget.test.js`：验证静态 pin 超过 188 时治理门禁必失败
- `node --test scripts/package-security.test.js scripts/release-manifest.test.js`
- `node --test scripts/package-security.test.js scripts/release-manifest.test.js scripts/release-ops-docs.test.js`：发布安全、清单、备份/回退说明契约 5 个测试通过
- `npm.cmd run test:desktop-db`：11 个 SQLite/锁/恢复/传输测试全部通过
- 此前生成的候选目录 `release_candidate_v011_latest2/` 已完成安装包扫描，清单一致且敏感文件扫描为 0；本轮按用户要求不重新打包，候选包不作为最新源码的发布证据
- 本轮非 EXE 商家热力图资源生命周期修复：Leaflet 初始化延迟渲染增加可取消定时器，KeepAlive 失活时不再对隐藏 DOM 执行延迟刷新，Vue 作用域销毁时统一释放地图、标记、热力圈和悬浮状态；保留热力图数据接口、数量/GMV 切换和地图复用行为；热力图请求生命周期行为 3/3、Web behavior `53/235`、源码完整性 `941/0`、typecheck、Lint、格式和 `build:web`（3168 modules）均通过；本轮未触碰 EXE/Desktop/打包发布代码

- 本轮非 EXE 商家销售查询职责分层：将原 `merchant-sales-query.ts` 的汇总/Distinct package 计数、排名/分页、趋势、CSV 导出、MerchantDailyMetrics 重算分别收敛至 `merchant-sales-summary-query.ts`、`merchant-sales-ranking-query.ts`、`merchant-sales-trend-query.ts`、`merchant-sales-export-query.ts`、`merchant-sales-metrics-query.ts`，原入口保留兼容 barrel；商家销售净 GMV/CSV/分页真实行为 `31/31`、受影响 legacy `36/36`、API unit `113/922`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、API build、全栈 build（Web 3168 modules）、typecheck、Lint、格式、治理（静态 pin `188/188`）和源码完整性（`946/0`）均通过；本轮未触碰 EXE/Desktop/打包发布代码
- 本轮非 EXE 用户访问应用层职责分层：将原 `user-application.service.ts` 中的认证、用户写命令、用户查询和角色/范围校验分别收敛至 `user-auth.service.ts`、`user-command.service.ts`、`user-query.service.ts`、`user-role-policy.ts`，原入口保留兼容 barrel；保留旧导入、`/api/users` 契约、租户过滤、最后 admin 保护、tokenVersion、角色范围和批量 `UserRoleBinding` 写入语义；用户认证/角色单测 `25/25`、受影响 API legacy `20/20`、Web legacy `16/16`、API unit `113/922`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、全栈 build（Web 3168 modules）、typecheck、Lint、格式、治理（静态 pin `188/188`）和源码完整性（`950/0`）均通过；本轮未触碰 EXE/Desktop/打包发布代码

- 本轮非 EXE 权限中心编排职责分层：将原 `usePermissionCenter.ts` 中的角色权限、组织树、用户授权状态与写入副作用分别收敛至 `usePermissionCenterRoles.ts`、`usePermissionCenterOrganizations.ts`、`usePermissionCenterUserAccess.ts`，共享表单/用户类型与默认值收敛至 `permission-center-types.ts`；主入口继续保留 `PermissionCenterController`、统一刷新/租户展示/作用域销毁保护，三个面板接口、API 契约、视觉流程与请求竞态语义不变；权限中心行为回归 `19/19`、Web behavior `53/235`、Web legacy `85/345`、API unit `113/922`、API integration `7/32`、`test:coverage`、全栈 build（Web `3172 modules`）、typecheck、Lint、格式、治理（静态 pin `188/188`）和源码完整性（`954/0`）均通过；本轮未触碰 EXE/Desktop/打包发布代码
 - 本轮非 EXE 数据分析 Excel 导出职责分层：将原 `data-analysis-excel.ts` 的共享单元格格式与公式注入防护、总览/时段、排行、核销、退款、明细工作表分别收敛至 `data-analysis-excel.shared.ts`、`data-analysis-excel-overview.ts`、`data-analysis-excel-trend.ts`、`data-analysis-excel-ranking.ts`、`data-analysis-excel-verify.ts`、`data-analysis-excel-refund.ts`、`data-analysis-excel-detail.ts`，原入口继续保留 `buildDataAnalysisWorkbook`/`buildExportFilename` 兼容导出；保持 7 个 sheet 顺序、xlsx 模板、`paidTime` 报表数据、导出文件名、明细截断提示和安全文本语义不变；数据分析行为 `11/11`、API unit `113/922`、API legacy `103/408`、API integration `7/32`、`test:coverage`、typecheck、Lint、格式、治理（静态 pin `188/188`）、源码完整性（`961/0`）和全栈 build（Web `3172 modules`）均通过；本轮未触碰 EXE/Desktop/打包发布代码
 - 本轮非 EXE 数据分析报告编排职责分层：新增 `data-analysis-report.ts`，集中负责窗口解析、详情/排行/退款限额、10 路 paidTime 查询任务的 `mapPool` 编排和 `DataAnalysisReport` 组装；`DataAnalysisService` 保留摘要缓存、重型聚合门禁、导出单飞和旧控制器入口，仅委托报告构建；新增报告编排行为 `2/2`，数据分析原有行为 `11/11`，API unit `114/924`、API legacy `103/408`、API integration `7/32`、`test:coverage`、typecheck、Lint、格式、治理（静态 pin `188/188`）、源码完整性（`962/0`）和全栈 build（Web `3172 modules`）均通过；本轮未触碰 EXE/Desktop/打包发布代码

本地开发浏览器验收（Playwright CLI，2026-08-03）：

- `POST /api/auth/local-session`：`201`
- `GET /api/users/me`：`200`
- `GET /api/tasks/kpis`：`200`
- 权限中心角色、组织、用户授权接口：`200`；停用用户授权读取不再返回 `404`
- `GET /api/data-analysis/summary?window=month&date=2026-07-05&endDate=2026-08-03`：`200`
- `GET /api/iam/shadow/stats`（`iam:root`）：`200`；集成验收报告 `mismatches=0`
- 权限中心修复后浏览器控制台：`0 errors / 0 warnings`
- 当前开发服务运行态：`GET /health` `200`、`GET /api/content/health` `200`；`GET /ready` 已从依赖注入 500 修复为按迁移 checksum 不一致正确返回 `503`。现有 `prisma/dev.db` 的 `0004`、`0005`、`0007`、`0014` 登记 checksum 与源码不一致，未篡改迁移历史。
- 2026-08-04 readiness 契约收口：生产环境缺少生成的 `RELEASE_MANIFEST_PATH` 时保持 `not_ready`；Readiness/ReleaseManifest 行为测试 12/12 通过。
- 2026-08-04 CSP 收紧后重新加载 Dashboard：`POST /api/auth/local-session`、`GET /api/users/me`、任务 KPI、Dashboard 摘要、内容运营和 Cookie 状态请求均成功；浏览器控制台 `0 errors / 0 warnings`。
- 2026-08-04 Cookie-only 浏览器复核：Playwright Cookie 列表仅出现 `content_ops_auth`（`Path=/api`），localStorage 仅保留 `auth_user` 与角色信息、无 `auth_token`；旧会话首次 `browser-refresh` 401 后按既有恢复逻辑重新 `browser-local-session` 201，第二次 reload 直接 `browser-refresh` 201，`/api/users/me`、任务 KPI、Dashboard 摘要和内容运营请求均 200，控制台 `0 errors / 0 warnings`。

2026-08-08 非 EXE JeeSite 外部数据源职责分层复跑：将外部 URL/分页/请求重试、登录恢复、响应大小限制、同主机重定向 SSRF 保护、PLATFORM_SCAN_LIMIT 截断与 JeeSite 映射从 DataSourceService 收敛至 JeeSiteDataSourceClient；DataSourceService 保留 source 选择、TTL、最小请求间隔、force/non-force 单飞和旧 ContentDataset/LoadDatasetOptions 导出兼容；JeeSite 客户端行为 2/2、DataSource 缓存/单飞行为 2/2、相关 legacy 31/31、API unit 117/936、API legacy 103/408、API integration 7/32、Web behavior 53/235、test:coverage、typecheck、API build、全栈 build（Web 3173 modules）、治理静态 pin 188/188、源码完整性（967/0）和 Lint（0 errors，1 条既有 warning）通过；全量格式检查仍仅有 10 个既有金额/退款文件未格式化；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Content 套餐分析投影职责分层复跑：将 `PackageAnalysisResult`、`analysisTrends` 和 `buildPackageAnalysisResult` 从 `content-recommend-core.ts` 收敛至 `content-package-analysis.ts`；旧 core 继续 re-export 类型/函数，`ContentService`、推荐 facade、社区/Battle Card 调用方保持兼容；新增套餐分析行为 `1/1`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、API build、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`968/0`）和 Lint（0 errors，1 条既有 warning）通过；全量格式检查仍仅有 10 个既有金额/退款文件未格式化；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Content 套餐控制器职责分层复跑：将原 `package.controller.ts` 的详情/缓存/Cookie/AI/调试路由收敛至 `package-detail.controller.ts`，库存日爬取、商家同步和地理编码收敛至 `package-operations.controller.ts`；原控制器保留推荐、类别、套餐分析、社区/Battle Card、健康检查与 `safePackageId` 兼容入口，路由 URL、RBAC/Throttle 装饰器和客户端契约不变；同步修正 residual #232 的详情刷新静态契约与 residual #256 已迁移绩效查询模块路径；API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、Web legacy `85/345`、`test:coverage`、typecheck、API build、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`970/0`）和 Lint（0 errors，1 条既有 warning）通过；目标文件定向格式检查通过，全量格式检查仍仅有 10 个既有金额/退款文件未格式化；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 金额/退款格式门禁收口：对 10 个历史 Prettier 失败文件完成机械格式化，不改变业务语义；金额/退款定向 unit `6 个文件 / 31 个测试`、typecheck、全量 `format:check`、Lint（0 errors，1 条既有 warning）、治理静态 pin `188/188` 和源码完整性（`970/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 任务控制器职责分层复跑：原 `DistributionTaskController` 保留查询路由，创建/更新/删除/排期/发布/失败/取消/转派命令收敛至 `DistributionTaskCommandController`，共享任务访问范围和 evidence URL 校验；双路径 `/api/distribution-tasks` 与 `/api/tasks`、RBAC/权限码、Throttle、幂等拦截器和返回契约不变；原控制器 116 行、命令控制器 263 行、共享 helper 57 行；任务相关 legacy `6/6` 文件、`17/17` 测试，Web 任务 legacy `4/4`，API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、Web legacy `85/345`、typecheck、format、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`972/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 数据分析套餐排行投影职责分层复跑：将 `resolvePackageDisplayName`、`mergePackageRankingByName` 和 `queryPackageRanking` 从 `data-analysis-ranking.query.ts` 收敛至 `data-analysis-package-ranking.ts`；旧 `data-analysis-query.ts` / ranking entry 保留兼容 re-export，商家/业务员排行、核销极值、退款排行以及 paidTime 和金额 SQL 语义不变；新模块 130 行，原排行模块降至 244 行；数据分析行为 `14/14`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`973/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Content 套餐详情解析职责分层复跑：将 `HtmlParser` 中的 stream/loose 两套 token fallback 解析与共享 section-title 规则分别收敛至 `package-detail-fallback-parser.ts`、`package-detail-parser-rules.ts`；`HtmlParser` 保留主 DOM 解析、item 解析、坐标/rawHtml/日志和公共 `parsePackageDetail` 入口，fallback 选择、标题/section/item 输出与缺失详情语义不变；原文件由 471 行降至 191 行，fallback 模块 227 行、规则模块 54 行；详情行为 `3/3`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`975/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE GMV 刷新支撑职责分层复跑：将订单列表 URL 构建、会话续期、Cookie fallback、OrderHeader 批量 upsert 与页面参数类型收敛至 `gmv-refresh-support.ts`；`gmv-refresh.ts` 保留 `fetchOrderPage` 的 SSRF/响应体上限、拉单与重算编排、`withHeavyAggregateGate` 以及旧 build/fetch/resolve/upsert 导出，兼容入口和数据语义不变；原文件由 394 行降至 326 行，新支撑模块 93 行；GMV 定向行为 `18/18`、相关 legacy `15/15`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理静态 pin `188/188`、源码完整性（`976/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 文案审核规则职责分层复跑：将禁用词、价格/库存/售罄校验、使用限制校验与 `auditCopyText` 收敛至 `copy-audit-rules.ts`；`copy-rules.ts` 保留模板标题/正文/CTA 生成和旧 `auditCopyText`、`AuditPackageInput` 导出兼容，审核规则、风险等级、审核状态和生成结果语义不变；原模块由 388 行降至 312 行，新审核模块 79 行；文案审核/生成定向行为 `21/21`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理静态 pin 188/188、源码完整性（`977/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE GMV 趋势聚合职责分层已完成：将周/月聚合与 ISO 周键从 `gmv-resolve.ts` 收敛至 `gmv-trend-aggregate.ts`；原入口继续 re-export `aggregateTrend`，KPI/趋势/分布/商家 SQL、净 GMV fen 对账、退款/核销率和 legacy 静态契约不变；原模块由 334 行降至 276 行，新纯聚合模块 62 行；复跑 GMV 聚焦行为 `45/45`、相关 legacy `19/19`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`978/0`）和 Lint（0 errors，1 条既有 warning）均通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 告警聚合规则职责分层已完成：将告警缓存键、推荐结果展平、优先级评分/排序、列表筛选和摘要统计从 `alert.service.ts` 收敛至 `alert-aggregation.ts`；`AlertService` 保留旧方法和 `alert.service` 导出兼容，解析/处置 SQL、`RESOLVED_ALERT_DAY_LIMIT`、推荐来源/套餐 Top-N 诚实度及 legacy 静态契约未改变；原服务由 447 行降至 373 行，新纯聚合模块 106 行；复跑告警聚焦行为 `63/63`、相关 legacy `18/18`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`979/0`）和 Lint（0 errors，1 条既有 warning）均通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 告警套餐聚焦聚合进一步职责分层已完成：将按套餐分组、优先级排序、Top-8 截断及 `matched/truncated` 诚实度从 `AlertService` 收敛至 `alert-aggregation.ts`；旧 `AlertService.buildAlertPackageFocus()` 保留为兼容 facade，并通过评分回调委托，返回结构不变；#283 legacy pin 改为验证新的纯模块实现与服务 facade；`alert.service.ts` 由 373 行降至 306 行，聚合模块由 106 行增至 155 行；复跑 API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`979/0`）和 Lint（0 errors，1 条既有 warning）均通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE GMV cockpit 长任务生命周期职责分层已完成：将历史回填确认/范围解析、JeeSite refresh job 轮询、`job_lost/poll_failed` 自动重试、进度文案、刷新反馈与卸载取消从 `gmv-cockpit-core.ts` 收敛至 `gmv-refresh-lifecycle.ts`；`gmv-cockpit-core.ts` 继续 re-export `backfillGmvHistory`、`pollGmvRefreshJob`、`refreshGmvCockpit` 和 `RefreshPollError` 类型，旧 `useGmvCockpit`/GMV 页面调用路径与请求代际/卸载保护语义不变；核心模块由 464 行降至 229 行，新生命周期模块 270 行；复跑 GMV request lifecycle `3/3`、Web behavior `53/235`、Web legacy `85/345`、typecheck、`build:web`（Web `3174 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`980/0`）和 Lint（0 errors，1 条既有 warning）均通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE GMV cockpit 读取编排职责分层已完成：将全量本地指标/榜单并行读取、Top-N honesty sink 投影及 extras 派生加载从 `gmv-cockpit-ops.ts` 收敛至 `gmv-cockpit-load.ts`；`gmv-cockpit-ops.ts` 保留 `createGmvCockpitLoadAll` 兼容 re-export，`useGmvCockpit`、请求代际和卸载保护语义不变；ops 模块由 330 行降至 252 行，新读取模块 103 行；复跑新增成功刷新后读取行为 `1/1`，GMV cockpit 行为 `4/4`、Web behavior `53/236`、Web legacy `85/345`、typecheck、`build:web`（Web `3175 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`981/0`）和 Lint（0 errors，1 条既有 warning）均通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE recommendations 页面动作职责分层已完成：将 `loadPage`、清空筛选、分析/生成跳转与 area/category/merchant/库存区间/业务日期/角色 watch 编排从 `useRecommendationsPage.ts` 收敛至 `recommendations-page-actions.ts`；旧 composable 保留同名兼容导出，推荐读取、分页缓存、请求代际、卸载保护、merchantId/inventoryMin/inventoryMax/date 查询参数和 RECOMMEND_CACHE_CAP 诚实度不变；原入口由 436 行降至 357 行，新动作模块 75 行；新增成功读取与页面动作行为 `1/1`，推荐页行为 `3/3`、Web behavior `53/237`、Web legacy `85/345`、typecheck、`build:web`（Web `3176 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`982/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE recommendations 读取职责进一步分层已完成：将区域投影、分类选项读取、推荐列表请求/分页缓存、请求代际与 RECOMMEND_CACHE_CAP 诚实度编排从 `useRecommendationsPage.ts` 收敛至 `recommendations-page-loaders.ts`；旧 composable 继续 re-export `buildRecommendAreaOptions`、`loadRecommendCategoryOptions`、`loadRecommendationsPage` 和 `createRecommendationsLoaders`，筛选字段与 API 参数、页面缓存和卸载保护语义不变；页面入口由 357 行降至 133 行，actions 模块 75 行，loaders 模块 235 行；复跑推荐页行为 `3/3`、三个受影响 legacy residual `12/12`、Web behavior `53/237`、Web legacy `85/345`、typecheck、`build:web`（Web `3177 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`983/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 退款趋势与组件编译质量收口：移除 `RefundVerifyTrend` 未使用的 `trendOption` prop 及唯一透传绑定，退款趋势 tab、日期/粒度切换和 slot 图表契约不变；同时将 `TableSkeleton` 与 `GmvCockpitBackfill` 的 `withDefaults`+响应式解构改为 Vue 推荐的解构默认值，消除两条构建期组件提示；退款趋势行为 `4/4`、GMV 回填生命周期行为 `3/3`、Web behavior `53/237`、Web legacy `85/345`、typecheck、`build:web`（Web `3177 modules`）、全量 format、Lint（0 errors，0 warnings）、治理（静态 pin `188/188`）和源码完整性（`983/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE zero-sales loader 职责分层复跑：将包级销售补充、商户库存 SKU 汇总、零销量 SKU 候选/批量指标/排序分页、SKU 时间线分别收敛至独立 loader，旧 `zero-sales-loaders.ts` 保留兼容 barrel；保持 `zero-sales-list.ts`、`zero-sales.service.ts`、fen GMV/售价、`paidTime` 外围数据口径、`stockLeft > 0`、批量 SQL、候选 LIMIT、时间窗口和旧导入入口不变；residual #65/#66/#67/#74/#75/#78 及推荐页 residual #267 静态 pin 已迁移至权威实现文件；focused legacy `7/7` 文件、`39/39` 测试，API unit `118/937`、API legacy `103/408`、Web behavior `53/237`、Web legacy `85/345`、typecheck、format、Lint（0 errors，0 warnings）、build:web（`3177 modules`）、治理静态 pin `188/188`、源码完整性 `987/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE GMV 指标投影职责分层复跑：将 DailyMetrics KPI、趋势映射/日期补齐、分布 Top-N 及长尾诚实度、商家排序分页分别收敛至独立模块，旧 `gmv-metrics.ts` 保留兼容 barrel；保持 `gmv-resolve.ts`、`gmv-order-header.ts`、`gmv.service.ts` 和旧测试导入入口不变，fen 精度、净 GMV 减退款、渠道 remainder、退款/核销单数分母、Top-N `limit/matched/truncated` 语义不变；residual #265 静态 pin 已迁移至权威实现文件；GMV focused unit `45/45`、相关 legacy `14/14`、API unit `118/937`、API legacy `103/408`、typecheck、format、Lint、build:web（`3177 modules`）、治理静态 pin `188/188`、源码完整性 `991/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE merchant-list 读路径职责分层复跑：将商家 SQL head/metric-first 查询、批量指标聚合、排序分页/缓存编排与共享类型收敛至独立模块，旧 `merchant-list.ts` 保留兼容 barrel；保持 `MerchantService`、scope 过滤、`totalSkuDesc` prune-before-enrich、GMV/stale metric-first head、`stockLeft > 0`、fen GMV 与 `limit/truncated` 语义不变；residual #55/#63/#67/#68/#75/#266 静态 pin 已迁移至权威实现文件；商家 focused unit `36/36`、相关 legacy `44/44`、API unit `118/937`、API legacy `103/408`、API build、typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `995/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE Content 映射职责分层复跑：将共享列表/枚举转换、套餐/机器审核映射、GeneratedCopy 映射与 CopyPerformance 映射分别收敛至独立模块，旧 `mappers.ts` 保留兼容 barrel；保持 fen 字段读写、审计精简 select、文案列表省略 body/cta、绩效列表省略 leaderId 以及旧服务/测试导入契约不变；residual #63 套餐静态 pin 已迁移至权威实现文件；文案服务 focused unit `17/17`、相关 legacy `29/29`、API unit `118/937`、API legacy `103/408`、API build、typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `999/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE GMV OrderHeader 计算职责分层复跑：将今日 KPI/小时数据、趋势补齐与净 GMV 映射、分布 Top-N/长尾诚实度分别收敛至独立模块，旧 `gmv-order-header.ts` 保留兼容 barrel；保持 `gmv-resolve.ts`、刷新 upsert、查询模块和旧测试导入契约不变，OrderHeader/ DailyMetrics fallback、fen 精度、退款扣减、退款/核销率分母、`mapPool` 并发上限及分布 `limit/matched/truncated` 语义不变；residual #66/#289 静态 pin 已迁移至权威实现文件；GMV focused unit `45/45`、相关 legacy `9/9`、API unit `118/937`、API legacy `103/408`、API build、typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1002/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE IAM 访问职责分层复跑：将 IAM 用户访问读取、旧 `UserRoleBinding` 查询、旧 area/merchant 投影、角色/组织/权限目录查询分别收敛至独立模块，旧 `IamAccessService` 保留兼容 facade；保持租户/停用过滤、权限别名展开、缓存与失效、组织树、双轨授权和原有公开方法/类型契约不变；IAM focused behavior `35/35`、API unit `118/937`、API legacy `103/408`、API build、typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1005/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE IAM 用户授权写入职责分层复跑：将角色与组织解析、成员关系/主组织校验、最后 admin 保护和组织树委派授权分别收敛至独立 helper；`IamUserAccessAdminService` 保留兼容入口，只负责授权替换事务、legacy `UserRoleBinding` 双写、`tokenVersion`/JWT/cache 失效和返回契约；保持权限别名、ALL/ORG_TREE/ORG_ONLY/NONE 范围、组织树边界、成员关系和错误语义不变；IAM focused behavior `35/35`、IAM integration `13/13`、API unit `118/937`、API legacy `103/408`、API build、typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1007/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE DistributionTask 读取编排职责分层复跑：将列表/KPI、详情执行时间线、任务行/删除/更新/访问 meta 和绩效读取编排从 `distribution-task.service.ts` 收敛至 `distribution-task-read.ts`；`DistributionTaskService` 保留原公开方法、更新/删除命令、FK/状态策略和 controller 注入入口，`packageGeo`、执行时间线、窄投影、scope probe、NotFound 与错误语义不变；任务 focused unit `48/48`、受影响 legacy `28/28`、API unit `118/937`、API legacy `103/408`、API integration `32/32`、API build、typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1008/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE GMV 刷新职责分层复跑：将同主机重定向/响应体上限、分页拉单循环、金额重算及缓存失效分别收敛至 `gmv-refresh-page.ts`、`gmv-refresh-pull.ts`、`gmv-refresh-recompute.ts`；`gmv-refresh.ts` 保留旧 fetch/pull/refresh/type 导出、`withHeavyAggregateGate` 和刷新结果契约，`GmvRefreshJob`、GMV service 及旧调用入口不变；SSRF、Cookie 单次续期、`MAX_PAGES`/truncated、OrderHeader upsert、DailyMetrics/PSD/merchant-sales 重算和失效时序语义不变；GMV focused behavior `18/18`、受影响 legacy `15/15`、API unit `118/937`、API legacy `103/408`、API integration `32/32`、API build、typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1011/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE Dashboard Operations 读编排职责分层复跑：将今日运营作战台、效果数据、CopyPerformance/GeneratedCopy 分块读取与 Top-N/标题 join 截断诚实度投影从 `dashboard-operations.service.ts` 收敛至 `dashboard-operations-read.ts`；`DashboardOperationsService` 保留公开入口、缓存键、`TtlCache`、`withHeavyAggregateGate`、繁忙错误映射和兼容委托，推荐 scope、CP/GC 查询边界、面板计数及返回结构不变；原服务由 393 行降至 85 行，新读模块 326 行；Dashboard 行为 `14/14`、受影响 legacy `67/67`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、API build、typecheck、format、Lint、全栈 build（Web `3177 modules`）、治理静态 pin `188/188` 和源码完整性 `1012/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE SQL chunk runtime 职责分层复跑：将通用 `chunkIds`、有序并发池 `mapPool`、有界 `queryInChunks` 及 `DEFAULT_IN_CHUNK`/`QUERY_IN_CHUNKS_CONCURRENCY` 收敛至 `sql-chunk-runtime.ts` 与 `sql-chunk-runtime-constants.ts`；`sql-chunk.ts` 保留历史导出路径及业务扫描/保留/缓存上限常量，零动销、动销、商家、热力图、Dashboard、数据分析和保留任务的调用语义不变；SQL chunk focused unit `21/21`、受影响 legacy `83/83`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、API build、typecheck、Lint、全栈 build（Web `3177 modules`）、治理静态 pin `188/188` 和源码完整性 `1014/0` 通过；格式检查仅命中工作树已有的 `GmvCockpitBackfill.vue`，未修改该文件；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 质量门禁收口复跑：格式化现有 `GmvCockpitBackfill.vue` 后，全量 format check 恢复通过；将 Web residual #260 的 execution timeline 静态 pin 从已拆出的 `distribution-task.service.ts` 迁移至权威 `distribution-task-read.ts`，业务实现与接口契约不变；Web behavior `53/237`、Web legacy `85/345`、typecheck、Lint、build:web（`3177 modules`）、治理静态 pin `188/188` 和源码完整性 `1014/0` 均通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 覆盖率与治理预算复跑：统一 `test:coverage` 依次完成 API unit `118/937`、API integration `7/32`、Web behavior `53/237` 并生成覆盖率报告；`test:governance` 与治理预算测试均通过，静态 pin 保持 API `103`、Web `85`、合计 `188/188`，未新增静态契约；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE movement SKU 读取/投影职责分层已完成：将 active SKU SQL、销售窗口 `EXISTS/NOT EXISTS`、大 merchant/area scope 分块和近 30 天销售读取收敛至 `movement-sku-loaders.ts`，将 candidate 映射、排序、SKU rows 编排及 CSV-safe 分页/`limit`/`truncated` 投影收敛至 `movement-sku-projection.ts`；`movement-skus.ts` 保留旧 re-export 兼容入口，`movement-list.ts` 与 `movement.service.ts` 直接依赖权威模块，`stockLeft > 0`、早期 `LIMIT`、chunking、stale bucket 和分页语义不变；同步将 residual #55/#62/#67/#68/#81/#266 静态 pin 迁移至真实实现文件；定向 unit `39/39`、受影响 legacy `44/44`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/237`、`test:coverage`、API build、typecheck、format、Lint、build:web（`3177 modules`）、治理静态 pin `188/188` 和源码完整性（`1016/0`）通过；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 数据分析日期范围逻辑可验证性收口：将 `AppleDateRangePicker.vue` 内嵌的 YMD 格式化/解析、六周日历单元格生成、`disabledDate` 投影和范围归一化收敛至 `features/data-analysis/utils/date-range-picker-core.ts`；组件 props、`start/end`、`disabledDate`、`change` 事件、日历交互、样式以及 `DataAnalysisWindowBar` 调用契约不变；新增 core behavior `3/3`，统一 `test:coverage` 完成 API unit `118/937`、API integration `7/32`、Web behavior `54/240`，Web legacy `85/345`、typecheck、format、Lint、build:web（`3178 modules`）、治理静态 pin `188/188` 和源码完整性（`1018/0`）通过；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 单日/范围日期核心统一已完成：新增 `apps/web/src/utils/date-picker-core.ts`，将单日 `AppleDatePicker.vue` 与日期范围 `AppleDateRangePicker.vue` 共用 YMD 格式化/解析、六周日历生成和 `disabledDate` 投影；`date-range-picker-core.ts` 保留原 feature 导出兼容层，单日组件 props、`modelValue`/`change` 事件、选中/今天标记、日历交互与样式契约不变；新增通用 core behavior `2/2`，日期范围行为 `3/3`，统一 `test:coverage` 完成 API unit `118/937`、API integration `7/32`、Web behavior `55/242`，Web legacy `85/345`、typecheck、format、Lint、build:web（`3179 modules`）、治理静态 pin `188/188` 和源码完整性（`1020/0`）通过；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部数据源会话缓存一致性修复已完成：手动 Cookie 校验成功后同时失效数据集缓存与推荐运行时缓存，并防止旧 in-flight 会话结果回写；数据源缓存/失效竞态测试 `4/4`、推荐运行时失效竞态测试 `3/3`、Cookie API 集成 `1/1`，API unit `118/940`、API integration `7/32`、typecheck、format、Lint、治理静态 pin `188/188` 和源码完整性（`1020/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 缓存失效竞态与外部会话清理已完成：共享 `TtlCache` 与套餐 `DetailCache` 在 `clear/clear(prefix)` 后不再允许旧 in-flight 结果回写；新增 `ExternalDataCacheInvalidationService`，在 Cookie 更新成功后统一失效数据集、推荐、告警、Dashboard、套餐详情五层缓存；新增 focused tests `27/27`、Cookie API 集成 `1/1`；统一 `test:coverage` 完成 API unit `119/942`、API integration `7/32`、Web behavior `55/242`、Web legacy `85/345`，并通过 typecheck、format、Lint、root build、build:web（`3179 modules`）、治理静态 pin `188/188` 和源码完整性（`1021/0`）；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部会话校验竞态已完成：`AutoLoginService.clearCache()` 现在同步清理校验快照、断开旧校验，并以 epoch/request identity 防止旧 Cookie 校验在清理后或新 Cookie 校验之后回写状态；新增行为回归 `2/2`，AutoLogin/JeeSite focused `20/20`；统一 `test:coverage` 完成 API unit `119/944`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性（`1021/0`）；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部自动登录失效竞态已完成：`AutoLoginService` 新增登录请求 epoch 与 Promise identity，`clearCache()` 会使在途自动登录失效并释放单飞槽位，新的强制刷新可独立启动；旧登录不再回写 `cachedCookie`、失败计数、校验快照或 Cookie 缓存文件，已持有旧请求的调用方返回 `null`，同一代并发登录仍保持单飞复用；新增行为回归 `1/1`，AutoLogin/JeeSite focused `21/21`；统一 `test:coverage` 完成 API unit `119/945`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部会话消费代际保护已完成：`ensureValidCookie()` 的环境 Cookie 和 `updateManualCookie()` 的手工 Cookie 在异步校验返回后均校验 cookie state epoch，旧验证不会覆盖 `clearCache()` 后或更新后的会话；并发手工更新保持新请求胜出，旧请求返回可重试错误，Cookie 缓存文件写入也受同一代保护；新增行为回归 `2/2`，AutoLogin/JeeSite focused `24/24`；统一 `test:coverage` 完成 API unit `119/947`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Cookie 缓存文件写入顺序保护已完成：`AutoLoginService.saveCookieToCacheFile()` 增加单实例 Promise 写入队列，并在排队执行前再次校验 cookie state epoch，避免旧 Cookie 的异步 `fs.writeFile` 晚于新 Cookie 完成而把磁盘缓存回退；新增“旧写未完成时新写不得并发、完成顺序保持新值”行为回归 `1/1`，AutoLogin/JeeSite focused `25/25`；统一 `test:coverage` 完成 API unit `119/948`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 启动缓存 Cookie 代际保护已完成：`loadCookieFromCacheFile()` 在异步校验开始时捕获 cookie state epoch，并在校验成功后提交内存缓存前再次校验；`clearCache()` 期间完成的旧启动校验不会重新写入 `cachedCookie`/`lastLoginTime`；新增行为回归 `1/1`，AutoLogin/JeeSite focused `26/26`；统一 `test:coverage` 完成 API unit `119/949`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 **历史记录（当时）** 非 EXE 迁移历史处置证据结构化已完成：`db:history-report` 在保持只读、不创建缺失数据库、不改写 `_prisma_migrations` 的前提下，新增 `backupRequired`、`sourceReviewRequired`、`cleanWindowsEvidenceRequired` 三个机器可读前置条件；当时开发库曾报告 `0004`、`0005`、`0007`、`0014` 四条 checksum 差异并返回 `backup_source_and_clean_windows_evidence_required`，不伪造修复成功；后续兼容基线以本文当前状态为准；`test:migration-history` `4/4`、`test:migration-history-report` `2/2`，以及 typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1021/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 迁移证据正向门禁回归已完成：新增干净临时 SQLite 迁移历史场景，确认 checksum 完全匹配时 `repairApplied=false`、备份/来源复核/干净环境三个前置条件均为 `false`，只有异常历史才要求处置；`test:migration-history` `4/4`、`test:migration-history-report` `3/3`、相关脚本与文档格式检查、源码完整性 `1021/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 告警编排职责分层已完成：将 `alert-core.ts` 中的告警类型/缓存类型、表格摘要、处理与筛选动作分别收敛至 `alert-types.ts`、`alert-summary.ts`、`alert-handlers.ts`；`alert-core.ts` 保留历史路径兼容 barrel，`useAlerts.ts` 直接依赖权威职责模块，日期筛选、分页缓存、请求代际、卸载保护和处理审计契约不变；核心模块由 `420` 行降至 `191` 行；告警 focused behavior `3/3`、迁移后的 residual #221 `4/4`、Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、build:web（`3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1024/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE API 告警处理职责分层已完成：将 `AlertService` 中的 alertId 规范化、单条/批量处理写入、每日已处理记录限额读取收敛至 `alert-resolution.ts`；保留 `AlertService` 的 `resolveOperationAlert()`、`resolveOperationAlerts()`、`loadResolvedAlertIds()` 兼容入口，告警聚合缓存、分页、日期、scope、批量 SQL `ON CONFLICT`、200 条上限和 `RESOLVED_ALERT_DAY_LIMIT` 语义不变；`alert.service.ts` 由 `327` 行降至 `193` 行；AlertService/扫描 focused `31/31`、迁移后的 API legacy `24/24`、API unit `119/949`、API integration `7/32`、API legacy `103/408`、typecheck、format、Lint、root build（Web `3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1025/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 规则配置读写职责分层已完成：将 `rule-config-ops.ts` 中的规则读取/默认合并/缓存单飞与版本创建/激活/删除/缓存失效分别收敛至 `rule-config-read.ts`、`rule-config-write.ts`；`rule-config-ops.ts` 保留历史 re-export，`RuleConfigService` 直接依赖权威模块，列表窄投影、`mapPool` 并发上限、版本递增、inactive 保留数、激活同范围互斥和异常语义不变；兼容入口由 `322` 行降至 `3` 行，读/写模块分别为 `132`/`178` 行；RuleConfig focused `15/15`、相关 legacy `57/57`、API unit `119/949`、API integration `7/32`、API legacy `103/408`、typecheck、format、Lint、root build（Web `3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1027/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 数据分析核销口径回归已修正：退款 `paidTime` 夹具中的两笔订单均为 `verifyTime IS NULL`，将从旧 `netSales` 机械迁移而来的 `writeOffAmount=107` 断言修正为 `0`，与 `IS_VERIFIED` 和 PRD“仅统计已核销订单余额+现金”定义一致；查询实现未改动，数据分析行为 `11/11`、API unit `119/949`、API integration `7/32`、API legacy `103/408`、typecheck、format、Lint、root build（Web `3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1027/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 规则配置职责分层已完成：将 `settings-core.ts` 中的状态/读取与规则创建、激活、删除及公开动作组装分别收敛至 `settings-read.ts`、`settings-write.ts`；`settings-core.ts` 保留历史 re-export，`useSettings` 直接依赖权威读写模块，规则列表/默认值请求代际、作用域卸载保护、重复提交/变更单飞和表单快照语义不变；兼容入口由 `326` 行降至 `3` 行，读取模块 `111` 行、写入模块 `227` 行；Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1029/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Dashboard 读模型职责分层已完成：将效果数据、CP/GC 分块读取、`PERF_LIST_SELECT` 投影和 Beijing “昨日复盘”编排从 `dashboard-operations-read.ts` 收敛至 `dashboard-performance-read.ts`；旧模块继续 re-export `computePerformance` / `loadDashboardPerfAndCopies`，`DashboardOperationsService` 直接依赖新权威模块，推荐源/标题 join 截断诚实度、`queryInChunks` + `mapPool` 并发上限、缓存与返回结构不变；混合入口由 `342` 行拆为作战台 `203` 行与效果读取 `159` 行；Dashboard 相关 legacy `61/61`、数据分析行为 `12/12`、API unit `119/950`、API integration `7/32`、API legacy `103/408`、Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 **历史记录（当时）** 非 EXE `/ready` HTTP 状态契约回归已完成：新增控制器行为用例，明确 `ReadinessService` 返回 `not_ready` 时响应状态为 `503`，返回 `ready` 时不改写成功状态；Readiness focused `9/9`、API unit `119/951`、迁移历史 `4/4`、迁移证据报告 `3/3`、typecheck、format、Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；当时 `db:drift-check` 曾因开发库历史 checksum 差异返回失败，未修改数据库；当前结果以本文顶部状态为准；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE `/ready` 真实 HTTP 集成回归已完成：新增隔离 SQLite 集成测试并接入 `vitest.integration.config.ts`，干净迁移历史通过真实 `GET /ready` 返回 `200`，不可信 `MIGRATION_FINGERPRINT` 通过真实路由返回 `503`；API integration `8/34`，覆盖率模式 `8/34`，API unit `119/951`、Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；未读取或修改项目开发库，本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 浏览器双账号 Cookie 隔离回归已完成：新增两个独立 `request.agent` 会话，分别登录管理员和普通用户并读取 `/api/users/me`；管理员 logout 后其会话返回 `401`，普通用户会话继续返回 `200` 且身份不变，验证单侧退出不会清理另一侧 Cookie 会话；认证 focused `7/7`、API integration `8/35`、typecheck、format、Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮仅改动 API 集成测试，未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-08 **历史记录（当时）** 非 EXE 退款商家排行缓存与 API 测试分层修正已完成：`getTopMerchants()` 缓存 key 补入查询日期，避免同一排序/窗口下不同 `q.date` 复用错误排行；新增行为测试验证同日期命中缓存、不同日期重新查询，并同步更新 residual #72 legacy pin；同时将真实 HTTP/SQLite `ready-api.spec.ts` 明确排除出 unit、保留在 integration，避免 unit setup 误跑产生 `503`；API unit `120/952`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；当时开发库的历史 checksum 差异未改写，本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 退款/核销商家排行聚合条件修正已完成：将 `refund-order-header.ts` 与 `refund-top-merchants.ts` 中分组后的未聚合 `HAVING oh."refundAmountFen" > 0` / `oh."verifyAmountFen" > 0` 改为基于 `SUM(...)` 的聚合条件，避免同一商家同时存在有指标和无指标订单时被 SQLite 任意代表行错误排除；新增真实 SQLite 混合订单行为覆盖退款排行、核销排行及今日退款旧入口；`refund-paid-time` `2/2`、API unit `120/953`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 商家销售 CSV 退款/核销率口径修正已完成：导出 SQL 补齐 `refundCount`/`verifyCount` 聚合字段，CSV 与商家销售摘要/排行统一使用“退款/核销订单数 ÷ 支付订单数”，不再使用金额 ÷ GMV 的混合口径；真实 SQLite 导出行为验证金额比例与单数比例不同的商家仍输出 `1.0000` 单数率；商家销售 focused `1/1`、API unit `120/953`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE 退款/核销 `paidTime` 口径统一已完成：修正旧核销 KPI 与 Top 核销商家入口按 `verifyTime` 过滤的问题，改为以订单 `paidTime` 作为窗口，核销金额使用 `verifyTime IS NOT NULL` 条件聚合；新增真实 SQLite 回归覆盖“支付窗口内、窗口外核销”和“支付窗口外、窗口内核销”，并验证未核销订单的残留核销金额不进入 KPI；`refund-paid-time` `2/2`、API unit `120/953`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE 核销趋势主读路径已完成：新增 `OrderHeader` 按 `paidTime` 的核销趋势查询、日填充和单数率计算；`loadVerifyTrend` 与退款趋势对齐，优先使用实时订单数据，空结果再回退 `DailyMetrics`，不再因历史汇总缺行静默返回空趋势；真实 SQLite 跨日趋势、服务层主源和 `DailyMetrics` 回退行为 `5/5`，API unit `120/955`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 核销金额条件聚合已完成：DailyMetrics 重算、GMV `OrderHeader` 今日/趋势查询、数据分析 overview、MerchantDailyMetrics 重算及本地重算脚本均改为仅在 `verifyTime IS NOT NULL` 时汇总 `verifyAmountFen`，防止未核销订单残留金额污染 KPI、趋势、商家销售和 GMV 读模型；新增真实 SQLite 回归覆盖 DailyMetrics、数据分析、GMV 今日/趋势和 MerchantDailyMetrics `4` 个文件 `15/15`，全量 API unit `122` 个文件 `957/957`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；root build 首次因并行 Vite 进程争用生成声明文件短暂失败，单独 Web build 与随后 root build 均成功；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 **历史记录（当时）** 非 EXE 质量门禁证据已补齐：`npm.cmd run test:coverage` 成功生成 API unit、API integration 和 Web coverage 产物；API legacy `103` 个文件 `408/408`、Web legacy `85` 个文件 `345/345`、schema validate、迁移历史/报告测试、临时 SQLite 备份契约测试均通过；只读 `iam:backfill:report` 返回 `ready: true`（`unknownRoles=0`、`invalidScopes=0`、`missingAssignments=0`）。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码；当时开发库历史迁移 checksum 差异按发布验收项保留，当前结果以本文顶部状态为准。

2026-08-09 非 EXE GMV 分时异常契约已修正：`resolveGmvHourly` 不再把 `OrderHeader` 查询失败吞掉并伪装成 24 个零点，而是让服务/HTTP 错误链路保留真实故障，避免数据库不可用被误报为零销售；新增 Promise rejection 行为回归 `1/1`，全量 API unit `123` 个文件 `958/958`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过。本切片未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE PRD 条目复核完成：权限中心已由 `PermissionRolePanel`、`PermissionOrganizationPanel`、`PermissionUserPanel` 和 `usePermissionCenter` 编排入口组成，保持现有视觉与 API 契约；权限中心 focused behavior `19/19` 通过。退款/核销源码审计确认所有窗口以订单 `paidTime` 定界，`refundTime` 仅保留在订单同步/持久化字段，不参与分析过滤；本轮未引入重复重构，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 刷新降级可见性已修正：JeeSite 拉单异常继续允许使用本地 `OrderHeader` 重算，但 `GmvRefreshResult` 新增 `pullWarnings`，后台任务和 Web 刷新/历史回填不再把该降级伪装成无条件成功；API 回归 `2/2`、Web behavior `5/5`，全量 API unit `123` 个文件 `959/959`、Web behavior `55/243`、typecheck、目标文件 Prettier/ESLint 和 build:web（`3183 modules`）通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE JobRun 审计失败 fail-closed 已完成：`JobRunnerService` 无法写入初始 `running` 记录时不再执行实际任务；任务执行失败后若 `failed` 状态也无法持久化，则记录持久化错误并交给调度层，避免任务完成或失败但没有可恢复审计记录；新增行为回归 `8/8`，全量 API unit `123` 个文件 `961/961`、typecheck、API build、目标文件 Prettier/ESLint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 异步回填已接入 `JobRun`：保留现有内存 `jobId` 和 Web 轮询结果，同时由 `GmvModule` 注入 `JobsModule`，以稳定的 `gmv-refresh` 任务名记录回填区间、任务 ID、拉取/写入/警告摘要；JobRun 无法启动时内存任务明确进入 `error`，不会执行 JeeSite 拉单；GMV JobRun focused `2/2`、API integration `8` 个文件 `35/35`、API unit `124` 个文件 `963/963`、typecheck、API build、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 幂等记录错误分类已修正：`IdempotencyService.tryCreate()` 仅将唯一约束错误视为并发竞争；数据库锁定、连接失败等其它持久化异常现在原样暴露，不再伪装成“幂等记录创建冲突”；新增行为回归 `2/2`，全量 API unit `124` 个文件 `965/965`、typecheck、API build、目标文件 Prettier/ESLint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 幂等响应状态落库可观测性已补强：`IdempotencyGuard` 不再静默吞掉响应生成后 `completed/failed` 状态写回异常，改为仅记录幂等记录 ID、目标状态、HTTP 状态和错误原因，不记录请求幂等键或请求体；新增成功/失败写回异常行为回归 `2/2`，并修正 `gmv-refresh-job.spec.ts` 的自引用类型标注 `TS2502`。幂等 focused `9/9`、API unit `124` 个文件 `967/967`、API integration `8/35`、typecheck、API build、全量 format/Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 定时任务 JobRun 覆盖已补齐：此前仅保留进程内 `running` 标志的 10 个保留/聚合任务现在统一通过 `JobRunnerService` 记录运行、成功/失败状态，并将删除/更新数量与业务日期写入 `metaJson`；原有重叠保护、Beijing 日期和 SQL 批量边界保持不变。13 个 API `@Cron` 源文件静态核对均有 JobRunner，9 个保留任务行为回归 `46/46`，API unit `124` 个文件 `967/967`、API integration `8/35`、typecheck、API build、全量 format/Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 审计异步写入异常可观测性已补强：`AuditLogInterceptor` 保持审计写入失败不阻断业务响应，但对 `tryLog()` 意外 rejection 记录 action/objectType 和错误堆栈，不记录请求体；`AuditLogService` 的 best-effort 日志文案同步去除“silent”误导。新增行为回归 `1/1`，API unit `125` 个文件 `968/968`、API integration `8/35`、typecheck、API build、全量 format/Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 回填重启状态可恢复已完成：`JobRunnerService` 在写入 `running` 记录时保留初始 `refreshJobId` 与日期范围，并支持按 JSON 元数据读取同一回填任务的最新 `JobRun`；GMV 状态接口在进程内存找不到任务时回读持久化成功/失败/中断状态，Web 轮询将 `interrupted` 视为可恢复终态并沿既有幂等重试路径重新发起；中断期间已记录的页数、抓取/写入数量和错误摘要会保留，成功记录仍返回结果与警告摘要。新增 API 回归 `16/16`、Web GMV 行为回归 `6/6`，全量 API unit `125` 个文件 `972/972`、API integration `8/35`、Web behavior `55/244`、typecheck、API/Web build（Web `3183 modules`）、全量 format/Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 回填运行中进度 checkpoint 已补齐：`JobRunnerService.runJob(..., { persistMeta: true })` 对显式开启的任务合并快速连续元数据更新，并在最终 success/failed 状态前等待 checkpoint 完成；GMV 回填将页数、抓取/写入/跳过/错误数量及 `pulling/recomputing/finalizing` 阶段写入 `JobRun.metaJson`，所以进程在拉单或重算阶段中断后，状态接口读取到的是最后一次已落库进度，而不是仅有初始日期范围。新增 GMV 进度/阶段回归，相关 API focused `18/18`，全量 API unit `125` 个文件 `974/974`、API integration `8/35`、typecheck、API build、全量 format/Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE IAM 租户解析 fail-closed 已完成：`findTenantId()` 不再把数据库异常或缺失租户字段静默转换为 `tenant_default`，租户身份读取失败时不会继续签发带默认租户的会话；登录后的旧密码哈希升级和 `lastLoginAt` 写入仍保持非关键 best-effort，但失败会记录 userId 与安全错误摘要，且不再输出“升级成功”的误导日志。新增租户解析与登录写入行为回归 `8/8`，全量 API unit `126` 个文件 `978/978`、API integration `8/35`、typecheck、API build、全量 format/Lint、治理静态 pin `188/188`（API behavior `134`）和源码完整性 `1030/0` 通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 文案审核任务绑定错误语义已收紧：`CopyAuditService` 不再吞掉既有 `waiting_audit` 任务提升为 `draft` 时的数据库异常；自动建任务仅将唯一约束冲突视为并发竞争并重读获胜任务，锁定、连接失败和 schema 异常不再触发无依据的 fallback insert。新增状态提升失败、非唯一插入异常和唯一竞争重读行为回归 `3/3`，文案审核文件 `20/20`、全量 API unit `126` 个文件 `981/981`、API integration `8/35`、typecheck、API/Web build（Web `3183 modules`）、format、Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 认证异常可观测性已补强：`AuthService`、`JwtStrategy` 和 `/api/users/me` 对 AppUser/IAM 查询异常保留原有拒绝或兼容回退语义，同时记录不含凭据的安全错误摘要；新增认证日志行为回归 `18/18`。同时将 AutoLogin 单测默认外部地址改为公开字面 IP，去除并发 Cookie 校验对本机 DNS 的依赖，避免测试门禁因 DNS 时序 30 秒超时；AutoLogin `23/23`、全量 API unit `126` 个文件 `984/984`、API integration `8/35`、typecheck、API/Web build（Web `3183 modules`）、format、Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE IAM 请求租户边界已收紧：新增统一 `requireTenantId` 上下文校验，认证签发、JWT 状态重读、`PermissionGuard`、IAM 控制器和旧 `/api/users` 兼容入口均不再把缺失租户转换为 `tenant_default`；IAM 访问读取改为必须带租户，不再允许无租户通配查询；`/api/users/me` 不再为缺失 AppUser 生成合成身份。保留 `UserRoleBinding` 及冷启动双写投影中的显式默认租户兼容语义。租户边界 focused `41/41`、API unit `127` 个文件 `993/993`、API integration `8/35`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1031/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 用户读取租户边界已收紧：`UserQueryService` 的 `list`、`findById`、`hasUnrestrictedPeerRole`、`hasAdminRole` 必须显式传入 `tenantId`，`UserController` 统一从认证上下文传入租户；`AppUser` 用户读取的 `findUserById`、列表 count/page 和 unrestricted-role 检查始终带租户条件，列表总数与分页查询共用同一租户参数。保留 `UserRoleBinding` 兼容和写入路径兼容，不触碰 EXE/Desktop/开发库。用户查询 focused `20/20`、全量 API unit `128` 个文件 `994/994`、API integration `8/35`、typecheck、API/Web build（Web `3183 modules`）、全量 format/Lint、治理静态 pin `188/188`（API behavior `136`）和源码完整性 `1031/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 用户命令租户边界已收紧：`UserCommandService` 的创建、资料更新、停用和角色更新现在都必须显式带可用 `tenantId`，底层 `getUserActiveMeta`、`hasAdminRole`、`insertUser`、`updateUser` 均固定使用租户谓词和参数；缺失或空白租户 fail-closed，`ensureEnvAdmin` 仍保留独立冷启动专用路径，旧 `/api/users` HTTP 契约不变。新增缺失租户、跨租户更新和 SQL 参数顺序回归，用户/IAM focused `23/23`、全量 API unit `128` 个文件 `997/997`、API integration `8/35`、typecheck、API/Web build（Web `3183 modules`）、全量 format/Lint、治理静态 pin `188/188`（API behavior `136`）和源码完整性 `1031/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 看板错误可观测性已补强：KPI、趋势、分时、分布和商家榜请求的超时、网络异常及 429 不再静默回退为空状态，统一进入页面错误提示链路；新增 timeout/network/rate-limit 行为回归，focused `7/7`，Web 全量行为 `55` 个文件 `245/245`，typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1031/0` 和全栈 build（Web `3183 modules`）均通过。非 EXE 浏览器实测 `/gmv-cockpit` 正常渲染，按周切换后显示 `2026-W32 · GMV ¥154,799.86`；控制台仅保留既有登录刷新 `401`，未新增页面错误。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Dashboard 任务 KPI 错误可观测性已补强：`useDashboardTaskMetrics` 不再吞掉任务 KPI 请求失败并继续把初始 0 当作真实指标，当前请求错误会进入 `ErrorAlert`，同时保留请求代际、迟到响应丢弃和作用域卸载保护；新增失败态行为回归，focused `4/4`，Web 全量行为 `55` 个文件 `246/246`，typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1031/0` 和全栈 build（Web `3183 modules`）均通过。浏览器以 503 mock 验证卡片显示错误 alert，移除 mock 后 `/api/tasks/kpis` 恢复 `200` 且卡片正常渲染。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Dashboard 内容漏斗错误可观测性已补强：`useContentFunnel` 不再把 `getDashboardSummary` 失败清空为全 0，当前请求错误进入 `ErrorAlert`，刷新失败保留最近一次成功漏斗数据，同时保留请求代际和作用域卸载保护；新增初次失败/刷新失败行为回归，focused `5/5`，Web 全量行为 `55` 个文件 `248/248`，typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1031/0` 和全栈 build（Web `3183 modules`）均通过。浏览器以 503 mock 验证内容漏斗错误 alert，移除 mock 后 `/api/content/dashboard/summary` 恢复 `200`。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 操作审计列表错误可见性已补强：`AuditLogView` 现在消费 `useAuditLogList` 的当前请求错误并渲染 `ErrorAlert`，接口失败不再与“暂无审计日志”的正常空结果混淆；新增初次失败行为回归，focused `4/4`，Web 全量行为 `55` 个文件 `249/249`，typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1031/0` 和全栈 build（Web `3183 modules`）均通过。浏览器以 503 mock 验证 `/audit-logs` 出现错误 alert，移除 mock 后 `/api/audit-logs` 恢复 `200` 且正常列表渲染。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 规则配置列表错误可见性已补强：`loadSettingsRules` 不再静默吞掉主列表请求异常，新增当前请求 `loadError` 并由 `SettingsPanelBody` 渲染 `ErrorAlert`；刷新失败保留最近一次成功规则列表，下一次加载开始时清除旧错误；新增初次失败/刷新失败行为回归，focused `8/8`，Web 全量行为 `55` 个文件 `251/251`，typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1031/0` 和全栈 build（Web `3183 modules`）均通过。浏览器以 503 mock 验证 `/settings` 显示规则列表错误 alert，移除 mock 后 `/api/content/rules` 恢复 `200`。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 推荐套餐列表错误可见性已补强：`loadRecommendationsPage` 不再静默吞掉主列表请求异常，当前请求错误进入 `ErrorAlert`，刷新失败保留最近一次成功推荐列表，并保留分页缓存、请求代际和卸载保护；新增初次失败/刷新失败行为回归，focused `5/5`，Web 全量行为 `55` 个文件 `253/253`，typecheck、format、Lint、治理静态 pin `188/188`、源码完整性 `1031/0` 和全栈 build（Web `3183 modules`）均通过。浏览器以 503 mock 验证 `/recommendations` 显示错误 alert，移除 mock 后 `/api/content/packages/recommend` 恢复 `200`。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 文案生成套餐详情错误可见性已补强：`usePackageDetail` 不再把详情读取/刷新失败静默转换为“未抓取”，当前错误进入 `ErrorAlert`；同一套餐刷新失败保留最近一次成功详情，切换套餐或清空选择时仍清理旧详情，继续保留请求代际与作用域卸载保护；新增初次失败/同套餐刷新失败行为回归，focused `6/6`，Web 全量行为 `55` 个文件 `255/255`，typecheck、目标文件 format/Lint 和 Web build（`3183 modules`）均通过。浏览器以 503 mock 验证 `/generate` 出现错误 alert，移除 mock 后详情请求恢复 `200` 且页面重新显示“1组明细”。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 套餐分析页错误可见性已补强：`usePackageAnalysisPage` 不再静默吞掉分析请求失败，当前错误进入页面 `ErrorAlert`；刷新失败保留最近一次成功分析，继续保留请求代际与作用域卸载保护；新增初次失败/刷新失败行为回归，focused `5/5`，Web 全量行为 `55` 个文件 `256/256`，typecheck、目标文件 format/Lint 和 Web build（`3183 modules`）均通过。浏览器以 503 mock 验证 `/packages/:packageId` 出现错误 alert，移除 mock 后分析请求恢复 `200` 且分析内容正常渲染。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 文案生成套餐列表错误可见性已补强：`useGenerate.loadPackages` 不再吞掉首屏推荐接口失败，当前错误进入生成页 `ErrorAlert`；刷新失败保留最近一次成功套餐列表，成功重试会清除旧错误，同时继续保留请求代际、分页合并和作用域卸载保护；新增失败/成功重试行为回归，focused `4/4`，Web 全量行为 `55` 个文件 `257/257`，typecheck、目标文件 format/Lint、Web build（`3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1031/0` 均通过。浏览器以 503 mock 验证 `/generate` 显示“请求失败 (503)”错误 alert，移除 mock 后推荐接口恢复 `200`，套餐与详情正常渲染。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 生成页 AI 状态读取错误可见性已补强：`useAICopyConfig` 不再吞掉 `getAICopyStatus` 异常，当前错误进入生成页 `ErrorAlert`；刷新失败保留最近一次成功 AI 状态，成功重试会清除旧错误，同时继续保留请求代际、保存互斥和作用域卸载保护；新增失败/成功重试行为回归，focused `5/5`，Web 全量行为 `55` 个文件 `258/258`，typecheck、目标文件 format/Lint、Web build（`3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1031/0` 均通过。浏览器以 503 mock 验证 `/generate` 显示“请求失败 (503)”且套餐仍正常加载，移除 mock 后 AI 状态恢复 `200` 并显示“已接入”。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 活动详情读取错误可见性已补强：`useCampaignDetail` 新增主详情 `loadError` 与嵌套任务 `tasksError`，活动/任务请求失败不再伪装成“活动不存在”或“暂无活动任务”；任务刷新失败保留最近一次成功列表，成功重试清除旧错误，同时继续保留分页与请求代际保护；新增主详情失败、任务失败保留与重试恢复行为回归，focused `2/2`，Web 全量行为 `56` 个文件 `260/260`，typecheck、目标文件 format/Lint、Web build（`3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1032/0` 均通过。浏览器以 503 mock 验证活动详情页显示错误 alert，移除 mock 后活动与任务恢复 `200` 并正常渲染“活动四”“任务四”；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 社群详情抽屉错误可见性已补强：`useCommunityDetail` 将详情、表现、嵌套任务和推荐套餐读取拆为独立错误状态；详情失败保留列表行，任务/推荐/表现失败不再与空内容混淆，重开抽屉时旧请求不会覆盖当前社群；新增四域失败与任务重试恢复行为回归，focused `2/2`，Web 全量行为 `57` 个文件 `262/262`，typecheck、目标文件 format/Lint、Web build（`3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过。浏览器以四接口 503 mock 验证社群详情仍显示“社群四”并出现 4 个独立错误 alert，切换为 200 后表现区间、推荐套餐“套餐四”和任务“任务四”正常渲染；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 零动销维度错误可见性已补强：`useZeroSalesPage` 的区域/品类分布切换不再静默吞掉失败；在请求代际和作用域保护下，当前维度错误进入页面 `summaryError`，成功重试清除错误并保留上一份有效图表数据，迟到旧失败不会覆盖新维度结果。新增行为回归 focused `2/2`（文件内 `5/5`），Web 全量行为 `57` 个文件 `264/264`，typecheck、Web build、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Dashboard 推荐源部分失败与测试分层已收口：`DashboardSummaryService` 在推荐源异常时保留数据库 KPI，同时返回 `sourceError`，Web 内容漏斗显示“推荐源暂不可用”，不再把空状态分布伪装成真实 0；新增 API Dashboard 行为 `15/15`、Web 映射/漏斗行为 `8/8`。同时将 `data-analysis-paid-time-api.spec.ts` 明确排除出 API unit，避免 HTTP 临时 SQLite 夹具误入纯单元套件；API unit `128` 个文件 `998/998`、API integration `9` 个文件 `38/38`、Web behavior `57` 个文件 `265/265`、typecheck、API/Web build、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `paidTime` HTTP 集成验收已补齐：新增 `data-analysis-paid-time-api.spec.ts`，临时 SQLite 夹具包含“支付时间在窗口内、退款在窗口外”与“退款在窗口内、支付在窗口外”两条订单；真实 `/api/data-analysis/summary`、`/api/refund/today`、`/api/refund/trend`、`/api/refund/top-merchants` 与 `/api/data-analysis/export` 同时验证仅按 `paidTime` 归属，Excel `订单明细` 仅包含支付窗口内订单，数据分析净 GMV/退款组件和退款 KPI/趋势/商家排行均对账。focused `3/3`，API integration 全量 `9` 个文件 `38/38`，typecheck、API build、目标文件 format/Lint、治理静态 pin `188/188`（API behavior `137`）和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 活动列表错误可见性已补强：`CampaignsView` 接入 `usePagedList.error` 的 `ErrorAlert`，活动列表请求失败时保留上一页数据并显式提示，不再只依赖瞬时 Toast 或把失败误显示为空列表；新增页面契约回归 `5/5`、`usePagedList` 行为 `11/11`，Web behavior `57` 个文件 `265/265`、Web legacy `85` 个文件 `346/346`、typecheck、API/Web build、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 任务中心列表与 KPI 错误可见性已补强：`TaskCenterView` 同时展示 `usePagedList.error` 与新增的 `kpiError`，任务列表请求失败保留上一页任务，KPI 失败不再只清空为未标记的空卡片；成功重试会清除对应错误，既有请求代际和作用域卸载保护保持不变。新增 `useTaskCenter` 行为回归 `7/7`、页面契约回归 `4/4`，Web behavior `57` 个文件 `267/267`、Web legacy `85` 个文件 `347/347`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 任务详情错误可见性已补强：`useTaskDetail` 将主详情失败与任务表现子请求失败拆为 `loadError`/`performanceError`；主详情失败不再只显示 Toast，表现请求失败不再静默变成“暂无任务表现”，已成功的详情数据会保留，成功重试清除对应错误，原有并行请求、请求代际和作用域保护保持不变。新增详情生命周期行为 `6/6`、任务详情契约回归 `6/6`，Web behavior `57` 个文件 `269/269`、Web legacy `85` 个文件 `348/348`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 用户管理列表错误可见性已补强：`UserManagementView` 接入 `usePagedList.error` 的 `ErrorAlert`，列表读取失败时保留上一页用户并显式提示；显式搜索改为强制刷新，避免软缓存掩盖真实读取失败，成功重试清除错误；旧 `/api/users` 契约与写入生命周期保持不变。新增用户管理行为回归 `5/5`、页面契约回归 `5/5`，Web behavior `57` 个文件 `270/270`、Web legacy `85` 个文件 `349/349`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 文案审核队列与详情错误可见性已补强：`useAudit` 新增独立的 `loadError`/`detailError`，审核队列读取失败不再被挂载逻辑吞掉并伪装成空队列，文案详情失败仍保留列表投影但明确提示；成功重试清除对应错误，当前请求代际、文案切换和作用域卸载保护保持不变。新增审核生命周期行为回归 `8/8`、页面/旧契约回归 `5/5`，Web behavior `57` 个文件 `272/272`、Web legacy `85` 个文件 `350/350`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 操作审计详情错误可见性已补强：`useAuditLogDetail` 新增持久 `detailError`，详情读取失败时弹窗保留列表投影并显示 `ErrorAlert`，成功重试清除错误，关闭弹窗或作用域销毁会清理错误且迟到响应不回写；保留既有审计详情 Toast 与请求代际保护。新增详情行为回归 `4/4`、页面/旧契约回归 `6/6`，Web behavior `57` 个文件 `273/273`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Cookie 配置状态错误可见性已补强：Cookie 状态读取失败不再被转换成 `null` 并误显示为“认证失效/离线”，`useCookieConfigDialog` 新增 `statusError`，弹窗显示明确错误，成功重试清除错误并保留请求代际/卸载保护；Cookie 更新请求拒绝时也会显示通用失败提示，不再静默。新增配置行为回归 `6/6`，Web behavior `57` 个文件 `275/275`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 顶栏数据源状态错误可见性已补强：`useShellLayout` 不再吞掉 `getCookieStatus` 失败，顶栏在状态不可读时显示“状态未知”并保留错误语义；成功轮询后恢复“已连接/未连接”，同时保留单飞轮询、上次成功状态和卸载保护。新增 ShellLayout 行为回归 `4/4`，Web behavior `57` 个文件 `276/276`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 生成页多页套餐读取部分失败可见性已补强：`loadGeneratePackages` 后续分页请求失败时不再静默丢弃，保留已成功页、标记套餐结果不完整并通过 `packageLoadError` 显示明确提示；请求代际失效后不回写旧错误，首屏完全失败语义保持不变。新增部分失败行为回归 `2/2`，Web behavior `57` 个文件 `278/278`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 生成执行错误可见性已补强：作战卡生成请求拒绝不再形成未处理 Promise，文案生成拒绝不再只依赖瞬时拦截器 Toast；两类失败分别进入页面 `ErrorAlert`，成功重试清除错误，切换套餐和作用域销毁仍阻止迟到结果回写。新增生成生命周期行为回归 `7/7`，Web behavior `57` 个文件 `280/280`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 规则默认值读取错误可见性已补强：规则默认值接口失败不再被静默吞掉，Settings 新增独立 `defaultsError` 并显示 `ErrorAlert`；失败保留上一份默认值，成功重试清除错误，既有请求代际和规则列表错误语义保持不变。新增 Settings 默认值行为回归 `1/1`，Web behavior `57` 个文件 `281/281`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 社群库列表读取错误可见性已补强：`CommunityLibraryView` 接入 `usePagedList.error` 的 `ErrorAlert`，列表读取失败时保留上一页社群并显式区分“读取失败”和“空列表”；成功重试清除错误，既有分页、筛选缓存和请求代际保护保持不变。新增社群库列表行为回归 `1/1`，Web behavior `58` 个文件 `282/282`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1033/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE AI 配置保存错误可见性已补强：`useAICopyConfig` 新增独立 `configError`，保存接口失败不再只依赖瞬时拦截器 Toast，生成页显示持久 `ErrorAlert`；失败不覆盖现有状态，成功重试清除错误，既有状态读取错误、请求代际和作用域卸载保护保持不变。新增 AI 配置保存行为回归 `1/1`，Web behavior `58` 个文件 `283/283`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1034/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 推荐页分类选项读取错误可见性已补强：分类接口失败不再静默吞掉，新增独立 `categoryError` 并显示 `ErrorAlert`；保留上一份分类选项，刷新动作同时重试主列表和分类接口，成功重试清除错误，主列表错误与分类错误互不覆盖且保留请求代际/卸载保护。新增分类读取行为回归 `1/1`，Web behavior `58` 个文件 `284/284`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、目标文件 format/Lint、治理静态 pin `188/188` 和源码完整性 `1034/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 任务中心行级操作错误可见性已补强：排期、发布、完成、失败、取消和转派的真实接口失败进入持久 `actionError` 并显示 `ErrorAlert`，用户取消确认不再被误判为接口错误；成功重试清除错误，发布/失败对话框保留重试能力，既有重复提交、请求代际和作用域卸载保护保持不变。新增操作失败/重试/取消行为回归 `2/2`、页面契约回归 `4/4`，Web behavior `58` 个文件 `286/286`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1034/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 社群库写入错误可见性已补强：创建/编辑、CSV/JSON 批量导入、删除、停用和启用统一收敛到 `useCommunityLibrary`，真实接口失败进入持久 `writeError` 并显示 `ErrorAlert`；失败保留弹窗和表单以便重试，成功清除错误并刷新列表，通用确认操作新增 `onError` 投影，写入请求在作用域销毁后不再回写。新增社群库写入生命周期行为 `5/5`（含重复提交保护）、相关页面契约 `4/4`，Web behavior `58` 个文件 `291/291`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1034/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 设置规则写入错误可见性已补强：规则创建、激活和删除失败不再只依赖拦截器，新增持久 `writeError` 并显示 `ErrorAlert`；创建失败保留弹窗和表单以便重试，成功重试清除错误，用户取消删除确认不产生写入错误，既有重复提交、请求代际和作用域卸载保护保持不变。新增 Settings 写入失败/重试/取消行为回归 `3/3`，Settings 生命周期聚焦 `12/12`，Web behavior `58` 个文件 `294/294`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1034/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE IAM 用户管理写入错误可见性已补强：创建、编辑、停用和启用失败不再只依赖瞬时 Toast，统一进入持久 `writeError` 并显示 `ErrorAlert`；创建/编辑失败保留表单以便重试，成功重试清除错误，打开新表单会清理旧写入错误，既有 IAM 重复提交、请求代际和作用域卸载保护保持不变。新增用户管理失败/重试行为回归 `3/3`，用户管理生命周期聚焦 `8/8`，Web behavior `58` 个文件 `297/297`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1034/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 权限中心写入错误可见性已补强：角色权限保存、角色创建、组织保存和用户授权保存失败统一进入页面级 `writeError` 并显示 `ErrorAlert`，原有读取 `errorMessage` 保持独立；失败保留当前角色草稿/对话框/授权草稿以便重试，成功重试清除错误，刷新和重新打开角色/组织编辑态清理旧错误，既有 IAM 重复提交、角色/用户切换和作用域卸载保护保持不变。新增四类写入失败/重试行为回归 `4/4`，权限中心生命周期聚焦 `23/23`，Web behavior `58` 个文件 `301/301`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1034/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 权限中心用户授权读取错误可见性已补强：切换用户或刷新授权详情失败时清空旧授权草稿并投影到页面 `errorMessage`，不再只依赖瞬时 Toast 或把失败显示成空授权；成功重试清除读取错误并恢复授权，既有用户切换请求代际、重复保存和作用域卸载保护保持不变。新增授权读取失败/重试行为回归 `1/1`，权限中心生命周期聚焦 `24/24`，Web behavior `58` 个文件 `302/302`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1034/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Attribution 操作错误可见性已补强：手工归因与归因重算失败统一进入持久 `actionError` 并显示 `ErrorAlert`；手工归因失败保留绑定弹窗以便重试，成功重试清除错误，手工绑定增加 composable 级单飞保护，既有请求代际和作用域卸载保护保持不变。新增归因写入失败/重试/重复提交行为回归 `2/2`，Attribution 生命周期聚焦 `6/6`，Web behavior `58` 个文件 `304/304`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1034/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 活动写入错误可见性已补强：活动创建/编辑、删除和列表状态转换失败统一进入持久 `writeError` 并显示 `ErrorAlert`；创建/编辑失败保留表单以便重试，成功重试清除错误，删除确认取消不计为接口失败，状态转换保留单飞、请求代际和作用域卸载保护。新增活动写入失败/重试/取消/重复提交与迟到结果行为回归 `6/6`，Web behavior `59` 个文件 `310/310`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1035/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 活动详情操作错误可见性已补强：详情页启动、暂停、结束和取消失败统一进入持久 `actionError` 并显示 `ErrorAlert`；成功重试清除错误，状态操作保留单飞、请求代际和作用域卸载保护，取消确认不改变现有业务语义。新增详情操作失败/重试/重复提交/迟到结果行为回归 `2/2`，活动详情生命周期聚焦 `4/4`，Web behavior `59` 个文件 `312/312`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1035/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 任务详情操作错误可见性已补强：发布、标记失败、取消、排期、完成和重新分配的真实接口失败统一进入持久 `actionError` 并显示 `ErrorAlert`；发布/失败对话框仅在 mutation 真正成功后关闭，后续详情刷新失败单独提示且不把已成功写入误判为失败，既有请求代际、旧操作结果丢弃和作用域卸载保护保持不变。新增 mutation 失败/重试、刷新失败和迟到结果行为回归 `3/3`，任务详情生命周期聚焦 `8/8`，Web behavior `59` 个文件 `314/314`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1035/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 任务创建写入错误可见性已补强：单任务创建/编辑与批量创建失败统一进入共享持久 `writeError` 并显示 `ErrorAlert`；失败保留对应弹窗和表单以便重试，成功重试清除错误，原有重复提交、请求代际和作用域卸载保护保持不变。新增单任务/批量任务失败重试行为回归 `2/2`，任务创建生命周期聚焦 `6/6`，Web behavior `59` 个文件 `316/316`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1035/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 旧用户管理授权抽屉错误可见性已补强：`useUserAccessLoader` 保留授权读取错误并在失败时清空旧授权草稿，抽屉显示持久 `ErrorAlert` 并提供“重新加载授权”；保存失败进入持久 `writeError`，保留当前授权草稿和抽屉以便重试，用户切换、迟到响应和作用域卸载不会回写过期错误，旧 `/api/users` 兼容入口保持不变。授权 loader 回归 `3/3`、旧用户授权契约回归 `5/5`，Web behavior `59` 个文件 `316/316`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1035/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 文案审核写入错误可见性已补强：审核接口失败不再只返回 `false` 并依赖瞬时 Toast，`useAudit` 将真实失败投影为持久 `actionError`，审核面板保留当前草稿以便重试；审核成功但队列刷新失败仍单独归入 `loadError`，切换文案或作用域卸载不会回写过期错误。新增审核写入失败/成功重试/迟到失败行为回归 `3/3`，旧审核分页/页面契约回归 `5/5`，Web behavior `59` 个文件 `317/317`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1035/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 浏览器只读烟测复核通过：Playwright 打开审核、权限中心、旧用户管理授权抽屉和数据分析页，页面均正常渲染；`/api/users/me`、IAM 角色/权限/组织/用户/授权、审核队列和数据分析 summary 均返回 `200`，未执行保存、启停或审核写入；首轮旧会话 `browser-refresh` `401` 后按既有恢复路径 `browser-local-session` `201`，仅保留既有 Element Plus `el-pagination small` 弃用警告。

2026-08-09 非 EXE 审核分页兼容性警告已收口：`AuditQueuePanel` 将 Element Plus 已弃用的 `small` 属性替换为 `size="small"`，分页总数、页码、页大小和事件契约不变；legacy 分页契约回归 `5/5`，新浏览器会话审核页控制台达到 `0 warnings`，审核队列 `200`，全量 Web behavior `59` 个文件 `317/317`、Web legacy `85` 个文件 `351/351`、typecheck、API/Web build（Web `3183 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1035/0` 和 `git diff --check` 均通过；仅保留既有首轮 `browser-refresh 401` 后 `browser-local-session 201` 的恢复日志，本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE API 全套行为复核通过：API unit `128` 个文件 `998/998`、API legacy `103` 个文件 `408/408`、API integration `9` 个文件 `38/38`；覆盖 IAM HTTP `13/13`、认证双账号隔离、`paidTime` 跨日 `3/3`、`/ready` `2/2`、Cookie 配置和 AI 配置边界，测试中的外部失败/重试日志均为既有模拟场景且进程以 `0` 退出；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 **历史记录（当时）** 非 EXE schema 只读复核完成：`db:drift-check` 的迁移历史→Schema、实际数据库→Schema 均为 `No difference detected`，当时实际数据库→迁移历史因 `0004`、`0005`、`0007`、`0014` 登记 checksum 与源码差异而按预期失败；`db:history-report` 保持 `readOnly=true`、`repairApplied=false`，未写入 `prisma/dev.db`；后续兼容基线已落地，当前结果以本文顶部状态为准。

2026-08-09 非 EXE 任务更新/删除命令职责分层已完成：新增 `UpdateTaskService` 与 `DeleteTaskService`，将任务更新的冻结/FK/assignee 校验、空 PATCH shell、状态乐观锁和任务删除的状态/发布历史/归因访问保护从 `DistributionTaskService` 迁移到 canonical application services；`DistributionTaskService` 仅保留查询、范围元数据和兼容 facade，命令控制器直接注入新服务，路由、权限、返回结构、并发状态 pin 与旧调用入口不变。任务聚焦回归 `11` 个文件 `81/81`，API unit `128` 个文件 `998/998`、API legacy `103` 个文件 `408/408`、API integration `9` 个文件 `38/38`、Web behavior `59` 个文件 `317/317`，typecheck、全栈 build（Web `3183 modules`）、Lint（0 errors，0 warnings）、format、治理静态 pin `188/188`、源码完整性 `1037/0` 和 `git diff --check` 均通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `/ready` 生产启动身份 fail-closed 与隔离集成 fixture 已完成：生产 `ReadinessService` 只有在 `BOOT_ID` 非空、数据库、迁移 checksum、Web 资源和发布清单均有效时才返回 `ready`；新增生产缺少 `BOOT_ID` 的回归，Readiness focused `10/10`。集成 fixture 改为迁移名称与 checksum 双重校验，并固定使用 API workspace 的隔离 setup 路径，修复旧临时库或开发库被误读的问题；真实 `/ready` HTTP `2/2`。全量 API unit `128/999`、legacy `103/408`、integration `9/38`，typecheck、lint、format、根构建（Web `3183 modules`）、治理 `188/188`、源码完整性 `1037/0` 均通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 权限中心页面分层收口已完成：保留既有角色、组织、用户三面板与 `usePermissionCenter` 编排契约，将 `PermissionCenterView.vue` 的页面级全局样式移至 `styles/permission-center.css`，模板、交互、响应式断点和视觉选择器语义不变；页面文件由 `551` 行降至 `87` 行，Vue 专用 `:deep` 选择器同步转换为等价 CSS 选择器。权限中心 focused `24/24`、Web behavior `59/317`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、定向 lint/format 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 删除/状态写入迟到结果收口已完成：共享 `confirmAndDelete` 新增可选 `isActive` 作用域活性门，社群库删除/停用/启用、活动删除和任务删除在所属作用域卸载后不再打开确认框或发起新请求，已发起请求的迟到成功/失败也不再投影 Toast、刷新或错误状态；新增 helper 迟到成功/失败/提前失活回归与社群行操作卸载回归，focused `3` 个文件 `17/17`，全量 Web behavior `60` 个文件 `321/321`、Web legacy `85` 个文件 `351/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1038/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 预警处理错误可见性已补强：单条/批量处理失败统一进入持久 `actionError` 并显示页面 `ErrorAlert`，成功重试清除错误；保留操作历史失败记录、请求代际和作用域卸载保护，迟到失败不再回写页面。新增预警处理失败/重试回归 `1/1`，预警生命周期聚焦 `3/3`，全量 Web behavior `60` 个文件 `322/322`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1038/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 操作历史导出错误可见性已补强：CSV 导出失败现在进入抽屉持久 `exportError` 并显示 `ErrorAlert`，成功重试清除错误；保留原有下载、CSV 注入防护和操作历史数据契约。新增导出失败/成功重试回归 `2/2`，全量 Web behavior `61` 个文件 `324/324`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1039/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 零动销时间线生命周期与错误可见性已补强：时间线请求失败进入抽屉持久 `error` 并显示 `ErrorAlert`，成功重试清除；关闭抽屉、快速切换请求和作用域销毁通过请求代际保护丢弃迟到数据，不再回写已失效抽屉。新增失败/重试、关闭后迟到响应和销毁后禁止读取回归 `3/3`，全量 Web behavior `62` 个文件 `327/327`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1040/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 动销时间线错误可见性已补强：`useMovementTimeline` 将请求失败从一次性 Toast 收敛为持久 `error`，动销时间线抽屉显示 `ErrorAlert`，成功重试清除错误；保留快速切换、关闭和作用域销毁的请求代际保护。新增失败/重试行为回归 `1/1`，全量 Web behavior `62` 个文件 `328/328`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1040/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Cookie 更新错误可见性已补强：Cookie 更新接口拒绝或返回业务失败时进入独立持久 `saveError`，配置弹窗显示明确错误，成功重试清除错误；状态读取错误与更新错误分离，保留重复提交、请求代际和作用域卸载保护。新增拒绝失败/业务失败重试回归 `2/2`，全量 Web behavior `62` 个文件 `329/329`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1040/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 数据分析 Excel 导出错误可见性已补强：导出失败进入页面持久 `exportError` 并显示 `ErrorAlert`，成功重试清除错误，作用域销毁后不再投影迟到反馈；保留原有导出 URL、文件名和下载行为。新增导出失败/成功重试回归 `1/1`，全量 Web behavior `62` 个文件 `330/330`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1040/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Generate 文案复制错误可见性已补强：复制函数返回真实成功/失败结果并校验降级 `execCommand` 的布尔结果，页面持久 `copyError` 显示 `ErrorAlert`；失败保留错误以便再次点击复制，成功重试清除错误，复制请求代际和 Vue 作用域销毁后不再投影迟到提示。新增复制失败/降级复制失败/销毁后迟到反馈回归 `3/3`，全量 Web behavior `63` 个文件 `333/333`、Web legacy `85/351`、typecheck、Web build（`3183 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1041/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 任务中心任务 ID 复制稳定性已补强：抽取共享剪贴板工具，统一支持安全上下文 API、降级 textarea 复制和真实布尔结果校验；任务列表复制失败进入持久 `copyError` 并显示 `ErrorAlert`，成功重试清除错误，任务中心 composable 对请求代际和作用域销毁后的迟到结果做丢弃。新增任务 ID 复制失败/成功重试与销毁后迟到反馈回归 `2/2`，全量 Web behavior `64` 个文件 `335/335`、Web legacy `85/351`、typecheck、Web build（`3185 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1044/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 设置规则详情读取错误可见性已补强：规则展开 `getRule` 失败不再回退为看似成功的空 payload，失败进入持久 `payloadErrorById` 并显示 `ErrorAlert`，提供“重新加载详情”重试；成功重试清除错误，规则列表变更、请求代际和 Vue 作用域销毁后丢弃迟到详情结果。新增规则详情失败/列表 payload 直读/销毁后迟到反馈回归 `3/3`，全量 Web behavior `65` 个文件 `338/338`、Web legacy `85/351`、typecheck、Web build（`3186 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1046/0` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 商家热力图错误可见性已补强：请求失败统一通过 `extractErrorMessage` 归一化，保留 API 结构化响应中的业务错误信息，不再只读取 `Error.message`；既有单飞、请求代际和作用域销毁保护不变。新增结构化 API 错误横幅回归，热力图 focused `4/4`，全量 Web behavior `65` 个文件 `339/339`、Web legacy `85/351`、typecheck、Web build（`3186 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1046/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 回填重复命令边界已补强：回填入口、快捷范围和日期区间按钮在 `backfilling` 期间统一禁用，命令分发层二次阻断活动中的新回填，并仅在真实发出命令后关闭菜单、清理日期区间，避免用户误以为已发起新任务或丢失未执行的区间选择；新增回填中阻断/空闲关闭后发出回归 `2/2`，全量 Web behavior `66` 个文件 `341/341`、Web legacy `85/351`、typecheck、Web build（`3187 modules`）、Lint、format、治理静态 pin `188/188`、源码完整性 `1048/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 辅助分布错误可见性已补强：品类分布和区域热力请求不再通过 `catch(() => null)` 静默变成空图，新增独立 `extrasError` 持久错误并显示页面 `ErrorAlert`；单项失败时保留该图表上一份数据，另一项仍可独立更新，两个请求成功重试后清除错误并替换旧数据。新增辅助分布失败保留数据/成功重试回归 `2/2`，全量 Web behavior `67` 个文件 `343/343`、Web legacy `85/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Generate 深链套餐上下文错误可见性已补强：当 `?packageId=` 不在推荐分页内时，补充 `getPackageAnalysis` 请求失败或返回不匹配套餐不再静默忽略，进入现有 `packageLoadError` 并保留原始 `packageId`，按 ID 的生成/作战卡/详情兼容路径不变；新增深链上下文失败回归 `1/1`，Generate focused `7/7`，全量 Web behavior `67` 个文件 `344/344`、Web legacy `85/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 商家列表/详情错误状态隔离已补强：商家页将共享 `loadError` 拆分为 `listError`/`detailError`，列表和详情请求分别清理与保留错误，成功重试不再留下旧错误，并通过请求代际与作用域保护避免迟到结果回写；保留 `loadError` 兼容聚合，页面分别显示两类错误，API、路由和金额口径不变。新增商家失败重试/列表与详情错误隔离行为回归 `2/2`，商家生命周期聚焦 `7/7`，全量 Web behavior `67` 个文件 `346/346`、Web legacy `85/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 商家销售子请求错误状态隔离已补强：汇总、趋势、排行和手动重算分别维护 `summaryError`、`trendError`、`rankingError`、`refreshError`，成功翻页/重载/重算重试只清除对应错误；保留 `loadError` 兼容聚合，商家销售页面分别显示各区域错误，三路并发失败不再互相覆盖。新增排行重试、汇总/趋势并发隔离和手动重算重试行为回归 `3/3`，商家销售生命周期聚焦 `8/8`，全量 Web behavior `67` 个文件 `349/349`、Web legacy `85/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `AppleDateRangePicker` 样式职责已分层：将组件内 `366` 行 scoped CSS 移至 `apps/web/src/styles/components/apple-date-range-picker.css`，组件保留模板、交互、日期核心调用、事件和原选择器契约；组件由 `720` 行降至 `353` 行，未改变视觉选择器或运行时行为。日期范围核心聚焦 `3/3`，全量 Web behavior `67` 个文件 `349/349`、Web legacy `85` 个文件 `351/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 回填菜单样式职责已分层：将 `GmvCockpitBackfill.vue` 内嵌 `467` 行 scoped CSS 移至 `apps/web/src/styles/components/gmv-cockpit-backfill.css`，组件由 `828` 行降至 `360` 行；保留 `scoped`、`:deep`、`:global`、选择器、Teleport、回填入口、日期区间和生命周期契约，未改变回填命令或 API 行为。回填相关聚焦 `3` 个文件 `7/7`，全量 Web behavior `67` 个文件 `349/349`、Web legacy `85` 个文件 `351/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、新 CSS Prettier、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV 单日日期选择器样式职责已分层：将 `AppleDatePicker.vue` 内嵌 `229` 行 scoped CSS 移至 `apps/web/src/styles/components/apple-date-picker.css`，组件由 `505` 行降至 `275` 行；日期核心继续复用共享 `date-picker-core`，`modelValue`/`update:modelValue`/`change`、`placeholder`、`disabledDate`、月份导航、Teleport、生命周期与原选择器契约不变。日期核心与 GMV 编排聚焦 `4` 个文件 `14/14`，全量 Web behavior `67` 个文件 `349/349`、Web legacy `85` 个文件 `351/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、新 CSS Prettier、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `ShellSidebar` 样式职责已分层：将组件内 `391` 行 scoped CSS 移至 `apps/web/src/styles/components/shell-sidebar.css`，组件由 `572` 行降至 `180` 行；保留 `navTree`/`collapsed` props、`toggle-collapse` 事件、路由激活与分组展开、预加载、暗色主题和响应式选择器契约。导航相关聚焦 `3` 个文件 `13/13`，全量 Web behavior `67` 个文件 `349/349`、Web legacy `85` 个文件 `351/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、新 CSS Prettier、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `CommunityDetailCard` 样式职责已分层：将组件内 `117` 行 scoped CSS 移至 `apps/web/src/styles/components/community-detail-card.css`，组件由 `424` 行降至 `306` 行；保留社群详情、表现、推荐套餐、任务分页、错误提示、props、事件和任务/创建/批量创建路由契约不变。社区详情行为聚焦 `2/2`，社区库/任务中心静态契约聚焦 `11` 个文件 `48/48`，全量 Web behavior `67` 个文件 `349/349`、Web legacy `85` 个文件 `351/351`、typecheck、Web build（`3187 modules`，临时输出目录）、Lint、format、新 CSS Prettier、治理静态 pin `188/188`、源码完整性 `1049/0` 和 `git diff --check` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `AppleButton` 样式职责已分层：将组件内 `264` 行 scoped CSS 移至 `apps/web/src/styles/components/apple-button.css`，组件由 `337` 行降至 `72` 行；保留模板、props、默认值、click 事件、变体、尺寸、加载/禁用态、图标和 `:deep` 选择器契约不变。Web behavior `67` 个文件 `349/349`、typecheck、Lint、format、Web build（`3187 modules`）、治理静态 pin `188/188`、源码完整性 `1049/0` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `GmvTopMerchantsTable` 样式职责已分层：将组件内 `200` 行 scoped CSS 移至 `apps/web/src/styles/components/gmv-top-merchants-table.css`，组件由 `356` 行降至 `155` 行；保留 GMV/退款/核销率展示、Top-N 截断提示、商家分页、上一页/下一页事件和 EmptyState 契约不变。GMV 分页 legacy `4/4`、GMV cockpit 行为 `7/7`，全量 Web behavior `67` 个文件 `349/349`、Web legacy `85` 个文件 `351/351`、typecheck、Web build（临时输出目录，`3187 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1049/0` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE `GmvKpiRow` 样式职责已分层：将组件内 `131` 行 scoped KPI 覆盖样式移至 `apps/web/src/styles/components/gmv-kpi-row.css`，组件由 `367` 行降至 `235` 行；保留基础 `gmv-proto-kpi.css` 先加载、组件覆盖样式后加载的顺序，以及 KPI 卡片、GMV fen 拆分、比较指标和 tone 视觉契约不变。全量 Web behavior `67` 个文件 `349/349`、Web legacy `85` 个文件 `351/351`（串行重跑）、typecheck、Web build（临时输出目录，`3187 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1049/0` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE GMV cockpit 洞察计算职责已分层：将成交峰值、核销率、品类亮点和退款率四类 insight 从 `GmvCockpitBody.vue` 提取至 `apps/web/src/features/gmv/composables/gmv-insights.ts`，`GmvInsightRow` 复用共享 `GmvInsightItem` 类型；新增纯逻辑行为回归 `3/3`，保留 `readFen`、原有文案、排序、百分比和空输入语义，页面组件由 `290` 行降至 `214` 行。全量 Web behavior `68` 个文件 `352/352`、Web legacy `85` 个文件 `351/351`（串行）、typecheck、Web build（临时输出目录，`3188 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1051/0` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 退款/核销页面请求错误状态已隔离：KPI、趋势和商家榜分别维护 `kpiError`、`trendError`、`merchantError`，三路并发失败不再互相覆盖；各区域成功重试只清除对应错误，页面分别显示 `ErrorAlert`，同时保留 `loadError` 兼容聚合和请求代际/作用域销毁保护。新增错误隔离与重试行为回归 `1/1`，退款/核销生命周期聚焦 `5/5`，paidTime 日期/窗口/分页 legacy `8/8`；全量 Web behavior `68` 个文件 `353/353`、Web legacy `85` 个文件 `351/351`（串行）、typecheck、Web build（临时输出目录，`3188 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1051/0` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE Generate 返回适配职责已分层：将 `buildUseGenerateReturn` 从混合套餐读取/生成动作生命周期的 `generate-core.ts` 提取至 `apps/web/src/composables/generate-return.ts`，原 `generate-core` 导出路径继续 re-export，GenerateView 的 `channelOptions`、错误状态、套餐诚实度字段和动作 API 保持不变；组件编排核心由 `426` 行降至 `337` 行。Generate 聚焦行为 `17/17`、Residual #238/#249 legacy `9/9`，全量 Web behavior `68` 个文件 `353/353`、Web legacy `85` 个文件 `351/351`（串行）、typecheck、Web build（临时输出目录，`3189 modules`）、Lint、format、治理静态 pin `188/188` 和源码完整性 `1052/0` 均通过；构建仅保留既有第三方 Rollup annotation、动态 import 与 CSS sourcemap 提示；本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

## Windows 发布验收（当前明确延期）

以下项目属于恢复 Windows 发布时的独立门禁；它们不阻塞本轮 API/Web/Prisma 非 EXE 优化，但完成前不得宣称 Windows 安装包已发布：

1. 在干净 Windows 环境执行安装、升级和旧库导入五类场景：正常、锁定、损坏、中断重试、已迁移。
2. 候选目录 `release_candidate_v011_latest2/` 仅作为此前生成和扫描的保留证据；本轮 API/Web 变更后未重新打包，旧工作树 `release/` 中已有产物包含 `.env` / `.cookie.cache`，不能作为新包证据，也不应擅自删除用户资产；仍需在干净 Windows 环境安装、启动并验证候选安装器。
3. 本地开发浏览器已完成登录、`/api/users/me`、数据库业务路由、权限中心和数据分析链路；仍需在干净安装包环境复核同一链路。
4. IAM shadow 报告接口和零差异集成用例已完成；仍需在干净安装包运行链路重采样报告，并完成退款 `paidTime` 跨日的发布环境证据。
5. Windows 发布恢复后仍需在备份、来源和干净安装包证据齐全时复核迁移、旧库导入与 `/ready`；当前非 EXE `db:drift-check` 已通过，不应把历史开发库报告误写成当前漂移失败。

## 已满足的发布前门禁

- 当前非 EXE 门禁：`typecheck`、API/Web build、API/Web focused/legacy 回归、`check:integrity`、`db:validate` 和 `db:drift-check` 已按本文件顶部状态基线复核。
- 旧 pin 已隔离为 API/Web legacy suite，行为套件与 legacy 均由 CI 独立执行；数据分析限额、CSV 限额、审计路径策略、保留任务、扫描上限和数据库启动/迁移检查，以及本轮文案、社群、活动、任务和用户投影护栏，已改为行为覆盖；当前精确统计为 API `103`、Web `85`、合计 `188` 个静态 pin，已达到治理目标。
- CI 已独立执行 API 行为/legacy、API 集成、Web 行为/legacy、schema、覆盖率、构建、源码完整性和发布契约任务；`typecheck` job 同时检查 API 生产源码、API 测试源码和 Web 类型；数据库备份及旧安装包回退说明已保留在 `docs/PACKAGING.md`，并由 `release-contracts` job 校验。

## 发布操作约束

- 生成安装包前确认目标输出目录及旧产物归属；不对用户已有 `release/`、数据库或截图执行递归删除。
- 只有在上述验收证据齐全后才将版本改为 `0.11.0`，再执行发布提交。
