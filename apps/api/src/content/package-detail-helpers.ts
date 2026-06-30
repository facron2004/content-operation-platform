import type {
  ContentPackage,
  OperationCard,
  RecommendPackageItem,
  SalesSnapshot
} from '@content/shared';
import { latestSnapshotsByPackage } from '@content/shared';
import type { DataSourceService } from './data-source.service';
import { toOperationCard } from '../domain/operation-rules';

/**
 * 从数据源解析套餐 + 最新快照。
 * 优先读取实时数据源,确保文案生成能拿到套餐详情与当前售价等最新字段。
 */
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

/** 将推荐套餐列表转换为 packageId → OperationCard 映射 */
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
