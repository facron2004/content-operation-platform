/** Shared money truth types — OrderHeader source, DailyMetrics cache, never SalesSnapshot. */

export type MoneyDataSource = 'OrderHeader' | 'DailyMetrics' | 'empty';

export type MoneyDayTotals = {
  date: string;
  totalGmv: number;
  paidOrderCount: number;
  dataSource: MoneyDataSource;
  emptyReason?: string;
};

export type MoneyPrisma = {
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  dailyMetrics: {
    findUnique: (args: { where: { date: string } }) => Promise<{
      date: string;
      totalGmv: number;
      paidOrderCount: number;
      gmvOnline?: number;
      gmvWallet?: number;
    } | null>;
  };
};
