export const DESKTOP_RUNTIME_COOKIE_NAME = 'desktop_runtime_token';

export interface DesktopRuntimeSession {
  baseUrl: string;
  token: string;
}

export function buildDesktopRuntimeCookie(runtime: DesktopRuntimeSession) {
  return {
    url: runtime.baseUrl,
    name: DESKTOP_RUNTIME_COOKIE_NAME,
    value: runtime.token,
    httpOnly: true,
    secure: false,
    sameSite: 'strict' as const
  };
}
