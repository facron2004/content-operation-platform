import type {
  ContentPackage,
  OperationCard,
  RecommendPackageItem,
  SalesSnapshot
} from '@content/shared';
import { latestSnapshotsByPackage } from '@content/shared';
import { toOperationCard } from '../domain/operation-rules';
import type { DataSourceService } from './data-source.service';

export async function resolvePackageAndSnapshot(
  packageId: string,
  dataSource: DataSourceService
): Promise<{ pkg: ContentPackage; snapshot: SalesSnapshot; snapshots: SalesSnapshot[] } | null> {
  const dataset = await dataSource.loadDataset();
  const pkg = dataset.packages.find((item) => item.packageId === packageId);
  const packageSnapshots = dataset.snapshots.filter((item) => item.packageId === packageId);
  const snapshot = latestSnapshotsByPackage(packageSnapshots).get(packageId);
  return pkg && snapshot ? { pkg, snapshot, snapshots: packageSnapshots } : null;
}

export function buildOperationCardMap(
  packages: RecommendPackageItem[]
): Map<string, OperationCard> {
  return new Map<string, OperationCard>(
    packages
      .filter((pkg) => pkg.scoreBreakdown)
      .map((pkg) => [
        pkg.packageId,
        toOperationCard(pkg, pkg.scoreBreakdown!, pkg.operationTags ?? [])
      ])
  );
}
