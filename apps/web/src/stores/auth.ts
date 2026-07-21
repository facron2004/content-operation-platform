import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { readStoredAuth } from './auth-storage';
import { createAuthRefreshScheduler } from './auth-refresh-scheduler';
import { isTokenAuthenticated, isTokenExpired } from './auth-token';
import { createAuthActions } from './auth-actions';
export const useAuthStore = defineStore('auth', () => {
  const stored = readStoredAuth(),
    token = ref<string | null>(stored.token),
    username = ref<string | null>(stored.username),
    refreshInflight = { current: null as Promise<string | null> | null },
    localSessionInflight = { current: null as Promise<string | null> | null };
  const scheduler = createAuthRefreshScheduler();
  const isAuthenticated = computed(() => isTokenAuthenticated(token.value));
  const actions = createAuthActions({
    token,
    username,
    isAuthenticated: () => isAuthenticated.value,
    refreshInflight,
    localSessionInflight,
    scheduler
  });
  watch(token, (current) => {
    if (isTokenExpired(current)) actions.clearAuth();
  });
  if (token.value) actions.scheduleRefresh();
  return { token, username, isAuthenticated, ...actions };
});
