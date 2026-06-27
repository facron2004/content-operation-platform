import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * 4 个 e2e 测试的全局 JWT 认证 helper。
 *
 * 背景:app.module.ts 全局注册了 JwtAuthGuard,所有 controller 默认受保护;
 * 但 e2e 测试是早期写的,从未发送 Bearer token,导致 8 个 it 全部 401。
 *
 * 修法:走真实 /api/auth/login 拿 token,而不是 mock 掉 Guard。
 * 优势:既修了 e2e,又顺带验证了 login 链路本身。
 */
const DEFAULT_ADMIN = { username: 'admin', password: 'contentops2024' };

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * 调 /api/auth/login 拿 token,返回完整 Authorization header。
 * 失败时抛错(避免后续请求静默 401 难以排查)。
 */
export async function loginAndGetAuthHeader(
  app: INestApplication,
  credentials: { username: string; password: string } = DEFAULT_ADMIN
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send(credentials)
    .expect(201);

  if (!res.body?.access_token) {
    throw new Error(`login did not return access_token: ${JSON.stringify(res.body)}`);
  }
  return `Bearer ${res.body.access_token as string}`;
}

/**
 * 工厂(异步):登录一次拿 token,返回一个带 Bearer 的 supertest 风格 agent。
 *
 * 用法:
 *   const api = await authedAgent(app);
 *   await api.get('/api/content/...').expect(200);
 *   await api.post('/api/content/...').send({...}).expect(201);
 *
 * 设计要点:
 * - 函数本身是 async,内部 await login;返回的 agent 是同步的(直接返回 supertest Test)
 * - 这是必要的:supertest Test 是 thenable,被 await 后会触发请求并解析为 response
 * - 若 agent 本身是 async,链式 .expect() 调用会落在 Promise 上,丢失断言语义
 * - token 24h 有效,每个 it 登录一次即可
 */
export async function authedAgent(app: INestApplication) {
  const authHeader = await loginAndGetAuthHeader(app);
  const make = (method: Method) => (path: string) =>
    request(app.getHttpServer())[method](path).set('Authorization', authHeader);
  return {
    get: make('get'),
    post: make('post'),
    put: make('put'),
    patch: make('patch'),
    delete: make('delete')
  };
}
