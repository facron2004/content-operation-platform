import { Logger } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogInterceptor } from '../src/audit-log/audit-log.interceptor';

describe('AuditLogInterceptor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs unexpected async audit write failures without rejecting the response', async () => {
    const persistenceError = new Error('database is locked');
    const tryLog = vi.fn().mockRejectedValue(persistenceError);
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const interceptor = new AuditLogInterceptor({ tryLog } as never);
    const request = {
      method: 'POST',
      path: '/api/tasks',
      route: { path: '/' },
      body: { title: 'private request body' },
      params: {},
      user: { userId: 'user-1', username: 'operator' },
      ip: '127.0.0.1'
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({})
      })
    } as never;

    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of({ taskId: 'task-1' }) }))
    ).resolves.toEqual({ taskId: 'task-1' });
    await Promise.resolve();

    expect(tryLog).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Audit log write failed for POST / tasks'),
      expect.stringContaining('database is locked')
    );
    expect(loggerError.mock.calls.flat().join(' ')).not.toContain('private request body');
  });
});
