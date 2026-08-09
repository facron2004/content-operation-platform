export const COOKIE_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function createAuthRefreshScheduler() {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null,
    scheduleVersion = 0;
  const api = {
    clear() {
      scheduleVersion += 1;
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    },
    schedule(args: {
      isAuthenticated: () => boolean;
      refresh: () => Promise<boolean | null>;
      intervalMs?: number;
    }) {
      const version = ++scheduleVersion;
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      const due = args.intervalMs ?? COOKIE_REFRESH_INTERVAL_MS;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (version !== scheduleVersion || !args.isAuthenticated()) return;
        args.refresh().then((ok) => {
          if (ok && version === scheduleVersion && args.isAuthenticated()) api.schedule(args);
        });
      }, due);
    }
  };
  return api;
}
