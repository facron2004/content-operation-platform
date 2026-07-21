export * from './math';
export * from './dates';
export * from './errors';
export * from './pagination';
export * from './utils-format';
export * from './utils-contracts';
export function latestSnapshotsByPackage<T extends { packageId: string; snapshotTime: string }>(
  snapshots: T[]
): Map<string, T> {
  const result = new Map<string, T>();
  for (const snapshot of snapshots) {
    const previous = result.get(snapshot.packageId);
    if (
      !previous ||
      new Date(snapshot.snapshotTime).getTime() > new Date(previous.snapshotTime).getTime()
    )
      result.set(snapshot.packageId, snapshot);
  }
  return result;
}
