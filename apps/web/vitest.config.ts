import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    exclude: [
      'src/**/residual-*-hardening.spec.ts',
      'src/features/campaigns/composables/useCampaignDetail.spec.ts',
      'src/features/task-center/composables/useTaskDetail.spec.ts'
    ]
  }
});
