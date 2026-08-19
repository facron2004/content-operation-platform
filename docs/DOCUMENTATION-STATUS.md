# 文档对齐总览 (Documentation Status)

> 状态基线：2026-08-18（Asia/Shanghai）

本文档是系统全域架构设计、各模块实现状态与验证证据的统一总索引。历史审计、设计稿和执行计划保留原始日期与结论；当历史记录与本文档冲突时，以当前代码、当前验证命令和本文档为准。

---

## 全局实现状态矩阵

| 架构专项 / 模块域 | 当前状态 | 验证证据与验收边界 |
|-------------------|----------|--------------------|
| **P0-01/P0-02 Desktop 路径与凭证** | 结构就绪 | 统一 `apps/desktop` 入口，支持 Electron `safeStorage` 与回环凭证校验；Windows EXE 真实安装烟测按发布周期执行 |
| **P0-03 数据库迁移基线** | 0001 至 0029 已落库 | `npm run db:validate` 通过；Prisma Schema 与 0029 迁移完整对齐，启动阶段执行只读结构自检，禁止运行时 DDL |
| **P0-04 关键写入幂等性** | 已全链路落地 | `@RequireIdempotency` 守卫覆盖任务创建/批量创建/发布、活动启动、社群导入与 GMV 回填；400 缺失键、409 负载冲突、同键重放与每日清理已就绪 |
| **P0-05 源码审查白名单** | 已就绪 | `scripts/package-review.js` 仅收集正式源码与配置，敏感文件（`.env`、`.tmp*`、`*.db`、`*.log`）白名单排除，安全违规为 0 |
| **P1-05 事务性 Outbox 闭环** | 已落地 | `OutboxService` typed handler registry，任务发布与事件同一事务写入，`OutboxProcessorJob` 指数退避重试与审计日志持久化 |
| **金钱分精度体系 (Phase 1-5)** | 全链路闭环 | SQLite 存储 `*Fen` (BigInt)，ORM 双写扩展自动同步，`MoneyViewInterceptor` 格式化 `*Display`，`npm run db:reconcile` 扫描 10 个模型 0 分差异 |
| **用户中心与会员目录快照** | 已落地 | 后台受控单线程串行分页；人工与每 10 分钟增量同步按活动快照最新旧用户边界早停，仅写入新增会员；每日全量校准使用新代暂存写入 + 单事务原子切换快照指针；看板精准统计北京时间今日/本周/本月新增会员 |
| **商品中心与三库存模型** | 已落地 | 砍价商品结构适配对象与 JSON 字符串；初始库存（`initialStock`）、现在库存（`currentStock`）与当日库存（`dailyStock`）三口径明确；待售/销售中/已回收三状态贯通；收口重复套餐入口 |
| **门店管理与 GMV 区域分布** | 已落地 | JeeSite `corePartnerShop/listData` 串行抓取，幂等写入 1900+ 门店经纬度；GMV 区域分析优先按门店坐标归属于深圳 9 个行政区 |
| **商家提货分与财务中心** | 已落地 | 从合作商账户记录聚合有效可用分（分整数储存），采用活动快照机制只读呈现；订单中心拆分展示线上支付、余额支付与实付合计，严格保留只读安全边界 |
| **前端样式解耦与错误隔离** | 已落地 | 复合页面（商家销售/退款核销/GMV等）拆分多路独立错误状态与局部重试；大型 CSS 抽取至 `styles/components/` 与 `styles/views/`；异步请求增加 `isActive` 卸载保护 |
| **全栈类型、构建与完整性** | 0 报错通过 | `npm run typecheck`（shared + api + web）、`npm run check:integrity`（1,221 个源码文件，0 未解析导入）、`npm run db:validate` 与 `npm run lint:check` 均通过 |

---

## 近期重要功能与架构交付

### 1. 用户中心全量会员目录原子快照与新增看板
- **新增用户增量同步**：活动快照按 `sourceCreatedAt` 取最新旧 `memberId`，外部分页按默认新到旧顺序扫描，读到该 ID 后截断本页并停止；在安全页数内找不到边界则任务失败，不静默漏数。前端“同步新增用户”调用 `/api/user-center/members/refresh/incremental`，完成后重新加载用户列表和新增看板。
- **原子快照切换**：16 万+ 会员目录采用串行分页写入 `MemberDirectoryRefreshEntry` 暂存表，全部成功后短事务仅更新 `MemberDirectorySnapshotState` 指针，彻底解决长事务锁超时导致的数据更新丢失问题。
- **服务启动自动同步**：API 启动后自动触发一次后台受控同步（可用 `USER_CENTER_REFRESH_ON_STARTUP=false` 关闭），前端页面可接续活动任务进度，刷新期间继续读取旧快照。
- **新增用户看板**：北京时间自然天（今日 00:00 至今）、自然周（周一 00:00 至今）、自然月（1 日 00:00 至今）新增会员统计，无完整快照时显示不可用状态，杜绝伪造 0 数据。

### 2. 商品中心三库存模型与状态筛选
- **三库存口径**：砍价商品 `initialInventoryTotal` 写入初始库存（`initialStock`）、`inventoryTotal` 写入现在库存（`currentStock`）、`hasInventory` 写入当日库存（`dailyStock`），并在列表、详情和汇总中统一呈现。
- **展示优化与状态流转**：商品列表默认按剩余库存降序排序，避免首屏被售罄 SKU 占满；支持 `pending`（待售）、`selling`（销售中）、`recycle`（已回收）三种状态筛选并同步 URL。
- **入口收敛**：移除侧栏与路由中与商品管理重复的套餐管理入口，旧路径 `/packages` 自动重定向至 `/products`，组合套餐 `/packages/combinations` 独立维护。

### 3. 合作商店铺同步与 GMV 深圳 9 区坐标归属
- **店铺数据落库**：从 JeeSite `corePartnerShop/listData` 串行抓取 1900+ 合作商店铺主数据，提取经纬度与区域代码并持久化。
- **GMV 区域分析**：GMV 区域分布优先使用订单套餐关联的外部门店经纬度，回退至商家坐标，通过深圳各区中心点分类器准确归入南山、福田、罗湖、宝安、龙岗、龙华、盐田、坪山、光明 9 大行政区。

### 4. 商家提货分快照与财务只读边界
- **提货分聚合**：读取合作商账户记录 JSON，按商家 ID 聚合 `state=1` 的有效可用提货分，按点×100 的整数分储存。
- **订单支付拆分与安全边界**：订单中心展示线上支付、余额支付与实付合计；订单、物流、卡券与核销相关路由严格保持只读与流水审计，关闭中台写接口。

---

## 推荐标准验证顺序

在提交代码或发布前，推荐按以下顺序执行质量门禁：

```bash
# 1. 全栈类型检查
npm run typecheck

# 2. 源码导入完整性校验 (确保无死链导入)
npm run check:integrity

# 3. Prisma Schema 模型声明校验
npm run db:validate

# 4. 静态代码质量与风格检查
npm run lint:check
npm run format:check

# 5. 全栈构建
npm run build

# 6. 后端与前端自动化测试
npm run test:unit -w @content/api
npm run test:integration -w @content/api
npm run test:behavior -w @content/web
npm run test:legacy -w @content/web

# 7. 数据库金钱精度对账
npm run db:reconcile
```

---

## 项目文档索引与地图

### 1. 核心规范与指南
- [README](../README.md)：项目简介、核心功能、技术架构、快速启动与 API 概览。
- [开发者指南](../开发者指南.md)：开发环境、Monorepo 结构、34 领域模块、金钱精度规范、数据库治理与编码规范。
- [持续优化收束报告](CONTINUOUS-OPTIMIZATION-SUMMARY.md)：按时间线记录全部重构、优化与验证日志。

### 2. 专项技术文档
- [自动登录机制](AUTO_LOGIN.md)：JeeSite 会话管理、Cookie 轮转与重试机制。
- [AI 文案集成指南](DEEPSEEK-INTEGRATION.md)：DeepSeek / OpenAI 模型接入与降级。
- [性能优化总结](PERFORMANCE.md)：多级缓存策略、并发控制与响应时间优化。
- [用户体验优化总结](UX_IMPROVEMENTS.md)：前端错误隔离、加载骨架屏与交互体验。
- [打包优化文档](PACKAGING.md)：Windows 打包、Electron 架构与发布规范。
- [Codex CLI 接入指南](CODEX-AISENYU.md)：本地 AI 开发辅助与中转站配置。
- [Claude Code 接入指南](CLAUDE-CODE-AISENYU.md)：Claude 编程工具配置与环境变量。

---

## 文档更新规则

1. **事实真源原则**：所有文档中的命令输出、文件数量、测试用例数、端口与路径必须基于实际代码执行结果，禁止推测。
2. **同步更新原则**：当新增领域模块、修改 API 路由或演进数据库 Schema 时，必须同步更新 `README.md`、`开发者指南.md` 与本文档。
