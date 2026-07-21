import { safeRatio } from '@content/shared';
/** OrderHeader GMV: online cash + wallet (bonus never included). */ export const SQL_GMV_OH = `"paidAmount" + "paidAmountWallet"`;
/** SalesSnapshot / MerchantDailyMetrics GMV: online + wallet (bonus never included). */ export const SQL_GMV_SS = `"paidAmountOnline" + "paidAmountWallet"`;
export const gmvFromParts = (online: number, wallet: number): number => online + wallet;
export const rateAgainstGmv = (amount: number, gmv: number): number => safeRatio(amount, gmv);
