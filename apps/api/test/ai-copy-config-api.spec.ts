import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('AI copy config API', () => {
  it('updates runtime AI config from the frontend without returning the raw API key', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/content/ai-copy/config')
      .send({
        apiKey: 'sk-front-config-secret',
        baseURL: 'https://ai.example.com/v1',
        model: 'front-copy-model',
        providerName: '前台AI',
        temperature: 0.5,
        maxTokens: 1100
      })
      .expect(201);

    expect(response.body).toMatchObject({
      enabled: true,
      providerName: '前台AI',
      baseURL: 'https://ai.example.com/v1',
      model: 'front-copy-model',
      missing: [],
      maskedApiKey: 'sk-f**********cret',
      temperature: 0.5,
      maxTokens: 1100
    });
    expect(JSON.stringify(response.body)).not.toContain('sk-front-config-secret');

    const status = await request(app.getHttpServer())
      .get('/api/content/ai-copy/status')
      .expect(200);
    expect(status.body.maskedApiKey).toBe('sk-f**********cret');
    expect(JSON.stringify(status.body)).not.toContain('sk-front-config-secret');

    await app.close();
  });
});
