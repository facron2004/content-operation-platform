# 自动登录机制

> **当前边界（2026-08-09）**：本文只说明 API 访问 JeeSite 外部数据源的会话处理，不证明 Windows/EXE 或安装包运行时已验收。账号、密码、Cookie 只能放在本地配置，禁止提交 `.env`、Cookie 缓存或审查包。

## 概述

为了解决外部 API Cookie 频繁过期的问题，系统实现了自动登录机制。当检测到 Cookie 失效时，系统会自动使用配置的账号密码重新登录，获取新的 Cookie。

## 工作原理

1. **优先级**：
   - 首先使用 `.env` 中配置的 `EXTERNAL_API_COOKIE`（如果有）
   - Cookie 失效时，自动使用账号密码登录获取新 Cookie
   - 新 Cookie 会缓存 2 小时，避免频繁登录

2. **自动检测**：
   - 系统检测到 API 返回登录页面或 `result: 'login'` 时
   - 自动触发重新登录流程
   - 登录成功后继续执行原请求

3. **Cookie 缓存**：
   - 登录成功后的 Cookie 会缓存在内存中
   - 缓存有效期：2 小时
   - 避免每次请求都重新登录

## 配置方法

### 方式一：使用账号密码（推荐）

在 `.env` 文件中配置：

```env
# 外部 API 配置
EXTERNAL_API_BASE_URL="https://zdm.zhsh1.cn/a"
EXTERNAL_API_USERNAME="your_username"
EXTERNAL_API_PASSWORD="your_password"

# 可选：手动配置的 Cookie（优先使用）
EXTERNAL_API_COOKIE=""
```

**优点**：
- Cookie 过期后自动重新登录
- 无需手动更新 Cookie
- 系统可以长期稳定运行

### 方式二：仅使用 Cookie

```env
EXTERNAL_API_BASE_URL="https://zdm.zhsh1.cn/a"
EXTERNAL_API_COOKIE="skinName=skin-green; jeesite.session.id=xxx"

# 不配置账号密码
EXTERNAL_API_USERNAME=""
EXTERNAL_API_PASSWORD=""
```

**缺点**：
- Cookie 过期后需要手动更新
- 不适合长期运行

## 使用建议

### 生产环境

**强烈建议配置账号密码**，这样系统可以：
- 自动处理 Cookie 过期问题
- 减少运维工作量
- 提高系统稳定性

### 开发环境

可以只配置 Cookie，方便快速测试：
1. 浏览器登录 https://zdm.zhsh1.cn/a
2. F12 开发者工具 → Network → 复制 Cookie
3. 更新 `.env` 中的 `EXTERNAL_API_COOKIE`

## 安全注意事项

1. **保护 .env 文件**：
   - 确保 `.env` 文件已添加到 `.gitignore`
   - 不要将账号密码提交到代码仓库

2. **使用专用账号**：
   - 建议为 API 访问创建专用账号
   - 不要使用个人主账号

3. **权限最小化**：
   - 专用账号只需要读取数据的权限
   - 不需要管理员权限

## 工作流程

```
┌─────────────────┐
│  API 请求开始   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 检查 Cookie     │
│ 是否有效        │
└────┬───────┬────┘
     │       │
  有效│       │无效/过期
     │       │
     │       ▼
     │  ┌─────────────────┐
     │  │ 检查是否配置     │
     │  │ 账号密码         │
     │  └────┬───────┬────┘
     │       │       │
     │    有 │       │ 无
     │       │       │
     │       ▼       ▼
     │  ┌─────────┐ ┌──────────┐
     │  │自动登录 │ │返回错误  │
     │  │获取Cookie│ │需手动更新│
     │  └────┬────┘ └──────────┘
     │       │
     │       ▼
     │  ┌─────────────────┐
     │  │ 缓存新 Cookie   │
     │  │ (有效期2小时)   │
     │  └────┬────────────┘
     │       │
     └───────┴────────┐
                      │
                      ▼
              ┌─────────────────┐
              │ 使用 Cookie     │
              │ 执行 API 请求   │
              └─────────────────┘
```

## 故障排查

### Cookie 仍然失效

1. 检查账号密码是否正确
2. 检查账号是否被锁定
3. 查看服务器日志：`Auto login failed: xxx`

### 登录失败

可能原因：
- 账号密码错误
- 需要验证码（目前不支持）
- 网络问题
- 外部 API 登录接口变更

解决方法：
- 手动登录验证账号密码
- 临时使用 Cookie 方式
- 联系外部 API 提供方

## 技术实现

### 核心文件

- `apps/api/src/content/auto-login.service.ts` - 自动登录服务
- `apps/api/src/content/data-source.service.ts` - 数据源服务（集成自动登录）

### 关键逻辑

1. **Cookie 优先级**：
   ```typescript
   // 1. 环境变量中的 Cookie
   if (process.env.EXTERNAL_API_COOKIE) return cookie;
   
   // 2. 缓存的 Cookie（2小时内有效）
   if (cachedCookie && !expired) return cachedCookie;
   
   // 3. 自动登录获取新 Cookie
   return await performLogin();
   ```

2. **登录流程**：
   ```typescript
   // 访问登录页面获取初始 Cookie
   GET /a/login
   
   // 提交登录表单
   POST /a/login
   body: username=xxx&password=xxx
   
   // 解析响应中的 Set-Cookie
   // 提取 jeesite.session.id
   
   // 验证 Cookie 是否有效
   GET /a/bargain/bargainCommodity/listData
   ```

3. **Cookie 验证**：
   ```typescript
   // 发送测试请求
   // 检查响应是否包含登录页面标识
   // 检查响应是否为有效 JSON
   ```

## 未来改进

1. **支持验证码**：
   - 集成验证码识别服务
   - 或使用人工介入机制

2. **多账号轮换**：
   - 配置多个账号
   - 避免单账号频繁登录被限制

3. **Cookie 持久化**：
   - 将 Cookie 保存到数据库
   - 服务重启后仍然有效

4. **监控告警**：
   - 登录失败时发送通知
   - 记录登录历史和失败原因
