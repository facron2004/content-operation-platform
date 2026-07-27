import { describe, expect, it } from 'vitest';
import { newEntityId } from '../src/common/id';

describe('newEntityId', () => {
  it('prefixes when requested and stays unique across calls', () => {
    const a = newEntityId('task');
    const b = newEntityId('task');
    expect(a.startsWith('task_')).toBe(true);
    expect(b.startsWith('task_')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('omits prefix when not provided', () => {
    const id = newEntityId();
    expect(id).toMatch(/^[a-z0-9]+-[a-f0-9]{12}$/);
  });
});
