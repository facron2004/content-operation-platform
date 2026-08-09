import { Inject, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { describeError } from '@content/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  burnPasswordVerifyCost,
  isLegacyHash,
  verifyLegacyPassword,
  verifyPassword
} from './auth-utils';
import * as repo from '../repositories/user.repository';

@Injectable()
export class UserAuthService {
  private readonly logger = new Logger(UserAuthService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async validateUser(username: string, password: string) {
    const row = await repo.findUserByUsername(this.prisma, username);
    if (!row || Number(row.isActive) !== 1) {
      await burnPasswordVerifyCost(password);
      return null;
    }
    const isLegacy = isLegacyHash(row.passwordHash);
    const passwordOk = isLegacy
      ? verifyLegacyPassword(password, row.passwordHash)
      : await verifyPassword(password, row.passwordHash);
    if (!passwordOk) return null;
    if (isLegacy) {
      const h = await bcrypt.hash(password, 10);
      try {
        await repo.updatePasswordHash(this.prisma, row.userId, h);
        this.logger.log(`已将用户 ${row.username} 的旧密码哈希升级为 bcrypt`);
      } catch (error: unknown) {
        this.logger.warn(
          `用户 ${row.userId} 的旧密码哈希升级失败，将在下次登录重试: ${describeError(error)}`
        );
      }
    }
    const bindings = await repo.findRolesByUserId(this.prisma, row.userId);
    try {
      await repo.updateLastLogin(this.prisma, row.userId);
    } catch (error: unknown) {
      this.logger.warn(`用户 ${row.userId} 的 lastLoginAt 写入失败: ${describeError(error)}`);
    }
    return {
      userId: row.userId,
      username: row.username,
      isActive: true,
      tokenVersion: Number(row.tokenVersion ?? 0),
      tenantId: await repo.findTenantId(this.prisma, row.userId),
      roles: bindings.map((b) => ({
        role: b.role,
        scopeType: b.scopeType ?? undefined,
        scopeId: b.scopeId ?? undefined
      }))
    };
  }
}
