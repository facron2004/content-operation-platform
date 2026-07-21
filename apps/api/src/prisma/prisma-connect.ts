import type { Logger } from '@nestjs/common';
import { describeError } from '@content/shared';
type PrismaLike = { $queryRawUnsafe: (sql: string) => Promise<unknown> };
export async function connectPrismaOnInit(
  prisma: PrismaLike,
  logger: Logger,
  getPrismaErrorCode: (error: unknown) => string | undefined,
  resolveDevDbPath: () => { finalDbPath: string }
): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    logger.log('Database connection successful');
  } catch (error: unknown) {
    logger.error(`Database connection failed: ${describeError(error)}`);
    const prismaCode = getPrismaErrorCode(error);
    if (prismaCode === 'P1003') logger.error('Database file does not exist or is not accessible');
    else if (prismaCode === 'P2021')
      logger.error('Database table does not exist, migrations may be required');
    logger.error(`Database path: ${resolveDevDbPath().finalDbPath}`);
    throw error;
  }
}
