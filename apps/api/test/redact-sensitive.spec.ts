import { describe, expect, it } from 'vitest';
import { redactSensitive, safeStringifyRedacted } from '../src/common/redact-sensitive';
import { AUDIT_PAYLOAD_MAX_CHARS } from '../src/common/sql-chunk';

describe('redactSensitive', () => {
  it('redacts password / cookie / apiKey fields case-insensitively', () => {
    const out = redactSensitive({
      username: 'alice',
      password: 's3cret',
      passwordHash: 'bcrypt-hash',
      Cookie: 'session=abc',
      api_key: 'sk-test',
      accessToken: 'jwt-value',
      nested: { access_token: 'tok', keep: 1 }
    }) as Record<string, unknown>;

    expect(out.username).toBe('alice');
    expect(out.password).toBe('[REDACTED]');
    expect(out.passwordHash).toBe('[REDACTED]');
    expect(out.Cookie).toBe('[REDACTED]');
    expect(out.api_key).toBe('[REDACTED]');
    expect(out.accessToken).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).access_token).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).keep).toBe(1);
  });

  it('truncates long strings and deep trees', () => {
    const long = 'x'.repeat(10_000);
    const out = redactSensitive({ note: long }) as { note: string };
    expect(out.note.endsWith('…[truncated]')).toBe(true);
    expect(out.note.length).toBeLessThan(long.length);
  });

  it('safeStringifyRedacted never embeds raw password', () => {
    const json = safeStringifyRedacted({ password: 'hunter2', ok: true });
    expect(json).toBeDefined();
    expect(json).not.toContain('hunter2');
    expect(json).toContain('[REDACTED]');
    expect(json).toContain('"ok":true');
  });

  it('redacts phone / email / ownerPhone / memberId PII keys', () => {
    const out = redactSensitive({
      phone: '13800138000',
      email: 'a@b.com',
      ownerPhone: '13900139000',
      memberId: 'm-1',
      keep: true
    }) as Record<string, unknown>;
    expect(out.phone).toBe('[REDACTED]');
    expect(out.email).toBe('[REDACTED]');
    expect(out.ownerPhone).toBe('[REDACTED]');
    expect(out.memberId).toBe('[REDACTED]');
    expect(out.keep).toBe(true);
  });

  it('redacts trackingCode so create-task audit after does not store live codes', () => {
    const out = redactSensitive({
      trackingCode: 'LIVE_CODE_XYZ',
      title: 'task'
    }) as Record<string, unknown>;
    expect(out.trackingCode).toBe('[REDACTED]');
    expect(out.title).toBe('task');
  });

  it('summarizes rawData / markdown bulk bodies instead of storing cleartext', () => {
    const csv = 'name,phone\nalice,13800138000\n' + 'x'.repeat(200);
    const out = redactSensitive({
      source: 'csv',
      rawData: csv,
      markdown: '# soldout dump with 13900139000'
    }) as Record<string, unknown>;
    expect(out.source).toBe('csv');
    expect(String(out.rawData)).toMatch(/^\[REDACTED len=\d+\]$/);
    expect(String(out.rawData)).not.toContain('13800138000');
    expect(String(out.markdown)).toMatch(/^\[REDACTED len=\d+\]$/);
    expect(String(out.markdown)).not.toContain('13900139000');
  });

  it('safeStringifyRedacted caps total payload length', () => {
    const fat = { note: 'n'.repeat(AUDIT_PAYLOAD_MAX_CHARS + 500), ok: true };
    const json = safeStringifyRedacted(fat);
    expect(json).toBeDefined();
    expect(json!.length).toBeLessThanOrEqual(AUDIT_PAYLOAD_MAX_CHARS + 20);
    expect(json).toContain('…[truncated]');
  });
});
