/**
 * Deep-clone JSON-like values while redacting known secret field names.
 * Used by audit logging so password / cookie / apiKey never hit OperationAuditLog.
 */

import { AUDIT_PAYLOAD_MAX_CHARS } from './sql-chunk';

// Secrets + common PII keys that must not land in OperationAuditLog before/after.
// Also bulk free-form bodies (rawData / markdown) that often embed owner phones
// inside CSV/JSON text where key-name redaction cannot see them.
const SENSITIVE_KEY =
  /^(password|passwordhash|passwd|pwd|secret|token|access_token|accessToken|refresh_token|refreshToken|api[_-]?key|apikey|cookie|authorization|auth|credential|credentials|x-internal-token|soldout_collect_token|jwt|bearer|phone|mobile|email|ownerphone|memberid|memberphone|trackingcode|rawdata|markdown|body|content|html|snapshotjson)$/i;

const MAX_DEPTH = 8;
const MAX_STRING = 8_000;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return '[Truncated]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => redactSensitive(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      // Summarize bulk free-form bodies instead of storing (truncated) cleartext.
      if (
        /^(rawdata|markdown|body|content|html|snapshotjson)$/i.test(key) &&
        typeof child === 'string'
      ) {
        out[key] = `[REDACTED len=${child.length}]`;
      } else {
        out[key] = '[REDACTED]';
      }
      continue;
    }
    out[key] = redactSensitive(child, depth + 1);
  }
  return out;
}

/** JSON.stringify with redaction; returns undefined on circular / non-serializable. */
export function safeStringifyRedacted(value: unknown): string | undefined {
  try {
    const json = JSON.stringify(redactSensitive(value));
    if (json == null) return undefined;
    if (json.length <= AUDIT_PAYLOAD_MAX_CHARS) return json;
    return `${json.slice(0, AUDIT_PAYLOAD_MAX_CHARS)}…[truncated]`;
  } catch {
    return undefined;
  }
}
