/**
 * Named throttlers for Nest throttler v6.
 *
 * Route decorators MUST key overrides by these exact names
 * (`@Throttle({ long: { limit, ttl } })`). A key of `default` only
 * binds when a throttler is named `default` — which we intentionally
 * do not register. Residual #45: every route previously used `default`
 * and was a silent no-op against short/medium/long.
 *
 * - short  — burst (10 / 1s)
 * - medium — short window (50 / 10s)
 * - long   — per-minute budget (200 / 60s); route overrides bind here
 */
export const appThrottlerConfig = [
  { name: 'short', ttl: 1000, limit: 10 },
  { name: 'medium', ttl: 10000, limit: 50 },
  { name: 'long', ttl: 60000, limit: 200 }
];
