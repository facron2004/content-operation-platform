import { describe, expect, it } from 'vitest';
import type { RecommendPackageItem } from '@content/shared';
import {
  GENERATE_PACKAGE_PICKER_MAX_PAGES,
  mergeGeneratePackagePages,
  resolveGeneratePackagePageCount
} from './generate-package-picker';

const pkg = (packageId: string) => ({ packageId }) as RecommendPackageItem;

describe('Generate package picker pagination', () => {
  it('derives a bounded page count from API pagination', () => {
    expect(resolveGeneratePackagePageCount(3, 500, 200)).toBe(3);
    expect(resolveGeneratePackagePageCount(undefined, 401, 200)).toBe(3);
    expect(resolveGeneratePackagePageCount(999, 999, 200)).toBe(GENERATE_PACKAGE_PICKER_MAX_PAGES);
  });

  it('merges pages in ranked order without duplicate package options', () => {
    expect(
      mergeGeneratePackagePages([
        [pkg('p1'), pkg('p2')],
        [pkg('p2'), pkg('p3')]
      ])
    ).toEqual([pkg('p1'), pkg('p2'), pkg('p3')]);
  });
});
