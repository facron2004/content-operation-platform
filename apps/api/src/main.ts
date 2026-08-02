import 'reflect-metadata';
import './config/load-env';
import compression from 'compression';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { securityHeaders, RequestIdMiddleware } from './common';
import { describeError } from '@content/shared';
import { resolvePublicDir, mountStaticSpa } from './bootstrap-static';
import { configureAppMiddleware } from './bootstrap-middleware';
const log = new Logger('Bootstrap');

// Node 22 默认 --unhandled-rejections=throw 会因为单个未捕获的 Promise rejection
// 直接终止进程。30 天 GMV 回填耗时长（拉单+重算），期间任意一处 stray rejection
// （如 libsql 把 SQLITE_BUSY 映射成 "unknown variant SocketTimeout" 时未被某条路径
// catch 到）都会让 API 进程崩溃 → 内存中的 refresh job 丢失 → 前端轮询 404/500。
// 这里把未捕获 rejection 落日志但不崩溃进程，保证长回填不被偶发异常打断。
// 真正致命的同步异常仍由 Nest 的 GlobalExceptionFilter / 进程退出兜底。
process.on('unhandledRejection', (reason) => {
  log.error(
    `UnhandledRejection (suppressed to keep long-running jobs alive): ${describeError(reason)}`
  );
});
process.on('uncaughtException', (err) => {
  log.error(
    `UncaughtException (suppressed to keep long-running jobs alive): ${describeError(err)}`
  );
});

const isDesktopMode = process.env.DESKTOP_MODE === 'true';

/** 桌面模式令牌校验中间件：验证 Electron 注入的 HttpOnly Cookie */
function desktopTokenGuard(req: Request, res: Response, next: NextFunction): void {
  // 健康检查放行
  if (req.path === '/health') return next();

  const expected = process.env.DESKTOP_RUNTIME_TOKEN;
  if (!expected) return next();

  const cookies = (req.headers.cookie ?? '').split(';');
  const tokenCookie = cookies.find((c) => c.trim().startsWith('desktop_runtime_token='));
  const token = tokenCookie?.split('=').slice(1).join('=').trim();

  if (token !== expected) {
    res.status(403).json({ message: 'Forbidden: invalid desktop runtime token' });
    return;
  }
  next();
}

async function bootstrap() {
  // Cap JSON / urlencoded bodies so a single request cannot OOM the process.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  // Opt-in: when reverse-proxied, trust X-Forwarded-For so req.ip is the client IP.
  // Leave unset for direct binds so clients cannot spoof IP via headers.
  const trustProxy = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (trustProxy === '1' || trustProxy === 'true' || trustProxy === 'yes') {
    expressApp.set('trust proxy', 1);
  } else if (trustProxy && /^\d+$/.test(trustProxy)) {
    expressApp.set('trust proxy', Number(trustProxy));
  }
  expressApp.use(express.json({ limit: '1mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression());
  app.use(securityHeaders);

  // 桌面模式：令牌校验
  if (isDesktopMode) {
    app.use(desktopTokenGuard);
  }

  const requestIdMiddleware = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestIdMiddleware.use(req, res, next)
  );
  configureAppMiddleware(app);
  mountStaticSpa(app.getHttpAdapter().getInstance(), resolvePublicDir(), express, log);

  // 桌面模式强制 127.0.0.1，禁止暴露到局域网
  const port = Number(process.env.PORT ?? 3100);
  const host = isDesktopMode ? '127.0.0.1' : (process.env.HOST ?? '0.0.0.0');
  await app.listen(port, host);
  log.log(
    `Content Ops API listening on http://${host}:${port}/api${isDesktopMode ? ' [Desktop Mode]' : ''}`
  );
}
bootstrap().catch((err) => {
  log.error(`Failed to start Content Ops API: ${describeError(err)}`);
  process.exit(1);
});
