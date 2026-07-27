# 内容运营平台 · 持续优化收束报告

> **目标**：`继续优化，我不说停不准停`  
> **范围**：NestJS monorepo Content Operation Platform（`apps/api` + `apps/web` + `packages/shared`）  
> **分支**：`codex/unsold-inventory-links`  
> **状态截止**：Residual **#290** 已落地并通过类型检查 / 焦点 pin 测试  
> **日期跨度**：2026-07-22 → 2026-07-25（含多次 compaction 续跑）

---

## 1. 目标与工作方式

在用户明确说停之前，持续做安全 / 正确性 / 工程可维护性的 residual 硬化：

1. 扫描 Medium+ 残差（安全、静默截断、IDOR、范围泄漏、SQL 性能、PII 等）
2. 优先落地 **高 ROI** 项（小改动、可验证、直接影响运营台面诚实度或安全面）
3. 每个 residual 尽量带：API 投影 + shared 类型 + SPA 提示 + `residual-N-hardening.spec.ts` pin 测试
4. 验证：`tsc -p tsconfig.build.json --noEmit`（api）、`vue-tsc --noEmit`（web）、焦点 vitest
5. 记账：`memory/continuous-optimization-2026-07-23.md` + `MEMORY.md` 指针

**不做**的事：破坏性攻击、DoS、供应链投毒、写 exploit；安全工作限定在已授权的本仓库防御硬化。

---

## 2. 总体成果一览

| 指标 | 数值 |
|------|------|
| Residual 编号跨度 | **#21 → #290**（约 270 个落地项，含少量编号跳号） |
| 源码 pin 测试 | **157** 个 `apps/api/test/residual-*-hardening.spec.ts` |
| 主战场 | 安全 / 数据范围、SQL 批量化、读路径瘦身、SPA 能力接线、**静默 Top-N / take-cap 诚实度** |
| 共享约定 | `limit` / `matched` / `truncated` 或 `*Limit` / `*Loaded` / `*Truncated` / `*Missed` + SPA 琥珀色 `list-cap-hint` |
| 类型检查 | api `tsc` + web `vue-tsc` 在 #290 收口时均为 clean |
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

## 8. 仍挂起 / 下一轮候选（#291+）

按 ROI 粗排（实现未启动）：

| 优先级 | 候选 | 说明 |
|--------|------|------|
| Medium / API | Dashboard summary `topPackages` / `statusDistribution` RECOMMEND-head 诚实度 | 漏斗当前主要用计数，SPA 表面弱 → API Medium / SPA Low |
| Feature | Attribution unmatched-orders SPA | API 已有，缺客户端全链路 |
| UX | Generate 多页可搜索套餐选择器 | 诚实度已在 #268；体验未做 |
| Low | 死客户端 `getUser` / `resolveAlert` | 清理型，ROI 低 |
| 平台债 | env-admin 冷启动口令路径、全局 `forbidNonWhitelisted: true`、Campaign 关系化 scope、CSP 去 unsafe-inline/eval、JWT → httpOnly cookie | 高成本，长期债 |

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

## 10. 一句话结论

在「不停优化」目标下，仓库从 **数据范围未接线 / 安全边角** 推进到 **SQL 批量与读路径瘦身**，再推进到 **SPA 能力补齐**，最终把运营台核心图表与列表的 **静默 Top-N 截断** 收敛为可投影、可横幅、可 pin 的诚实度契约；截止 **Residual #290**，主路径 Medium 级 silent-cap 族已基本收口，后续进入功能级与平台债阶段。
