import type { ContentPackage, SalesSnapshot } from '@content/shared';
import type { DataSourceService } from './data-source.service';

/**
 * 动态兜底日期：取当前时间往前推 1 天，避免硬编码过期日期。
 * 用于 promotion score 计算时没有传入日期的场景。
 */
export function getFallbackDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

/** 格式化日期为 YYYY-MM-DD（本地时间） */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 按 packageId 取每个套餐的最新快照 */
export function latestSnapshotsByPackage(snapshots: SalesSnapshot[]): Map<string, SalesSnapshot> {
  const result = new Map<string, SalesSnapshot>();
  for (const snapshot of snapshots) {
    const previous = result.get(snapshot.packageId);
    if (
      !previous ||
      new Date(snapshot.snapshotTime).getTime() > new Date(previous.snapshotTime).getTime()
    ) {
      result.set(snapshot.packageId, snapshot);
    }
  }
  return result;
}

/**
 * 从数据源解析套餐 + 最新快照。
 * 优先读取实时数据源，确保文案生成能拿到套餐详情与当前售价等最新字段。
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

/** 从快照列表中取指定 packageId 的最新快照（简化版） */
export function latestSnapshotForPackage(
  snapshots: SalesSnapshot[],
  packageId: string
): SalesSnapshot | null {
  let best: SalesSnapshot | null = null;
  let bestTime = 0;
  for (const s of snapshots) {
    if (s.packageId !== packageId) continue;
    const t = new Date(s.snapshotTime).getTime();
    if (Number.isFinite(t) && t > bestTime) {
      best = s;
      bestTime = t;
    }
  }
  return best;
}
