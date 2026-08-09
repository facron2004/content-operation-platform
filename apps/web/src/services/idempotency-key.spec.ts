import { describe, expect, it } from 'vitest';
import {
  buildBusinessIntentKey,
  createIntentVersion,
  resolveSubmissionIntent
} from './idempotency-key';

describe('business idempotency keys', () => {
  it('builds resource-version keys for publish and campaign start', () => {
    expect(buildBusinessIntentKey('publish-task', 'task-1', 'v7')).toBe('publish-task:task-1:v7');
    expect(buildBusinessIntentKey('campaign-start', 'campaign-1', 'v3')).toBe(
      'campaign-start:campaign-1:v3'
    );
  });

  it('reuses a submission key for the same payload and rotates it after a change', () => {
    const first = resolveSubmissionIntent('create-task', { title: 'A', priority: 1 });
    const retry = resolveSubmissionIntent('create-task', { title: 'A', priority: 1 }, first);
    const changed = resolveSubmissionIntent('create-task', { title: 'B', priority: 1 }, retry);

    expect(retry.key).toBe(first.key);
    expect(changed.key).not.toBe(first.key);
    expect(first.key).toMatch(/^create-task:/);
  });

  it('creates header-safe intent versions', () => {
    expect(createIntentVersion()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
