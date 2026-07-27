-- AlterTable
ALTER TABLE "ContentPackage" ADD COLUMN "grossProfitFen" BIGINT;
ALTER TABLE "ContentPackage" ADD COLUMN "originalPriceFen" BIGINT;
ALTER TABLE "ContentPackage" ADD COLUMN "salePriceFen" BIGINT;
ALTER TABLE "ContentPackage" ADD COLUMN "temporarySalePriceFen" BIGINT;
ALTER TABLE "ContentPackage" ADD COLUMN "welfarePriceFen" BIGINT;

-- AlterTable
ALTER TABLE "CopyPerformance" ADD COLUMN "gmvFen" BIGINT;

-- AlterTable
ALTER TABLE "DailyMetrics" ADD COLUMN "gmvBonusFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "gmvCardFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "gmvOnlineFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "gmvWalletFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "paidAmountBonusFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "paidAmountWalletFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "totalGmvFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "totalRefundFen" BIGINT;
ALTER TABLE "DailyMetrics" ADD COLUMN "totalVerifyFen" BIGINT;

-- AlterTable
ALTER TABLE "MarketingCampaign" ADD COLUMN "budgetFen" BIGINT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "targetGmvFen" BIGINT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "totalGmvFen" BIGINT;
ALTER TABLE "Member" ADD COLUMN "walletBalanceFen" BIGINT;

-- AlterTable
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "paidAmountBonusFen" BIGINT;
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "paidAmountCardFen" BIGINT;
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "paidAmountOnlineFen" BIGINT;
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "paidAmountWalletFen" BIGINT;
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "refundAmountFen" BIGINT;
ALTER TABLE "MerchantDailyMetrics" ADD COLUMN "verifyAmountFen" BIGINT;

-- AlterTable
ALTER TABLE "OrderHeader" ADD COLUMN "orderAmountFen" BIGINT;
ALTER TABLE "OrderHeader" ADD COLUMN "paidAmountBonusFen" BIGINT;
ALTER TABLE "OrderHeader" ADD COLUMN "paidAmountCardFen" BIGINT;
ALTER TABLE "OrderHeader" ADD COLUMN "paidAmountFen" BIGINT;
ALTER TABLE "OrderHeader" ADD COLUMN "paidAmountWalletFen" BIGINT;
ALTER TABLE "OrderHeader" ADD COLUMN "refundAmountFen" BIGINT;
ALTER TABLE "OrderHeader" ADD COLUMN "verifyAmountFen" BIGINT;

-- AlterTable
ALTER TABLE "PackageSalesDaily" ADD COLUMN "salesAmountFen" BIGINT;

-- AlterTable
ALTER TABLE "SalesSnapshot" ADD COLUMN "gmvFen" BIGINT;
ALTER TABLE "SalesSnapshot" ADD COLUMN "paidAmountBonusFen" BIGINT;
ALTER TABLE "SalesSnapshot" ADD COLUMN "paidAmountCardFen" BIGINT;
ALTER TABLE "SalesSnapshot" ADD COLUMN "paidAmountFen" BIGINT;
ALTER TABLE "SalesSnapshot" ADD COLUMN "paidAmountOnlineFen" BIGINT;
ALTER TABLE "SalesSnapshot" ADD COLUMN "paidAmountWalletFen" BIGINT;
ALTER TABLE "SalesSnapshot" ADD COLUMN "refundAmountFen" BIGINT;
ALTER TABLE "SalesSnapshot" ADD COLUMN "verifyAmountFen" BIGINT;

-- AlterTable
ALTER TABLE "TaskPerformanceDaily" ADD COLUMN "gmvFen" BIGINT;
ALTER TABLE "TaskPerformanceDaily" ADD COLUMN "refundAmountFen" BIGINT;
ALTER TABLE "TaskPerformanceDaily" ADD COLUMN "verifyAmountFen" BIGINT;

