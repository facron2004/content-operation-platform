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
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestIdMiddleware.use(req, res, next)
  );
  configureAppMiddleware(app);
  mountStaticSpa(app.getHttpAdapter().getInstance(), resolvePublicDir(), express, log);
  const port = Number(process.env.PORT ?? 3101),
    host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  log.log(`Content Ops API listening on http://${host}:${port}/api`);
}
bootstrap().catch((err) => {
  log.error(`Failed to start Content Ops API: ${describeError(err)}`);
  process.exit(1);
});
