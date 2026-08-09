/** Money recomputation phase for GMV refresh. */
import { Logger } from '@nestjs/common';
import { recomputeDailyMetricsRange, recomputePackageSalesAmountRange } from '../money';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { PrismaService } from '../prisma/prisma.service';

export async function runMoneyRecomputes(params: {
  prisma: PrismaService;
  getMerchantSalesService: () => Promise<MerchantSalesService | null>;
  invalidateCache: () => void;
  startDate: string;
  endDate: string;
  logger: Logger;
}): Promise<string[]> {
  const { prisma, getMerchantSalesService, invalidateCache, startDate, endDate, logger } = params;
  const recomputeWarnings: string[] = [];

  try {
    await recomputeDailyMetricsRange(prisma, startDate, endDate);
  } catch (e) {
    const msg = `DailyMetrics recompute failed: ${(e as Error).message}`;
    logger.warn(msg);
    recomputeWarnings.push(msg);
  }
  try {
    const psd = await recomputePackageSalesAmountRange(prisma, startDate, endDate);
    logger.log(
      `PSD salesAmount recompute [${startDate}→${endDate}] rows=${psd.rowsUpserted} coverage=${(psd.coverageRatio * 100).toFixed(1)}%`
    );
  } catch (e) {
    const msg = `PackageSalesDaily salesAmount recompute failed: ${(e as Error).message}`;
    logger.warn(msg);
    recomputeWarnings.push(msg);
  }

  try {
    const ms = await getMerchantSalesService();
    if (ms) await ms.recomputeRange(startDate, endDate);
  } catch (e) {
    const msg = `merchant-sales recomputeRange failed: ${(e as Error).message}`;
    logger.warn(msg);
    recomputeWarnings.push(msg);
  }
  // Invalidate only after all money writers finish so cold GMV/overview/refund
  // loads do not stampede mid MDM DELETE+INSERT (residual #85).
  invalidateCache();
  return recomputeWarnings;
}
