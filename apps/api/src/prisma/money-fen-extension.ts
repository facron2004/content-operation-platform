/**
 * VNext 金额精度治理（PRD §7.4）Phase 3 双写扩展。
 *
 * 拦截所有写操作（create/update/upsert/createMany/updateMany），在写入前根据
 * MONEY_FIELDS 映射，从遗留 Float 金额字段（元）派生 *Fen 分整数列（BigInt）一并写入。
 * 仅对 data 中出现的金额字段计算 Fen，局部更新不会误清空已存在的 *Fen。
 *
 * 该扩展覆盖全部 ORM 写路径（API 服务 + 复用 PrismaService 的脚本），
 * 对 $executeRaw* 原生 SQL 不生效 —— 原生 SQL 写路径需在各 SQL 构造处显式调用
 * fenColumnsForRawWrite（见 money-fen.ts）。
 */
import { MONEY_FIELDS, withMoneyFen } from '@content/shared';

function applyMoneyFen(model: string, data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((d) => withMoneyFen(model, d as Record<string, unknown>));
  }
  return withMoneyFen(model, data as Record<string, unknown>);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const moneyFenExtension: any = {
  query: {
    $allModels: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async $allOperations({ model, operation, args, query }: any) {
        if (!args || typeof args !== 'object') return query(args);
        if (!MONEY_FIELDS[model]) return query(args);
        if (operation === 'upsert') {
          if (args.create) args.create = applyMoneyFen(model, args.create);
          if (args.update) args.update = applyMoneyFen(model, args.update);
        } else if (args.data !== undefined) {
          args.data = applyMoneyFen(model, args.data);
        }
        return query(args);
      }
    }
  }
};
