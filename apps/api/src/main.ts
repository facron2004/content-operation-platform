import 'reflect-metadata';
import './config/load-env';
import compression from 'compression';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { securityHeaders, RequestIdMiddleware } from './common';
import { describeError } from '@content/shared';
import { resolvePublicDir, mountStaticSpa } from './bootstrap-static';
import { configureAppMiddleware } from './bootstrap-middleware';
const log = new Logger('Bootstrap');
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(compression());
  app.use(securityHeaders);
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use((req, res, next) => requestIdMiddleware.use(req, res, next));
  configureAppMiddleware(app);
  mountStaticSpa(app.getHttpAdapter().getInstance(), resolvePublicDir(), express, log);
  const port = Number(process.env.PORT ?? 3101),
    host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  log.log(`Content Ops API listening on http://${host}:${port}/api`);
  log.log(`Swagger at http://${host}:${port}/api-docs`);
}
bootstrap().catch((err) => {
  log.error(`Failed to start Content Ops API: ${describeError(err)}`);
  process.exit(1);
});
