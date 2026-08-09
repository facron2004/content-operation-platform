import { createAuthCore, type AuthActionOptions } from './auth-actions-core';
export function createAuthActions(options: AuthActionOptions) {
  const core = createAuthCore(options);
  return {
    ...core,
    // Browser authentication is carried by the HttpOnly Cookie. Keep this
    // compatibility method but never expose a JWT to request callers.
    getAuthHeader: () => ({}),
    ensureAuthenticated: async () => {
      if (options.isAuthenticated()) return true;
      return (await core.refresh()) ?? core.loginLocally();
    }
  };
}
