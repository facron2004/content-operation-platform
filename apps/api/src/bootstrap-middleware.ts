import { ValidationPipe, type INestApplication } from '@nestjs/common';
export function configureAppMiddleware(app: INestApplication): void {
  const allowedOrigins = [
    `http://localhost:${process.env.PORT ?? 3101}`,
    `http://127.0.0.1:${process.env.PORT ?? 3101}`
  ];
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true })
  );
}
