import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdempotencyGuard } from '../src/idempotency/idempotency.guard';
import { IdempotencyService } from '../src/idempotency/idempotency.service';
import { ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('IdempotencyGuard Integration Tests', () => {
  let guard: IdempotencyGuard;
  let service: IdempotencyService;

  beforeEach(() => {
    service = {
      hashRequest: (body: unknown) => JSON.stringify(body ?? {}),
      findRecord: vi.fn(),
      tryCreate: vi.fn()
    } as unknown as IdempotencyService;

    guard = new IdempotencyGuard(service, new Reflector());
  });

  it('passes through GET/HEAD requests', async () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', headers: {} }),
        getResponse: () => ({})
      })
    } as any;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('passes through when no Idempotency-Key header is provided', async () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', headers: {} }),
        getResponse: () => ({})
      })
    } as any;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('throws ConflictException when same key but different body hash is detected', async () => {
    vi.spyOn(service, 'findRecord').mockResolvedValue({
      id: 'idem-1',
      idempotencyKey: 'key-123',
      operationType: 'create-task',
      requestHash: 'different-hash',
      status: 'completed',
      responseData: '{"success":true}',
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          headers: { 'idempotency-key': 'key-123' },
          body: { title: 'New Task Body' }
        }),
        getResponse: () => ({})
      })
    } as any;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(ConflictException);
  });
});
