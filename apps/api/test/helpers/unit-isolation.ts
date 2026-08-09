import { afterEach, beforeEach } from 'vitest';

/**
 * Unit tests share one Vitest worker. Keep process.env changes local to each
 * test so configuration-focused cases cannot poison later behavior tests.
 */
let environmentBeforeTest: NodeJS.ProcessEnv | null = null;

beforeEach(() => {
  environmentBeforeTest = { ...process.env };
});

afterEach(() => {
  if (!environmentBeforeTest) return;
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, environmentBeforeTest);
  environmentBeforeTest = null;
});
