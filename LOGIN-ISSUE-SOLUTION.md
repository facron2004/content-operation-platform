# 登录问题解决方案

## 问题描述

系统无法自动登录到JeeSite后台，错误信息：
```
External backend requires authentication (login expired)
```

## 根本原因

JeeSite后台由于多次登录失败尝试，已触发**验证码保护机制**。自动登录脚本无法处理验证码，因此登录失败。

从日志可以看到：
```
Redirect location: http://zdm.zhsh1.cn/a/loginFailure
```

## 解决方案

### 方案1：手动获取Cookie（推荐，立即生效）

1. **打开浏览器**，访问：https://zdm.zhsh1.cn/a/login

2. **手动登录**
   - 用户名：(见 .env 配置)
   - 密码：(见 .env 配置)
   - 如果需要验证码，输入验证码

3. **登录成功后，获取Cookie**
   
   方法A - 使用开发者工具：
   - 按 `F12` 打开开发者工具
   - 切换到 `Network` (网络) 标签
   - 刷新页面 (`F5`)
   - 点击任意请求
   - 在 `Headers` 中找到 `Cookie` 字段
   - 复制完整的Cookie值

   方法B - 使用Console：
   - 按 `F12` 打开开发者工具
   - 切换到 `Console` (控制台) 标签
   - 输入：`document.cookie`
   - 复制输出的Cookie字符串

4. **更新 .env 文件**
   
   打开 `.env` 文件，找到 `EXTERNAL_API_COOKIE` 这一行，替换为你复制的Cookie：
   ```bash
   EXTERNAL_API_COOKIE=skinName=skin-green; jeesite.session.id=你的session_id; pageSize=10; pageNo=1
   ```

5. **重启API服务器**
   ```bash
   cd apps/api
   npm run dev
   ```

6. **测试是否成功**
   ```bash
   curl http://localhost:3100/api/content/packages/recommend
   ```
   
   如果返回数据而不是错误，说明登录成功！

### 方案2：等待验证码限制解除（需要等待）

由于多次失败登录，账号可能被临时限制。可以：
1. 等待 30分钟 - 1小时
2. 然后重启服务器，自动登录可能会成功

### 方案3：联系管理员

如果以上方案都不行，可能需要：
1. 检查账号是否被锁定
2. 重置密码
3. 联系系统管理员解除限制

## Cookie有效期

- Cookie通常有效期为几小时到几天
- 如果Cookie过期，需要重新获取
- 系统会自动检测Cookie过期并尝试重新登录（如果没有验证码限制）

## 预防措施

为避免再次触发验证码：
1. 确保 `.env` 中的用户名和密码正确
2. 不要频繁重启服务器（会触发多次登录尝试）
3. 使用有效的Cookie而不是依赖自动登录

## 技术细节

自动登录流程：
1. 系统检测到Cookie过期
2. 尝试使用用户名密码自动登录
3. 如果登录成功，获取新的session cookie
4. 如果失败（验证码/账号锁定），返回错误

当前状态：
- ✅ 自动登录代码正常工作
- ✅ 用户名密码配置正确
- ❌ JeeSite要求验证码，自动登录无法完成
