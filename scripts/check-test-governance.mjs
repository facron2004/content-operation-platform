import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const API_TEST_ROOT = join(ROOT, 'apps', 'api', 'test');
const WEB_TEST_ROOT = join(ROOT, 'apps', 'web', 'src');
const API_STATIC_FILES = new Set([
  'apps/api/test/architecture-contracts.spec.ts',
  'apps/api/test/throttler-named-buckets.spec.ts'
]);
const WEB_STATIC_FILES = new Set([
  'apps/web/src/features/campaigns/composables/useCampaignDetail.spec.ts',
  'apps/web/src/features/task-center/composables/useTaskDetail.spec.ts'
]);
const STATIC_TARGET = 188;

export function getStaticPinBudgetError(count) {
  return count > STATIC_TARGET
    ? `static pin count exceeds target ${STATIC_TARGET}: ${count}`
    : null;
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const name of readdirSync(directory)) {
    const filePath = join(directory, name);
    const stat = statSync(filePath);
    if (stat.isDirectory()) files.push(...walk(filePath));
    else if (name.endsWith('.spec.ts')) files.push(filePath);
  }
  return files;
}

function relativeSlash(filePath) {
  return relative(ROOT, filePath).replaceAll('\\', '/');
}

const apiFiles = walk(API_TEST_ROOT).map(relativeSlash);
const webFiles = walk(WEB_TEST_ROOT).map(relativeSlash);
const apiResidual = apiFiles.filter((filePath) =>
  /\/test\/residual-\d+-hardening\.spec\.ts$/.test(filePath)
);
const webResidual = webFiles.filter((filePath) =>
  /\/src\/.*\/residual-\d+-hardening\.spec\.ts$/.test(filePath)
);
const apiStaticFiles = [
  ...new Set([...apiResidual, ...apiFiles.filter((filePath) => API_STATIC_FILES.has(filePath))])
];
const webStaticFiles = [
  ...new Set([...webResidual, ...webFiles.filter((filePath) => WEB_STATIC_FILES.has(filePath))])
];

const apiUnitConfig = readFileSync(join(ROOT, 'apps', 'api', 'vitest.unit.config.ts'), 'utf8');
const apiLegacyConfig = readFileSync(join(ROOT, 'apps', 'api', 'vitest.legacy.config.ts'), 'utf8');
const webConfig = readFileSync(join(ROOT, 'apps', 'web', 'vitest.config.ts'), 'utf8');
const webLegacyConfig = readFileSync(join(ROOT, 'apps', 'web', 'vitest.legacy.config.ts'), 'utf8');
const errors = [];

function requireText(content, text, filePath) {
  if (!content.includes(text)) errors.push(`${filePath} is missing ${text}`);
}

requireText(apiUnitConfig, "'test/residual-*-hardening.spec.ts'", 'apps/api/vitest.unit.config.ts');
requireText(
  apiLegacyConfig,
  "'test/residual-*-hardening.spec.ts'",
  'apps/api/vitest.legacy.config.ts'
);
requireText(webConfig, "'src/**/residual-*-hardening.spec.ts'", 'apps/web/vitest.config.ts');
requireText(
  webLegacyConfig,
  "'src/**/residual-*-hardening.spec.ts'",
  'apps/web/vitest.legacy.config.ts'
);

for (const filePath of API_STATIC_FILES) {
  const configPath = filePath.replace(/^apps\/api\//, '');
  requireText(apiUnitConfig, `'${configPath}'`, 'apps/api/vitest.unit.config.ts');
  requireText(apiLegacyConfig, `'${configPath}'`, 'apps/api/vitest.legacy.config.ts');
}
for (const filePath of WEB_STATIC_FILES) {
  const configPath = filePath.replace(/^apps\/web\//, '');
  requireText(webConfig, `'${configPath}'`, 'apps/web/vitest.config.ts');
  requireText(webLegacyConfig, `'${configPath}'`, 'apps/web/vitest.legacy.config.ts');
}

const allStatic = apiStaticFiles.length + webStaticFiles.length;
const staticPinBudgetError = getStaticPinBudgetError(allStatic);
if (staticPinBudgetError) errors.push(staticPinBudgetError);
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      api: {
        staticPins: apiStaticFiles.length,
        behaviorSpecs: apiFiles.length - apiStaticFiles.length
      },
      web: {
        staticPins: webStaticFiles.length,
        behaviorSpecs: webFiles.length - webStaticFiles.length
      },
      totalStaticPins: allStatic,
      target: STATIC_TARGET,
      remainingReduction: Math.max(0, allStatic - STATIC_TARGET),
      legacySuite: 'configured-and-guarded'
    },
    null,
    2
  )
);
