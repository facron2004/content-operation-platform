export type ClientIdempotentOperation =
  | 'create-task'
  | 'batch-create-tasks'
  | 'publish-task'
  | 'verification'
  | 'refund'
  | 'refund-approve'
  | 'refund-complete'
  | 'product-edit'
  | 'inventory-adjustment'
  | 'merchant-application'
  | 'merchant-approval'
  | 'asset-adjustment'
  | 'settlement'
  | 'profit-sharing'
  | 'reconciliation'
  | 'campaign-start'
  | 'batch-import'
  | 'data-backfill'
  | 'marketing-tag'
  | 'audience'
  | 'marketing-campaign'
  | 'coupon'
  | 'automation'
  | 'private-domain'
  | 'sms-task'
  | 'benefit-grant'
  | 'package-combination'
  | 'store'
  | 'merchant-score'
  | 'crm-lead'
  | 'delivery'
  | 'card-batch'
  | 'card-redeem';

export interface SubmissionIntent {
  key: string;
  fingerprint: string;
}

function normalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForFingerprint);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForFingerprint(item)])
    );
  }
  return value;
}

export function createIntentVersion(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `intent_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildBusinessIntentKey(
  operation: ClientIdempotentOperation,
  ...parts: Array<string | number>
): string {
  return [operation, ...parts.map((part) => encodeURIComponent(String(part)))].join(':');
}

/** Reuse the same key after a timeout, but rotate it if the submitted payload changed. */
export function resolveSubmissionIntent(
  operation: ClientIdempotentOperation,
  payload: unknown,
  previous?: SubmissionIntent | null
): SubmissionIntent {
  const fingerprint = JSON.stringify(normalizeForFingerprint(payload));
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    key: buildBusinessIntentKey(operation, createIntentVersion())
  };
}
