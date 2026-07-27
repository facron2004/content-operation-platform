import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  buildExceptionBody,
  normalizeExceptionMessage,
  resolveExceptionPayload
} from '../src/common/exception-payload';

describe('normalizeExceptionMessage', () => {
  it('joins validation message arrays into a single string', () => {
    expect(
      normalizeExceptionMessage(['a must be string', 'b should not be empty'], 'fallback')
    ).toBe('a must be string; b should not be empty');
  });

  it('uses fallback for null/undefined', () => {
    expect(normalizeExceptionMessage(undefined, 'fallback')).toBe('fallback');
    expect(normalizeExceptionMessage(null, 'fallback')).toBe('fallback');
  });

  it('truncates very long messages', () => {
    const long = 'x'.repeat(3000);
    const out = normalizeExceptionMessage(long, 'fb', 100);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101);
  });
});

describe('resolveExceptionPayload', () => {
  it('stringifies class-validator message arrays (Residual #46)', () => {
    const log = vi.fn();
    const ex = new BadRequestException({
      statusCode: 400,
      message: ['username must be a string', 'password should not be empty'],
      error: 'Bad Request'
    });
    const out = resolveExceptionPayload(ex, log);
    expect(out.status).toBe(400);
    expect(typeof out.message).toBe('string');
    expect(out.message).toContain('username must be a string');
    expect(out.message).toContain('password should not be empty');
    expect(Array.isArray(out.message)).toBe(false);
  });

  it('masks 5xx message in production bodies', () => {
    const body = buildExceptionBody({
      status: 500,
      message: 'Prisma connection refused at 127.0.0.1',
      details: { stack: 'secret' },
      path: '/api/x',
      isProduction: true
    });
    expect(body.message).toBe('Internal Server Error');
    expect(body).not.toHaveProperty('details');
  });

  it('keeps 4xx message and omits details in production', () => {
    const body = buildExceptionBody({
      status: 400,
      message: 'bad input',
      details: { message: ['field'] },
      path: '/api/x',
      isProduction: true
    });
    expect(body.message).toBe('bad input');
    expect(body).not.toHaveProperty('details');
  });

  it('logs unhandled Error and returns 500', () => {
    const log = vi.fn();
    const out = resolveExceptionPayload(new Error('boom'), log);
    expect(out.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(out.message).toBe('boom');
    expect(log).toHaveBeenCalled();
  });

  it('handles string HttpException response', () => {
    const out = resolveExceptionPayload(new HttpException('nope', 403), vi.fn());
    expect(out.status).toBe(403);
    expect(out.message).toBe('nope');
  });
});
