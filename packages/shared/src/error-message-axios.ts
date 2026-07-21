const readResponseMessage = (data: unknown, keys: readonly string[]): string | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
};
type AxiosLikeError = {
  code?: string;
  message?: string;
  response?: { status?: number; data?: unknown };
};
export function messageFromAxiosError(
  error: AxiosLikeError,
  responseMessageKeys: readonly string[],
  fallback: string
): string {
  const message = readResponseMessage(error.response?.data, responseMessageKeys);
  if (message) return message;
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message ?? ''))
    return '请求超时,请稍后重试';
  if (!error.response) return '网络连接失败,请检查网络';
  const status = error.response.status;
  return typeof status === 'number' ? `请求失败 (${status})` : fallback;
}
