import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT_SECURITY_POLICY, securityHeaders } from '../src/common/security.middleware';

describe('security headers', () => {
  it('serves a strict CSP without inline script/style or eval allowances', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
        return response;
      }
    } as unknown as Response;
    const next = vi.fn();

    securityHeaders({ path: '/api/users' } as Request, response, next);

    const policy = headers.get('Content-Security-Policy');
    expect(policy).toBe(CONTENT_SECURITY_POLICY);
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(next).toHaveBeenCalledOnce();
    expect(headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, private');
  });
});
