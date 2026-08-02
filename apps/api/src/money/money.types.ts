/** Shared money truth types — OrderHeader source, DailyMetrics cache, never SalesSnapshot. */

export type MoneyDataSource = 'OrderHeader' | 'DailyMetrics' | 'empty';

export type MoneyDayTotals = {
  date: string;
  totalGmvFen: bigint | null;
  paidOrderCount: number;
  dataSource: MoneyDataSource;
  emptyReason?: string;
};

export type MoneyPrisma = {
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  dailyMetrics: {
    findUnique: (args: {
      where: { date: string };
      select?: {
        totalGmvFen?: boolean;
        paidOrderCount?: boolean;
        date?: boolean;
        gmvOnlineFen?: boolean;
        gmvWalletFen?: boolean;
      };
    }) => Promise<{
      date?: string;
      totalGmvFen: bigint | null;
      paidOrderCount: number;
      gmvOnlineFen?: bigint | null;
      gmvWalletFen?: bigint | null;
    } | null>;
  };
};
