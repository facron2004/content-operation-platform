export const PUBLIC_CONFIG_KEYS = [
  'CONTENT_DATA_SOURCE',
  'LOCAL_LIFE_API_BASE_URL',
  'EXTERNAL_API_BASE_URL',
  'EXTERNAL_PACKAGES_PATH',
  'AI_API_BASE_URL',
  'AI_MODEL',
  'AI_PROVIDER',
  'AI_PROVIDER_NAME',
  'AI_TEMPERATURE',
  'AI_MAX_TOKENS'
] as const;

export const SECRET_CONFIG_KEYS = [
  'EXTERNAL_API_COOKIE',
  'EXTERNAL_API_TOKEN',
  'EXTERNAL_API_USERNAME',
  'EXTERNAL_API_PASSWORD',
  'JEESITE_SESSION_ID',
  'JEESITE_COOKIE',
  'AI_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN'
] as const;

export const DESKTOP_CONFIG_KEYS = [...PUBLIC_CONFIG_KEYS, ...SECRET_CONFIG_KEYS] as const;

export type PublicConfigKey = (typeof PUBLIC_CONFIG_KEYS)[number];
export type SecretConfigKey = (typeof SECRET_CONFIG_KEYS)[number];
export type PublicConfig = Partial<Record<PublicConfigKey, string>>;
export type SecretPresence = Record<SecretConfigKey, boolean>;
export type DesktopConfigView = { public: PublicConfig; secrets: SecretPresence };

const publicKeySet = new Set<string>(PUBLIC_CONFIG_KEYS);
const secretKeySet = new Set<string>(SECRET_CONFIG_KEYS);

export function normalizePublicConfig(input: unknown): PublicConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('公开配置必须是对象');
  }

  const normalized: PublicConfig = {};
  for (const [key, value] of Object.entries(input)) {
    if (!publicKeySet.has(key)) throw new Error(`不允许保存配置项: ${key}`);
    if (value === null || value === undefined || value === '') continue;
    if (typeof value !== 'string' || value.length > 4096) {
      throw new Error(`配置项 ${key} 必须是 4096 字符以内的字符串`);
    }
    normalized[key as PublicConfigKey] = value.trim();
  }
  return normalized;
}

export function assertSecretConfigKey(value: unknown): SecretConfigKey {
  if (typeof value !== 'string' || !secretKeySet.has(value)) {
    throw new Error('不允许保存该敏感配置项');
  }
  return value as SecretConfigKey;
}
