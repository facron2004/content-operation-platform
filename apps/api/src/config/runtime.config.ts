export const APP_RUNTIMES = ['desktop', 'server', 'development'] as const;

export type AppRuntime = (typeof APP_RUNTIMES)[number];

export function resolveAppRuntime(env: NodeJS.ProcessEnv = process.env): AppRuntime {
  const configured = env.APP_RUNTIME?.trim().toLowerCase();
  if (configured) {
    if (APP_RUNTIMES.includes(configured as AppRuntime)) return configured as AppRuntime;
    throw new Error(`APP_RUNTIME must be one of: ${APP_RUNTIMES.join(', ')}`);
  }
  return env.NODE_ENV === 'production' ? 'server' : 'development';
}

export function isDesktopRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveAppRuntime(env) === 'desktop';
}

export function resolveApiHost(env: NodeJS.ProcessEnv = process.env): string {
  return isDesktopRuntime(env) ? '127.0.0.1' : (env.HOST ?? '0.0.0.0');
}
