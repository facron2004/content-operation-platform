/**
 * Named throttlers for Nest throttler v6.
 *
 * Route decorators MUST key overrides by these exact names
 * (`@Throttle({ long: { limit, ttl } })`). A key of `default` only
 * binds when a throttler is named `default` — which we intentionally
 * do not register. Residual #45: every route previously used `default`
 * and was a silent no-op against short/medium/long.
 *
 * - short  — burst (30 / 1s)
 * - medium — short window (100 / 10s)
 * - long   — per-minute budget (400 / 60s); route overrides bind here
 *
 * 档位面向内部运营后台（@Roles 守卫之后）调优：看板单次加载会并发触发
 * 6+ 个 GET，加上快速连续刷新/轮询，旧档位（short 10/1s）会误伤正常
 * 操作返回 429。此处放宽到既能容纳正常并发、仍能限制滥用的水平。
 */
export const appThrottlerConfig = [
  { name: 'short', ttl: 1000, limit: 30 },
  { name: 'medium', ttl: 10000, limit: 100 },
  { name: 'long', ttl: 60000, limit: 400 }
];
