# 桌面端打包与发布规范 (Electron Packaging)

> **当前基线（2026-08-18）**：本文档详细说明 Windows 桌面客户端（Electron）的架构设计、打包流程、运行时数据隔离与安全规范。当前开发阶段以 API/Web 联合开发与非 EXE 门禁为主，桌面安装包与真实进程烟测按正式发布周期组织验收。

---

## 架构与设计原则

桌面端架构位于 `apps/desktop/`，采用 Electron + 内置 NestJS API + Vue 3 静态前端的一体化封装模式：

```
┌────────────────────────────────────────────────────────┐
│               Electron Main Process                    │
│   ├── 安全存储 (safeStorage 加密凭据)                   │
│   ├── 随机生成运行令牌 (bootId / JWT Secret)            │
│   └── 启动内嵌 Node.js / NestJS API 服务进程           │
└──────────────────────────┬─────────────────────────────┘
                           │ 注入环境变量与端口
┌──────────────────────────┴─────────────────────────────┐
│                 NestJS API (127.0.0.1)                 │
│   ├── 数据存储: app.getPath('userData')/data/*.db      │
│   └── 静态托管: app.getPath('resources')/web           │
└────────────────────────────────────────────────────────┘
```

- **单一入口**：正式入口为 `apps/desktop` + `electron-builder.yml`，彻底废弃旧脚本。
- **运行时数据隔离**：
  - 静态资源、Prisma 引擎与迁移 SQL 位于安装包 `resources` 目录。
  - 用户数据、数据库（`content-operations.db`）、备份（`backups/`）与日志（`logs/`）统一存放在系统用户数据目录（`app.getPath('userData')`），禁止在安装目录中读写数据库。
- **安全防泄漏**：打包脚本强制执行安全扫描，严禁把 `.env`、Cookie 缓存、数据库文件（`*.db`、`*-wal`、`*-shm`）或日志打入安装包。

---

## 打包命令与流程

```bash
# 1. 编译全部工作区模块
npm run build
npm run build:desktop

# 2. 准备 API 运行时与静态资源
npm run package:prepare

# 3. 执行安装包安全校验
npm run package:verify

# 4. 生成 Windows x64 NSIS 安装包
npm run package:exe
```

---

## 源码审查包打包 (`package:review`)

为满足合规安全审查需求，系统提供 `npm run package:review` 脚本：
- **白名单机制**：仅打包 API/Web/Desktop/Shared 源码、Prisma Schema/迁移、测试与文档。
- **安全过滤**：自动排除所有二进制构建产物、`node_modules`、`.tmp*` 缓存、数据库与真实凭据。
- 生成包含文件 SHA-256 清单的 `REVIEW_CONTEXT.md`。

---

## 核心配置文件

- `electron-builder.yml` — Electron 打包参数、产物命名与资源过滤规则
- `apps/desktop/src/main.ts` — Electron 主进程入口与进程生命周期管理
- `scripts/package-exe.js` — Windows NSIS 安装包构建编排脚本
- `scripts/package-review.js` — 源码安全审查包生成脚本
- `scripts/verify-package.js` — 打包产物安全合规扫描脚本
