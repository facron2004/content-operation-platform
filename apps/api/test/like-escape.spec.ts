import { describe, expect, it } from 'vitest';
import {
  escapeLike,
  jsonArrayIdLike,
  likeContains,
  sanitizeContainsSearch
} from '../src/common/like-escape';

describe('like-escape', () => {
  it('escapes percent and underscore wildcards', () => {
    expect(escapeLike('100%_off')).toBe('100\\%\\_off');
  });

  it('escapes backslashes first', () => {
    expect(escapeLike('a\\b%c')).toBe('a\\\\b\\%c');
  });

  it('builds contains pattern', () => {
    expect(likeContains('a_b')).toBe('%a\\_b%');
  });

  it('sanitizeContainsSearch strips Prisma-unsafe wildcards', () => {
    expect(sanitizeContainsSearch('  foo%bar_baz\\qux  ')).toBe('foo bar baz qux');
    expect(sanitizeContainsSearch('%%%')).toBeUndefined();
    expect(sanitizeContainsSearch(undefined)).toBeUndefined();
  });

  it('jsonArrayIdLike builds quoted-token LIKE with ESCAPE', () => {
    const m = jsonArrayIdLike('"areaIds"', 'area-1');
    expect(m).toEqual({
      sql: `"areaIds" LIKE ? ESCAPE '\\'`,
      param: `%"area-1"%`
    });
  });

  it('jsonArrayIdLike rejects ids that would break the quoted pattern', () => {
    expect(jsonArrayIdLike('"areaIds"', 'a"b')).toBeNull();
    expect(jsonArrayIdLike('"areaIds"', 'a\\b')).toBeNull();
    expect(jsonArrayIdLike('"areaIds"', '')).toBeNull();
  });

  it('jsonArrayIdLike escapes wildcards inside ids', () => {
    const m = jsonArrayIdLike('"merchantIds"', 'm%1_x');
    expect(m?.param).toBe(`%"m\\%1\\_x"%`);
  });
});
