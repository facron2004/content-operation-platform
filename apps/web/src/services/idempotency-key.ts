export type ClientIdempotentOperation =
  | 'create-task'
  | 'batch-create-tasks'
  | 'publish-task'
  | 'campaign-start'
  | 'batch-import'
  | 'data-backfill';

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
