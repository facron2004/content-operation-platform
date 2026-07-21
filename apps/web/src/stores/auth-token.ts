import { parseJwtExp } from './auth-storage';
export function isTokenAuthenticated(token: string | null | undefined): boolean {
  if (!token) return false;
  const exp = parseJwtExp(token);
  return !(exp && Date.now() >= exp);
}
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return false;
  const exp = parseJwtExp(token);
  return Boolean(exp && Date.now() >= exp);
}
