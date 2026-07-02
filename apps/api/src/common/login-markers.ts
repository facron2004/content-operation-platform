/**
 * External backend (JeeSite) login page markers.
 *
 * When the external backend returns an HTML login page (session expired)
 * instead of JSON, the response body contains these substrings. Three call
 * sites detect this condition:
 *   - data-source.service.ts: parseExternalResponse()
 *   - auto-login.service.ts: detectLoginRedirect()
 *   - auto-login.service.ts: credential failure check
 *
 * Keep all markers in one place so adding/removing a marker is a single edit.
 */

/** Substrings that indicate the response body is the JeeSite login page. */
export const LOGIN_PAGE_MARKERS: readonly string[] = ['loginForm', '/a/login'] as const;

/** HTML tag indicating the body is an HTML login form (not a JeeSite JSON wrapper). */
export const LOGIN_FORM_HTML_MARKER = '<form';

/** Substring used by JeeSite when login credentials are wrong. */
export const LOGIN_INVALID_CREDENTIALS_MARKER = '用户名或密码错误';

/**
 * Detects whether a response body is the JeeSite login page
 * (used by session-expiry detection and credentials-failure detection).
 */
export const containsLoginPageMarker = (text: string): boolean =>
  LOGIN_PAGE_MARKERS.some((marker) => text.includes(marker));
