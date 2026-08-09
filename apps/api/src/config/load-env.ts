import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const parseEnvValue = (value: string) => {
  const t = value.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
};
const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) {
      process.env[key] = parseEnvValue(trimmed.slice(eq + 1));
    }
  }
};

export function shouldLoadEnvFiles(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === 'development' || nodeEnv === 'test';
}

if (shouldLoadEnvFiles()) {
  const rootDir = resolve(__dirname, '../../../..');
  loadEnvFile(resolve(rootDir, '.env'));
  loadEnvFile(resolve(rootDir, '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));
  loadEnvFile(resolve(process.cwd(), '.env.local'));
}
