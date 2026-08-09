import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IdempotencyGuard } from '../src/idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../src/idempotency/idempotency.interceptor';
import { IdempotencyService } from '../src/idempotency/idempotency.service';

describe('IdempotencyGuard Integration Tests', () => {
  let guard: IdempotencyGuard;
  let service: IdempotencyService;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = {
      hashRequest: (body: unknown) => JSON.stringify(body ?? {}),
      findRecord: vi.fn(),
      tryCreate: vi.fn(),
      tryAcquireFailed: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn()
    } as unknown as IdempotencyService;

    reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    guard = new IdempotencyGuard(service, reflector as unknown as Reflector);
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

  it('rejects a required operation without Idempotency-Key', async () => {
    reflector.getAllAndOverride.mockReturnValue('publish-task');
    const mockContext = {
      getHandler: () => vi.fn(),
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', headers: {}, body: {} }),
        getResponse: () => ({})
      })
    } as any;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException);
    expect(service.findRecord).not.toHaveBeenCalled();
    expect(service.tryCreate).not.toHaveBeenCalled();
  });

  it('uses required route metadata instead of a spoofed operation header', async () => {
    reflector.getAllAndOverride.mockReturnValue('campaign-start');
    vi.spyOn(service, 'findRecord').mockResolvedValue(null);
    vi.spyOn(service, 'tryCreate').mockResolvedValue({
      id: 'idem-required',
      idempotencyKey: 'campaign-start:campaign-1:v1',
      operationType: 'campaign-start',
      requestHash: JSON.stringify({}),
      status: 'pending',
      responseData: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const mockContext = {
      getHandler: () => vi.fn(),
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          headers: {
            'idempotency-key': 'campaign-start:campaign-1:v1',
            'idempotency-operation': 'create-task'
          },
          originalUrl: '/api/tasks',
          body: {}
        }),
        getResponse: () => ({ json: vi.fn(), statusCode: 201 })
      })
    } as any;

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
    expect(service.findRecord).toHaveBeenCalledWith(
      'campaign-start:campaign-1:v1',
      'campaign-start'
    );
    expect(service.tryCreate).toHaveBeenCalledWith(
      'campaign-start:campaign-1:v1',
      'campaign-start',
      JSON.stringify({})
    );
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

  it('replays a completed response without invoking the handler', async () => {
    const body = { title: 'New Task Body' };
    const request = {
      method: 'POST',
      headers: { 'idempotency-key': 'key-123' },
      body
    };
    vi.spyOn(service, 'findRecord').mockResolvedValue({
      id: 'idem-1',
      idempotencyKey: 'key-123',
      operationType: 'create-task',
      requestHash: JSON.stringify(body),
      status: 'completed',
      responseData: '{"success":true,"taskId":"task-1"}',
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({})
      })
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const next = { handle: vi.fn(() => of({ success: false })) };
    const result = new IdempotencyInterceptor().intercept(context, next);

    await expect(firstValueFrom(result)).resolves.toEqual({ success: true, taskId: 'task-1' });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('replays a completed null response without invoking the handler', async () => {
    const body = { title: 'New Task Body' };
    const request = {
      method: 'POST',
      headers: { 'idempotency-key': 'key-123' },
      body
    };
    vi.spyOn(service, 'findRecord').mockResolvedValue({
      id: 'idem-1',
      idempotencyKey: 'key-123',
      operationType: 'create-task',
      requestHash: JSON.stringify(body),
      status: 'completed',
      responseData: 'null',
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({})
      })
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const next = { handle: vi.fn(() => of({ success: false })) };
    const result = new IdempotencyInterceptor().intercept(context, next);

    await expect(firstValueFrom(result)).resolves.toBeNull();
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('derives the operation from the full URL when route.path omits the controller prefix', async () => {
    vi.spyOn(service, 'findRecord').mockResolvedValue(null);
    vi.spyOn(service, 'tryCreate').mockResolvedValue({
      id: 'idem-1',
      idempotencyKey: 'key-123',
      operationType: 'campaign-start',
      requestHash: JSON.stringify({}),
      status: 'pending',
      responseData: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          headers: { 'idempotency-key': 'key-123' },
          body: {},
          originalUrl: '/api/campaigns/campaign-1/start?source=retry',
          route: { path: '/:id/start' }
        }),
        getResponse: () => ({ json: vi.fn(), statusCode: 201 })
      })
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(service.findRecord).toHaveBeenCalledWith('key-123', 'campaign-start');
    expect(service.tryCreate).toHaveBeenCalledWith('key-123', 'campaign-start', JSON.stringify({}));
  });

  it('logs a completed-state persistence failure after the response is generated', async () => {
    vi.spyOn(service, 'findRecord').mockResolvedValue(null);
    vi.spyOn(service, 'tryCreate').mockResolvedValue({
      id: 'idem-1',
      idempotencyKey: 'key-123',
      operationType: 'create-task',
      requestHash: JSON.stringify({ title: 'New Task Body' }),
      status: 'pending',
      responseData: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const persistenceError = new Error('database is locked');
    const complete = vi.spyOn(service, 'complete').mockRejectedValue(persistenceError);
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = {
      statusCode: 201,
      json: vi.fn().mockReturnValue('sent')
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          headers: { 'idempotency-key': 'key-123' },
          body: { title: 'New Task Body' }
        }),
        getResponse: () => response
      })
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(response.json({ success: true })).toBe('sent');
    await Promise.resolve();

    expect(complete).toHaveBeenCalledWith('idem-1', '{"success":true}');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist idempotency record idem-1 as completed'),
      expect.stringContaining('database is locked')
    );
    errorLog.mockRestore();
  });

  it('logs a failed-state persistence failure without exposing the request key', async () => {
    vi.spyOn(service, 'findRecord').mockResolvedValue(null);
    vi.spyOn(service, 'tryCreate').mockResolvedValue({
      id: 'idem-2',
      idempotencyKey: 'sensitive-key',
      operationType: 'create-task',
      requestHash: JSON.stringify({ title: 'New Task Body' }),
      status: 'pending',
      responseData: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const persistenceError = new Error('connection unavailable');
    const fail = vi.spyOn(service, 'fail').mockRejectedValue(persistenceError);
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = {
      statusCode: 500,
      json: vi.fn().mockReturnValue('sent')
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          headers: { 'idempotency-key': 'sensitive-key' },
          body: { title: 'New Task Body' }
        }),
        getResponse: () => response
      })
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    response.json({ error: 'failed' });
    await Promise.resolve();

    expect(fail).toHaveBeenCalledWith('idem-2');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist idempotency record idem-2 as failed'),
      expect.stringContaining('connection unavailable')
    );
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('sensitive-key');
    errorLog.mockRestore();
  });

  it('blocks a concurrent request while the same key is pending', async () => {
    const body = { title: 'New Task Body' };
    vi.spyOn(service, 'findRecord').mockResolvedValue({
      id: 'idem-1',
      idempotencyKey: 'key-123',
      operationType: 'create-task',
      requestHash: JSON.stringify(body),
      status: 'pending',
      responseData: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          headers: { 'idempotency-key': 'key-123' },
          body
        }),
        getResponse: () => ({})
      })
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow('正在处理中');
    expect(service.tryCreate).not.toHaveBeenCalled();
  });

  it('allows at most one request through when concurrent creates race', async () => {
    reflector.getAllAndOverride.mockReturnValue('create-task');
    const body = { title: 'Concurrent Task' };
    const pendingRecord = {
      id: 'idem-race',
      idempotencyKey: 'create-task:intent-1',
      operationType: 'create-task',
      requestHash: JSON.stringify(body),
      status: 'pending' as const,
      responseData: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    let created = false;
    vi.spyOn(service, 'findRecord').mockImplementation(async () =>
      created ? pendingRecord : null
    );
    vi.spyOn(service, 'tryCreate').mockImplementation(async () => {
      if (created) return null;
      created = true;
      return pendingRecord;
    });
    const context = () =>
      ({
        getHandler: () => vi.fn(),
        getClass: () => class TestController {},
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            headers: { 'idempotency-key': 'create-task:intent-1' },
            body
          }),
          getResponse: () => ({ json: vi.fn(), statusCode: 201 })
        })
      }) as any;

    const results = await Promise.allSettled([
      guard.canActivate(context()),
      guard.canActivate(context())
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('atomically reacquires a failed record for only one concurrent retry', async () => {
    reflector.getAllAndOverride.mockReturnValue('publish-task');
    const body = { note: 'retry' };
    const failedRecord = {
      id: 'idem-failed',
      idempotencyKey: 'publish-task:task-1:v1',
      operationType: 'publish-task',
      requestHash: JSON.stringify(body),
      status: 'failed' as const,
      responseData: null,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    vi.spyOn(service, 'findRecord').mockResolvedValue(failedRecord);
    let acquired = false;
    vi.spyOn(service, 'tryAcquireFailed').mockImplementation(async () => {
      if (acquired) return false;
      acquired = true;
      return true;
    });
    const context = () =>
      ({
        getHandler: () => vi.fn(),
        getClass: () => class TestController {},
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            headers: { 'idempotency-key': 'publish-task:task-1:v1' },
            body
          }),
          getResponse: () => ({ json: vi.fn(), statusCode: 201 })
        })
      }) as any;

    const results = await Promise.allSettled([
      guard.canActivate(context()),
      guard.canActivate(context())
    ]);

    expect(service.tryAcquireFailed).toHaveBeenCalledTimes(2);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
