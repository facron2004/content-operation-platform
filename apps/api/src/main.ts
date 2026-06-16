import 'reflect-metadata';
import './config/load-env';
import compression from 'compression';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { securityHeaders } from './common';
import type { Request, Response, NextFunction } from 'express';

/** 解析前端静态资源目录，兼容 pkg 打包后的 exe 环境 */
function resolvePublicDir(): string {
  // 优先：exe 同级目录下的 public（pkg 打包场景）
  const exePublic = join(dirname(process.execPath), 'public');
  if (existsSync(exePublic)) return exePublic;
  // 回退：当前工作目录 / API 构建产物中的 public
  const cwdPublic = join(process.cwd(), 'apps', 'api', 'dist', 'public');
  if (existsSync(cwdPublic)) return cwdPublic;
  return join(process.cwd(), 'public');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(compression());
  app.use(securityHeaders);

  // P0-4 CORS 白名单：仅允许本机前端访问
  const allowedOrigins = [
    `http://localhost:${process.env.PORT ?? 3100}`,
    `http://127.0.0.1:${process.env.PORT ?? 3100}`
  ];
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // 允许无 origin（同源请求、curl 等）
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true
  });

  // P0-3 DTO 校验：让 class-validator 装饰器真正生效
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  // P0-1 静态资源托管：exe 打包后可以直接访问前端页面
  const expressApp = app.getHttpAdapter().getInstance();
  const publicDir = resolvePublicDir();
  if (existsSync(publicDir)) {
    expressApp.use(require('express').static(publicDir));
    // Vue history 路由回落：非 /api 请求统一返回 index.html
    expressApp.get('*splat', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
      const indexPath = join(publicDir, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
    console.log(`Static files served from: ${publicDir}`);
  }

  const port = Number(process.env.PORT ?? 3100);
  // P0-4 默认绑定 127.0.0.1，防止局域网访问；设置 HOST=0.0.0.0 可显式开放
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  console.log(`Content Ops API listening on http://${host}:${port}/api`);
}

bootstrap().catch((err) => {
  console.error('Failed to start Content Ops API:', err);
  process.exit(1);
});
