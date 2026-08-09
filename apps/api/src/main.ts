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
import { createDesktopTokenGuard, requireDesktopRuntimeToken } from './bootstrap-desktop-runtime';
import { resolveApiHost, resolveAppRuntime } from './config/runtime.config';
const log = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  log.error(`UnhandledRejection: ${describeError(reason)}`);
  setImmediate(() => {
    throw reason instanceof Error ? reason : new Error(String(reason));
  });
});
process.on('uncaughtException', (err) => {
  log.error(`UncaughtException: ${describeError(err)}; exiting for supervised restart`);
  process.exitCode = 1;
  process.exit(1);
});

const appRuntime = resolveAppRuntime();
const desktopTokenGuard =
  appRuntime === 'desktop' ? createDesktopTokenGuard(requireDesktopRuntimeToken()) : null;

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
  if (desktopTokenGuard) {
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
  const host = resolveApiHost();
  await app.listen(port, host);
  log.log(
    `Content Ops API listening on http://${host}:${port}/api${appRuntime === 'desktop' ? ' [Desktop Mode]' : ''}`
  );
}
bootstrap().catch((err) => {
  log.error(`Failed to start Content Ops API: ${describeError(err)}`);
  process.exit(1);
});
