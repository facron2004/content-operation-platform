/** Audit path policy kept pure so route classification can be behavior-tested. */

/** High-volume public paths that would drown the audit table. */
export function shouldSkipAuditPath(path: string): boolean {
  return (
    path.startsWith('/api/tracking') ||
    path.startsWith('/t/') ||
    path.includes('/health') ||
    path.includes('/auth/local-session') ||
    path.includes('/auth/refresh')
  );
}

/**
 * Authenticated bulk endpoints whose request/response bodies embed free-form
 * PII or multi-KB text. Still audit who/when/action; drop before/after payloads.
 */
export function shouldOmitAuditBodies(path: string): boolean {
  return (
    path.includes('/import') ||
    path.includes('/generate') ||
    path.includes('/soldout-links/collect') ||
    // Heavy admin jobs already leave who/when/action; bodies are multi-KB or binary-ish.
    path.includes('/export') ||
    path.includes('/gmv/refresh') ||
    path.includes('/merchant-sales/refresh') ||
    path.includes('/attribution/recompute') ||
    path.includes('/sync-merchants') ||
    path.includes('/refresh-addresses')
  );
}
