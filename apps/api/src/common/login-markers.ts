/** JeeSite login markers for data-source / auto-login session & credential checks. */ /** Substrings that indicate the response body is the JeeSite login page. */ export const LOGIN_PAGE_MARKERS: readonly string[] =
  ['loginForm', '/a/login'] as const;
/** HTML tag indicating the body is an HTML login form (not a JeeSite JSON wrapper). */ export const LOGIN_FORM_HTML_MARKER =
  '<form';
/** Substring used by JeeSite when login credentials are wrong. */ export const LOGIN_INVALID_CREDENTIALS_MARKER =
  '用户名或密码错误';
/** Detects whether a response body is the JeeSite login page. */ export const containsLoginPageMarker =
  (text: string): boolean => LOGIN_PAGE_MARKERS.some((marker) => text.includes(marker));
