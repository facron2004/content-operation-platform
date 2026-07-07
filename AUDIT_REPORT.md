# Content Operation Platform — Full Audit Report

**Date**: 2026-07-07
**Scope**: 5 dimensions (Backend Architecture / Frontend Architecture / Core Domain Module / Shared Packages & Tests / Security & Configuration)

## Resolution Status

| Priority | Total | Fixed | Status |
|----------|-------|-------|--------|
| P0 Critical | 3 | 3 | **All resolved** |
| P1 High | 8 | 8 | **All resolved** |
| P2 Medium | 17 | 14 | **14 resolved, 3 deferred** (P2-13 前端测试, P2-15 AI 失败路径, P2-16 E2E negative) |
| P3 Low | 12 | 0 | Deferred |

**Commit**: `c590ff8` — `fix(audit): resolve P0/P1/P2 issues from full codebase audit`
**Tests**: 291 passing across 24 spec files (was 251 / 22 files)
**Compilation**: 0 TypeScript errors across shared / api / web packages

## Overall Scores

| Dimension | Score | Summary |
|-----------|-------|---------|
| Backend Architecture | 6.0/10 | 扎实的 NestJS 分层和纯函数 Domain 层，但 schema 演进机制和缺失 await 拖后腿 |
| Frontend Architecture | 8.2/10 | 零 `any`、优秀的 HTTP 客户端和缓存设计，个别组件/组合子过大 |
| Core Domain Module | 7.8/10 | 评分/告警/文案业务逻辑成熟度高，但数据集缓存去重有致命 bug |
| Shared Packages & Tests | 7.0/10 | 共享包零依赖方向正确，但前端零测试、6 个工具函数未覆盖 |
| Security & Configuration | 7.5/10 | SSRF 防护一流、生产环境拒绝默认密钥，AI baseURL 缺 SSRF、登录无暴力破解防护 |

## Key Findings Summary

- **3 Critical (P0), 8 High (P1), 17 Medium (P2), 12 Low (P3)** issues identified
- Notable strengths:
  - Domain 层纯函数设计，集中阈值常量，可测试性极佳 (8-9/10)
  - 前端零 `any` 使用，类型纪律优秀 (10/10)
  - 双层 SSRF 防护（字面 IP + DNS 解析），timing-safe token 比较
  - 生产环境拒绝默认 JWT_SECRET/AUTH_PASSWORD，安全默认值
  - HTTP 客户端指数退避重试 + 401 去重修复 + NProgress 引用计数

---

## Improvement Items

### P0 — Critical (fix immediately)

**P0-1: Dataset cache deduplication completely broken** ✅ Resolved
- Files: `apps/api/src/content/data-source.service.ts:50-62`
- Issue: `loadDataset` 的 `finally` 在 IIFE Promise resolve 之前就同步清空 `this.inFlight = null`，导致并发请求的去重守卫永远不触发。每次缓存失效时所有并发请求都会独立打外部 API。
- Fix: 将 `this.inFlight = null` 移入 IIFE 的 `.finally()` 回调，确保 Promise resolve 后才清空。

**P0-2: HtmlFetcher 缺少 await 导致 URL 拼接为 `[object Promise]`** ✅ Resolved
- Files: `apps/api/src/content/package-detail/html-fetcher.ts:20`
- Issue: `normalizeJeesiteBaseUrl` 是 async 函数但调用处缺少 `await`，导致 baseUrl 变成 `[object Promise]`，所有详情抓取请求 URL 错误。
- Fix: 添加 `await` 或将 `normalizeJeesiteBaseUrl` 改为同步函数（如果不需要异步操作）。

**P0-3: 三源 Schema 演进无版本追踪、无回滚能力** ✅ Resolved
- Files: `prisma/schema.prisma`, `apps/api/src/prisma/prisma.service.ts` (migrateAddColumns), `apps/api/src/content/daily-inventory-crawler.service.ts` (auto CREATE TABLE)
- Issue: Schema 同时由 Prisma schema、运行时 ALTER TABLE ADD COLUMN、运行时 CREATE TABLE 三条路径管理。无迁移历史、无版本控制、无回滚。列名拼错或类型变更会导致数据丢失且无法恢复。
- Fix: 统一使用 Prisma Migrate (`prisma migrate dev/deploy`)，移除运行时 ALTER TABLE。将 auto-table-creation 改为 Prisma migration。

---

### P1 — High (fix this week)

**P1-1: AI Config `baseURL` 缺少 SSRF 校验** ✅ Resolved
- Files: `apps/api/src/content/content.dto.ts:42`, `apps/api/src/content/ai-copy/ai-client.manager.ts:52-54`
- Issue: `POST /api/content/ai-copy/config` 接受 `baseURL` 并直接传给 OpenAI 客户端，无 SSRF 校验。可被用于探测云元数据 (169.254.169.254) 或内网扫描。
- Fix: 复用 `jeesite-url.ts` 的 `assertHostnameNotPrivateAsync()` 校验。

**P1-2: 过期缓存 Cookie 阻塞环境变量 Cookie 回退** ✅ Resolved
- Files: `apps/api/src/content/auto-login.service.ts:164-178`
- Issue: `getFreshCachedCookie` 过期时返回 null 但未清空 `this.cachedCookie`，导致 `getEnvironmentCookie` 的 `!this.cachedCookie` 条件不满足，环境变量中的手动 Cookie 被跳过。
- Fix: 过期时 `this.cachedCookie = null`，或移除 `getEnvironmentCookie` 中的 `!this.cachedCookie` 守卫。

**P1-3: collectInventoryRows 使用朴素 Map 而非 latestSnapshotsByPackage** ✅ Resolved
- Files: `apps/api/src/content/daily-inventory-crawler.service.ts:102-118`
- Issue: 用 `snapshots.map(s => [s.packageId, s])` 构建 Map，同一包有多条快照时保留数组最后一条而非最新的，可能记录过期库存数据。
- Fix: 替换为 `latestSnapshotsByPackage(dataset.snapshots)`。

**P1-4: 登录 POST 请求缺少超时** ✅ Resolved
- Files: `apps/api/src/content/auto-login.service.ts:285`
- Issue: 登录表单提交使用裸 `fetch()` 而无 AbortController，外部系统挂起时登录流程无限阻塞，级联阻塞推荐/文案请求。
- Fix: 替换为 `fetchWithTimeout(loginUrl, {...})`。

**P1-5: HtmlFetcher 硬编码生产 URL 回退** ✅ Resolved
- Files: `apps/api/src/content/package-detail/html-fetcher.ts:22`
- Issue: `EXTERNAL_API_BASE_URL` 未配置时静默回退到 `https://zdm.zhsh1.cn`，开发/测试环境可能误触生产数据。
- Fix: 移除硬编码回退，未配置时抛 `BadRequestException`。

**P1-6: CONTENT_CACHE_TTL_MS 双重默认值语义冲突** ✅ Resolved
- Files: `apps/api/src/content/content.service.ts:248-250` (60s), `apps/api/src/content/data-source.service.ts:78` (300s)
- Issue: 两个服务读取同一环境变量但默认值不同 (60s vs 300s)，语义意图不明确。
- Fix: 拆分为 `CONTENT_RECOMMENDATION_CACHE_TTL_MS` 和 `CONTENT_DATASET_CACHE_TTL_MS`。

**P1-7: 前端登录跳转使用 `window.location.hash` (history 模式路由无效)** ✅ Resolved
- Files: `apps/web/src/services/http-client.ts:73`
- Issue: `window.location.hash = '#/login'` 在 `createWebHistory()` 模式下无效，用户 401 后不会被正确跳转到登录页。
- Fix: 使用 `router.push({ name: 'login' })`。

**P1-8: 前端无 404 路由** ✅ Resolved
- Files: `apps/web/src/router.ts`
- Issue: 访问不存在的路径无 catch-all 路由，用户看到空白页。
- Fix: 添加 `{ path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') }`。

---

### P2 — Medium (fix this sprint)

**P2-1: Login 端点无独立限速 / 暴力破解防护** ✅ Resolved
- Files: `apps/api/src/auth/auth.controller.ts:23-27`
- Issue: 登录端点使用全局限速 (200/min)，无账户锁定，攻击者可 12,000 次/小时暴力破解。
- Fix: 添加 `@Throttle({ short: { limit: 3, ttl: 1000 } })` 或登录失败指数退避。

**P2-2: JWT 无 refresh token rotation、无撤销机制** ✅ Partially resolved (缩短过期时间至 2h)
- Files: `apps/api/src/auth/auth.service.ts:20-24`
- Issue: refresh 仅重新签名，无服务端 session 追踪，被盗 JWT 24 小时内有效且无法撤销。
- Fix: 实现 refresh token + 一次性轮转 + token blacklist，或至少缩短 access token 到 2h。

**P2-3: getRecommendations 端点 ~12 个查询参数无 DTO 校验** ✅ Resolved
- Files: `apps/api/src/content/package.controller.ts:29-87`
- Issue: 直接用 `@Query()` 接收参数，无 class-validator 装饰器，`category`/`date` 无长度限制，`page`/`pageSize` 无范围校验。
- Fix: 创建 `RecommendationsQueryDto` 配合 `@IsOptional()`, `@MaxLength()`, `@Min()`, `@Max()`。

**P2-4: getCategories 触发完整推荐计算** ✅ Resolved
- Files: `apps/api/src/content/content.service.ts:313-324`
- Issue: `getCategories()` 调用 `getCachedRecommendations` 触发全量评分流水线，仅为了提取分类名。
- Fix: 直接从 dataset.packages 提取分类，跳过评分管道。

**P2-5: 推荐管道先计算后过滤** ✅ Resolved
- Files: `apps/api/src/content/content.service.ts:341-351`
- Issue: 对所有包计算完整评分后才按分类/库存过滤，500 包中仅 30 匹配时浪费 470 次计算。
- Fix: 在 `buildRecommendPackageItems` 入口预过滤 category/inventoryFlag。

**P2-6: ShellLayout God Component (536 行)** ✅ Resolved
- Files: `apps/web/src/components/ShellLayout.vue`
- Issue: Cookie 配置弹窗 (~150 行) 内嵌在主布局中，职责过多。
- Fix: 提取 `CookieConfigDialog.vue` 独立组件。

**P2-7: useGenerate God Composable (298 行, 22 导出)** ✅ Resolved
- Files: `apps/web/src/composables/useGenerate.ts`
- Issue: 表单、AI 配置、包列表、编排全部混在一个组合子中。
- Fix: 拆分为 `useGenerateForm()`, `useAICopyConfig()`, `usePackageFeed()` + 编排器。

**P2-8: 前端无 AbortController 请求取消** ✅ Resolved
- Files: `apps/web/src/services/http-client.ts`, `apps/web/src/services/api/*.ts`
- Issue: requestId 模式防止过期写入但不取消在途请求，快速切页时浪费带宽。
- Fix: 给 axios 附加 `AbortController.signal`，取消前序请求。

**P2-9: Raw HTML 缓存占内存 (500 条 * 50-200KB)** ✅ Resolved
- Files: `apps/api/src/content/package-detail/detail-cache.ts:8-9`
- Issue: `saveRawHtml=true` 时将完整 HTML 存入内存缓存，500 条可达 25-100MB。
- Fix: 缓存前剥离 `rawHtml`，或仅缓存解析后的 sections。

**P2-10: AI maxTokens/temperature 无边界校验** ✅ Resolved
- Files: `apps/api/src/content/ai-copy/ai-client.manager.ts:35-36`
- Issue: 用户可设 `maxTokens: 0` 或 `temperature: -1`，导致后续 OpenAI 请求全部失败。
- Fix: 添加 `clamp(maxTokens, 100, 8000)`, `clamp(temperature, 0, 2)`。

**P2-11: buildInventoryFlag 对 0 天未售误判为 unsold_today** ✅ Resolved
- Files: `apps/api/src/content/inventory-flags.ts:86-95`
- Issue: `inventoryUnsoldDays === 0` 时仍返回 `unsold_today`，实际上表示当日售出（销售良好）。
- Fix: `inventoryUnsoldDays === 0` 时返回 `normalResult` 而非 `unsold_today` 分支。

**P2-12: AI contentId 并发碰撞风险** ✅ Resolved
- Files: `apps/api/src/content/ai-copy/ai-copy.service.ts:127`
- Issue: `Date.now()` 毫秒粒度 + 短 randomShortId，并发同毫秒请求可能碰撞。
- Fix: 使用 `crypto.randomUUID()` 替代。

**P2-13: 零前端测试** ⏳ Deferred (需要 @testing-library/vue 基础设施)
- Files: `apps/web/` (整个目录)
- Issue: 30+ 组件、6+ 组合子、7+ API 模块、stores 全部无测试。
- Fix: 添加 vitest + @testing-library/vue，优先测试组合子和 http-client 重试逻辑。

**P2-14: 6 个共享工具函数未测试** ✅ Resolved (新增 27 个测试)
- Files: `packages/shared/src/index.ts` (paginate, resolvePagination, latestSnapshotsByPackage, localDateKey, randomShortId, formatPrice)
- Fix: 在 `shared-utils.spec.ts` 中补充边界用例。

**P2-15: AI 文案生成失败路径未测试** ⏳ Deferred
- Files: `apps/api/test/ai-copy.service.spec.ts`
- Issue: 未覆盖 OpenAI API 错误、畸形 JSON 响应、字段缺失、超时场景。
- Fix: 添加 `mockRejectedValueOnce` 和畸形响应测试。

**P2-16: content-api E2E 仅一个 happy path** ⏳ Deferred
- Files: `apps/api/test/content-api.spec.ts`
- Issue: 未测试 401 未授权、无效查询参数、错误响应。
- Fix: 添加 2-3 个 negative path E2E 测试。

**P2-17: Shared 包 index.ts 与 api-types.ts 循环导入** ✅ Resolved (添加保护注释)
- Files: `packages/shared/src/{index.ts:699, api-types.ts:4-11}`
- Issue: api-types 从 index 导入类型，index 又 re-export api-types，模块级循环。
- Fix: 当前为纯 `import type` 安全，已添加防护注释防止未来引入运行时导入。

---

### P3 — Low (fix when convenient)

| # | Issue | Files | Fix |
|---|-------|-------|-----|
| P3-1 | `formatMoney` 与 shared 的 `formatPrice` 重复 | `apps/web/src/utils/labels.ts:131` | 统一到 shared |
| P3-2 | `useRequestId` 未一致采用 | `composables/useRequestId.ts` | 统一使用或移除 |
| P3-3 | `dangerouslyUseHTMLString` 在快捷键帮助中 | `composables/useKeyboardShortcuts.ts:148` | 改用 Vue 组件弹窗 |
| P3-4 | CSS 重复: `.metric-tile` 全局+scoped | `styles.css:331-382` vs `MetricTile.vue:17-66` | 删除全局死代码 |
| P3-5 | Dark theme CSS 两个重叠 `[data-theme='dark']` 块 | `styles/dark-theme.css:19-66` | 合并为一个块 |
| P3-6 | AuditView 静默吞错误 | `views/AuditView.vue:92-101` | 添加 catch + ErrorAlert |
| P3-7 | OperationHistory 记录不刷新 | `components/OperationHistory.vue:98` | watch visible 时重新加载 |
| P3-8 | 不安全类型断言 `ref({} as T)` | `composables/usePackageAnalysisPage.ts:9` | 改为 `ref<T \| null>(null)` + v-if |
| P3-9 | API-only 类型 (InventoryFlagInput/Result) 在 shared | `packages/shared/src/index.ts:649-668` | 移到 API 本地类型 |
| P3-10 | CSP 包含 `unsafe-inline` + `unsafe-eval` | `apps/api/src/common/security.middleware.ts:22-24` | 生产用 runtime-only build 移除 |
| P3-11 | cheerio 固定在 RC 版本 | `apps/api/package.json:34` | 升级到 1.0.0 stable |
| P3-12 | `.cookie.cache` 默认文件权限 | `apps/api/src/content/auto-login.service.ts:94-98` | 用 `{ mode: 0o600 }` |

---

## Fix Roadmap

| Phase | Items | Status |
|-------|-------|--------|
| Phase 1: P0 修复 | P0-1 ~ P0-3 (缓存去重、await 修复、Schema 统一) | ✅ Complete |
| Phase 2: P1 修复 | P1-1 ~ P1-8 (SSRF、Cookie 回退、快照 Map、超时、路由修复) | ✅ Complete |
| Phase 3: P2 修复 | P2-1 ~ P2-17 (限速、DTO 校验、组件拆分、测试补充) | ✅ 14/17 resolved, 3 deferred |
| Phase 4: P3 润色 | P3-1 ~ P3-12 (CSS 清理、类型整理、依赖升级) | ⏳ Pending |
