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
    /* .env 覆盖进程残留旧值（watch/restart / 复用终端环境变量） */ process.env[
      trimmed.slice(0, eq).trim()
    ] = parseEnvValue(trimmed.slice(eq + 1));
  }
};
const rootDir = resolve(__dirname, '../../../..');
loadEnvFile(resolve(rootDir, '.env'));
loadEnvFile(resolve(rootDir, '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));
