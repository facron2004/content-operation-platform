import type { ContentPackage, SalesSnapshot } from '@content/shared';

export interface ContentDataset {
  packages: ContentPackage[];
  snapshots: SalesSnapshot[];
}

export interface LoadDatasetOptions {
  forceRefresh?: boolean;
}
