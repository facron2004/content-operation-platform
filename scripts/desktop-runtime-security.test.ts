import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { buildDesktopBackendEnvironment } from '../apps/desktop/src/backend-runtime-environment';
import { buildDesktopRuntimeCookie } from '../apps/desktop/src/desktop-session';
import {
  isDesktopRuntime,
  resolveApiHost,
  resolveAppRuntime
} from '../apps/api/src/config/runtime.config';
import {
  createDesktopTokenGuard,
  requireDesktopRuntimeToken
} from '../apps/api/src/bootstrap-desktop-runtime';

function createEnvironment(randomBytes: (size: number) => Buffer) {
  return buildDesktopBackendEnvironment({
    inheritedEnvironment: {
      APP_RUNTIME: 'server',
      DESKTOP_MODE: 'true',
      DESKTOP_APP: '1',
      DESKTOP_RUNTIME_TOKEN: 'inherited-token',
      JWT_SECRET: 'inherited-jwt',
      AUTH_PASSWORD: 'inherited-password',
      AUTH_USERNAME: 'inherited-user',
      HOST: '0.0.0.0',
      PORT: '9999',
      EXTERNAL_API_BASE_URL: 'https://inherited.example'
    },
    configuredEnvironment: {
      EXTERNAL_API_BASE_URL: 'https://configured.example'
    },
    nodeEnvironment: 'production',
    port: 43123,
    databaseUrl: 'file:C:/Users/test/AppData/content-ops.db',
    migrationsPath: 'C:/app/prisma/migrations',
    schemaPath: 'C:/app/prisma/schema.prisma',
    releaseManifestPath: 'C:/app/release-manifest.json',
    bootId: 'boot-test',
    appVersion: '0.12.0',
    webDistPath: 'C:/app/web',
    logDirectory: 'C:/Users/test/AppData/logs',
    randomBytes
  });
}

test('desktop backend environment replaces inherited runtime credentials and legacy flags', () => {
  let fill = 1;
  const randomBytes = (size: number) => Buffer.alloc(size, fill++);

  const first = createEnvironment(randomBytes);
  const second = createEnvironment(randomBytes);

  assert.equal(first.environment.APP_RUNTIME, 'desktop');
  assert.equal(first.environment.DESKTOP_MODE, undefined);
  assert.equal(first.environment.DESKTOP_APP, undefined);
  assert.equal(first.environment.HOST, '127.0.0.1');
  assert.equal(first.environment.PORT, '43123');
  assert.equal(first.environment.AUTH_USERNAME, undefined);
  assert.equal(first.environment.EXTERNAL_API_BASE_URL, 'https://configured.example');
  assert.match(first.runtimeToken, /^[a-f0-9]{64}$/);
  assert.notEqual(first.environment.JWT_SECRET, 'inherited-jwt');
  assert.notEqual(first.environment.AUTH_PASSWORD, 'inherited-password');
  assert.notEqual(first.runtimeToken, second.runtimeToken);
  assert.notEqual(first.environment.JWT_SECRET, second.environment.JWT_SECRET);
  assert.notEqual(first.environment.AUTH_PASSWORD, second.environment.AUTH_PASSWORD);
});

test('APP_RUNTIME is validated and desktop mode always resolves the loopback host', () => {
  assert.equal(resolveAppRuntime({ APP_RUNTIME: 'desktop' }), 'desktop');
  assert.equal(resolveAppRuntime({ APP_RUNTIME: 'server' }), 'server');
  assert.equal(resolveAppRuntime({ NODE_ENV: 'development' }), 'development');
  assert.equal(resolveAppRuntime({ NODE_ENV: 'production' }), 'server');
  assert.equal(isDesktopRuntime({ APP_RUNTIME: 'desktop' }), true);
  assert.equal(resolveApiHost({ APP_RUNTIME: 'desktop', HOST: '0.0.0.0' }), '127.0.0.1');
  assert.throws(() => resolveAppRuntime({ APP_RUNTIME: 'invalid' }), /APP_RUNTIME/);
});

function invokeGuard(pathname: string, cookie?: string) {
  const guard = createDesktopTokenGuard('runtime-token');
  let nextCalled = false;
  let statusCode: number | undefined;
  let responseBody: unknown;
  const request = { path: pathname, headers: { cookie } } as unknown as Request;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      responseBody = body;
      return response;
    }
  } as unknown as Response;
  const next = (() => {
    nextCalled = true;
  }) as NextFunction;

  guard(request, response, next);
  return { nextCalled, statusCode, responseBody };
}

test('desktop runtime token is mandatory and guards every business request', () => {
  assert.throws(() => requireDesktopRuntimeToken({ APP_RUNTIME: 'desktop' }), /required/);
  assert.equal(
    requireDesktopRuntimeToken({
      APP_RUNTIME: 'desktop',
      DESKTOP_RUNTIME_TOKEN: ' runtime-token '
    }),
    'runtime-token'
  );

  assert.equal(invokeGuard('/ready').nextCalled, true);
  assert.equal(invokeGuard('/health').nextCalled, true);
  assert.deepEqual(invokeGuard('/api/users'), {
    nextCalled: false,
    statusCode: 403,
    responseBody: { message: 'Forbidden: invalid desktop runtime token' }
  });
  assert.equal(
    invokeGuard('/api/users', 'other=value; desktop_runtime_token=runtime-token').nextCalled,
    true
  );
});

test('main process installs the random runtime token as a protected same-origin cookie', () => {
  assert.deepEqual(
    buildDesktopRuntimeCookie({ baseUrl: 'http://127.0.0.1:43123', token: 'runtime-token' }),
    {
      url: 'http://127.0.0.1:43123',
      name: 'desktop_runtime_token',
      value: 'runtime-token',
      httpOnly: true,
      secure: false,
      sameSite: 'strict'
    }
  );
});
