import { createAuthCore, type AuthActionOptions } from './auth-actions-core';
export function createAuthActions(options: AuthActionOptions) {
  const core = createAuthCore(options);
  return {
    ...core,
    getAuthHeader: () =>
      options.token.value ? { Authorization: `Bearer ${options.token.value}` } : {},
    ensureAuthenticated: async () =>
      options.isAuthenticated() && options.token.value
        ? options.token.value
        : ((await core.refresh()) ?? core.loginLocally())
  };
}
