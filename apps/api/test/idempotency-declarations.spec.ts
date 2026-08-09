import { describe, expect, it } from 'vitest';
import { CampaignController } from '../src/campaign/campaign.controller';
import { CommunityController } from '../src/community/community.controller';
import { DistributionTaskCommandController } from '../src/distribution-task/distribution-task-command.controller';
import { GmvController } from '../src/gmv/gmv.controller';
import { REQUIRE_IDEMPOTENCY_METADATA } from '../src/idempotency/require-idempotency.decorator';

function requiredOperation(controller: { prototype: object }, method: string): unknown {
  const handler = Reflect.get(controller.prototype, method) as unknown;
  if (typeof handler !== 'function') return undefined;
  return Reflect.getMetadata(REQUIRE_IDEMPOTENCY_METADATA, handler);
}

describe('required idempotency route declarations', () => {
  it('declares task creation and publish operations explicitly', () => {
    expect(requiredOperation(DistributionTaskCommandController, 'create')).toBe('create-task');
    expect(requiredOperation(DistributionTaskCommandController, 'batchCreate')).toBe(
      'batch-create-tasks'
    );
    expect(requiredOperation(DistributionTaskCommandController, 'publish')).toBe('publish-task');
  });

  it('declares campaign start, community import, and GMV backfill explicitly', () => {
    expect(requiredOperation(CampaignController, 'start')).toBe('campaign-start');
    expect(requiredOperation(CommunityController, 'import')).toBe('batch-import');
    expect(requiredOperation(GmvController, 'refresh')).toBe('data-backfill');
  });

  it('does not misclassify unrelated writes as required operations', () => {
    expect(requiredOperation(CampaignController, 'create')).toBeUndefined();
    expect(requiredOperation(CampaignController, 'pause')).toBeUndefined();
    expect(requiredOperation(CampaignController, 'complete')).toBeUndefined();
    expect(requiredOperation(CommunityController, 'create')).toBeUndefined();
    expect(requiredOperation(GmvController, 'invalidateCache')).toBeUndefined();
  });
});
