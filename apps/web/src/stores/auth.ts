import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { readStoredAuth } from './auth-storage';
import { createAuthRefreshScheduler } from './auth-refresh-scheduler';
import { createAuthActions } from './auth-actions';
export const useAuthStore = defineStore('auth', () => {
  const stored = readStoredAuth(),
    authenticated = ref(false),
    username = ref<string | null>(stored.username),
    refreshInflight = { current: null as Promise<boolean | null> | null },
    localSessionInflight = { current: null as Promise<boolean | null> | null };
  const scheduler = createAuthRefreshScheduler();
  const isAuthenticated = computed(() => authenticated.value);
  const actions = createAuthActions({
    authenticated,
    username,
    isAuthenticated: () => isAuthenticated.value,
    refreshInflight,
    localSessionInflight,
    scheduler
  });
  return { username, isAuthenticated, ...actions };
});
