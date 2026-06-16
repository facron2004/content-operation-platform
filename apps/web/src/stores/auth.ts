import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // JWT exp is in seconds
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(localStorage.getItem(USER_KEY));

  // Check token existence AND expiry to avoid flicker
  const isAuthenticated = computed(() => {
    if (!token.value) return false;
    const exp = parseJwtExp(token.value);
    if (exp && Date.now() >= exp) {
      // Expired token — silently clear it (no redirect in getter)
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
  }

  function clearAuth() {
    token.value = null;
    username.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getAuthHeader() {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  return { token, username, isAuthenticated, setAuth, clearAuth, getAuthHeader };
});
