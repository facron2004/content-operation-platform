import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { RefundController } from '../src/refund/refund.controller';
import type { RefundService } from '../src/refund/refund.service';

function request(query: Record<string, unknown>): Request {
  return { user: { roles: ['admin'] }, query } as unknown as Request;
}

describe('refund controller force authorization', () => {
  it('passes an authorized explicit force signal and keeps ordinary reads non-force', () => {
    const service = { getRefundToday: vi.fn() } as unknown as RefundService;
    const controller = new RefundController(service);

    controller.today({ date: '2026-08-10', force: 'true' }, request({ force: 'true' }));
    controller.today({ date: '2026-08-10' }, request({}));

    expect(service.getRefundToday).toHaveBeenNthCalledWith(
      1,
      { date: '2026-08-10', force: 'true' },
      true
    );
    expect(service.getRefundToday).toHaveBeenNthCalledWith(2, { date: '2026-08-10' }, false);
  });
});
