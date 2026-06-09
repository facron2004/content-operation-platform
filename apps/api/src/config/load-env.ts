import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const parseEnvValue = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex < 1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = parseEnvValue(trimmed.slice(equalsIndex + 1));
    // .env 文件用于本地开发的显式配置：应覆盖同一进程里残留的旧值
    //（例如 watch/restart 或复用终端环境变量的场景）
    process.env[key] = value;
  }
};

const rootDir = resolve(__dirname, '../../../..');
loadEnvFile(resolve(rootDir, '.env'));
loadEnvFile(resolve(rootDir, '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));
