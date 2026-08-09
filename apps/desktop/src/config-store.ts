import { app, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertSecretConfigKey,
  DESKTOP_CONFIG_KEYS,
  normalizePublicConfig,
  PUBLIC_CONFIG_KEYS,
  SECRET_CONFIG_KEYS,
  type DesktopConfigView,
  type PublicConfig,
  type SecretConfigKey,
  type SecretPresence
} from './config-policy';

type EncryptedSecrets = Partial<Record<SecretConfigKey, string>>;

function getPublicConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function getSecretsPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function readPublicConfig(): PublicConfig {
  return normalizePublicConfig(readJson(getPublicConfigPath()));
}

function readEncryptedSecrets(): EncryptedSecrets {
  const raw = readJson(getSecretsPath());
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('敏感配置文件格式无效');
  }
  const secrets: EncryptedSecrets = {};
  for (const [key, value] of Object.entries(raw)) {
    const secretKey = assertSecretConfigKey(key);
    if (typeof value !== 'string' || !value) throw new Error(`敏感配置 ${key} 格式无效`);
    secrets[secretKey] = value;
  }
  return secrets;
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // 保留原配置文件，临时文件只包含本次写入的数据。
    }
    throw error;
  }
}

function buildSecretPresence(secrets: EncryptedSecrets): SecretPresence {
  return Object.fromEntries(
    SECRET_CONFIG_KEYS.map((key) => [key, typeof secrets[key] === 'string'])
  ) as SecretPresence;
}

export function getConfig(): DesktopConfigView {
  return { public: readPublicConfig(), secrets: buildSecretPresence(readEncryptedSecrets()) };
}

export function savePublicConfig(input: unknown): void {
  const current = readPublicConfig();
  const next = normalizePublicConfig(input);
  const merged: PublicConfig = { ...current };
  const rawInput = input as Record<string, unknown>;
  for (const key of PUBLIC_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rawInput, key)) {
      const rawValue = rawInput[key];
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        delete merged[key];
        continue;
      }
    }
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      const value = next[key];
      if (value) merged[key] = value;
      else delete merged[key];
    }
  }
  writeJsonAtomically(getPublicConfigPath(), merged);
}

export function setSecret(name: unknown, value: unknown): void {
  const secretKey = assertSecretConfigKey(name);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，拒绝以明文保存敏感配置');
  }
  if (value !== null && (typeof value !== 'string' || value.length > 32_768)) {
    throw new Error('敏感配置值无效');
  }

  const secrets = readEncryptedSecrets();
  if (value === null || value === '') {
    delete secrets[secretKey];
  } else {
    secrets[secretKey] = safeStorage.encryptString(value).toString('base64');
  }
  writeJsonAtomically(getSecretsPath(), secrets);
}

export function getBackendConfigEnvironment(): Record<string, string> {
  const publicConfig = readPublicConfig();
  const encryptedSecrets = readEncryptedSecrets();
  const environment: Record<string, string> = {};

  for (const key of DESKTOP_CONFIG_KEYS) {
    const publicValue = publicConfig[key as keyof PublicConfig];
    if (typeof publicValue === 'string' && publicValue) environment[key] = publicValue;
  }

  const secretKeys = Object.keys(encryptedSecrets) as SecretConfigKey[];
  if (secretKeys.length > 0 && !safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，拒绝读取敏感配置');
  }
  for (const key of secretKeys) {
    const encrypted = encryptedSecrets[key];
    if (!encrypted) continue;
    environment[key] = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  return environment;
}
