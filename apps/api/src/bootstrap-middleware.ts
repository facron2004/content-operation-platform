import { ValidationPipe, type INestApplication } from '@nestjs/common';

function parseCorsOrigins(): string[] {
  const port = process.env.PORT ?? 3101;
  const defaults = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    // Vite dev server (see apps/web vite.config.ts default 3100)
    'http://localhost:3100',
    'http://127.0.0.1:3100'
  ];
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...defaults, ...extra])];
}

export function configureAppMiddleware(app: INestApplication): void {
  const allowedOrigins = parseCorsOrigins();
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Non-browser clients (curl, server-to-server) send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
    // Residual #262: SPA downloadBlob reads export-cap honesty headers.
    exposedHeaders: ['X-Export-Truncated', 'X-Export-Limit', 'X-Export-Total']
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true })
  );
}
