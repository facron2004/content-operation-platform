# 文档对齐总览

> 状态基线：2026-08-09（Asia/Shanghai）

本文档是当前代码与文档的统一入口。历史审计、设计稿和执行计划保留原始日期与结论；当历史记录与本文档冲突时，以当前代码、当前验证命令和本文档为准。

## 当前工作范围

本轮继续优化只覆盖 API、Web、shared、Prisma、脚本和文档。Windows Desktop、EXE、安装器、`win-unpacked` 以及安装后真实进程验收明确延期，不属于本轮完成证据；相关说明仅作为后续发布参考，不能当作当前已验收能力。

## 当前实现状态

| 项目 | 当前状态 | 证据 |
|------|----------|------|
| P0-03 数据库迁移基线 | 0015 源码基线已落地，开发库待应用 | `npm run db:validate`、迁移历史→Schema `No difference detected`；新增 Outbox `nextRetryAt` 的 0015 已纳入 schema/policy。当前运行中的 API 占用 `prisma/dev.db`，`db:migrate`/实际库 drift 需在停机窗口重跑 |
| P0-04 关键写入幂等 | 已完成 | `@RequireIdempotency`、400 缺失键、409 负载冲突、同键重放、竞态保护、失败记录重取、每日清理任务及前端业务意图键 |
| P1-05 Outbox 真闭环 | 代码与聚焦验收完成，开发库迁移待应用 | handler registry、`task.published` 事务 producer、真实审计 handler、失败重试/`nextRetryAt`/`failed`；API 聚焦 `26/26`，API build 通过 |
| API 行为 | 当前聚焦回归通过 | P0-04 API focused `34/34`；其余完整 API 结果以 `docs/CONTINUOUS-OPTIMIZATION-SUMMARY.md` 的最新条目为准 |
| Web 行为 | 当前聚焦与兼容回归通过 | Web behavior `360/360`、legacy `351/351`（本轮 P0-04 基线） |
| 类型、构建、完整性 | 当前非 EXE 门禁通过 | `npm run typecheck`、`npm run build`、`npm run check:integrity`（1078 个源码文件，未解析导入 0） |
| 格式与静态检查 | 本轮改动文件通过 | Prettier 全部 Markdown 通过；P0-04 变更文件 ESLint `0 errors/0 warnings` |
| Windows 发布 | 延期 | 不执行 `build:exe`、`package:exe`、安装器、`win-unpacked` 或 EXE smoke |

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

`db:migrate` 与 `db:drift-check` 必须在 API 停止、数据库可获得迁移锁的维护窗口执行；当前 0015 已完成源码/schema/policy 对齐，但运行中的开发 API 占用 `prisma/dev.db`，暂不把未应用的实际库状态写成“已通过”。

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
