import type { ContentPackage, SalesSnapshot } from '@content/shared';

export interface ContentDataset {
  packages: ContentPackage[];
  snapshots: SalesSnapshot[];
  /** Only true when every external page was read without a cap or partial failure. */
  isComplete?: boolean;
}

export interface LoadDatasetOptions {
  forceRefresh?: boolean;
}
