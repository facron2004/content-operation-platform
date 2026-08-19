# 自动登录与外部会话管理机制

> **当前基线（2026-08-18）**：本文详细说明 API 后端访问 JeeSite 外部业务数据源的会话维护与自动登录重试机制。账号、密码与 Cookie 严格保存在本地 `.env`，禁止提交到代码仓库、日志或审查产物中。

---

## 概述

为解决外部 JeeSite API 会话频繁过期（默认 session 约 30 分钟至 2 小时）导致的数据抓取中断问题，系统实现了全自动登录与 Cookie 轮转机制。当检测到 Cookie 失效或重定向到登录页时，系统自动使用配置的凭据重新登录并重试未完成的业务请求，对业务上层完全透明。

该机制目前服务于以下外部数据源：
1. **套餐与商品数据**：`GET /bargain/bargainCommodity/listData`
2. **合作商店铺目录**：`GET /core/corePartnerShop/listData`
3. **合作商账户记录（提货分）**：`GET /core/corePartnerAccountRecord/listData`
4. **会员目录与用户数据**：`GET /user/member/listData`

---

## 工作原理

1. **凭证加载优先级**：
   - 首先检查内存中最近一次成功登录获取的 Cookie 缓存（有效期 2 小时）。
   - 若内存缓存为空或已过期，检查 `.env` 中的 `EXTERNAL_API_COOKIE`。
   - 若无静态 Cookie 或已有 Cookie 失效，自动调用 `AutoLoginService` 使用配置的 `EXTERNAL_API_USERNAME` / `EXTERNAL_API_PASSWORD` 登录。

2. **失效自动拦截与单飞重试**：
   - 数据抓取层检测到 HTTP 302 重定向、响应为 HTML 登录页或 JSON 返回 `result: 'login'` 时，判定会话失效。
   - 触发自动登录流程，重新换取 `jeesite.session.id`。
   - 登录成功后更新内存 Cookie，并自动对刚才失败的外部请求进行重试。

3. **内存安全缓存**：
   - 登录凭据仅在服务端内存中持有，不向前端暴露。
   - 缓存设有 2 小时 TTL，防止无效 Cookie 长期滞留。

---

## 配置方法

在本地根目录 `.env` 文件中配置：

```env
# 外部 JeeSite API 基础地址
EXTERNAL_API_BASE_URL="https://zdm.zhsh1.cn/a"

# 推荐：配置专有同步账号与密码
EXTERNAL_API_USERNAME="your_username"
EXTERNAL_API_PASSWORD="your_password"

# 可选：手动配置的静态 Cookie（开发调试用）
EXTERNAL_API_COOKIE=""
```

---

## 登录执行与验证流程

```
┌─────────────────┐
│  API 外部请求   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 检查内存 Cookie │
│ (2小时有效期)   │
└────┬───────┬────┘
     │       │
  有效│       │无效 / 过期 / 302
     │       │
     │       ▼
     │  ┌─────────────────────────┐
     │  │ 检查是否配置用户名密码   │
     │  └────┬───────────────┬────┘
     │       │               │
     │    有 │               │ 无
     │       │               │
     │       ▼               ▼
     │  ┌─────────────────┐ ┌──────────────────┐
     │  │ AutoLoginService│ │ 返回会话失效错误  │
     │  │ 模拟提交登录表单│ │ 提示配置账号密码  │
     │  └────┬────────────┘ └──────────────────┘
     │       │
     │       ▼
     │  ┌─────────────────────────┐
     │  │ 解析并缓存新 Session ID  │
     │  └────┬────────────────────┘
     │       │
     └───────┴────────┐
                      │
                      ▼
              ┌─────────────────┐
              │ 附带有效 Cookie │
              │ 完成业务数据抓取│
              └─────────────────┘
```

---

## 核心实现文件

- `apps/api/src/content/auto-login.service.ts` — 自动登录核心服务（表单构造、Set-Cookie 解析、会话测试）
- `apps/api/src/content/data-source.service.ts` — 套餐数据源抓取与会话注入
- `apps/api/src/gap-center/store.service.ts` — 门店数据抓取与自动重试
- `apps/api/src/finance-center/finance-center.service.ts` — 提货分账户数据抓取
- `apps/api/src/user-center/user-center.service.ts` — 会员目录抓取与会话维持

---

## 故障排查

1. **登录失败日志 `Auto login failed`**：
   - 检查 `.env` 中的用户名与密码是否包含特殊字符需转义。
   - 在浏览器中手动打开 `https://zdm.zhsh1.cn/a/login` 确认账号是否被锁定或触发了图片验证码。
2. **响应返回 HTML 页面**：
   - 确认 `EXTERNAL_API_BASE_URL` 路径是否正确（默认必须带 `/a` 后缀）。
