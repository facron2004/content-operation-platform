-- AlterTable: add single-count refund/verify columns to MerchantDailyMetrics
-- so the unified 单数口径 (退款率/核销率 = 单数比) read queries can aggregate
-- stored per-(merchant, day) counts instead of recomputing from OrderHeader.
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "refundCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "verifyCount" INTEGER NOT NULL DEFAULT 0;
