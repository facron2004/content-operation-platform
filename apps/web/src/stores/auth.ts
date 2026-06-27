import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import axios from 'axios';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const REFRESH_LEAD_MS = 5 * 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;
const REFRESH_PATH = '/auth/refresh';
const LOCAL_SESSION_PATH = '/auth/local-session';

function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(localStorage.getItem(USER_KEY));

  let refreshInflight: Promise<string | null> | null = null;
  let localSessionInflight: Promise<string | null> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const isAuthenticated = computed(() => {
    if (!token.value) return false;
    const exp = parseJwtExp(token.value);
    if (exp && Date.now() >= exp) {
      clearAuth();
      return false;
    }
    return true;
  });

  function setAuth(accessToken: string, user: string) {
    token.value = accessToken;
    username.value = user;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, user);
    scheduleRefresh();
  }

  function clearAuth() {
    token.value = null;
    username.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function getAuthHeader() {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function refresh(): Promise<string | null> {
    if (refreshInflight) return refreshInflight;
    const current = token.value;
    if (!current) return null;

    refreshInflight = (async () => {
      try {
        const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';
        const res = await axios.post(
          `${baseURL}${REFRESH_PATH}`,
          {},
          { headers: { Authorization: `Bearer ${current}` }, timeout: 10000 }
        );
        const newToken = res.data?.access_token as string | undefined;
        const newUser = (res.data?.username as string | undefined) ?? username.value ?? '';
        if (!newToken) return null;
        setAuth(newToken, newUser);
        return newToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshInflight = null;
        }, 100);
      }
    })();

    return refreshInflight;
  }

  async function loginLocally(): Promise<string | null> {
    if (localSessionInflight) return localSessionInflight;

    localSessionInflight = (async () => {
      try {
        const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';
        const res = await axios.post(`${baseURL}${LOCAL_SESSION_PATH}`, {}, { timeout: 10000 });
        const newToken = res.data?.access_token as string | undefined;
        const newUser = (res.data?.username as string | undefined) ?? 'admin';
        if (!newToken) return null;
        setAuth(newToken, newUser);
        return newToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          localSessionInflight = null;
        }, 100);
      }
    })();

    return localSessionInflight;
  }

  async function ensureAuthenticated(): Promise<string | null> {
    if (isAuthenticated.value && token.value) return token.value;
    const refreshed = await refresh();
    if (refreshed) return refreshed;
    return loginLocally();
  }

  function scheduleRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    const exp = token.value ? parseJwtExp(token.value) : null;
    if (!exp) return;
    const due = Math.max(exp - Date.now() - REFRESH_LEAD_MS, MIN_REFRESH_INTERVAL_MS);
    refreshTimer = setTimeout(() => {
      if (!isAuthenticated.value) return;
      refresh().then((ok) => {
        if (ok) scheduleRefresh();
      });
    }, due);
  }

  if (token.value) scheduleRefresh();

  return {
    token,
    username,
    isAuthenticated,
    setAuth,
    clearAuth,
    getAuthHeader,
    refresh,
    loginLocally,
    ensureAuthenticated,
    scheduleRefresh
  };
});
