import { randomBytes as secureRandomBytes } from 'node:crypto';
import { DESKTOP_CONFIG_KEYS } from './config-policy';

const RESERVED_BACKEND_KEYS = [
  ...DESKTOP_CONFIG_KEYS,
  'APP_RUNTIME',
  'DESKTOP_MODE',
  'DESKTOP_APP',
  'DESKTOP_RUNTIME_TOKEN',
  'DATABASE_URL',
  'MIGRATIONS_PATH',
  'SCHEMA_PATH',
  'RELEASE_MANIFEST_PATH',
  'BOOT_ID',
  'APP_VERSION',
  'WEB_DIST_PATH',
  'LOG_DIR',
  'AUTH_USERNAME',
  'AUTH_PASSWORD',
  'JWT_SECRET',
  'PORT',
  'HOST'
] as const;

export interface DesktopBackendEnvironmentOptions {
  inheritedEnvironment: NodeJS.ProcessEnv;
  configuredEnvironment: NodeJS.ProcessEnv;
  nodeEnvironment: 'production' | 'development';
  port: number;
  databaseUrl: string;
  migrationsPath: string;
  schemaPath: string;
  releaseManifestPath?: string;
  bootId: string;
  appVersion: string;
  webDistPath: string;
  logDirectory: string;
  randomBytes?: (size: number) => Buffer;
}

export interface DesktopBackendEnvironment {
  environment: NodeJS.ProcessEnv;
  runtimeToken: string;
}

export function buildDesktopBackendEnvironment(
  options: DesktopBackendEnvironmentOptions
): DesktopBackendEnvironment {
  const environment = { ...options.inheritedEnvironment };
  for (const key of RESERVED_BACKEND_KEYS) delete environment[key];
  Object.assign(environment, options.configuredEnvironment);

  const randomBytes = options.randomBytes ?? secureRandomBytes;
  const runtimeToken = randomBytes(32).toString('hex');
  Object.assign(environment, {
    NODE_ENV: options.nodeEnvironment,
    APP_RUNTIME: 'desktop',
    HOST: '127.0.0.1',
    PORT: String(options.port),
    DATABASE_URL: options.databaseUrl,
    MIGRATIONS_PATH: options.migrationsPath,
    SCHEMA_PATH: options.schemaPath,
    ...(options.releaseManifestPath ? { RELEASE_MANIFEST_PATH: options.releaseManifestPath } : {}),
    BOOT_ID: options.bootId,
    APP_VERSION: options.appVersion,
    WEB_DIST_PATH: options.webDistPath,
    DESKTOP_RUNTIME_TOKEN: runtimeToken,
    LOG_DIR: options.logDirectory,
    JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_PASSWORD: randomBytes(24).toString('hex')
  });

  return { environment, runtimeToken };
}
