# 打包优化文档

> **当前范围（2026-08-09）**：本文保留为后续 Windows 发布参考。当前优化明确不执行 `build:exe`、`package:exe`、安装器、`win-unpacked` 或 EXE/安装后真实进程 smoke；下面的打包步骤、体积数字和发布验收均不能作为本轮已完成证据。当前非 EXE 门禁见 [文档对齐总览](DOCUMENTATION-STATUS.md)。

## 打包流程

使用 `npm run package:exe` 命令打包项目为 Windows 安装包。旧的 `pkg` 目录说明仅作为历史记录，不代表当前产物布局。

### 打包步骤

1. **构建模块**：编译 shared、API、Web 和 Electron 主进程
2. **收集运行时**：将 API 运行时、Web 资源、schema 和 migrations 放入 staging
3. **生成清单**：生成包含 schema/migration SHA-256 的 `ReleaseManifest`
4. **安全校验**：拒绝真实 `.env`、Cookie 缓存、数据库/WAL/SHM 和密钥模式
5. **打包安装器**：使用 electron-builder 生成 Windows x64 NSIS 安装包
6. **产物复验**：对最终 `win-unpacked` 和安装包资源再次执行安全扫描

## 产物体积说明

旧版文档中的 125MB 体积表只属于历史产物，不能作为当前完整运行时的发布依据。每个候选包应记录实际安装器大小和 `win-unpacked` 目录大小：

```powershell
$root = 'release_candidate_v011_latest'
Get-ChildItem -LiteralPath (Join-Path $root 'release') -Filter '*.exe' -File |
  Select-Object FullName, Length, LastWriteTime
(Get-ChildItem -LiteralPath (Join-Path $root 'release\win-unpacked') -Recurse -File |
  Measure-Object Length -Sum).Sum
```

体积变化不能以牺牲 Prisma、bcrypt、SQLite 或 API 运行时完整性为代价；恢复 Windows 发布时，最终判断才以 `verify-package.js --release` 和已安装 EXE smoke 为准。

## 优化技术

### 1. Prisma 客户端优化

**问题**：Prisma 默认包含所有数据库引擎（MySQL、PostgreSQL、SQLite、SQL Server、CockroachDB）

**解决方案**：
- 只复制 SQLite 相关的运行时文件
- 过滤掉其他数据库的 WASM 文件
- 代码位置：`scripts/package-exe.js` 第 134-148 行

```javascript
const runtimeFiles = fs.readdirSync(runtimeSrc);
runtimeFiles.forEach(file => {
  const isOtherDb = file.includes('mysql') || file.includes('postgresql') ||
                    file.includes('sqlserver') || file.includes('cockroachdb');
  const isSqlite = file.includes('sqlite');
  const isCommon = file.includes('library') || file.includes('binary') ||
                   file.includes('client') || file.includes('index') ||
                   file.endsWith('.d.ts') || file.endsWith('.d.mts');

  if (isSqlite || (isCommon && !isOtherDb)) {
    // 复制文件
  }
});
```

### 2. 删除临时文件

**问题**：Prisma 生成的 `.tmp*` 文件占用 42MB

**解决方案**：
- 在打包脚本中自动删除临时文件
- 代码位置：`scripts/package-exe.js` 第 106-115 行

```javascript
const clientDir = path.join(prismaClientDest, 'client');
if (fs.existsSync(clientDir)) {
  const files = fs.readdirSync(clientDir);
  files.forEach(file => {
    if (file.includes('.tmp')) {
      fs.unlinkSync(path.join(clientDir, file));
    }
  });
}
```

### 3. 路径处理

**问题**：安装包不能依赖源码目录或开发机路径。

**解决方案**：
- 只把静态资源、schema 和 migrations 放入安装包 resources
- 数据库与备份全部位于 Electron `userData`，不与安装目录混用
- API 由 Electron 注入明确的资源路径、数据库路径和启动实例 `bootId`

### 4. 错误处理

添加了友好的错误提示：
- 端口被占用（EADDRINUSE）
- 权限不足（EACCES）
- 前端文件缺失
- 数据库连接失败
- 数据库表不存在

代码位置：`apps/api/src/main.ts` 第 67-84 行

## 运行时数据与配置

- Windows 10/11
- 无需安装 Node.js
- 桌面端公开配置在用户目录 `config.json` 保存
- Cookie、账号密码和 AI Key 只通过 Electron `safeStorage` 保存到加密配置
- 数据库固定在 `app.getPath('userData')/data/content-operations.db`
- 首次启动可在旧库导入、重试、新建数据库和退出之间选择；不会猜测或直接打开项目 `prisma/dev.db`

## 发布前数据库验收（Windows 发布恢复后）

候选安装器安装后，可使用隔离的 userData 目录执行真实数据库场景验收。脚本只接受不存在的输出目录，不会删除或覆盖已有安装目录、数据库或发布产物：

```powershell
pwsh -NoProfile -File .\scripts\desktop-package-acceptance.ps1 `
  -Executable 'C:\Path\To\内容运营中台.exe' `
  -LegacyDatabase 'C:\Path\To\old-content-operations.db' `
  -OutputRoot 'C:\Temp\content-ops-v011-acceptance-20260804'
```

脚本覆盖正常已迁移库、旧库导入、中断迁移恢复、锁定数据库和损坏数据库，并验证 `/ready` 的数据库/迁移/Web 三项检查。每次迁移或导入前生成的备份位于用户目录 `backups\before-migration-*.db` 或 `backups\before-import-*.db`。

## 备份与回退（Windows 发布恢复后）

开发/迁移前备份可执行 `npm run db:backup -- --reason "迁移前备份"`。脚本只接受本地 SQLite `file:` URL，先校验源库 `PRAGMA integrity_check`，再用 `VACUUM INTO` 生成不覆盖旧文件的备份，并复验备份完整性、记录 SHA-256 和审计日志；远程数据库或损坏源库会直接拒绝。

1. 停止桌面应用，保留用户目录中的 `data`、`backups` 和 `logs`；不要删除或回滚共享 `prisma\dev.db`。
2. 先复制旧安装包到独立的回退目录，再安装旧版本；不要覆盖原候选包或直接删除 `release`。
3. 若升级后的数据库迁移失败，保留失败现场的临时库和日志；从最近一次 `before-migration-*.db` 复制出回退副本，确认副本通过 SQLite 完整性检查后，再在应用停止状态下替换用户目录数据库。
4. 旧库导入失败时，原库保持不变；使用 `before-import-*.db` 仅作为证据或恢复副本，重新启动后选择“重试”或重新选择旧库。
5. 回退后必须重新验证 `/ready`、`/api/users/me` 和至少一个数据库业务路由，并记录所用安装包、数据库备份和日志路径。

## 已知限制

1. **仅支持 Windows x64**：需要其他平台请扩展 electron-builder target
2. **exe 文件较大**：77MB，因为包含了完整的 Node.js 运行时
3. **首次启动较慢**：约 2-3 秒，因为需要解压虚拟文件系统

## 进一步优化建议

1. **使用 UPX 压缩 exe**：可减少 30-40% 体积，但启动会更慢
2. **代码分割**：前端 JS 文件 1.6MB，可以考虑按路由分割
3. **Tree shaking**：检查是否有未使用的依赖
4. **Brotli 压缩**：对静态资源启用压缩

## 故障排查

### 端口被占用

```
❌ 错误：端口 3100 已被占用
```

**解决方案**：
- 桌面端启动时自动选择空闲回环端口
- 若服务仍未就绪，查看用户目录 logs 和 `/ready` 返回的检查项

### 数据库文件缺失

```
❌ 数据库连接失败
   数据库文件不存在或无法访问
```

**解决方案**：
- 确认用户目录 `data/content-operations.db` 可读写
- 首次启动通过旧库选择器导入旧 SQLite 文件，或明确选择新建数据库

### 前端页面 404

```
❌ 错误：找不到前端文件目录
```

**解决方案**：
- 确保 `public` 目录存在
- 重新运行打包脚本
