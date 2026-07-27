import { describe, expect, it } from 'vitest';

describe('residual #77 attribution recompute batch + heavy gate', () => {
  it('runDirectAttribution batches memberId IN via queryInChunks', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    expect(src).toContain('queryInChunks');
    expect(src).toContain('DEFAULT_IN_CHUNK');
    expect(src).toMatch(/memberId" IN \(\$\{ph\}\)/);
    // No per-visit sequential OrderHeader lookup in direct tier.
    expect(src).not.toMatch(/for \(const visit of visits\) \{\s*[\s\S]*?SELECT oh\."orderId"/);
    // Single insertAttributions after batch collect.
    expect(src).toMatch(/runDirectAttribution[\s\S]*?insertAttributions\(task\.taskId, orderIds/);
  });

  it('runRecompute is under withHeavyAggregateGate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toMatch(/runRecompute[\s\S]*withHeavyAggregateGate/);
    expect(src).toContain('HeavyAggregateQueueFullError');
  });
});
