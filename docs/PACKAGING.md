# 打包优化文档

## 打包流程

使用 `npm run build:exe` 命令打包项目为 Windows 可执行文件。

### 打包步骤

1. **清理输出目录**：删除 `dist` 目录
2. **构建前端**：运行 `npm run build` 构建 Vue 应用
3. **构建后端**：编译 TypeScript 到 `apps/api/dist`
4. **复制前端资源**：将 `apps/web/dist` 复制到 `apps/api/dist/public`
5. **复制配置文件**：复制 `.env.example` 和 `prisma/schema.prisma`
6. **打包 exe**：使用 `@yao-pkg/pkg` 将 Node.js 应用打包成 exe
7. **复制运行时文件**：
   - 复制 `.env.example`、`schema.prisma`、`dev.db`
   - 复制 Prisma 客户端（仅 SQLite 相关文件）
   - 删除临时文件
8. **生成使用说明**：创建 `README.txt`

## 优化成果

### 大小优化

| 项目 | 优化前 | 优化后 | 减少 |
|------|--------|--------|------|
| Prisma runtime | 73MB | 23MB | 50MB |
| 临时文件 | 42MB | 0MB | 42MB |
| **总大小** | **216MB** | **125MB** | **91MB (42%)** |

### 最终文件分布

- `content-ops.exe`: 77MB（Node.js + 后端代码）
- `node_modules`: 46MB（Prisma 客户端）
- `public`: 2MB（前端静态文件）
- 其他配置文件: <1MB

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

**问题**：pkg 打包后，`__dirname` 指向虚拟文件系统，无法访问外部文件

**解决方案**：
- 使用 `dirname(process.execPath)` 获取 exe 所在目录
- 所有外部文件（静态资源、数据库、Prisma 客户端）都相对于 exe 目录
- 代码位置：
  - `apps/api/src/main.ts` 第 20-24 行
  - `apps/api/src/prisma/prisma.service.ts` 第 9-15 行、第 30-32 行

### 4. 错误处理

添加了友好的错误提示：
- 端口被占用（EADDRINUSE）
- 权限不足（EACCES）
- 前端文件缺失
- 数据库连接失败
- 数据库表不存在

代码位置：`apps/api/src/main.ts` 第 67-84 行

## 运行时要求

- Windows 10/11
- 无需安装 Node.js
- 需要配置 `.env` 文件（复制 `.env.example`）
- 数据库文件 `dev.db` 必须与 exe 在同一目录

## 已知限制

1. **仅支持 Windows x64**：需要其他平台请修改 `pkg` 的 `--targets` 参数
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
- 关闭占用端口的程序
- 或修改 `.env` 文件中的 `PORT` 配置

### 数据库文件缺失

```
❌ 数据库连接失败
   数据库文件不存在或无法访问
```

**解决方案**：
- 确保 `dev.db` 文件与 exe 在同一目录
- 检查文件权限

### 前端页面 404

```
❌ 错误：找不到前端文件目录
```

**解决方案**：
- 确保 `public` 目录存在
- 重新运行打包脚本
