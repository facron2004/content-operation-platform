import { messageFromAxiosError } from './error-message-axios';
type AxiosLikeError = {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number; data?: unknown };
};
export interface ExtractErrorMessageOptions {
  isAxiosError?: (error: unknown) => error is AxiosLikeError;
  fallback?: string;
  responseMessageKeys?: readonly string[];
}
const DEFAULT_RESPONSE_KEYS: readonly string[] = ['message', 'error'];
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
export function extractErrorMessage(
  error: unknown,
  options: ExtractErrorMessageOptions = {}
): string {
  const {
    isAxiosError,
    fallback = '请求失败',
    responseMessageKeys = DEFAULT_RESPONSE_KEYS
  } = options;
  if (isAxiosError && isAxiosError(error))
    return messageFromAxiosError(error as AxiosLikeError, responseMessageKeys, fallback);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
export { messageFromAxiosError } from './error-message-axios';
