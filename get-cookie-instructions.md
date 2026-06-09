# 获取JeeSite登录Cookie的步骤

## 方法1：使用浏览器开发者工具

1. 打开浏览器，访问：https://zdm.zhsh1.cn/a/login

2. 手动输入用户名和密码登录

3. 登录成功后，按 F12 打开开发者工具

4. 切换到 "Network" (网络) 标签

5. 刷新页面 (F5)

6. 在请求列表中找到任意一个请求，点击查看

7. 在 "Headers" (请求头) 中找到 "Cookie" 字段

8. 复制完整的 Cookie 值，应该类似：
   ```
   skinName=skin-green; jeesite.session.id=xxxxxxxxxxxxxxxx; pageSize=10; pageNo=1
   ```

9. 更新 `.env` 文件：
   ```bash
   EXTERNAL_API_COOKIE=你复制的cookie字符串
   ```

10. 重启API服务器：
    ```bash
    cd apps/api
    npm run dev
    ```

## 方法2：使用浏览器Console

1. 打开浏览器，访问：https://zdm.zhsh1.cn/a/login

2. 手动登录成功

3. 按 F12 打开开发者工具

4. 切换到 "Console" (控制台) 标签

5. 输入并运行：
   ```javascript
   document.cookie
   ```

6. 复制输出的Cookie字符串

7. 更新 `.env` 文件中的 `EXTERNAL_API_COOKIE`

## 注意事项

- Cookie 通常有效期为几小时到几天
- 如果Cookie过期，需要重新获取
- 不要在公共场所或不安全的网络环境下操作
- 建议定期更换密码以保证账号安全
