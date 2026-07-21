import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { authedAgent } from './helpers/auth';

describe('AI copy config API', () => {
  it('updates runtime AI config from the frontend without returning the raw API key', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    // 走真实 /api/auth/login 拿 Bearer token
    const api = await authedAgent(app);
    // 确保 app 在测试结束后关闭，即使断言失败
    try {
      const response = await api
        .post('/api/content/ai-copy/config')
        .send({
          apiKey: 'sk-front-config-secret',
          baseURL: 'https://example.com/v1',
          model: 'front-copy-model',
          providerName: '前台AI',
          temperature: 0.5,
          maxTokens: 1100
        })
        .expect(201);

      expect(response.body).toMatchObject({
        enabled: true,
        providerName: '前台AI',
        baseURL: 'https://example.com/v1',
        model: 'front-copy-model',
        missing: [],
        maskedApiKey: 'sk-f**********cret',
        temperature: 0.5,
        maxTokens: 1100
      });
      expect(JSON.stringify(response.body)).not.toContain('sk-front-config-secret');

      const status = await api.get('/api/content/ai-copy/status').expect(200);
      expect(status.body.maskedApiKey).toBe('sk-f**********cret');
      expect(JSON.stringify(status.body)).not.toContain('sk-front-config-secret');
    } finally {
      await app.close();
    }
  });
});
