# 内容运营平台 · 持续优化收束报告

> **目标**：`继续优化，我不说停不准停`  
> **范围**：NestJS monorepo Content Operation Platform（`apps/api` + `apps/web` + `packages/shared`）  
> **分支**：`codex/unsold-inventory-links`  
> **状态截止**：2026-08-17；Residual **#297** 之后的 API/Web 稳定性、P0-03 迁移基线、P0-04 关键写入幂等、P1-05 Outbox 真闭环、用户目录/生命周期/标签数据口径、商品库存/售卖时间/订单只读边界以及商品中心重复入口收口均已记录
> **当前门禁**：非 EXE `typecheck`、API/Web build、API/Web 行为与 legacy 回归、源码完整性、`db:validate`；0015 应用到开发库后再恢复 `db:drift-check` 作为当前门禁
> **日期跨度**：2026-07-22 → 2026-08-17（含多次 compaction 续跑）

> **范围边界**：本轮不执行 Windows Desktop、EXE、安装器、`win-unpacked` 或安装后真实进程 smoke。桌面源代码与发布流程的历史完成项不等于当前 Windows 发布已验收；统一口径见 [文档对齐总览](DOCUMENTATION-STATUS.md)。

---

## 2026-08-17 商家提货分外部快照接入

提货分页面现从 JeeSite `corePartnerAccountRecord/listData` 读取合作商账户记录 JSON，按 `corePartnerId` 聚合 `availableCommodityPoint`，仅 `state=1` 计入可用提货分。后台任务串行分页、分批写入 `PartnerPickupPointSnapshot` staging，全部页面成功后只在短事务中切换 `PartnerPickupPointSnapshotState` 活动指针；外部失败或中断继续保留旧快照。新增 API 为 `GET/POST /api/finance-center/pickup-points` 及刷新任务状态接口，前端提货分页提供“同步并刷新”，不允许本地创建或调整外部账户。

实现证据：`0029_partner_pickup_point_snapshot`、API build、Prisma schema 校验、迁移策略测试、源码完整性检查、定向 ESLint 和提货分映射/刷新任务聚焦测试均已通过；工作区全量 Web `vue-tsc`/Vite 当前被未触及的 Dashboard WIP 缺失导入与类型漂移阻断；真实 15,994 条外部全量刷新留待目标环境由有权限用户执行，避免在开发阶段重复制造外部负载。

---

## 1. 目标与工作方式

在用户明确说停之前，持续做安全 / 正确性 / 工程可维护性的 residual 硬化：

1. 扫描 Medium+ 残差（安全、静默截断、IDOR、范围泄漏、SQL 性能、PII 等）
2. 优先落地 **高 ROI** 项（小改动、可验证、直接影响运营台面诚实度或安全面）
3. 每个 residual 尽量带：API 投影 + shared 类型 + SPA 提示 + `residual-N-hardening.spec.ts` pin 测试
4. 验证：`npm run typecheck`、`npm run build`、API/Web focused 与 legacy vitest、`npm run check:integrity`、`npm run db:validate`、`npm run db:drift-check`
5. 记账：`memory/continuous-optimization-2026-07-23.md` + `MEMORY.md` 指针

**不做**的事：破坏性攻击、DoS、供应链投毒、写 exploit；安全工作限定在已授权的本仓库防御硬化。

---

## 2. 总体成果一览

| 指标 | 数值 |
|------|------|
| Residual 编号跨度 | **#21 → #297**（约 277 个落地项，含少量编号跳号） |
| 源码 pin 测试 | **157** 个 `apps/api/test/residual-*-hardening.spec.ts` |
| 主战场 | 安全 / 数据范围、SQL 批量化、读路径瘦身、SPA 能力接线、**静默 Top-N / take-cap 诚实度** |
| 共享约定 | `limit` / `matched` / `truncated` 或 `*Limit` / `*Loaded` / `*Truncated` / `*Missed` + SPA 琥珀色 `list-cap-hint` |
| 类型检查 | api `tsc` + web `vue-tsc` 在 #297 收口时均为 clean |
| 记忆索引 | Residual **#40–#290** 记入 `continuous-optimization-2026-07-23` |

---

## 3. 阶段地图

按问题族粗分（编号大致连续，阶段边界会有交叉）。

### 3.1 基础安全与数据范围（约 #21–#80，含 07-22 会话）

- **Auth / RBAC**
  - JWT 重载 `isActive` + roles + bindings（短 TTL）；停用 / 改角色 / 改密失效缓存
  - Env-admin 冷启动种子；登录优先 AppUser；前端角色只信服务端
  - 密码长度策略、自停用拦截、登录 DTO 长度上限
- **Data scope 真正接线**（此前有 helper 未贯通）
  - `buildDataScope` / `resolveScopedQuery` / `isResourceInScope`
  - 套餐推荐、告警、商家、零动销、社群、动销、运营台等读路径全量 scope
  - 多 area / multi-merchant 用 `IN (...)`，去掉「只取第一个 binding」的静默夹紧
- **Campaign / Task / Copy 范围与操作者**
  - 列表 / 详情 / 绩效 scope；平台级分析需 unrestricted
  - 发布 / 失败 / 取消 / 改派打 JWT operator；DTO 校验
- **其它安全硬化（post-compaction 系列）**
  - OrderHeader 日期时间 ISO / 空格混写 → `sqlDatetime` / `sqlBeijingDate` / 半开区间
  - CSV 公式中和、审计拦截、SQLite null 处理、敏感字段 redact
  - 重定向 / SSRF 主机钉扎、IDOR 防御、归因完整性、money recompute 单飞
  - Battle-card RBAC、GMV 统一、copy approve 竞态、任务生命周期冻结等

### 3.2 SQL 批量与写路径（约 #88–#99）

把 N+1 / 逐行写改成批量，降低锁与往返：

| Residual | 主题 |
|----------|------|
| #88 | batchCreate 插入路径 |
| #89 | attribution `hasDirect` bulk |
| #90 | batch tracking codes |
| #91 | updateSkuCounts bulk write |
| #92 | manualBind / revoke bulk TPD |
| #93 | community import 多行 INSERT |
| #94 | geocoder bulk CASE UPDATE |
| #95 | UserRoleBinding 多行 INSERT |
| #96 | batchCreate bulk rollback DELETE |
| #97 | alert resolve 多行 |
| #98 | GMV upsert binary-split |
| #99 | 死代码 `hasAttributions` 移除 |

### 3.3 读路径瘦身 / RETURNING / 死代码（约 #100–#173）

系统性地去掉「写前全量 getById / 多余 COUNT / 双次加载」，改为：

- status-only 转移、areaId-only / packageId-only 预检
- `RETURNING` / list-shell 响应
- 空集合 short-circuit、denorm 过滤、FK batch 跳空腿
- 死代码清理（`assertCanTransition`、`getCopyPackageId`、`toIsoText` 等）

代表项：#100 community delete 去 COUNT、#104 copy `versionNo` 原子、#106–#118 任务 / 活动 / 用户 mutator slim、#135 / #139 / #140 RETURNING 族、#164–#173 list-shell 族。

### 3.4 SPA 能力接线与字段表面（约 #174–#249）

后端已有、前端未暴露或半接线的能力补齐：

- 任务：列表取消 + reason、publish/fail 门闩、列表筛选、日期 / packageId / assignee、详情写字段、KPI 逾期点选筛选、列表改派
- 活动 / 社群：详情 KPI、任务嵌套、表单 DTO 字段、状态 CTA、isActive / areaId / startDate 筛选
- 用户：列表形态、编辑 / 角色编辑、isActive 筛选、再激活 CTA
- 审计：详情、日期 UI
- 其它：overview / recommendations / refund / movement 的 as-of date、GMV/refund top-merchants 分页、package force-refresh、generate scenario、fail evidenceUrl、batch create status、createUser roles 等

### 3.5 静默截断诚实度（约 #250–#290）— 本目标后期主战场

运营台大量 Top-N / `take` / SQL `LIMIT` 在 UI 上被当成「全集」。统一模式：

```text
API:  LIMIT+1 探测 或 loaded>=limit
     → 投影 { items, limit, matched, truncated }
       或 *Limit / *Loaded / *Truncated / *Missed
SPA:  琥珀色 list-cap-hint 横幅 + 标题 Top N+
Pin:  residual-N-hardening.spec.ts 源码静态断言
```

| Residual | 主题 | 关键 cap / 探测 |
|----------|------|----------------|
| #250 | 商家 SKU 列表 | 500-cap |
| #256 | 效果看板窗口 | dateFrom/dateTo 表面 |
| #260 | 执行时间线 | LIMIT honesty |
| #261 | Dashboard 漏斗窗口 | window honesty |
| #262–#263 | CSV 导出 | 1000 行 honesty |
| #264 | merchant-sales 排名 | LIMIT |
| #265 | GMV + refund top-merchants | LIMIT |
| #266 | cache-head 列表 | LIMIT |
| #267 / #275 / #277 | 推荐源 | `RECOMMEND_CACHE_CAP=500` |
| #268 | 生成页套餐选择器 | first-200 |
| #269 | 商家热力 | `PLATFORM_SCAN_LIMIT` |
| #270–#273 | 交互列表时间窗 | INTERACTIVE window |
| #274 | 已解决告警日限 | `RESOLVED_ALERT_DAY_LIMIT` |
| #276 | 活动列表 startDate 跨度 | span honesty |
| #278 / #281 | 派生社群 | 双 cap + group-cap=12 |
| #279 | 数据分析面板 | panel-cap |
| #280 | 运营台 focus 面板 KPI | `FOCUS_PANEL_LIMIT=8` / 告警预览 30 |
| #282 | 昨日复盘 good/weak 列表 | `DAILY_REVIEW_LIST_LIMIT=5` |
| #283 | 告警 focus 套餐格 | `FOCUS_PACKAGE_LIMIT=8` |
| #284 | 效果明细条数 | `DASHBOARD_COPY_PERF_TAKE=200` |
| #285 | 商家竞品 | `MERCHANT_COMPETITORS_LIMIT=5` |
| #286 | 效果看板文案标题 join | `DASHBOARD_GENERATED_COPY_TAKE=500` |
| #287 | Overview 零动销商家 Top | LIMIT+1 |
| #288 | Overview 分布图 | LIMIT+1 / stale 固定桶 |
| #289 | GMV 分布（含「其他」长尾） | head GMV vs 平台 total |
| #290 | 运营台文案标题 join（#286 对称） | `DASHBOARD_GENERATED_COPY_TAKE=500` |

---

## 4. 本轮收口明细（#288–#290）

### 4.1 Residual #288 — Overview 分布 LIMIT 诚实度

**问题**  
`/overview/distribution` 返回裸数组 + 静默 `LIMIT`；图表把 Top-N 占比当成全平台结构。

**改动**

- API：`OverviewDistributionPayload = { items, limit, matched, truncated }`；area/category 用 LIMIT+1；stale 对固定 ≤5 桶投影
- SPA：`OverviewDistributionResponse`；`overview-core` / `useOverview` sinks；`OverviewChartCard` 横幅 + Top N+；`useZeroSalesPage` 解包 `.items`

**验证**：`residual-288-hardening` 3/3；api tsc / web vue-tsc clean

### 4.2 Residual #289 — GMV 分布 LIMIT 诚实度

**问题**  
`/gmv/distribution` 裸数组；SPA 品类环图丢掉服务端合成的「其他」并在 head 上重算 share，运营会把 Top-N 当成 100% GMV。

**改动**

- API：`GmvDistributionPayload`；`mapDistributionRows` 在 head GMV < 平台 total 时 `truncated=true`（「其他」长尾）
- SPA：cockpit sinks + 图表横幅；**关键** `mapCategoryRows` 保留「其他」、优先服务端 share

**验证**：`residual-289` 3/3；`consolidated-pure-logic` 30/30；api tsc / vue-tsc clean

### 4.3 Residual #290 — 运营台 GeneratedCopy 标题 join 诚实度

**问题**  
`computeTodayOperationConsole` 与效果看板共用 `loadDashboardPerfAndCopies`（文案 head=500），标题 miss 静默成 `-`；#286 只修了 `computePerformance`。

**改动**

- API：投影 `titleJoinLimit/Loaded/Truncated/Missed`
- Shared：`TodayOperationConsole` + `ConsoleResponse` 可选字段
- SPA：`dashboard-console` map；`ReviewPanel` 横幅；`DashboardFocusSections` 接线

**验证**：`residual-290-hardening` 3/3；#289 / #286 / #288 / #287 pin 仍绿；shared rebuild + api tsc + vue-tsc clean

---

## 5. 关键约定与常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `RECOMMEND_CACHE_CAP` | 500 | 推荐 / 告警 / 效果源 head |
| `DASHBOARD_COPY_PERF_TAKE` | 200 | 效果明细条数 |
| `DASHBOARD_GENERATED_COPY_TAKE` | 500 | 文案标题 / 版本 join |
| `MERCHANT_COMPETITORS_LIMIT` | 5 | 同区同品竞品 |
| `FOCUS_PANEL_LIMIT` | 8 | 运营台 focus 卡片 |
| `ALERT_PREVIEW_LIMIT` | 30 | 告警预览 |
| `DAILY_REVIEW_LIST_LIMIT` | 5 | 昨日复盘 good/weak |
| `FOCUS_PACKAGE_LIMIT` | 8 | 告警 focus 套餐 |
| `MAX_DERIVED_COMMUNITY_GROUPS` | 12 | 派生社群卡片 |
| Overview distribution default | 20（DTO Max 50） | 分布图 Top-N |
| GMV distribution SPA | 主图 10 / 品类 8 / 区域 20 | 图表 head |

**诚实度字段习惯**

- 列表 / 分布：`items` + `limit` + `matched` + `truncated`（LIMIT+1 时 `matched = limit+1`）
- Join / take head：`*Limit` + `*Loaded` + `*Truncated`（`loaded >= limit`）+ 可选 `*Missed`
- SPA：`list-cap-hint` 琥珀色提示，标题可加 `Top N+`

---

## 6. 验证基线（#290 收口时）

```text
apps/api:
  npx tsc -p tsconfig.build.json --noEmit          # clean
  npx vitest run test/residual-290-hardening.spec.ts
  npx vitest run test/residual-289-hardening.spec.ts
  npx vitest run test/residual-288-hardening.spec.ts
  npx vitest run test/residual-287-hardening.spec.ts
  npx vitest run test/residual-286-hardening.spec.ts
  npx vitest run test/residual-265-hardening.spec.ts
  # 以及相关 pure-logic / operation-battle / alert.service 等焦点套件

packages/shared:
  npm run build                                    # clean

apps/web:
  ../../node_modules/.bin/vue-tsc --noEmit         # clean
```

Pin 测试风格：读源码字符串断言关键路径仍投影 honesty 字段、SPA 仍渲染横幅文案，防止回归时「功能在、诚实度被剥掉」。

---

## 7. 主要触达面（按层）

### API（代表性目录）

- `apps/api/src/content/dashboard.service.ts` — 运营台 / 效果 / 漏斗
- `apps/api/src/overview/` — KPI / trend / distribution / top-offenders
- `apps/api/src/gmv/` — distribution / top-merchants / metrics
- `apps/api/src/merchant*/` — SKU cap、竞品、热力、sales ranking
- `apps/api/src/attribution/`、`campaign/`、`community/`、`distribution-task/`、`user/`
- `apps/api/src/common/sqlite-datetime.ts`、`sql-chunk.ts` — 时间与 take 常量
- `apps/api/src/user-access/` — data-scope + scope-guards

### Shared

- `packages/shared/src/api-console-types.ts`
- `packages/shared/src/operation-console-today-types.ts`
- `packages/shared/src/api-content-performance-types.ts`
- 以及 alerts / communities / 各 API DTO 形态扩展

### SPA

- Dashboard：`dashboard-console.ts`、`ReviewPanel.vue`、`DashboardFocusSections.vue`
- Overview：`overview-core.ts`、`OverviewChartCard.vue`、`OverviewOffendersTable`
- GMV cockpit：`gmv-cockpit-*.ts`、`GmvCockpitChartCard.vue`
- Performance / Merchants / Alerts / Communities / Zero-sales 等列表与横幅

### 测试

- `apps/api/test/residual-*-hardening.spec.ts`（157）
- 领域单测：`operation-battle`、`alert.service`、`consolidated-pure-logic` 等

---

## 8. 仍挂起 / 下一轮候选（#292+）

Residual #291 已完成：Dashboard summary 的 `statusDistribution` / `topPackages` 现在返回推荐源的 `sourceMatchedCount`、`sourceLimit`、`sourceTruncated`，Web 内容漏斗在源被截断时显示范围提示；API 1/1、Web 2/2 行为测试覆盖该契约。

Residual #292 已完成：Attribution unmatched-orders SPA 已接入类型化 API、近 90 天分页列表、fen 金额展示、权限感知的手工绑定/重算操作，并加入订单归因导航；Web 行为 3/3、路由权限 1/1。

Residual #293 已完成：Generate 套餐选择器沿用现有推荐 API 分页，合并可加载的推荐头部并去重；保留服务端 cap 与分页失败提示，现有 `filterable` 下拉覆盖完整已加载候选；Web 行为 2/2。

Residual #294 已完成：API 全局 `ValidationPipe` 与显式 `createDtoPipe` 默认拒绝未知字段，避免客户端字段被静默剥离；Web 文案/规则请求移除由 JWT 服务端生成的 `createdBy`，并以 DTO/HTTP 行为覆盖兼容边界；API DTO 白名单行为 3/3，API unit 109/900、integration 7/29。

Residual #295 已完成：API CSP 移除 `unsafe-inline` / `unsafe-eval`，脚本和样式仅允许同源资源；响应头行为测试 1/1，Playwright Dashboard 验收入口、分包、登录和业务请求成功，控制台 0 errors / 0 warnings。

Residual #296 已完成：API 登录、本地会话和刷新写入 `content_ops_auth` HttpOnly Cookie，JWT Strategy 同时接受 Cookie/Bearer，Web 开启 credentials 并移除 localStorage JWT 持久化；logout 可清除 Cookie。Cookie 单测 2/2、Auth HTTP 集成 5/5；Playwright 复核无 `auth_token`、刷新 201、业务请求 200，控制台 0 errors / 0 warnings。

Residual #297 已完成：浏览器登录、本地会话和刷新改用 Cookie-only 响应，Web 认证状态不再保存或发送 JWT，401 恢复与固定周期 Cookie 刷新继续可用；旧 API token 返回保留为外部客户端兼容边界，旧 JWT 解析器和刷新常量已移除。Auth HTTP 集成 6/6；API unit/legacy/integration 当前为 113/910、103/408、7/31，Web behavior/legacy 为 13/69、85/345；Playwright 复核无 `auth_token`，第二次 reload 的 `browser-refresh` 为 201，受保护业务请求为 200，控制台 0 errors / 0 warnings。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 新建流程切片已完成：角色复制或组织编辑后再次点击“新建”会清空旧草稿并回到创建态，新增行为测试 2/2；API unit/Web behavior 当前为 113/911、14/74。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 刷新一致性切片已完成：权限中心刷新后清除已从列表移除的角色/用户选择和授权草稿，新增行为测试 1/1；API unit/Web behavior 当前为 113/911、14/74。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 授权抽屉加载一致性切片已完成：加载失败清空旧授权草稿并禁用保存，切换用户时丢弃迟到响应，新增行为测试 2/2；API unit/Web behavior 当前为 113/911、14/74。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 权限中心用户选择一致性切片已完成：用户列表接入服务端关键词搜索并展示超过 100 条时的截断提示，授权请求丢弃切换用户后的迟到响应，新增行为测试 2/2；API unit/Web behavior 当前为 113/911、14/76。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API 退款 paidTime 跨日行为证据切片已完成：测试夹具显式设置 refundTime，覆盖支付窗口内但退款窗口外应计入、支付窗口外但退款窗口内应排除；排行与趋势继续统一按 paidTime 取数，API unit 当前为 113/911。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 分页请求稳定性切片已完成：共享 `usePagedList` 在显式搜索/刷新时取消待执行筛选防抖，避免一次筛选触发两次网络请求，新增行为测试 1/1；Web behavior/legacy 当前为 14/77、85/345，Web 全量为 99 个文件、422 个测试。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 分页生命周期稳定性切片已完成：共享 `usePagedList` 在 Vue 作用域销毁时清理待执行筛选防抖，并使已发出的迟到响应失效，新增行为测试 1/1；Web behavior/legacy 当前为 14/78、85/345，Web 全量为 99 个文件、423 个测试；覆盖率 API unit 113/911、API integration 7/31、Web behavior 14/78 均已重新实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 预警列表请求稳定性切片已完成：显式翻页/刷新会取消已排队的筛选防抖，避免一次用户操作触发两次网络请求，新增行为测试 1/1；Web behavior/legacy 当前为 15/79、85/345，Web 全量为 100 个文件、424 个测试；覆盖率 API unit 113/911、API integration 7/31、Web behavior 15/79、测试治理 Web behaviorSpecs 15 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 请求去重一致性切片已完成：响应/错误只在仍持有对应 `AbortController` 时释放 in-flight 槽位，避免旧响应清掉新请求控制器，新增行为测试 2/2；Web behavior/legacy 当前为 15/81、85/345，Web 全量为 100 个文件、426 个测试；类型、Lint、格式和测试治理均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 认证生命周期切片已完成：登出使在途刷新/本地会话响应失效，刷新调度器在 `clear` 后不再重排，互斥请求的旧清理回调不会误清新请求，避免旧会话在登出后复活，新增行为测试 3/3；Web behavior/legacy 当前为 16/84、85/345，Web 全量为 101 个文件、429 个测试；覆盖率 API unit 113/911、API integration 7/31、Web behavior 16/84、测试治理 Web behaviorSpecs 16 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 成员关系一致性切片已完成：移除用户的主组织成员后，权限中心会清除失效的 `primaryOrgUnitId` 草稿，避免提交被 API 的成员关系约束拒绝；新增行为测试 1/1；Web behavior/legacy 当前为 16/85、85/345，Web 全量为 101 个文件、430 个测试；覆盖率 API unit 113/911、API integration 7/31、Web behavior 16/85、测试治理 Web behaviorSpecs 16 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 权限中心刷新一致性切片已完成：连续刷新时以请求代际保护角色、权限和组织列表，旧响应晚返回不会覆盖最新结果，也不会提前清除最新 loading 状态；新增行为测试 1/1；Web behavior/legacy 当前为 16/86、85/345，Web 全量为 101 个文件、431 个测试；覆盖率 API unit 113/911、API integration 7/31、Web behavior 16/86、测试治理 Web behaviorSpecs 16 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API IAM shadow fail-open 稳定性切片已完成：legacy projection 查询失败时记录结构化 `iam_shadow_skipped` 并计入 `skipped`，不阻断 PermissionGuard；只有两侧投影均成功才计入比较统计，新增行为测试 1/1；API unit 当前为 113/912，API integration 7/31、Web behavior 16/86，静态 pin 治理仍为 188。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API PermissionGuard shadow fail-open 防御切片已完成：即使未预期的 shadow `inspect` 异常逃逸服务层，guard 也记录结构化 `iam_shadow_guard_skipped` 后继续执行正常 IAM 授权，新增行为测试 1/1；API unit 当前为 113/913，API integration 7/31、Web behavior 16/86，静态 pin 治理仍为 188。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API IAM legacy projection 边界切片已完成：`ORG_TREE` 兼容投影固定在直接授权组织节点的 `areaId/merchantId`，不再把子商家重复展开到旧绑定表；新增单元回归 1/1、区域树 HTTP shadow 回归 1/1，API unit 当前为 113/914，API integration 7/32、Web behavior 16/86，静态 pin 治理仍为 188。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 API IAM shadow 可信度切片已完成：shadow 读取持久化 `UserRoleBinding` 与 IAM 派生兼容投影进行真实双轨比较，不再把 JWT 中已重投影的 bindings 当作旧侧证据；`ALL/NONE` 无范围 assignment 与兼容表行对齐，新增回归 1/1，API unit 当前为 113/915，API integration 7/32、Web behavior 16/86，静态 pin 治理仍为 188。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API IAM shadow 入口可观测性切片已完成：IAM access 读取异常现在记录包含路径、用户、租户和原因的结构化 `iam_shadow_skipped`，并计入全局/路径 skipped，继续 fail-open；新增行为测试 1/1，API unit 当前为 113/916，API integration 7/32、Web behavior 16/86，覆盖率、Lint、格式均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Cookie 状态轮询一致性切片已完成：ShellLayout 已提供全局 30 秒状态轮询，CookieConfigDialog 移除重复永久轮询，仅在打开/保存后刷新；新增行为测试 1/1，Web behavior 当前为 17/87、legacy 85/345；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web ShellLayout 轮询稳定性切片已完成：Cookie 状态轮询增加单飞保护，慢请求不会与下一周期叠加；组件卸载后迟到响应不再回写状态；新增行为测试 2/2，Web behavior 当前为 18/89、legacy 85/345；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API ContentService 推荐预热生命周期切片已完成：保存启动延迟定时器并在模块销毁时清理；预热任务增加单飞保护，慢预热不会被周期任务重复启动；新增行为测试 2/2，API unit 当前为 113/918、API integration 7/32、Web behavior 18/89；`test:coverage`、治理、typecheck、Lint、格式、API/Web 构建均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 套餐分析页请求生命周期切片已完成：API 拒绝不再形成未处理 Promise，重复加载以请求代际保护最新分析，卸载后的迟到响应被丢弃；新增行为测试 3/3，Web behavior 当前为 19/92、legacy 85/345；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 推荐列表请求生命周期切片已完成：推荐/分类请求在页面卸载后不再回写状态，卸载后再次触发 `load` 不再发起新请求；初始化改为显式处理的非 async mounted 回调；新增行为测试 2/2，Web behavior 当前为 20/94、legacy 85/345，Web 全量为 105 个文件、439 个测试；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 共享 Web `useApiFetch` 请求生命周期切片已完成：旧成功/失败响应不能覆盖最新请求，作用域销毁会使在途请求失效并阻止新请求；新增行为测试 3/3，Web behavior 当前为 21/97、legacy 85/345，Web 全量为 106 个文件、442 个测试；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Dashboard 角色切换请求生命周期切片已完成：旧角色成功/失败响应不会覆盖当前角色数据，作用域销毁后迟到响应被丢弃且不再发起新请求；新增行为测试 3/3，Web behavior 当前为 22/100、legacy 85/345，Web 全量为 107 个文件、445 个测试；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Dashboard 内容漏斗请求生命周期切片已完成：旧请求成功/失败响应不会覆盖最新漏斗，作用域销毁后迟到响应被丢弃且不再发起新请求；保留失败时显示空漏斗语义；新增行为测试 3/3，Web behavior 当前为 23/103、legacy 85/345，Web 全量为 108 个文件、448 个测试；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Overview 请求生命周期切片已完成：KPI、趋势、分布和零动销商家请求按独立代际保护最新数据与错误，作用域销毁后迟到响应被丢弃且不再发起请求；保留现有软失败、Top-N 截断诚实度和 as-of 日期语义；新增行为测试 3/3，Web behavior 当前为 24/106、legacy 85/345，Web 全量为 109 个文件、451 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Task Center KPI 请求生命周期切片已完成：重复刷新时旧 KPI/错误不能覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；不改变任务列表分页和 KPI 业务口径；新增行为测试 3/3，Web behavior 当前为 25/109、legacy 85/345，Web 全量为 110 个文件、454 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Audit Queue 列表请求生命周期切片已完成：筛选/分页/审核后刷新产生的旧列表响应不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留当前列表错误透传、选中项保留和分页语义；新增行为测试 3/3，Web behavior 当前为 26/112、legacy 85/345，Web 全量为 111 个文件、457 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Dashboard 任务 KPI 生命周期切片已完成：`DashboardTaskMetrics` 的 API 请求从组件脚本收敛到 composable，旧 KPI 响应/旧 finally 不会覆盖最新加载状态，作用域销毁后迟到响应被丢弃且不再发起新请求；保持权限判断、指标展示和失败静默语义；新增行为测试 3/3，Web behavior 当前为 27/115、legacy 85/345，Web 全量为 112 个文件、460 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Movement 时间线请求生命周期切片已完成：切换 SKU/天数时旧时间线响应和旧错误不会覆盖最新结果，关闭抽屉或作用域销毁后迟到响应被丢弃且不再发起新请求；保留时间线错误提示、天数裁剪和抽屉交互语义；新增行为测试 3/3，Web behavior 当前为 28/118、legacy 85/345，Web 全量为 113 个文件、463 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Movement 主列表/KPI 生命周期切片已完成：筛选、分页、Tab 切换和日期刷新产生的旧列表/KPI 响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留筛选、分页、日期和错误语义；新增行为测试 4/4，Web behavior 当前为 29/122、legacy 85/345，Web 全量为 114 个文件、467 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 退款/核销验证请求生命周期切片已完成：重复刷新、切换退款/核销、趋势窗口和商家榜分页产生的旧 KPI/趋势/榜单响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；继续统一沿用订单 `paidTime` 日期参数、趋势 `endDate` 和商家榜分页/限额诚实度；新增行为测试 4/4，Web behavior 当前为 30/126、legacy 85/345，Web 全量为 115 个文件、471 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Attribution 未匹配订单请求/操作生命周期切片已完成：旧分页响应不会覆盖最新订单，作用域销毁后迟到列表、手工绑定和归因重算结果均不再回写、提示或触发刷新；保留权限、fen 金额、分页和归因业务语义；新增行为测试 4/4，Web behavior 当前为 31/130、legacy 85/345，Web 全量为 116 个文件、475 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Zero-Sales 页面请求生命周期切片已完成：商家/SKU 列表、Tab 切换刷新、总览 KPI、未销分布和区域/品类维度切换产生的旧响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留现有分页、筛选、Top-N 截断诚实度和零动销业务口径；新增行为测试 7/7，Web behavior 当前为 33/137、legacy 85/345，Web 全量为 118 个文件、482 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 商家页请求生命周期切片已完成：商家列表、商家详情、详情天数切换和路由初始化产生的旧响应与错误不会覆盖最新结果，作用域销毁后迟到响应被丢弃且不再发起新请求；保留现有筛选、排序、分页、详情窗口和 LIMIT 截断诚实度；新增行为测试 4/4，Web behavior 当前为 34/141、legacy 85/345，Web 全量为 119 个文件、486 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 数据分析页请求生命周期切片已完成：摘要刷新、日期/预设切换和 Excel 导出在作用域销毁后不再回写、提示或发起新请求；保留现有 `paidTime`、金额转换、分层查询和导出契约；新增行为测试 3/3，Web behavior 当前为 35/144、legacy 85/345，Web 全量为 120 个文件、489 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web GMV cockpit 请求生命周期切片已完成：KPI、趋势、分时、分布、商家榜和日期切换以请求代际保护最新数据；作用域销毁后迟到响应、刷新轮询和回填进度不再回写、弹出提示或发起新请求；重复回填被阻止；保留现有 GMV fen 对账、退款 `paidTime`、Top-N 截断诚实度和刷新重试语义；新增行为测试 3/3，Web behavior 当前为 36/147、legacy 85/345，Web 全量为 121 个文件、492 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Generate 套餐详情请求生命周期切片已完成：详情 GET 与强制刷新 POST 使用请求代际和 Vue 作用域销毁保护，迟到详情不会覆盖最新数据，迟到刷新不会弹出成功/失败提示，卸载后不再发起新请求；保留现有强制刷新 POST、价格/明细展示和 Generate 业务契约；新增行为测试 4/4，Web behavior 当前为 37/151、legacy 85/345，Web 全量为 122 个文件、496 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 任务详情请求生命周期切片已完成：详情与任务级 performance 并行加载使用请求代际保护，状态变更统一经过单一 mutation runner，旧操作不会覆盖新详情或弹出过期提示，作用域销毁后不再回写、刷新时间线或发起新请求；保留任务状态机、状态变更后时间线重读、reassign body-only 合并和任务性能口径；新增行为测试 4/4，Web behavior 当前为 38/155、legacy 85/345，Web 全量为 123 个文件、500 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 任务创建/批量创建提交生命周期切片已完成：单个创建/编辑与批量创建增加重复提交保护、请求代际和 Vue 作用域销毁保护，迟到提交不会继续提示、关窗或触发 `onSaved`；保留现有校验、payload、状态规则、创建/编辑和批量创建契约；新增行为测试 4/4，Web behavior 当前为 39/159、legacy 85/345，Web 全量为 124 个文件、504 个测试；API unit 113/918、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API 幂等写入边界切片已完成：任务单创建挂载 `IdempotencyGuard`；已完成幂等响应由 interceptor 直接回放，不再重复执行 handler；同 key 的 pending 请求返回冲突，失败记录可复用；现有任务、活动和社群幂等路由统一接入回放 interceptor；新增行为测试 2/2，API unit 当前为 113/920、API integration 7/32、Web behavior 39/159；`test:coverage`、治理、typecheck、Lint、格式、API/Web 构建均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 API 幂等缓存边界补强已完成：JSON `null` 响应通过显式 replay 标记正确回放；operation 推断使用完整 URL，避免动态路由丢失 controller 前缀；新增行为测试 2/2，API unit 当前为 113/922、API integration 7/32、Web behavior 39/159；typecheck、API unit/integration、格式和 diff check 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 用户授权保存生命周期切片已完成：抽取共享 `features/iam/useIamAccessMutation`，阻止重复保存，并在抽屉关闭、用户切换或 Vue 作用域销毁后丢弃迟到成功/失败结果；保存 payload 在请求前快照，保留原有 IAM 替换授权、组织成员关系和角色范围校验契约；新增行为测试 2/2，Web behavior/legacy 当前为 40/161、85/345，Web 全量为 125 个文件、506 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 权限中心用户授权保存生命周期切片已完成：权限中心复用共享 `features/iam/useIamAccessMutation`，阻止重复保存，切换用户/刷新/作用域销毁后丢弃迟到成功/失败结果，并在请求前快照保存 payload；保留现有 IAM 授权、组织成员关系和主组织校验契约；新增行为测试 2/2，Web behavior/legacy 当前为 40/163、85/345，Web 全量为 125 个文件、508 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性和 `build:web` 均已实跑通过；Playwright 只读检查 `/permission-center` 用户授权页可渲染，控制台 0 errors / 0 warnings，未执行真实保存。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 权限中心角色/组织写入生命周期切片已完成：抽取通用 `features/iam/useIamMutation`，角色权限保存、角色创建、组织创建/编辑均阻止重复提交，保存 payload 在请求前快照；切换角色、打开其他编辑态、刷新、关闭对话框或 Vue 作用域销毁后丢弃迟到成功/失败结果；新增行为测试 5/5，Web behavior/legacy 当前为 40/168、85/345，Web 全量为 125 个文件、513 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性和 `build:web` 均已实跑通过；Playwright 只读切换 `/permission-center` 的角色与组织面板，均可渲染，控制台 0 errors / 0 warnings，未执行真实保存。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 用户管理旧 `/api/users` 兼容入口写入生命周期切片已完成：用户创建/编辑和启停操作阻止重复提交，创建/编辑 payload 在请求前快照；关闭或切换表单、Vue 作用域销毁后丢弃迟到成功/失败结果；legacy #183 pin 已改为验证稳定用户 ID 捕获；新增行为测试 4/4，Web behavior/legacy 当前为 41/172、85/345，Web 全量为 126 个文件、517 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性、API/Web 构建均已实跑通过；Playwright 只读访问 `/users` 并打开/关闭新建用户对话框，列表与表单均可渲染，控制台 0 errors / 0 warnings，未执行真实保存。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 Web 商家销售页查询生命周期切片已完成：汇总/趋势/排行刷新按请求代际丢弃迟到数据，分页排行与整页刷新分开管理 loading，Vue 作用域销毁后停止回写和新请求；手动重算阻止重复触发，销毁后不再提示成功或继续 reload；新增行为测试 5/5，Web behavior/legacy 当前为 42/177、85/345，Web 全量为 127 个文件、522 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性、API/Web 构建均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Generate 文案生成提交生命周期切片已完成：生成入口阻止重复提交，响应仅在当前 Vue 作用域和请求代际仍有效时写回文案、结束 loading 或提示成功；作用域销毁后清理生成状态并丢弃迟到结果；新增行为测试 2/2，Web behavior/legacy 当前为 43/179、85/345，Web 全量为 128 个文件、524 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性、API/Web 构建均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Generate AI 配置请求生命周期切片已完成：AI 配置状态刷新按请求代际丢弃旧结果，保存阻止重复提交并快照 payload；保存开始前的旧刷新不能覆盖保存结果，Vue 作用域销毁后清理 saving 状态并丢弃迟到状态/成功提示；新增行为测试 4/4，Web behavior/legacy 当前为 44/183、85/345，Web 全量为 129 个文件、528 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性、API/Web 构建均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Generate 初始化读请求生命周期切片已完成：套餐推荐多页加载以请求代际和 Vue 作用域 guard 丢弃旧/卸载响应，不发布部分多页结果；作战卡请求阻止重复触发，套餐切换和 Vue 作用域销毁会使旧响应失效并清理 loading；新增行为测试 6/6，Web behavior/legacy 当前为 45/189、85/345，Web 全量为 130 个文件、534 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性、API/Web 构建均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 商家热力图请求生命周期切片已完成：热力图读取增加单飞、Vue 作用域销毁和迟到成功/失败响应保护；KeepAlive 失活期间不继续初始化或刷新 Leaflet 地图；新增行为测试 3/3，Web behavior/legacy 当前为 46/192、85/345，Web 全量为 131 个文件、537 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 规则配置页请求/提交生命周期切片已完成：规则列表与默认值读取以请求代际和 Vue 作用域 guard 丢弃旧/卸载响应；规则创建阻止重复提交并快照表单，激活/删除操作共享 `mutating` 单飞并在销毁后抑制旧提示与刷新；新增行为测试 6/6，Web behavior/legacy 当前为 47/198、85/345，Web 全量为 132 个文件、543 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（921 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 路由懒加载预热生命周期切片已完成：`prefetchNavPaths` 返回 owner cleanup，同时可取消 `requestIdleCallback`/降级 `setTimeout`；ShellLayout 卸载时取消导航预热，避免离开页面后继续拉取整棵导航的异步组件；新增行为测试 2/2，Web behavior/legacy 当前为 47/200、85/345，Web 全量为 132 个文件、545 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（921 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 操作审计详情请求生命周期切片已完成：详情读取从 `AuditLogView` 收敛到 `features/audit-log/useAuditLogDetail`，以请求代际、对话框关闭和 Vue 作用域销毁丢弃迟到详情；过期失败不再提示；新增行为测试 3/3，并将 legacy #185 静态契约同步到新的 composable 边界；Web behavior/legacy 当前为 48/203、85/345，Web 全量为 133 个文件、548 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（923 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 审核写入生命周期切片已完成：审核提交增加单飞保护并快照标题/正文/备注；切换文案、重复选择或 Vue 作用域销毁会使旧审核结果失效，旧结果不会触发成功提示或列表刷新；审核面板按钮在提交期间禁用；新增行为测试 3/3，Web behavior/legacy 当前为 48/206、85/345，Web 全量为 133 个文件、551 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（923 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 PRD 测试可信度时限复核已完成：无缓存全量 ESLint 实测 18.83 秒，缓存全量 lint 实测 5.73 秒，均满足冷启动不超过 90 秒、缓存/变更不超过 20 秒的门槛；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Task Center 行级操作生命周期切片已完成：排期/发布/完成/失败/取消/转派统一收敛到 `features/task-center/composables/useTaskCenterActions`；发布/失败对话框增加关闭失效边界；同任务重复提交、任务切换和 Vue 作用域销毁后的迟到结果不再提示或刷新；保留任务状态机、取消原因和失败 `evidenceUrl` 等既有契约；新增行为测试 5/5，legacy #175/#180/#204/#242 同步新的职责边界；Web behavior/legacy 当前为 49/211、85/345，Web 全量为 134 个文件、556 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（925 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 操作审计列表生命周期切片已完成：列表请求从 `AuditLogView` 收敛到 `features/audit-log/useAuditLogList`，以请求代际保护列表行与有效日期窗口，筛选、分页、重置共享同一安全入口；Vue 作用域销毁后停止 loading、丢弃迟到响应并阻止新请求；新增行为测试 3/3，legacy #185/#193 同步新的 composable 边界；Web behavior/legacy 当前为 50/214、85/345，Web 全量为 135 个文件、559 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Task Center 列表生命周期切片已完成：共享 `usePagedList` 在 Vue 作用域销毁后阻止所有新列表操作、结束 loading，并通过 `requestId` 与当前分页筛选 key 防止迟到/已变更筛选响应写回；`useTaskCenter` 仅允许当前列表请求投影有效日期窗口；新增行为测试 4/4；Web behavior/legacy 当前为 50/218、85/345，Web 全量为 135 个文件、563 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web Cookie 配置弹窗生命周期切片已完成：Cookie 状态打开请求按代际保留最新结果，保存阻止重复提交并快照已提交字符串；保存开始前的旧状态请求不能覆盖结果，Vue 作用域销毁后不再回写、提示、关闭弹窗或发起新请求；新增行为测试 4/4；Web behavior/legacy 当前为 50/221、85/345，Web 全量为 135 个文件、566 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 权限中心编排生命周期切片已完成：`usePermissionCenter` 在 Vue 作用域销毁时使角色/权限/组织刷新、用户列表、用户授权读取和 IAM 写入代际失效；迟到响应不再回写状态或弹出错误，销毁后的读写入口直接 no-op；`onMounted` 初始化改为显式处理的非 async 回调；新增行为测试 2/2；Web behavior/legacy 当前为 50/223、85/345，Web 全量为 135 个文件、568 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（927 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 预警主路径生命周期切片已完成：`useAlerts` 使用 Vue 作用域级 dispose 使列表/筛选/批量处理入口在销毁后 no-op；作用域销毁会使迟到列表和处理响应失效、清理 loading，且不再产生过期成功/失败审计提示；watcher 也受 active guard 保护；新增行为测试 2/2；Web behavior/legacy 当前为 51/225、85/345，Web 全量为 136 个文件、570 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 套餐分析页请求生命周期切片已完成：`usePackageAnalysisPage` 改用 Vue 作用域级 dispose，销毁后清理 loading、使迟到分析响应失效，并阻止后续 `load()` 再发起请求；保留现有套餐分析数据和路由返回契约；新增行为测试 1/1（文件内生命周期测试共 4/4）；Web behavior/legacy 当前为 51/226、85/345，Web 全量为 136 个文件、571 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 推荐列表作用域生命周期切片已完成：`useRecommendationsPage` 从组件 `onUnmounted` 收敛到 Vue 作用域级 dispose；保留现有请求代际与 `isDisposed` guard，effect scope 销毁后迟到推荐/分类响应不再回写，刷新入口不再发起新请求；复用现有行为测试 2/2；Web behavior/legacy 当前为 51/226、85/345，Web 全量为 136 个文件、571 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 商家路由初始加载生命周期切片已完成：`bindMerchantRoute` 将初始列表/详情加载改为显式捕获 Promise 的 mounted 回调，初始请求拒绝不再形成未处理 Promise，同时保留 `isCurrent` 作用域与请求代际保护；新增行为测试 1/1（商家生命周期文件共 5/5）；Web behavior/legacy 当前为 51/227、85/345，Web 全量为 136 个文件、572 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web ShellLayout 作用域生命周期切片已完成：Cookie 状态轮询、延迟重排定时器和导航预取清理从组件 `onUnmounted` 收敛到 Vue 作用域级 `onScopeDispose`；现有 3 个行为测试改为真实 `effectScope().stop()` 验证慢响应、轮询和预取取消；Web behavior/legacy 当前为 51/227、85/345，Web 全量为 136 个文件、572 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（928 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web 可复用浏览器资源生命周期切片已完成：`useKeyboardShortcuts`、`useNotificationCenter`、`useResponsiveDrawerSize` 的事件监听/通知订阅清理从组件 `onUnmounted` 收敛到 Vue 作用域级 `onScopeDispose`；新增行为规格以真实 `effectScope().stop()` 验证键盘监听、窗口 resize 监听和通知订阅均成对释放，3/3 通过；Web behavior/legacy 当前为 52/230、85/345，Web 全量为 137 个文件、575 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（929 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 用户授权读取生命周期切片已完成：`useUserAccessLoader` 增加 Vue 作用域销毁失效保护，销毁时停止 loading、清空授权草稿，迟到成功/失败响应不再写回或进入抽屉错误提示，销毁后的新读取直接 no-op；保留切换用户的请求代际保护；新增行为回归 1/1（文件内 3/3）；Web behavior/legacy 当前为 52/231、85/345，Web 全量为 137 个文件、576 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（929 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 Web IAM 当前租户展示一致性切片已完成：权限中心编排 composable 改用登录会话 `roleStore.tenantId` 作为当前租户的唯一展示来源，不再在首次渲染时写死 `tenant_default` 或等待用户授权读取后才更新；新增行为回归 1/1（权限中心文件内 19/19）；Web behavior/legacy 当前为 52/232、85/345，Web 全量为 137 个文件、577 个测试；API unit 113/922、API integration 7/32；`test:coverage`、治理、typecheck、Lint、格式、源码完整性（929 个源文件、0 个未解析导入）和 `build:web` 均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 非 EXE 浏览器只读验收已完成：在现有 `3100/3101` 开发服务上打开权限中心与数据分析页，角色、组织、用户三面板及净 GMV 视图均正常渲染；`/api/users/me`、IAM 角色/权限/组织/用户/授权读取和数据分析 summary 均返回 `200`，两页最终控制台均为 `0 errors / 0 warnings`；旧会话首次 `browser-refresh` 的 `401` 随后由既有恢复路径以 `201` 成功刷新，未执行业务写入。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 非 EXE IAM 管理服务职责分层已完成：将原 `IamAdminService` 的角色、组织、用户授权与范围策略分别收敛至 `IamRoleAdminService`、`IamOrganizationAdminService`、`IamUserAccessAdminService`，保留 `IamAdminService` 兼容 facade 供现有控制器及旧 `/api/users/:id/access` 入口使用；不改变控制器路由、旧入口或权限/异常语义；IAM alias 单测 9/9、IAM 集成 13/13、API unit 113/922、API legacy 103/408、API integration 7/32、Web behavior 52/232、Web legacy 85/345、test:coverage、typecheck、Lint、格式、治理（静态 pin 188/188）、源码完整性（933 个源文件、0 个未解析导入）和全栈 build（Web 3167 modules）均已通过。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 非 EXE Dashboard 职责分层已完成：将原 `DashboardService` 的平台摘要聚合、今日运营作战台与效果分析/分块加载分别收敛至 `DashboardSummaryService`、`DashboardOperationsService` 与共享 `dashboard-ops-support`，保留 `DashboardService` 兼容 facade 供现有控制器和调用方使用；保持 Dashboard 路由、范围缓存键、重型聚合 gate、SQL 时间窗口、全局 top-N、来源/面板截断诚实度与异常语义不变；Dashboard 行为 14/14、相关治理契约 80/80、API unit 113/922、API legacy 103/408、API integration 7/32、Web behavior 52/232、Web legacy 85/345、test:coverage、typecheck、Lint、格式、治理（静态 pin 188/188）、源码完整性（936 个源文件、0 个未解析导入）和全栈 build（Web 3167 modules）均已通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 非 EXE 文案服务职责分层已完成：将原 `CopyService` 的生成与持久化、列表/详情查询、审核与分发任务创建分别收敛至 `CopyGenerationService`、`CopyQueryService`、`CopyAuditService`，保留 `CopyService` 兼容 facade，控制器路由、旧调用入口、单飞生成、审核状态机、fen/范围/列表窗口和自动任务语义不变；文案行为单测 17/17、API unit 113/922、API legacy 103/408、API integration 7/32、API build、typecheck、Lint、治理（静态 pin 188/188）和源码完整性（941 个源文件、0 个未解析导入）均已通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 非 EXE GMV 回填弹层生命周期切片已完成：将打开后的 `nextTick` 定位与 resize/scroll/keydown 全局监听收敛至 `useBackfillMenuLifecycle`；菜单在等待 DOM 更新期间关闭或 Vue 作用域卸载后，迟到回调不会再定位或补挂监听，正常打开仍保持三类监听的成对释放；新增行为测试 3/3，Web behavior 53/235、Web legacy 85/345，API unit 113/922、API integration 7/32；治理静态 pin 188/188、源码完整性（938 个源文件、0 个未解析导入）、typecheck、Lint、格式和 `build:web`（3168 modules）均已实跑通过。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 非 EXE 商家热力图资源生命周期切片已完成：Leaflet 初始化延迟渲染增加可取消定时器，KeepAlive 失活时不再对隐藏 DOM 执行延迟刷新，Vue 作用域销毁时统一释放地图、标记、热力圈和悬浮状态；保留热力图数据接口、数量/GMV 切换和地图复用行为；热力图请求生命周期行为 3/3、Web behavior 53/235、源码完整性 941/0、typecheck、Lint、格式和 `build:web`（3168 modules）均已通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 非 EXE 商家销售查询职责分层已完成：将原 `merchant-sales-query.ts` 的汇总/Distinct package 计数、排名/分页、趋势、CSV 导出、MerchantDailyMetrics 重算分别收敛至 `merchant-sales-summary-query.ts`、`merchant-sales-ranking-query.ts`、`merchant-sales-trend-query.ts`、`merchant-sales-export-query.ts`、`merchant-sales-metrics-query.ts`，原入口保留 11 行兼容 barrel；商家销售净 GMV/CSV/分页真实行为 31/31、受影响 legacy 36/36、API unit 113/922、API legacy 103/408、API integration 7/32、Web behavior 53/235、test:coverage、API build、全栈 build（Web 3168 modules）、typecheck、Lint、格式、治理（静态 pin 188/188）和源码完整性（946 个源文件、0 个未解析导入）均已通过。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 非 EXE 用户访问应用层职责分层已完成：将原 `user-application.service.ts` 中的认证、用户写命令、用户查询和角色/范围校验分别收敛至 `user-auth.service.ts`、`user-command.service.ts`、`user-query.service.ts`、`user-role-policy.ts`，原入口保留兼容 barrel；保留旧导入、`/api/users` 契约、租户过滤、最后 admin 保护、tokenVersion、角色范围和批量 `UserRoleBinding` 写入语义；用户认证/角色单测 25/25、受影响 API legacy 20/20、Web legacy 16/16、API unit 113/922、API legacy 103/408、API integration 7/32、Web behavior 53/235、test:coverage、全栈 build（Web 3168 modules）、typecheck、Lint、格式、治理（静态 pin 188/188）和源码完整性（950 个源文件、0 个未解析导入）均已通过。本轮不包含 EXE/Desktop/打包发布工作。

2026-08-05 非 EXE 权限中心编排职责分层已完成：将原 `usePermissionCenter.ts` 中的角色权限、组织树、用户授权状态与写入副作用分别收敛至 `usePermissionCenterRoles.ts`、`usePermissionCenterOrganizations.ts`、`usePermissionCenterUserAccess.ts`，共享表单/用户类型与默认值收敛至 `permission-center-types.ts`；主入口继续保留 `PermissionCenterController`、统一刷新/租户展示/作用域销毁保护，三个面板接口、API 契约、视觉流程与请求竞态语义不变；权限中心行为回归 19/19、Web behavior 53/235、Web legacy 85/345、API unit 113/922、API integration 7/32、test:coverage、全栈 build（Web 3172 modules）、typecheck、Lint、格式、治理（静态 pin 188/188）和源码完整性（954 个源文件、0 个未解析导入）均已通过。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 非 EXE 数据分析 Excel 导出职责分层已完成：将原 `data-analysis-excel.ts` 的共享单元格格式与公式注入防护、总览/时段、排行、核销、退款、明细工作表分别收敛至 `data-analysis-excel.shared.ts`、`data-analysis-excel-overview.ts`、`data-analysis-excel-trend.ts`、`data-analysis-excel-ranking.ts`、`data-analysis-excel-verify.ts`、`data-analysis-excel-refund.ts`、`data-analysis-excel-detail.ts`，原入口继续保留 `buildDataAnalysisWorkbook`/`buildExportFilename` 兼容导出；保持 7 个 sheet 顺序、xlsx 模板、`paidTime` 报表数据、导出文件名、明细截断提示和安全文本语义不变；数据分析行为 11/11、API unit 113/922、API legacy 103/408、API integration 7/32、test:coverage、typecheck、Lint、格式、治理（静态 pin 188/188）、源码完整性（961 个源文件、0 个未解析导入）和全栈 build（Web 3172 modules）均已通过。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-05 非 EXE 数据分析报告编排职责分层已完成：新增 `data-analysis-report.ts`，集中负责窗口解析、详情/排行/退款限额、10 路 paidTime 查询任务的 `mapPool` 编排和 `DataAnalysisReport` 组装；`DataAnalysisService` 保留摘要缓存、重型聚合门禁、导出单飞和旧控制器入口，仅委托报告构建；新增报告编排行为 2/2，数据分析原有行为 11/11，API unit 114/924、API legacy 103/408、API integration 7/32、`test:coverage`、typecheck、Lint、格式、治理（静态 pin 188/188）、源码完整性（962 个源文件、0 个未解析导入）和全栈 build（Web 3172 modules）均已通过。本轮不包含 EXE/Desktop/打包发布工作。
2026-08-08 非 EXE 任务绩效查询职责分层已完成：将 `TaskPerformanceDaily` 的 KPI 与单任务绩效聚合从 `distribution-task-query.ts` 收敛至 `distribution-task-performance-query.ts`，旧入口继续 re-export `getTaskKpi`/`getTaskPerformance`；原查询模块由 366 行降至 273 行，保留列表/详情投影与兼容调用方；新增绩效行为 1/1，任务查询相关行为 4/4、legacy 25/25、typecheck、API integration 7/32、全栈 build（Web 3173 modules）、治理（静态 pin 188/188）、源码完整性（963/0）和 Lint（0 errors）通过；首次全量复跑发现的 4 个 API unit 净 GMV/退款断言和 1 个 API legacy refund top-merchants 静态契约失败已在下一条记录中收口；全量格式检查仍有 10 个既有金额/退款文件未格式化；本轮不包含 EXE/Desktop/打包发布工作。
2026-08-08 非 EXE 金额/退款测试契约收口已完成：按当前统一的 `refundCount / paidOrderCount`、`verifyCount / paidOrderCount` 口径迁移 3 个遗留净 GMV 测试的断言并补齐 `MerchantDailyMetrics` 的 `refundCount/verifyCount` SQLite 夹具；更新 residual #72 以验证带周期、无分页参数的 refund top-merchants cache key；API unit `115/932`、API legacy `103/408`、API integration `7/32`、`test:coverage`、typecheck、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`963/0`）和 Lint（0 errors，1 条既有 warning）均通过；全量格式检查仍有 10 个既有金额/退款文件未格式化；本轮不包含 EXE/Desktop/打包发布工作。
2026-08-08 非 EXE Content 商家同步职责分层已完成：新增 `content-merchant-sync.service.ts`，将 JeeSite 商家同步、单飞保护、商家 upsert 与当前 fen-only `ContentPackage` 批量持久化从 `ContentService` 收敛出去；`ContentService.syncMerchantsFromJeeSite()` 保留兼容入口，刷新参数、跳过返回值、同步日志和批量 SQL 语义不变；新增同步行为 2/2，API unit `116/935`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`964/0`）和 Lint（0 errors，1 条既有 warning）均通过；本轮目标文件已定向格式化，全量格式检查仍有 10 个既有金额/退款文件未格式化；本轮不包含 EXE/Desktop/打包发布工作。
2026-08-08 非 EXE Content 推荐分析职责分层已完成：将推荐计算、库存趋势合并、推荐评分前置过滤与套餐分析从 `content-facade.ts` 收敛至 `content-recommendation-facade.ts`；旧 facade 继续 re-export 原函数，`ContentService`、推荐缓存/限额、社群与 Battle Card 调用入口保持兼容，社区业务实现未改动；推荐纯逻辑行为 `36/36`、推荐 cap legacy `8/8`、API unit `116/935`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`965/0`）和 Lint（0 errors，1 条既有 warning）均通过；拆分后两个普通 TypeScript 模块分别为 `250` 与 `187` 行；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE JeeSite 外部数据源职责分层已完成：将外部 URL/分页/请求重试、登录恢复、响应大小限制、同主机重定向 SSRF 保护、PLATFORM_SCAN_LIMIT 截断与 JeeSite 映射从 DataSourceService 收敛至 JeeSiteDataSourceClient；DataSourceService 保留 source 选择、TTL、最小请求间隔、force/non-force 单飞和旧 ContentDataset/LoadDatasetOptions 导出兼容；JeeSite 客户端行为 2/2、DataSource 缓存/单飞行为 2/2、相关 legacy 31/31、API unit 117/936、API legacy 103/408、API integration 7/32、Web behavior 53/235、test:coverage、typecheck、API build、全栈 build（Web 3173 modules）、治理（静态 pin 188/188）、源码完整性（967/0）和 Lint（0 errors，1 条既有 warning）通过；全量格式检查仍仅有 10 个既有金额/退款文件未格式化；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE Content 套餐分析投影职责分层已完成：将 `PackageAnalysisResult`、`analysisTrends` 和 `buildPackageAnalysisResult` 从 `content-recommend-core.ts` 收敛至 `content-package-analysis.ts`；旧 core 继续 re-export 类型/函数，`ContentService`、推荐 facade、社区/Battle Card 调用方保持兼容；新增套餐分析行为 `1/1`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、API build、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`968/0`）和 Lint（0 errors，1 条既有 warning）通过；全量格式检查仍仅有 10 个既有金额/退款文件未格式化；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE Content 套餐控制器职责分层已完成：将原 `package.controller.ts` 的详情/缓存/Cookie/AI/调试路由收敛至 `package-detail.controller.ts`，库存日爬取、商家同步和地理编码收敛至 `package-operations.controller.ts`；原控制器保留推荐、类别、套餐分析、社区/Battle Card、健康检查与 `safePackageId` 兼容入口，路由 URL、RBAC/Throttle 装饰器和客户端契约不变；同步修正 residual #232 的详情刷新静态契约与 residual #256 已迁移绩效查询模块路径；API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、Web legacy `85/345`、`test:coverage`、typecheck、API build、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`970/0`）和 Lint（0 errors，1 条既有 warning）通过；目标文件定向格式检查通过，全量格式检查仍仅有 10 个既有金额/退款文件未格式化；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE 金额/退款格式门禁已收口：对 10 个历史 Prettier 失败文件完成机械格式化，未改变业务语义；金额/退款定向 unit `6 个文件 / 31 个测试`、typecheck、全量 `format:check`、Lint（0 errors，1 条既有 warning）、治理（静态 pin `188/188`）和源码完整性（`970/0`）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE 任务控制器职责分层已完成：原 `DistributionTaskController` 保留查询路由，创建/更新/删除/排期/发布/失败/取消/转派命令收敛至 `DistributionTaskCommandController`，共享任务访问范围和 evidence URL 校验；双路径 `/api/distribution-tasks` 与 `/api/tasks`、RBAC/权限码、Throttle、幂等拦截器和返回契约不变；原控制器降至 116 行，新命令控制器 263 行，共享 helper 57 行；任务相关 legacy `6/6` 文件、`17/17` 测试，Web 任务 legacy `4/4`，API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、Web legacy `85/345`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`972/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE 数据分析套餐排行投影职责分层已完成：将 `resolvePackageDisplayName`、`mergePackageRankingByName` 和 `queryPackageRanking` 从 `data-analysis-ranking.query.ts` 收敛至 `data-analysis-package-ranking.ts`；旧 `data-analysis-query.ts` / ranking entry 保留兼容 re-export，商家/业务员排行、核销极值、退款排行以及 paidTime 和金额 SQL 语义不变；新模块 130 行，原排行模块降至 244 行；数据分析行为 `14/14`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`973/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE Content 套餐详情解析职责分层已完成：将 `HtmlParser` 中的 stream/loose 两套 token fallback 解析与共享 section-title 规则分别收敛至 `package-detail-fallback-parser.ts`、`package-detail-parser-rules.ts`；`HtmlParser` 保留主 DOM 解析、item 解析、坐标/rawHtml/日志和公共 `parsePackageDetail` 入口，fallback 选择、标题/section/item 输出与缺失详情语义不变；原文件由 471 行降至 191 行，fallback 模块 227 行、规则模块 54 行；详情行为 `3/3`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`975/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE GMV 刷新支撑职责分层已完成：将订单列表 URL 构建、会话续期、Cookie fallback、OrderHeader 批量 upsert 与页面参数类型收敛至 `gmv-refresh-support.ts`；`gmv-refresh.ts` 保留 `fetchOrderPage` 的 SSRF/响应体上限、拉单与重算编排、`withHeavyAggregateGate` 以及旧 build/fetch/resolve/upsert 导出，兼容入口和数据语义不变；原文件由 394 行降至 326 行，新支撑模块 93 行；GMV 定向行为 `18/18`、相关 legacy `15/15`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`976/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE 文案审核规则职责分层已完成：将禁用词、价格/库存/售罄校验、使用限制校验与 `auditCopyText` 收敛至 `copy-audit-rules.ts`；`copy-rules.ts` 保留模板标题/正文/CTA 生成和旧 `auditCopyText`、`AuditPackageInput` 导出兼容，审核规则、风险等级、审核状态和生成结果语义不变；原模块由 388 行降至 312 行，新审核模块 79 行；文案审核/生成定向行为 `21/21`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin 188/188）、源码完整性（`977/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE GMV 趋势聚合职责分层已完成：将周/月聚合与 ISO 周键从 `gmv-resolve.ts` 收敛至 `gmv-trend-aggregate.ts`；原入口继续 re-export `aggregateTrend`，KPI/趋势/分布/商家 SQL、净 GMV fen 对账、退款/核销率和 legacy 静态契约不变；原模块由 334 行降至 276 行，新纯聚合模块 62 行；GMV 聚焦行为 `45/45`、相关 legacy `19/19`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`978/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE 告警聚合规则职责分层已完成：将告警缓存键、推荐结果展平、优先级评分/排序、列表筛选和摘要统计从 `alert.service.ts` 收敛至 `alert-aggregation.ts`；`AlertService` 保留旧方法和 `alert.service` 导出兼容，解析/处置 SQL、`RESOLVED_ALERT_DAY_LIMIT`、推荐来源/套餐 Top-N 诚实度及 legacy 静态契约未改变；原服务由 447 行降至 373 行，新纯聚合模块 106 行；告警聚焦行为 `63/63`、相关 legacy `18/18`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`979/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE 告警套餐聚焦聚合进一步职责分层已完成：将按套餐分组、优先级排序、Top-8 截断及 `matched/truncated` 诚实度从 `AlertService` 收敛至 `alert-aggregation.ts`；旧 `AlertService.buildAlertPackageFocus()` 保留为兼容 facade，并通过评分回调委托，返回结构不变；#283 legacy pin 改为验证新的纯模块实现与服务 facade；`alert.service.ts` 由 373 行降至 306 行，聚合模块由 106 行增至 155 行；API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/235`、`test:coverage`、typecheck、format、全栈 build（Web `3173 modules`）、治理（静态 pin `188/188`）、源码完整性（`979/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE GMV cockpit 长任务生命周期职责分层已完成：将历史回填确认/范围解析、JeeSite refresh job 轮询、`job_lost/poll_failed` 自动重试、进度文案、刷新反馈与卸载取消从 `gmv-cockpit-core.ts` 收敛至 `gmv-refresh-lifecycle.ts`；`gmv-cockpit-core.ts` 继续 re-export `backfillGmvHistory`、`pollGmvRefreshJob`、`refreshGmvCockpit` 和 `RefreshPollError` 类型，旧 `useGmvCockpit`/GMV 页面调用路径与请求代际/卸载保护语义不变；核心模块由 464 行降至 229 行，新生命周期模块 270 行；GMV request lifecycle `3/3`、Web behavior `53/235`、Web legacy `85/345`、typecheck、`build:web`（Web `3174 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`980/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE GMV cockpit 读取编排职责分层已完成：将全量本地指标/榜单并行读取、Top-N honesty sink 投影及 extras 派生加载从 `gmv-cockpit-ops.ts` 收敛至 `gmv-cockpit-load.ts`；`gmv-cockpit-ops.ts` 保留 `createGmvCockpitLoadAll` 兼容 re-export，`useGmvCockpit`、请求代际和卸载保护语义不变；ops 模块由 330 行降至 252 行，新读取模块 103 行；新增成功刷新后读取行为 `1/1`，GMV cockpit 行为 `4/4`、Web behavior `53/236`、Web legacy `85/345`、typecheck、`build:web`（Web `3175 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`981/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE recommendations 页面动作职责分层已完成：将 `loadPage`、清空筛选、分析/生成跳转与 area/category/merchant/库存区间/业务日期/角色 watch 编排从 `useRecommendationsPage.ts` 收敛至 `recommendations-page-actions.ts`；旧 composable 保留同名兼容导出，推荐读取、分页缓存、请求代际、卸载保护、merchantId/inventoryMin/inventoryMax/date 查询参数和 RECOMMEND_CACHE_CAP 诚实度不变；原入口由 436 行降至 357 行，新动作模块 75 行；新增成功读取与页面动作行为 `1/1`，推荐页行为 `3/3`、Web behavior `53/237`、Web legacy `85/345`、typecheck、`build:web`（Web `3176 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`982/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE recommendations 读取职责进一步分层已完成：将区域投影、分类选项读取、推荐列表请求/分页缓存、请求代际与 RECOMMEND_CACHE_CAP 诚实度编排从 `useRecommendationsPage.ts` 收敛至 `recommendations-page-loaders.ts`；旧 composable 继续 re-export `buildRecommendAreaOptions`、`loadRecommendCategoryOptions`、`loadRecommendationsPage` 和 `createRecommendationsLoaders`，筛选字段与 API 参数、页面缓存和卸载保护语义不变；页面入口由 357 行降至 133 行，actions 模块 75 行，loaders 模块 235 行；复跑推荐页行为 `3/3`、三个受影响 legacy residual `12/12`、Web behavior `53/237`、Web legacy `85/345`、typecheck、`build:web`（Web `3177 modules`）、format、治理（静态 pin `188/188`）、源码完整性（`983/0`）和 Lint（0 errors，1 条既有 warning）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE Web 退款趋势与组件编译质量收口：移除 `RefundVerifyTrend` 未使用的 `trendOption` prop 及唯一透传绑定，退款趋势 tab、日期/粒度切换和 slot 图表契约不变；同时将 `TableSkeleton` 与 `GmvCockpitBackfill` 的 `withDefaults`+响应式解构改为 Vue 推荐的解构默认值，消除两条构建期组件提示；退款趋势行为 `4/4`、GMV 回填生命周期行为 `3/3`、Web behavior `53/237`、Web legacy `85/345`、typecheck、`build:web`（Web `3177 modules`）、全量 format、Lint（0 errors，0 warnings）、治理（静态 pin `188/188`）和源码完整性（`983/0`）通过；本轮不包含 EXE/Desktop/打包发布工作。

2026-08-08 非 EXE zero-sales loader 职责分层已完成：将包级销售补充、商户库存 SKU 汇总、零销量 SKU 候选/批量指标/排序分页、SKU 时间线分别收敛至 `zero-sales-package-sales-loaders.ts`、`zero-sales-package-loaders.ts`、`zero-sales-sku-loaders.ts`、`zero-sales-sku-timeline.ts`；`zero-sales-loaders.ts` 降为兼容 barrel，`zero-sales-list.ts`、`zero-sales.service.ts` 及旧测试导入入口不变，fen GMV/售价、`stockLeft > 0`、批量 `GROUP BY`、候选 `LIMIT` 和时间窗口语义不变；同步将 residual #65/#66/#67/#74/#75/#78 与推荐页 residual #267 的静态 pin 指向真实实现文件；zero-sales focused legacy `7/7` 文件、`39/39` 测试，API unit `118/937`、API legacy `103/408`、Web behavior `53/237`、Web legacy `85/345`、typecheck、全量 format、Lint（0 errors，0 warnings）、build:web（`3177 modules`）、治理（静态 pin `188/188`）和源码完整性（`987/0`）通过；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE GMV 指标投影职责分层已完成：将 DailyMetrics KPI、趋势映射/日期补齐、分布 Top-N 及长尾诚实度、商家排序分页分别收敛至 `gmv-daily-metrics-kpi.ts`、`gmv-daily-metrics-trend.ts`、`gmv-distribution-map.ts`、`gmv-merchant-page.ts`；`gmv-metrics.ts` 降为兼容 barrel，`gmv-resolve.ts`、`gmv-order-header.ts`、`gmv.service.ts` 和旧测试导入入口不变，fen 精度、净 GMV 减退款、渠道 remainder、退款/核销单数分母、Top-N `limit/matched/truncated` 语义不变；同步将 residual #265 静态 pin 指向商家分页实现；GMV focused unit `45/45`、相关 legacy `14/14`、API unit `118/937`、API legacy `103/408`、typecheck、全量 format、Lint、build:web（`3177 modules`）、治理（静态 pin `188/188`）和源码完整性（`991/0`）通过；Web 构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE merchant-list 读路径职责分层已完成：将商家 SQL head/metric-first 查询、批量指标聚合、排序分页/缓存编排与共享类型分别收敛至 `merchant-list-queries.ts`、`merchant-list-metrics.ts`、`merchant-list-projection.ts`、`merchant-list-types.ts`；`merchant-list.ts` 降为兼容 barrel，`MerchantService`、列表缓存键、scope 过滤、`totalSkuDesc` prune-before-enrich、GMV/stale metric-first head、`stockLeft > 0`、fen GMV 与 `limit/truncated` 语义不变；同步将 residual #55/#63/#67/#68/#75/#266 静态 pin 指向权威实现文件；商家 focused unit `36/36`、相关 legacy `44/44`、API unit `118/937`、API legacy `103/408`、API build、typecheck、全量 format、Lint、治理（静态 pin `188/188`）和源码完整性（`995/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE Content 映射职责分层已完成：将共享列表/枚举转换、套餐/机器审核映射、GeneratedCopy 映射与 CopyPerformance 映射分别收敛至 `content-mapping-utils.ts`、`package-mappers.ts`、`copy-mappers.ts`、`performance-mappers.ts`；`mappers.ts` 降为兼容 barrel，fen 字段读写、审计精简 select、文案列表省略 body/cta 与绩效列表省略 leaderId 的契约不变，旧服务/测试导入入口保持兼容；同步将 residual #63 的套餐静态 pin 指向权威实现文件；文案服务 focused unit `17/17`、相关 legacy `29/29`、API unit `118/937`、API legacy `103/408`、API build、typecheck、全量 format、Lint、治理（静态 pin `188/188`）和源码完整性（`999/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE GMV OrderHeader 计算职责分层已完成：将今日 KPI/小时数据、趋势补齐与净 GMV 映射、分布 Top-N/长尾诚实度分别收敛至 `gmv-order-header-today.ts`、`gmv-order-header-trend.ts`、`gmv-order-header-distribution.ts`；`gmv-order-header.ts` 降为兼容 barrel，`gmv-resolve.ts`、刷新 upsert、查询模块和旧测试导入入口不变，OrderHeader/ DailyMetrics fallback、fen 精度、退款扣减、退款/核销率分母、`mapPool` 并发上限及分布 `limit/matched/truncated` 语义不变；同步将 residual #66/#289 静态 pin 指向权威实现文件；GMV focused unit `45/45`、相关 legacy `9/9`、API unit `118/937`、API legacy `103/408`、API build、typecheck、全量 format、Lint、治理（静态 pin `188/188`）和源码完整性（`1002/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE IAM 访问职责分层已完成：将 IAM 用户访问读取、旧 `UserRoleBinding` 查询、旧 area/merchant 投影、角色/组织/权限目录查询分别收敛至 `iam-access-queries.ts`、`iam-legacy-projection.ts` 和共享类型模块；`IamAccessService` 保留兼容 facade、租户/停用过滤、权限别名展开、5 秒缓存、用户/租户失效、组织树编排及原有公开方法/类型入口，双轨授权语义不变；IAM focused behavior `35/35`、API unit `118/937`、API legacy `103/408`、API build、typecheck、全量 format、Lint、治理（静态 pin `188/188`）和源码完整性（`1005/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE IAM 用户授权写入职责分层已完成：将角色与组织解析、成员关系/主组织校验、最后 admin 保护和组织树委派授权分别收敛至 `iam-user-access-resolution.ts`、`iam-user-access-authorization.ts`；`IamUserAccessAdminService` 保留原有兼容入口，只负责授权替换事务、`UserRoleBinding` legacy 双写、`tokenVersion`/JWT/cache 失效和返回契约，权限别名、ALL/ORG_TREE/ORG_ONLY/NONE 范围、组织树边界、成员关系和错误语义不变；IAM focused behavior `35/35`、IAM integration `13/13`、API unit `118/937`、API legacy `103/408`、API build、typecheck、全量 format、Lint、治理（静态 pin `188/188`）和源码完整性（`1007/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE DistributionTask 读取编排职责分层已完成：将列表/KPI、详情执行时间线、任务行/删除/更新/访问 meta 和绩效读取编排从 `distribution-task.service.ts` 收敛至 `distribution-task-read.ts`；`DistributionTaskService` 保留原公开方法、更新/删除命令、FK/状态策略和 controller 注入入口，`packageGeo`、执行时间线、窄投影、scope probe、NotFound 与错误语义不变；任务 focused unit `48/48`、受影响 legacy `28/28`、API unit `118/937`、API legacy `103/408`、API integration `32/32`、API build、typecheck、全量 format、Lint、治理（静态 pin `188/188`）和源码完整性（`1008/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE GMV 刷新职责分层已完成：将同主机重定向/响应体上限、分页拉单循环、金额重算及缓存失效分别收敛至 `gmv-refresh-page.ts`、`gmv-refresh-pull.ts`、`gmv-refresh-recompute.ts`；`gmv-refresh.ts` 保留旧 fetch/pull/refresh/type 导出、`withHeavyAggregateGate` 和刷新结果契约，`GmvRefreshJob`、GMV service 及旧调用入口不变；SSRF、Cookie 单次续期、`MAX_PAGES`/truncated、OrderHeader upsert、DailyMetrics/PSD/merchant-sales 重算和失效时序语义不变；GMV focused behavior `18/18`、受影响 legacy `15/15`、API unit `118/937`、API legacy `103/408`、API integration `32/32`、API build、typecheck、全量 format、Lint、治理（静态 pin `188/188`）和源码完整性（`1011/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE Dashboard Operations 读编排职责分层已完成：将今日运营作战台、效果数据、CopyPerformance/GeneratedCopy 分块读取与 Top-N/标题 join 截断诚实度投影从 `dashboard-operations.service.ts` 收敛至 `dashboard-operations-read.ts`；`DashboardOperationsService` 保留公开入口、缓存键、`TtlCache`、`withHeavyAggregateGate`、繁忙错误映射和兼容委托，推荐 scope、CP/GC 查询边界、面板计数及返回结构不变；原服务由 393 行降至 85 行，新读模块 326 行；Dashboard 行为 `14/14`、受影响 legacy `67/67`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、API build、typecheck、全量 format、Lint、全栈 build（Web `3177 modules`）、治理静态 pin `188/188` 和源码完整性（`1012/0`）通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE SQL chunk runtime 职责分层已完成：将通用 `chunkIds`、有序并发池 `mapPool`、有界 `queryInChunks` 及 `DEFAULT_IN_CHUNK`/`QUERY_IN_CHUNKS_CONCURRENCY` 收敛至 `sql-chunk-runtime.ts` 与 `sql-chunk-runtime-constants.ts`；`sql-chunk.ts` 保留历史导出路径及业务扫描/保留/缓存上限常量，零动销、动销、商家、热力图、Dashboard、数据分析和保留任务的调用语义不变；SQL chunk focused unit `21/21`、受影响 legacy `83/83`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、API build、typecheck、Lint、全栈 build（Web `3177 modules`）、治理静态 pin `188/188` 和源码完整性（`1014/0`）通过；格式检查仅命中工作树已有的 `GmvCockpitBackfill.vue`，未修改该文件；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 质量门禁收口：格式化现有 `GmvCockpitBackfill.vue` 后，全量 format check 恢复通过；将 Web residual #260 的 execution timeline 静态 pin 从已拆出的 `distribution-task.service.ts` 迁移至权威 `distribution-task-read.ts`，业务实现与接口契约不变；Web behavior `53/237`、Web legacy `85/345`、typecheck、Lint、build:web（`3177 modules`）、治理静态 pin `188/188` 和源码完整性（`1014/0`）均通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 覆盖率与治理预算复跑：统一 `test:coverage` 依次完成 API unit `118/937`、API integration `7/32`、Web behavior `53/237` 并生成覆盖率报告；`test:governance` 与治理预算测试均通过，静态 pin 保持 API `103`、Web `85`、合计 `188/188`，未新增静态契约；本轮未触碰 EXE/Desktop/打包发布代码。

按 ROI 粗排（实现状态）：

| 优先级 | 候选 | 说明 |
|--------|------|------|
| Low | 已清理死客户端 `getUser` / `resolveAlert`；剩余为 Campaign 关系化 scope | Campaign 为长期债 |
| 平台债 | Campaign 关系化 scope | 高成本，长期债 |

经典「静默列表 cap」在 overview / GMV / merchant / dashboard / performance 主路径上已基本扫完；后续更可能是 **功能级 SPA**、**低 ROI 清理** 或 **平台级安全债**。

---

## 9. 记忆与索引

| 文件 | 作用 |
|------|------|
| `memory/continuous-optimization-2026-07-23.md` | Residual 明细账（含 #21–#290 与 post-compaction 章节） |
| `memory/continuous-optimization-2026-07-22.md` | 数据范围接线、env-admin、JWT bindings 等早期会话 |
| `memory/MEMORY.md` | 会话加载索引 → 当前指针 **#40–#290** |
| `docs/CONTINUOUS-OPTIMIZATION-SUMMARY.md` | **本文** — 目标级收束视图 |

---

2026-08-08 非 EXE movement SKU 读取/投影职责分层已完成：将 active SKU SQL、销售窗口 `EXISTS/NOT EXISTS`、大 merchant/area scope 分块和近 30 天销售读取收敛至 `movement-sku-loaders.ts`，将 candidate 映射、排序、SKU rows 编排及 CSV-safe 分页/`limit`/`truncated` 投影收敛至 `movement-sku-projection.ts`；`movement-skus.ts` 保留旧 re-export 兼容入口，`movement-list.ts` 与 `movement.service.ts` 直接依赖权威模块，`stockLeft > 0`、早期 `LIMIT`、chunking、stale bucket 和分页语义不变；同步将 residual #55/#62/#67/#68/#81/#266 静态 pin 迁移至真实实现文件；定向 unit `39/39`、受影响 legacy `44/44`、API unit `118/937`、API legacy `103/408`、API integration `7/32`、Web behavior `53/237`、`test:coverage`、API build、typecheck、format、Lint、build:web（`3177 modules`）、治理静态 pin `188/188` 和源码完整性（`1016/0`）通过；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 数据分析日期范围逻辑可验证性收口：将 `AppleDateRangePicker.vue` 内嵌的 YMD 格式化/解析、六周日历单元格生成、`disabledDate` 投影和范围归一化收敛至 `features/data-analysis/utils/date-range-picker-core.ts`；组件 props、`start/end`、`disabledDate`、`change` 事件、日历交互、样式以及 `DataAnalysisWindowBar` 调用契约不变；新增 core behavior `3/3`，统一 `test:coverage` 完成 API unit `118/937`、API integration `7/32`、Web behavior `54/240`，Web legacy `85/345`、typecheck、format、Lint、build:web（`3178 modules`）、治理静态 pin `188/188` 和源码完整性（`1018/0`）通过；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 单日/范围日期核心统一已完成：新增 `apps/web/src/utils/date-picker-core.ts`，将单日 `AppleDatePicker.vue` 与日期范围 `AppleDateRangePicker.vue` 共用 YMD 格式化/解析、六周日历生成和 `disabledDate` 投影；`date-range-picker-core.ts` 保留原 feature 导出兼容层，单日组件 props、`modelValue`/`change` 事件、选中/今天标记、日历交互与样式契约不变；新增通用 core behavior `2/2`，日期范围行为 `3/3`，统一 `test:coverage` 完成 API unit `118/937`、API integration `7/32`、Web behavior `55/242`，Web legacy `85/345`、typecheck、format、Lint、build:web（`3179 modules`）、治理静态 pin `188/188` 和源码完整性（`1020/0`）通过；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部数据源会话缓存一致性修复已完成：`DataSourceService.invalidateCache()` 在手动 Cookie 校验成功后由 `package-detail.controller.ts` 调用，同时清理推荐运行时缓存；失效会切断旧的 in-flight 引用并以 epoch 阻止旧会话结果回写缓存，普通缓存/数据源失效竞态测试 `4/4`、推荐运行时失效竞态测试 `3/3`、Cookie API 集成 `1/1`；API unit `118/940`、API integration `7/32`、typecheck、format、Lint、源码完整性（`1020/0`）和治理静态 pin `188/188` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 缓存失效竞态与外部会话清理已完成：共享 `TtlCache` 与套餐 `DetailCache` 在 `clear/clear(prefix)` 后不再允许旧 in-flight 结果回写；新增 `ExternalDataCacheInvalidationService`，在 Cookie 更新成功后统一失效数据集、推荐、告警、Dashboard、套餐详情五层缓存；新增 focused tests `27/27`、Cookie API 集成 `1/1`；统一 `test:coverage` 完成 API unit `119/942`、API integration `7/32`、Web behavior `55/242`、Web legacy `85/345`，并通过 typecheck、format、Lint、root build、build:web（`3179 modules`）、治理静态 pin `188/188` 和源码完整性（`1021/0`）；构建仅保留既有第三方 Rollup annotation、CSS sourcemap 与动态 import 提示；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部会话校验竞态已完成：`AutoLoginService.clearCache()` 现在同步清理校验快照、断开旧校验，并以 epoch/request identity 防止旧 Cookie 校验在清理后或新 Cookie 校验之后回写状态；新增行为回归 `2/2`，AutoLogin/JeeSite focused `20/20`；统一 `test:coverage` 完成 API unit `119/944`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性（`1021/0`）；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部自动登录失效竞态已完成：`AutoLoginService` 新增登录请求 epoch 与 Promise identity，`clearCache()` 会使在途自动登录失效并释放单飞槽位，新的强制刷新可独立启动；旧登录不再回写 `cachedCookie`、失败计数、校验快照或 Cookie 缓存文件，已持有旧请求的调用方返回 `null`，同一代并发登录仍保持单飞复用；新增行为回归 `1/1`，AutoLogin/JeeSite focused `21/21`；统一 `test:coverage` 完成 API unit `119/945`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 外部会话消费代际保护已完成：`ensureValidCookie()` 的环境 Cookie 和 `updateManualCookie()` 的手工 Cookie 在异步校验返回后均校验 cookie state epoch，旧验证不会覆盖 `clearCache()` 后或更新后的会话；并发手工更新保持新请求胜出，旧请求返回可重试错误，Cookie 缓存文件写入也受同一代保护；新增行为回归 `2/2`，AutoLogin/JeeSite focused `24/24`；统一 `test:coverage` 完成 API unit `119/947`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Cookie 缓存文件写入顺序保护已完成：`AutoLoginService.saveCookieToCacheFile()` 增加单实例 Promise 写入队列，并在排队执行前再次校验 cookie state epoch，避免旧 Cookie 的异步 `fs.writeFile` 晚于新 Cookie 完成而把磁盘缓存回退；新增“旧写未完成时新写不得并发、完成顺序保持新值”行为回归 `1/1`，AutoLogin/JeeSite focused `25/25`；统一 `test:coverage` 完成 API unit `119/948`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 启动缓存 Cookie 代际保护已完成：`loadCookieFromCacheFile()` 在异步校验开始时捕获 cookie state epoch，并在校验成功后提交内存缓存前再次校验；`clearCache()` 期间完成的旧启动校验不会重新写入 `cachedCookie`/`lastLoginTime`；新增行为回归 `1/1`，AutoLogin/JeeSite focused `26/26`；统一 `test:coverage` 完成 API unit `119/949`、API integration `7/32`、Web behavior `55/242`，API/Web legacy 分别 `103/408`、`85/345`，并通过 typecheck、format、Lint、root build（Web `3179 modules`）、治理静态 pin `188/188` 和源码完整性 `1021/0`；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 **历史证据**：非 EXE 迁移历史处置证据结构化已完成：`db:history-report` 在保持只读、不创建缺失数据库、不改写 `_prisma_migrations` 的前提下，新增 `backupRequired`、`sourceReviewRequired`、`cleanWindowsEvidenceRequired` 三个机器可读前置条件；当时开发库报告 `0004`、`0005`、`0007`、`0014` 四条 checksum 差异并返回 `backup_source_and_clean_windows_evidence_required`，不伪造修复成功；后续兼容基线已落地，当前 `db:drift-check` 结果以本文顶部和 V0.11 状态页为准；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 迁移证据正向门禁回归已完成：新增干净临时 SQLite 迁移历史场景，确认 checksum 完全匹配时 `repairApplied=false`、备份/来源复核/干净环境三个前置条件均为 `false`，只有异常历史才要求处置；`test:migration-history` `4/4`、`test:migration-history-report` `3/3`、相关脚本与文档格式检查、源码完整性 `1021/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 告警编排职责分层已完成：将 `alert-core.ts` 中的告警类型/缓存类型、表格摘要、处理与筛选动作分别收敛至 `alert-types.ts`、`alert-summary.ts`、`alert-handlers.ts`；`alert-core.ts` 保留历史路径兼容 barrel，`useAlerts.ts` 直接依赖权威职责模块，日期筛选、分页缓存、请求代际、卸载保护和处理审计契约不变；核心模块由 `420` 行降至 `191` 行；告警 focused behavior `3/3`、迁移后的 residual #221 `4/4`、Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、build:web（`3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1024/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE API 告警处理职责分层已完成：将 `AlertService` 中的 alertId 规范化、单条/批量处理写入、每日已处理记录限额读取收敛至 `alert-resolution.ts`；保留 `AlertService` 的 `resolveOperationAlert()`、`resolveOperationAlerts()`、`loadResolvedAlertIds()` 兼容入口，告警聚合缓存、分页、日期、scope、批量 SQL `ON CONFLICT`、200 条上限和 `RESOLVED_ALERT_DAY_LIMIT` 语义不变；`alert.service.ts` 由 `327` 行降至 `193` 行；AlertService/扫描 focused `31/31`、迁移后的 API legacy `24/24`、API unit `119/949`、API integration `7/32`、API legacy `103/408`、typecheck、format、Lint、root build（Web `3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1025/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 规则配置读写职责分层已完成：将 `rule-config-ops.ts` 中的规则读取/默认合并/缓存单飞与版本创建/激活/删除/缓存失效分别收敛至 `rule-config-read.ts`、`rule-config-write.ts`；`rule-config-ops.ts` 保留历史 re-export，`RuleConfigService` 直接依赖权威模块，列表窄投影、`mapPool` 并发上限、版本递增、inactive 保留数、激活同范围互斥和异常语义不变；兼容入口由 `322` 行降至 `3` 行，读/写模块分别为 `132`/`178` 行；RuleConfig focused `15/15`、相关 legacy `57/57`、API unit `119/949`、API integration `7/32`、API legacy `103/408`、typecheck、format、Lint、root build（Web `3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1027/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 数据分析核销口径回归已修正：退款 `paidTime` 夹具中的两笔订单均为 `verifyTime IS NULL`，将从旧 `netSales` 机械迁移而来的 `writeOffAmount=107` 断言修正为 `0`，与 `IS_VERIFIED` 和 PRD“仅统计已核销订单余额+现金”定义一致；查询实现未改动，数据分析行为 `11/11`、API unit `119/949`、API integration `7/32`、API legacy `103/408`、typecheck、format、Lint、root build（Web `3182 modules`）、治理静态 pin `188/188` 和源码完整性 `1027/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Web 规则配置职责分层已完成：将 `settings-core.ts` 中的状态/读取与规则创建、激活、删除及公开动作组装分别收敛至 `settings-read.ts`、`settings-write.ts`；`settings-core.ts` 保留历史 re-export，`useSettings` 直接依赖权威读写模块，规则列表/默认值请求代际、作用域卸载保护、重复提交/变更单飞和表单快照语义不变；兼容入口由 `326` 行降至 `3` 行，读取模块 `111` 行、写入模块 `227` 行；Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1029/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE Dashboard 读模型职责分层已完成：将效果数据、CP/GC 分块读取、`PERF_LIST_SELECT` 投影和 Beijing “昨日复盘”编排从 `dashboard-operations-read.ts` 收敛至 `dashboard-performance-read.ts`；旧模块继续 re-export `computePerformance` / `loadDashboardPerfAndCopies`，`DashboardOperationsService` 直接依赖新权威模块，推荐源/标题 join 截断诚实度、`queryInChunks` + `mapPool` 并发上限、缓存与返回结构不变；混合入口由 `342` 行拆为作战台 `203` 行与效果读取 `159` 行；Dashboard 相关 legacy `61/61`、数据分析行为 `12/12`、API unit `119/950`、API integration `7/32`、API legacy `103/408`、Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE `/ready` HTTP 状态契约回归已完成：新增控制器行为用例，明确 `ReadinessService` 返回 `not_ready` 时响应状态为 `503`，返回 `ready` 时不改写成功状态；Readiness focused `9/9`、API unit `119/951`、迁移历史 `4/4`、迁移证据报告 `3/3`、typecheck、format、Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；当前 `db:drift-check` 仍按预期因开发库 `0004/0005/0007/0014` checksum 差异返回失败，未修改数据库；本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE `/ready` 真实 HTTP 集成回归已完成：新增隔离 SQLite 集成测试并接入 `vitest.integration.config.ts`，干净迁移历史通过真实 `GET /ready` 返回 `200`，不可信 `MIGRATION_FINGERPRINT` 通过真实路由返回 `503`；API integration `8/34`，覆盖率模式 `8/34`，API unit `119/951`、Web behavior `55/242`、Web legacy `85/345`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；未读取或修改项目开发库，本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 浏览器双账号 Cookie 隔离回归已完成：新增两个独立 `request.agent` 会话，分别登录管理员和普通用户并读取 `/api/users/me`；管理员 logout 后其会话返回 `401`，普通用户会话继续返回 `200` 且身份不变，验证单侧退出不会清理另一侧 Cookie 会话；认证 focused `7/7`、API integration `8/35`、typecheck、format、Lint、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮仅改动 API 集成测试，未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 退款商家排行缓存与 API 测试分层修正已完成：`getTopMerchants()` 缓存 key 补入查询日期，避免同一排序/窗口下不同 `q.date` 复用错误排行；新增行为测试验证同日期命中缓存、不同日期重新查询，并同步更新 residual #72 legacy pin；同时将真实 HTTP/SQLite `ready-api.spec.ts` 明确排除出 unit、保留在 integration，避免 unit setup 误跑产生 `503`；API unit `120/952`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；当前开发库 `0004`、`0005`、`0007`、`0014` checksum 差异仍未改写，本轮未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 退款/核销商家排行聚合条件修正已完成：将 `refund-order-header.ts` 与 `refund-top-merchants.ts` 中分组后的未聚合 `HAVING oh."refundAmountFen" > 0` / `oh."verifyAmountFen" > 0` 改为基于 `SUM(...)` 的聚合条件，避免同一商家同时存在有指标和无指标订单时被 SQLite 任意代表行错误排除；新增真实 SQLite 混合订单行为覆盖退款排行、核销排行及今日退款旧入口；`refund-paid-time` `2/2`、API unit `120/953`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-08 非 EXE 商家销售 CSV 退款/核销率口径修正已完成：导出 SQL 补齐 `refundCount`/`verifyCount` 聚合字段，CSV 与商家销售摘要/排行统一使用“退款/核销订单数 ÷ 支付订单数”，不再使用金额 ÷ GMV 的混合口径；真实 SQLite 导出行为验证金额比例与单数比例不同的商家仍输出 `1.0000` 单数率；商家销售 focused `1/1`、API unit `120/953`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE 退款/核销 `paidTime` 口径统一已完成：修正旧核销 KPI 与 Top 核销商家入口按 `verifyTime` 过滤的问题，改为以订单 `paidTime` 作为窗口，核销金额使用 `verifyTime IS NOT NULL` 条件聚合；新增真实 SQLite 回归覆盖“支付窗口内、窗口外核销”和“支付窗口外、窗口内核销”，并验证未核销订单的残留核销金额不进入 KPI；`refund-paid-time` `2/2`、API unit `120/953`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。
2026-08-08 非 EXE 核销趋势主读路径已完成：新增 `OrderHeader` 按 `paidTime` 的核销趋势查询、日填充和单数率计算；`loadVerifyTrend` 与退款趋势对齐，优先使用实时订单数据，空结果再回退 `DailyMetrics`，不再因历史汇总缺行静默返回空趋势；真实 SQLite 跨日趋势、服务层主源和 `DailyMetrics` 回退行为 `5/5`，API unit `120/955`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 核销金额条件聚合已完成：DailyMetrics 重算、GMV `OrderHeader` 今日/趋势查询、数据分析 overview、MerchantDailyMetrics 重算及本地重算脚本均改为仅在 `verifyTime IS NOT NULL` 时汇总 `verifyAmountFen`，防止未核销订单残留金额污染 KPI、趋势、商家销售和 GMV 读模型；新增真实 SQLite 回归覆盖 DailyMetrics、数据分析、GMV 今日/趋势和 MerchantDailyMetrics `4` 个文件 `15/15`，全量 API unit `122` 个文件 `957/957`、API integration `8/35`、typecheck、format、Lint、root build（Web `3183 modules`）、治理静态 pin `188/188` 和源码完整性 `1030/0` 通过；root build 首次因并行 Vite 进程争用生成声明文件短暂失败，单独 Web build 与随后 root build 均成功；本轮未读取或修改项目开发库，未触碰 EXE/Desktop/打包发布代码。

2026-08-09 非 EXE 质量门禁证据已补齐：`npm.cmd run test:coverage` 成功生成 API unit、API integration 和 Web coverage 产物；API legacy `103` 个文件 `408/408`、Web legacy `85` 个文件 `345/345`、schema validate、迁移历史/报告测试、临时 SQLite 备份契约测试均通过；只读 `iam:backfill:report` 返回 `ready: true`（`unknownRoles=0`、`invalidScopes=0`、`missingAssignments=0`）。本轮未修改项目开发库，未触碰 EXE/Desktop/打包发布代码；当前开发库历史迁移 checksum 差异仍按 PRD 发布前验收项保留，不通过重写 checksum 规避。

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

2026-08-09 非 EXE schema 历史只读复核完成：`db:drift-check` 的迁移历史→Schema、实际数据库→Schema 均为 `No difference detected`，仅实际数据库→迁移历史因 `0004`、`0005`、`0007`、`0014` 登记 checksum 与源码不一致而按预期失败；`db:history-report` 保持 `readOnly=true`、`repairApplied=false`，未写入 `prisma/dev.db`，处置结论仍为先备份、来源复核并取得干净 Windows 证据后再制定修复方案。

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

2026-08-09 PRD P0-05 源码审查包白名单已完成：新增 `scripts/package-review.js`，只收集 API/Web/Desktop/Shared 源码、API 测试、Prisma schema/迁移、文档、CI/构建配置及明确批准的发布脚本，强制要求正式 `apps/desktop/src` 存在并生成 `REVIEW_CONTEXT.md`；旧 `electron/`、依赖、构建产物、日志、`.tmp*`、Cookie、数据库及真实 `.env` 不进入审查目录。包安全扫描同步补齐 `*.log`、`.tmp*`、`.cookie*` 门禁，CI 会生成、复扫并上传审查产物；发布契约 `8/8`、源码完整性 `1052/0`、真实工作树白名单 `1484` 个文件且安全违规 `0`、Prettier 与 `git diff --check` 均通过。本切片未修改业务运行逻辑、项目数据库或既有 `code-review-package.zip`，Desktop/EXE 单一路径与固定凭证退役仍作为后续独立 P0 切片保留。

2026-08-09 PRD P0-01/P0-02 Desktop 单一路径与运行时凭据收口已完成：正式入口统一为 `apps/desktop` + `electron-builder.yml`，删除旧 `electron/`、`electron-builder.json`、`scripts/package-electron.js` 与 `start-electron.bat`，开发命令固定从 `apps/desktop` 启动；API/Desktop 统一以 `APP_RUNTIME=desktop` 识别桌面环境，后端仅绑定 `127.0.0.1`，主进程每次启动随机生成运行令牌、JWT secret 与本地认证密码，业务请求必须携带主进程写入的 HttpOnly/SameSite Cookie，桌面令牌缺失时 API fail-closed。Desktop 源码契约 `2/2`、运行时安全 `4/4`、数据库迁移/路径/锁/恢复 `11/11`、发布契约 `10/10`、API unit `999/999`、API integration `38/38`、typecheck、Desktop build、定向 Lint/Prettier、源码完整性 `1069/0` 和 `git diff --check` 均通过；最新源码审查白名单 `1490` 个文件且安全违规 `0`。本切片未修改项目开发数据库；尚未执行安装包或真实 EXE 启动烟测，继续作为后续 Windows 发布验收门禁。

2026-08-09 PRD P0-04 非 EXE 关键写操作幂等已完成：新增 `@RequireIdempotency` 路由元数据，任务创建/批量创建/发布、活动启动、社群导入和 GMV 回填显式声明 Required；缺少 `Idempotency-Key` 返回 `400`，同 Key 同 Payload 重放首个响应，同 Key 不同 Payload 返回 `409`，数据库唯一键竞争与失败记录原子重获保证并发最多一个请求进入业务写入。服务端请求哈希递归排序 JSON 键，`IdempotencyRecord` 过期记录由每日 2 点、带作业单飞保护的 retention job 自动清理；Web 端为任务/活动版本、回填日期+sourceVersion 和导入/创建提交生成业务意图键，保留同一 Payload 的重试键并在 Payload 改变时轮换，任务详情发布处理器补充同步重复点击锁。P0-04 focused API `4` 个文件 `34/34`，Web behavior `71` 个文件 `360/360`、Web legacy `85` 个文件 `351/351`，根 typecheck、API build、Web build（`3190` modules transformed）、定向 ESLint（0 errors/0 warnings）、Prettier、源码完整性 `1077/0` 和 `git diff --check` 均通过；API legacy 全量仍保留两个与本切片无关的旧静态 pin 失败（residual #268/#289），相关文件未修改。本切片未读取或修改项目开发数据库，未触碰 EXE/Desktop/安装包或打包发布代码。

2026-08-09 非 EXE PRD P1-05 Outbox 真闭环已落地：`OutboxService` 新增 typed handler registry 与 JSON payload 校验，`OutboxProcessorJob` 只有 handler dispatch 成功后才允许 `markProcessed`；任务发布在同一 Prisma transaction 中写入状态、`DistributionExecution` 和 `task.published` 事件，真实 handler 以 `OperationAuditLog` 形成持久副作用。新增 0015 migration 持久化 `nextRetryAt`，指数退避后达到 5 次进入 `failed`；API 聚焦单测 `26/26`、API unit `130` 个文件 `1020/1020`、API integration `9` 个文件 `38/38`、root typecheck/build、lint、`db:validate`、迁移历史→Schema `No difference detected` 和源码完整性 `1078/0` 均通过。当前开发 API 仍占用 `prisma/dev.db`，0015 尚未应用，`db:migrate`/实际库 drift 留待停机窗口重跑；本轮未执行 EXE、安装器、`win-unpacked` 或 Desktop 发布验收。

2026-08-15 用户目录、生命周期和规则标签数据口径已统一：生命周期服务、规则标签预览/创建/评估/定时同步均优先读取最近一次成功的 `MemberDirectoryEntry` 完整快照，生命周期页“同步并刷新”复用现有后台串行分页任务并在完成后轮询重载；刷新失败继续保留旧快照。规则命中但尚未进入本地 `Member` 表的目录用户在写入 `UserTagRelation` 前按 500 条分批补齐最小档案，手动打标签也支持这类用户。新增/更新生命周期与标签回归后，API 全量单元测试为 `157` 个文件 `1135/1135`，聚焦用户目录/标签测试 `10/10`，root `typecheck`、API build、Web build 和改动文件 Prettier 均通过；浏览器接线验证了 POST 刷新、正确 `jobId` 轮询和完成后的 lifecycle 重载，运行快照显示 `163,827` 用户。Web behavior 当前为 `90` 个文件 `423` 个通过、1 个与本切片无关的 GMV 积分支付组合断言失败；本次未在运行实例启动真实十万级 JeeSite 全量拉取，外部凭证、全量任务完成和数据质量仍需目标环境验收。

2026-08-15 用户目录重启同步与原子快照已落地：API 启动后默认触发一次受控串行会员目录同步，可用 `USER_CENTER_REFRESH_ON_STARTUP=false` 关闭；新代页面写入 `MemberDirectoryRefreshEntry` staging，全部页面完成且无持久化错误后，在单事务内替换 `MemberDirectoryEntry` 并更新 `MemberDirectorySnapshotState` 活动指针，失败、空集、服务中断均不污染旧快照。新增 `GET /user-center/members/refresh/active`，用户管理页和生命周期页可在服务重启后接续活动任务；新增 0027 migration 与 migration-policy 记录。焦点 API 回归 `22/22`、API unit `158` 文件 `1139/1139`、API legacy `103` 文件 `410/410`、root typecheck、API/Web build、`check:integrity`、`db:validate` 和迁移策略测试通过；API integration `38/39`（剩余 1 个既有 Excel 导出 zip 测试失败），Web behavior `423/424`（剩余 1 个既有 GMV 积分支付组合断言失败），真实迁移应用、浏览器重跑和 JeeSite 全量数据质量仍待停机窗口/目标环境验收。

2026-08-16 商品库存与订单操作边界已收口：商家同步改为 Promise 单飞，商品页刷新等待同步持久化完成后再读取本地 `ContentPackage`，商品 GET 增加 no-cache 请求头；砍价适配器补齐 `bargainCommodityDynamic` 对象/JSON 字符串解析与 `hasInventory` 剩余量、`initialInventoryTotal` 总量口径，商品列表改为 `stockLeft DESC`，解决第一页被售罄 SKU 占满而误判“库存全是 0”的问题。订单中心、物流单、卡批次和卡券页移除核销、退款、库存回补、发货及卡券状态写路由和控件，保留查询与历史流水。API 聚焦回归 `5` 个文件 `18/18`、API build、Web build 和受影响 Web 行为测试通过；本地浏览器商品页验证汇总余量 `16,003 / 602,033` 且首屏显示非零 SKU，写接口本地验证返回 `404`。Web 全量行为仍有 1 个既有 GMV 积分支付组合断言失败；外部 JeeSite 当前会话返回登录态提示，完整实时数据仍需有效凭证的目标环境验收。

2026-08-16 商品在售 SKU 缓存残留已补齐：完整 JeeSite 分页同步现在携带 `isComplete` 标记，只有全量页面成功读取、未触发分页上限且本地套餐批量写入完整时，才将本次目录中不存在的旧 `selling` 记录标记为 `pending`；部分失败或截断不会误下架。当前运行实例真实同步返回 `packagesCount=747`、`packagesPersisted=747`、`stalePackagesDeactivated=15`，`activeSkus` 从 `762` 更新为 `747`；浏览器刷新后的商品页同样显示在售 `747`、余量 `16,243 / 602,033`。API 聚焦回归 `5` 个文件 `21/21`、root typecheck、API/Web build 通过。

2026-08-16 商品库存三口径已落地：砍价页 `bargainCommodityDynamic.initialInventoryTotal` 映射初始库存、`inventoryTotal` 映射现在库存并持久化到 `ContentPackage.currentStock`、`hasInventory` 映射当日库存并继续兼容 `stockLeft`；商品中心 API 与页面新增 `initialStock/currentStock/dailyStock` 三字段，列表、汇总和详情均展示，不再把三个概念压成一个 `stockLeft/stockTotal`。新增 0028 migration 并在实际根开发库应用；有效凭证下真实同步 `747/747`，接口汇总为初始 `602,033`、现在 `378,630`、当日 `16,229`，浏览器验证第二个 SKU 显示 `2,280 / 2,262 / 1,280`。聚焦 API `3` 个文件 `15/15`、API/Web build、root typecheck、`db:validate`、迁移策略 `6/6` 通过；`db:drift-check` 仍有既有 15 张重定义表残差，未归因于本次字段。

2026-08-16 商品状态筛选已贯通：商品中心列表 DTO 只接受 `pending`（待售）、`selling`（销售中）、`recycle`（已回收）三种状态；Web 筛选会保留 URL 参数、同步请求并在切回“全部状态”时省略过滤参数。当前运行实例接口返回 `pending=162`、`selling=747`、`recycle=56`，每个筛选结果仅含对应状态；浏览器点选待售后 URL 为 `?saleStatus=pending` 且列表显示 `162` 条。商品中心定向回归 `2/2`、root typecheck、API/Web build 通过。

2026-08-16 商品售卖时间对齐已补齐：定位到 `ContentMerchantSyncService` 的冲突更新只覆盖库存/状态等字段，遗漏 `ContentPackage.startTime/endTime`，导致外部同步成功但详情仍显示旧时间；同步 SQL 现会写入最新起止时间。JeeSite 适配器同时支持顶层 `startDate/expireDate`、`bargainCommodityDynamic` 嵌套时间字段和秒/毫秒时间戳，并保留 `pending/selling/recycle` 三种外部状态，商品详情改为按北京时间显示到时分。新增同步 SQL、非 selling 状态和嵌套数字时间回归，聚焦测试 `15/15`、root typecheck、API/Web build 通过；当前实例三状态全量同步 `2874/2874`，本地状态为 `pending=1089`、`selling=747`、`recycle=1039`，原始外部样本与本地起止时间一致；浏览器核对 SKU `2059931575084183552` 显示 `2026/05/28 00:00 – 2027/05/28 00:00`。起止日期相同的商品经外部原始字段核对为真实同日售卖，不再按相等值误报异常。

2026-08-17 用户管理看板补充新增用户指标：API summary 新增今日、本周、本月三项，外部目录使用最近一次成功快照的 `sourceCreatedAt` 全量聚合，本地模式使用 `Member.firstSeenAt` 回退；日期统一按北京时间，周一为自然周起点、每月 1 日为自然月起点。Web 用户中心新增三分栏“新增用户”卡片，并在无完整外部快照时显示不可用而不是误报 0；日期边界聚焦测试 `3/3`、用户中心聚焦测试 `15/15`、root typecheck、API build、Web build、定向 ESLint 和 `git diff --check` 已通过，目标环境外部数据核对待完成。

2026-08-17 商品中心重复入口已收口：`/products` 与原 `/packages` 均加载 `ProductCenterView.vue`，侧栏现仅保留“商品管理”；旧 `/packages` 链接重定向到 `/products`，独立的 `/packages/combinations` 组合套餐页面继续保留。新增导航回归覆盖重复入口移除与旧路径兼容；聚焦导航/权限测试 `12/12`、root typecheck、Web build、定向 ESLint 和 `git diff --check` 已通过，Prettier 仅保留基线已有的 `route-permissions.ts` 整文件格式提示。

## 10. 一句话结论

在「不停优化」目标下，仓库从 **数据范围未接线 / 安全边角** 推进到 **SQL 批量与读路径瘦身**，再推进到 **SPA 能力补齐**，最终把运营台核心图表与列表的 **静默 Top-N 截断** 收敛为可投影、可横幅、可 pin 的诚实度契约；截至 2026-08-09，主路径 Medium 级 silent-cap 族已基本收口，API CSP、浏览器 Cookie-only 认证、空表 env-admin 兜底退役、P0-03 迁移基线和 P0-04 关键写入幂等均已记录并有非 EXE 验证；外部旧 API 的 token 兼容接口、Campaign 关系化 scope 和 EXE/Windows 发布验收仍按范围单独保留，其中 Windows 验收明确延期。
