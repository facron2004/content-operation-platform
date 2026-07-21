import { parseJwtExp } from './auth-storage';
export function createAuthRefreshScheduler() {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const api = {
    clear() {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    },
    schedule(args: {
      token: string | null;
      isAuthenticated: () => boolean;
      refresh: () => Promise<string | null>;
      leadMs: number;
      minIntervalMs: number;
    }) {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      const exp = args.token ? parseJwtExp(args.token) : null;
      if (!exp) return;
      const due = Math.max(exp - Date.now() - args.leadMs, args.minIntervalMs);
      refreshTimer = setTimeout(() => {
        if (!args.isAuthenticated()) return;
        args.refresh().then((ok) => {
          if (ok) api.schedule(args);
        });
      }, due);
    }
  };
  return api;
}
