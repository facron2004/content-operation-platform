/** Package-level sales enrichment loaders for zero-sales views. */
import { PrismaService } from '../prisma/prisma.service';
import { queryInChunks } from '../common/sql-chunk';

export async function loadGmvByPackage(
  prisma: PrismaService,
  packageIds: string[],
  fromDate: string
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!packageIds.length) return m;
  const rows = await queryInChunks(packageIds, async (chunk) => {
    return (await prisma.$queryRawUnsafe(
      `SELECT "packageId", COALESCE(SUM("salesAmountFen"), 0) / 100.0 AS "gmv30d" FROM "PackageSalesDaily" WHERE "packageId" IN (${chunk.map(() => '?').join(',')}) AND "date" >= ? AND "salesQty" > 0 GROUP BY "packageId"`,
      ...chunk,
      fromDate
    )) as Array<{ packageId: string; gmv30d: number }>;
  });
  for (const g of rows) m.set(g.packageId, Number(g.gmv30d));
  return m;
}

/**
 * Last sale date per package. Optional fromDate bounds history scan — zero-sales
 * merchants only need last sale inside the stale window (+ε); unbounded MAX over
 * full PackageSalesDaily history grows with retention.
 */
export async function loadLastSalesByPackage(
  prisma: PrismaService,
  packageIds: string[],
  fromDate?: string
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!packageIds.length) return m;
  const rows = await queryInChunks(packageIds, async (chunk) => {
    const dateBound = fromDate ? ` AND s."date" >= ?` : '';
    const params: string[] = [...chunk];
    if (fromDate) params.push(fromDate);
    return (await prisma.$queryRawUnsafe(
      `SELECT s."packageId", MAX(s."date") AS "lastSalesDate" FROM "PackageSalesDaily" s WHERE s."packageId" IN (${chunk.map(() => '?').join(',')}) AND s."salesQty" > 0${dateBound} GROUP BY s."packageId"`,
      ...params
    )) as Array<{ packageId: string; lastSalesDate: string }>;
  });
  for (const r of rows) m.set(r.packageId, r.lastSalesDate);
  return m;
}
