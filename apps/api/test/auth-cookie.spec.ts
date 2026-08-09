import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  extractJwtFromCookie,
  setAuthCookie
} from '../src/auth/auth-cookie';

describe('auth cookie', () => {
  it('sets a scoped HttpOnly cookie and can extract its encoded value', () => {
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const token = 'header.payload/signature';

    setAuthCookie(response, token);

    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      `${AUTH_COOKIE_NAME}=header.payload%2Fsignature; HttpOnly; Path=/api; SameSite=Lax`
    );
    expect(
      extractJwtFromCookie({
        headers: { cookie: `other=value; ${AUTH_COOKIE_NAME}=header.payload%2Fsignature` }
      } as Request)
    ).toBe(token);
  });

  it('clears the auth cookie and ignores malformed values', () => {
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;

    clearAuthCookie(response);

    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      `${AUTH_COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Path=/api; SameSite=Lax`
    );
    expect(
      extractJwtFromCookie({ headers: { cookie: `${AUTH_COOKIE_NAME}=%E0%A4%A` } } as Request)
    ).toBeNull();
  });
});
