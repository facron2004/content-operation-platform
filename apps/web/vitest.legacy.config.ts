import { defineConfig } from 'vitest/config';

/**
 * Source-string pins remain runnable during the migration to behavior tests.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/residual-*-hardening.spec.ts',
      'src/features/campaigns/composables/useCampaignDetail.spec.ts',
      'src/features/task-center/composables/useTaskDetail.spec.ts'
    ]
  }
});
