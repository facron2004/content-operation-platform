import { describe, it, expect } from 'vitest';
import { maskEmail, maskPhone } from '../src/common/mask-pii';
import { safeStringifyRedacted } from '../src/common/redact-sensitive';

describe('PII Masking and Security Controls', () => {
  it('masks phone numbers correctly leaving last 4 digits', () => {
    expect(maskPhone('13812345678')).toBe('*******5678');
    expect(maskPhone(null)).toBeUndefined();
    expect(maskPhone(undefined)).toBeUndefined();
  });

  it('masks email addresses properly preserving domain', () => {
    expect(maskEmail('user@example.com')).toBe('u***@example.com');
    expect(maskEmail('admin.test@company.cn')).toBe('a***@company.cn');
    expect(maskEmail(null)).toBeUndefined();
  });

  it('redacts sensitive fields in JSON objects', () => {
    const payload = {
      username: 'admin',
      password: 'MySecretPassword123!',
      token: 'jwt-bearer-token',
      apiKey: 'sk-12345678',
      normalField: 'Public Value'
    };

    const redactedJson = safeStringifyRedacted(payload);
    expect(redactedJson).not.toContain('MySecretPassword123!');
    expect(redactedJson).not.toContain('jwt-bearer-token');
    expect(redactedJson).not.toContain('sk-12345678');
    expect(redactedJson).toContain('[REDACTED]');
    expect(redactedJson).toContain('Public Value');
  });
});
