import { Test } from '@nestjs/testing';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureAppMiddleware } from '../src/bootstrap-middleware';
import { PrismaService } from '../src/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../src/auth/public.decorator';
import { ROLES_KEY } from '../src/user-access/role.decorator';
import { PERMISSIONS_KEY } from '../src/user-access/iam/require-permissions.decorator';
import { AUTH_DECLARATION_KEY } from '../src/user-access/iam/route-auth.decorator';
import { IamShadowService } from '../src/user-access/iam/iam-shadow.service';

describe('IAM API', () => {
  async function boot() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureAppMiddleware(app);
    await app.init();
    return app;
  }

  async function seedMerchant(
    app: Awaited<ReturnType<typeof boot>>,
    merchantId: string,
    areaId: string
  ) {
    await app.get(PrismaService).merchant.upsert({
      where: { merchantId },
      create: { merchantId, merchantName: merchantId, areaId, areaName: areaId },
      update: { areaId, areaName: areaId }
    });
  }

  it('requires an explicit auth declaration for every HTTP route', async () => {
    const app = await boot();
    try {
      const missing: string[] = [];
      let routeCount = 0;
      const modules = app.get(ModulesContainer);
      for (const moduleRef of modules.values()) {
        for (const wrapper of moduleRef.controllers.values()) {
          const controller = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
          if (!controller || !controller.name.endsWith('Controller')) continue;
          if (Reflect.getMetadata(PATH_METADATA, controller) === undefined) continue;
          for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
            if (methodName === 'constructor') continue;
            const handler = controller.prototype[methodName] as (...args: never[]) => unknown;
            if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
            routeCount += 1;
            const declaration =
              Reflect.getMetadata(AUTH_DECLARATION_KEY, handler) ??
              Reflect.getMetadata(IS_PUBLIC_KEY, handler) ??
              Reflect.getMetadata(ROLES_KEY, handler) ??
              Reflect.getMetadata(PERMISSIONS_KEY, handler) ??
              Reflect.getMetadata(AUTH_DECLARATION_KEY, controller) ??
              Reflect.getMetadata(IS_PUBLIC_KEY, controller) ??
              Reflect.getMetadata(ROLES_KEY, controller) ??
              Reflect.getMetadata(PERMISSIONS_KEY, controller);
            if (declaration === undefined) missing.push(`${controller.name}.${methodName}`);
          }
        }
      }
      // The plan's 145-route baseline has grown with the IAM endpoints; every
      // current route must still carry an explicit declaration.
      expect(routeCount).toBeGreaterThanOrEqual(145);
      expect(missing).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('reads seeded tenant access and projects legacy user writes', async () => {
    const app = await boot();
    try {
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const token = session.body.access_token as string;

      const roles = await request(app.getHttpServer())
        .get('/api/iam/roles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(roles.body.some((role: { code: string }) => role.code === 'admin')).toBe(true);

      const permissions = await request(app.getHttpServer())
        .get('/api/iam/permissions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        permissions.body.some(
          (permission: { code: string }) => permission.code === 'iam:users:access'
        )
      ).toBe(true);

      const access = await request(app.getHttpServer())
        .get('/api/iam/users/admin/access')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(access.body.tenantId).toBe('tenant_default');
      expect(access.body.roles).toContain('admin');
      expect(access.body.permissions).toContain('iam:users:access');

      const username = `iam_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ username, password: 'iam-test-pass', roles: [{ role: 'executor' }] })
        .expect(201);
      const userId = created.body.userId as string;

      const projected = await request(app.getHttpServer())
        .get(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(projected.body.roles).toContain('executor');
      expect(projected.body.roleAssignments[0].scopeType).toBe('NONE');

      const replaced = await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          assignments: [{ roleCode: 'executor', scopeType: 'NONE' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(200);
      expect(replaced.body.roles).toContain('executor');

      const areaId = `primary-area-${Date.now()}`;
      await seedMerchant(app, `primary-merchant-${Date.now()}`, areaId);
      const region = await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `primary_region_${Date.now()}`,
          name: '主组织回归区域',
          unitType: 'REGION',
          parentId: 'org_hq',
          areaId
        })
        .expect(201);
      const multiMembership = await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          assignments: [{ roleCode: 'executor', scopeType: 'NONE' }],
          organizationUnitIds: ['org_hq', region.body.unitId],
          primaryOrgUnitId: region.body.unitId
        })
        .expect(200);
      expect(
        multiMembership.body.memberships.filter(
          (membership: { isPrimary: boolean }) => membership.isPrimary
        )
      ).toHaveLength(1);
      expect(multiMembership.body.primaryOrgUnitId).toBe(region.body.unitId);

      const preservedMembership = await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          assignments: [{ roleCode: 'executor', scopeType: 'NONE' }],
          primaryOrgUnitId: region.body.unitId
        })
        .expect(200);
      expect(
        preservedMembership.body.memberships.filter(
          (membership: { isPrimary: boolean }) => membership.isPrimary
        )
      ).toHaveLength(1);
      expect(preservedMembership.body.primaryOrgUnitId).toBe(region.body.unitId);

      const legacy = await request(app.getHttpServer())
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(legacy.body.roles[0].role).toBe('executor');

      await app.get(PrismaService).appUser.update({
        where: { userId },
        data: { isActive: 0 }
      });
      const inactiveAccess = await request(app.getHttpServer())
        .get(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(inactiveAccess.body.roles).toContain('executor');
    } finally {
      await app.close();
    }
  });

  it('keeps legacy user management reads and writes inside the actor tenant', async () => {
    const app = await boot();
    try {
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const token = session.body.access_token as string;
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tenantId = `tenant-legacy-isolation-${suffix}`;
      const username = `foreign_${suffix}`;
      const foreignUserId = `user-foreign-${suffix}`;
      const prisma = app.get(PrismaService);

      await prisma.tenant.create({
        data: { tenantId, tenantKey: tenantId, name: 'Legacy isolation tenant' }
      });
      await prisma.appUser.create({
        data: {
          userId: foreignUserId,
          username,
          passwordHash: 'not-a-login-hash',
          displayName: 'Foreign tenant user',
          tenantId
        }
      });

      const list = await request(app.getHttpServer())
        .get('/api/users')
        .query({ keyword: username })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(list.body).toMatchObject({ total: 0, data: [] });

      await request(app.getHttpServer())
        .get(`/api/users/${foreignUserId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((response) => expect(response.body).toEqual({}));

      await request(app.getHttpServer())
        .patch(`/api/users/${foreignUserId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'must-not-change' })
        .expect(404);

      await request(app.getHttpServer())
        .post(`/api/users/${foreignUserId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roles: [] })
        .expect(404);

      await request(app.getHttpServer())
        .post(`/api/users/${foreignUserId}/deactivate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      await expect(
        prisma.appUser.findUnique({ where: { userId: foreignUserId } })
      ).resolves.toMatchObject({ displayName: 'Foreign tenant user', tenantId });
    } finally {
      await app.close();
    }
  });

  it('exposes a permission-gated shadow report with zero projection diffs', async () => {
    const app = await boot();
    try {
      app.get(IamShadowService).resetStats();
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const token = session.body.access_token as string;

      const report = await request(app.getHttpServer())
        .get('/api/iam/shadow/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(report.body).toMatchObject({
        enabled: true,
        comparisons: expect.any(Number),
        matches: expect.any(Number),
        mismatches: 0,
        skipped: expect.any(Number),
        lastMismatchAt: null,
        byPath: expect.any(Object)
      });
      expect(report.body.comparisons).toBeGreaterThan(0);
      expect(report.body.matches).toBe(report.body.comparisons);
      expect(report.body.byPath['/api/iam/shadow/stats']).toMatchObject({
        comparisons: 1,
        matches: 1,
        mismatches: 0
      });
    } finally {
      await app.close();
    }
  });

  it('keeps area-tree legacy shadow projection stable with child merchants', async () => {
    const app = await boot();
    try {
      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const adminToken = adminSession.body.access_token as string;
      const areaId = `shadow-area-${Date.now()}`;
      const merchantId = `shadow-merchant-${Date.now()}`;
      await seedMerchant(app, merchantId, areaId);

      const region = await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `shadow_area_${Date.now()}`,
          name: 'Shadow 区域',
          unitType: 'REGION',
          parentId: 'org_hq',
          areaId
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `shadow_merchant_${Date.now()}`,
          name: 'Shadow 商家',
          unitType: 'MERCHANT',
          parentId: region.body.unitId,
          merchantId
        })
        .expect(201);

      const username = `iam_shadow_area_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'iam-shadow-area-pass', roles: [{ role: 'executor' }] })
        .expect(201);
      const userId = created.body.userId as string;
      await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignments: [
            { roleCode: 'area_operator', scopeType: 'ORG_TREE', orgUnitId: region.body.unitId }
          ],
          organizationUnitIds: ['org_hq', region.body.unitId],
          primaryOrgUnitId: region.body.unitId
        })
        .expect(200);
      const userSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'iam-shadow-area-pass' })
        .expect(201);

      app.get(IamShadowService).resetStats();
      await request(app.getHttpServer())
        .get('/api/content/packages/categories')
        .set('Authorization', `Bearer ${userSession.body.access_token}`)
        .expect(200);

      const report = await request(app.getHttpServer())
        .get('/api/iam/shadow/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(report.body.mismatches).toBe(0);
      expect(report.body.matches).toBe(report.body.comparisons);
      expect(report.body.byPath['/api/content/packages/categories']).toMatchObject({
        comparisons: 1,
        matches: 1,
        mismatches: 0
      });
    } finally {
      await app.close();
    }
  });

  it('creates roles and organization units through permission-gated APIs', async () => {
    const app = await boot();
    try {
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const token = session.body.access_token as string;

      const role = await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `reviewer_${Date.now()}`,
          name: '审阅角色',
          permissionCodes: ['content:read']
        })
        .expect(201);
      expect(role.body.permissions[0].permission.code).toBe('content:read');

      const legacyAliasRole = await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `legacy_user_writer_${Date.now()}`,
          name: '旧用户写入兼容角色',
          permissionCodes: ['users:write']
        })
        .expect(201);
      expect(
        legacyAliasRole.body.permissions.map(
          (item: { permission: { code: string } }) => item.permission.code
        )
      ).toEqual(['iam:user:create', 'iam:user:disable']);

      const areaId = `test-area-${Date.now()}`;
      await seedMerchant(app, `test-merchant-${Date.now()}`, areaId);
      const organization = await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `area_${Date.now()}`,
          name: '测试区域',
          unitType: 'REGION',
          parentId: 'org_hq',
          areaId
        })
        .expect(201);
      expect(organization.body.parentId).toBe('org_hq');
      expect(organization.body.unitType).toBe('REGION');
    } finally {
      await app.close();
    }
  });

  it('lets a custom IAM role pass a legacy role-gated business route', async () => {
    const app = await boot();
    try {
      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const adminToken = adminSession.body.access_token as string;
      const role = await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `audit_reader_${Date.now()}`,
          name: '审计读取角色',
          permissionCodes: ['audit:read']
        })
        .expect(201);
      const username = `iam_custom_route_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'iam-custom-route-pass', roles: [{ role: 'executor' }] })
        .expect(201);
      const userId = created.body.userId as string;
      await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignments: [{ roleCode: role.body.code, scopeType: 'NONE' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(200);
      const userSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'iam-custom-route-pass' })
        .expect(201);

      const auditLogs = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${userSession.body.access_token}`)
        .expect(200);
      expect(Array.isArray(auditLogs.body.data)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('requires domain permissions for protected aggregate and read routes', async () => {
    const app = await boot();
    try {
      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const adminToken = adminSession.body.access_token as string;
      const role = await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `domain_read_gate_${Date.now()}`,
          name: '仅审计读取角色',
          permissionCodes: ['audit:read']
        })
        .expect(201);
      const username = `iam_analytics_gate_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'iam-analytics-gate-pass', roles: [{ role: 'executor' }] })
        .expect(201);
      const userId = created.body.userId as string;
      await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignments: [{ roleCode: role.body.code, scopeType: 'ALL' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(200);
      const userSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'iam-analytics-gate-pass' })
        .expect(201);
      const token = userSession.body.access_token as string;

      for (const path of [
        '/api/gmv/today',
        '/api/overview/kpis',
        '/api/refund/today',
        '/api/merchant-sales/summary',
        '/api/data-analysis/summary',
        '/api/data-analysis/export',
        '/api/tasks',
        '/api/tasks/kpi',
        '/api/tasks/not-found',
        '/api/tasks/not-found/performance',
        '/api/content/dashboard/summary',
        '/api/content/ops/today',
        '/api/content/ops/review',
        '/api/content/performance',
        '/api/movement/today',
        '/api/movement/skus/moving',
        '/api/movement/skus/stagnant',
        '/api/movement/skus/stagnant/export',
        '/api/movement/skus/not-found/timeline',
        '/api/zero-sales/merchants',
        '/api/zero-sales/skus',
        '/api/zero-sales/skus/export',
        '/api/zero-sales/skus/not-found/timeline',
        '/api/campaigns',
        '/api/campaigns/not-found',
        '/api/campaigns/not-found/performance',
        '/api/community-library',
        '/api/community-library/not-found',
        '/api/community-library/not-found/performance',
        '/api/community-library/not-found/tasks',
        '/api/content/packages/recommend',
        '/api/content/packages/categories',
        '/api/content/packages/not-found/analysis',
        '/api/content/packages/not-found/score',
        '/api/content/packages/not-found/tags',
        '/api/content/packages/not-found/detail',
        '/api/content/communities',
        '/api/content/communities/not-found',
        '/api/content/copies',
        '/api/content/copies/not-found',
        '/api/content/alerts',
        '/api/merchants',
        '/api/merchants/heatmap',
        '/api/merchants/not-found/profile',
        '/api/merchants/not-found/trend',
        '/api/merchants/not-found/skus',
        '/api/merchants/not-found/competitors'
      ]) {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    } finally {
      await app.close();
    }
  });

  it('returns explicit auth errors and invalidates a token after access replacement', async () => {
    const app = await boot();
    try {
      await request(app.getHttpServer()).get('/api/iam/roles').expect(401);
      await request(app.getHttpServer()).get('/api/iam/shadow/stats').expect(401);

      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const adminToken = adminSession.body.access_token as string;
      const username = `iam_guard_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'iam-guard-pass', roles: [{ role: 'executor' }] })
        .expect(201);
      const userId = created.body.userId as string;

      const userSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'iam-guard-pass' })
        .expect(201);
      const userToken = userSession.body.access_token as string;
      await request(app.getHttpServer())
        .get('/api/iam/roles')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/iam/shadow/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/iam/users/does-not-exist/access')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignments: [], organizationUnitIds: ['org_hq'], primaryOrgUnitId: 'org_hq' })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/iam/roles')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);
    } finally {
      await app.close();
    }
  });

  it('revokes sessions when a referenced role permission changes', async () => {
    const app = await boot();
    try {
      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const adminToken = adminSession.body.access_token as string;
      const role = await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `session_role_${Date.now()}`,
          name: '会话撤销回归角色',
          permissionCodes: ['content:read']
        })
        .expect(201);
      const username = `iam_role_session_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'iam-role-session-pass', roles: [{ role: 'executor' }] })
        .expect(201);
      const userId = created.body.userId as string;
      await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignments: [{ roleCode: role.body.code, scopeType: 'NONE' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(200);
      const userSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'iam-role-session-pass' })
        .expect(201);
      const userToken = userSession.body.access_token as string;
      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/iam/roles/${role.body.roleId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissionCodes: ['content:write'] })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);
    } finally {
      await app.close();
    }
  });

  it('rejects invalid business bindings, cross-tenant parents, and organization cycles', async () => {
    const app = await boot();
    try {
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const token = session.body.access_token as string;
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const areaId = `iam-boundary-area-${suffix}`;
      await seedMerchant(app, `iam-boundary-merchant-${suffix}`, areaId);

      await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `invalid_area_${suffix}`,
          name: '无效区域绑定',
          unitType: 'REGION',
          parentId: 'org_hq',
          areaId: `missing-area-${suffix}`
        })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `invalid_merchant_${suffix}`,
          name: '无效商家绑定',
          unitType: 'MERCHANT',
          parentId: 'org_hq',
          merchantId: `missing-merchant-${suffix}`
        })
        .expect(400);

      const prisma = app.get(PrismaService);
      const foreignTenantId = `tenant_boundary_${suffix}`;
      await prisma.tenant.create({
        data: {
          tenantId: foreignTenantId,
          tenantKey: foreignTenantId,
          name: '隔离租户边界测试'
        }
      });
      const foreignHq = await prisma.organizationUnit.create({
        data: {
          unitId: `org_foreign_hq_${suffix}`,
          tenantId: foreignTenantId,
          code: `foreign_hq_${suffix}`,
          name: '隔离租户总部',
          unitType: 'HEADQUARTERS'
        }
      });
      await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `cross_tenant_${suffix}`,
          name: '跨租户父组织',
          unitType: 'REGION',
          parentId: foreignHq.unitId,
          areaId
        })
        .expect(400);

      const localHq = await prisma.organizationUnit.create({
        data: {
          unitId: `org_boundary_hq_${suffix}`,
          tenantId: 'tenant_default',
          code: `boundary_hq_${suffix}`,
          name: '环路测试总部',
          unitType: 'HEADQUARTERS'
        }
      });
      const region = await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `cycle_region_${suffix}`,
          name: '环路测试区域',
          unitType: 'REGION',
          parentId: localHq.unitId,
          areaId
        })
        .expect(201);
      await prisma.organizationUnit.update({
        where: { unitId: localHq.unitId },
        data: { parentId: region.body.unitId }
      });
      await request(app.getHttpServer())
        .patch(`/api/iam/organizations/${region.body.unitId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parentId: localHq.unitId })
        .expect(400);
    } finally {
      await app.close();
    }
  });

  it('protects system roles, permission caps, and the final admin', async () => {
    const app = await boot();
    try {
      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const adminToken = adminSession.body.access_token as string;
      const roles = await request(app.getHttpServer())
        .get('/api/iam/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const adminRole = roles.body.find((role: { code: string }) => role.code === 'admin') as {
        roleId: string;
      };
      expect(adminRole?.roleId).toBeTruthy();
      await request(app.getHttpServer())
        .patch(`/api/iam/roles/${adminRole.roleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '不可改名的系统角色' })
        .expect(409);

      const limitedRole = await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `iam_role_limited_${Date.now()}`,
          name: '有限授权角色',
          permissionCodes: ['iam:roles:write']
        })
        .expect(201);
      const username = `iam_permission_cap_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'iam-permission-cap-pass', roles: [{ role: 'executor' }] })
        .expect(201);
      const userId = created.body.userId as string;
      await request(app.getHttpServer())
        .put(`/api/iam/users/${userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignments: [{ roleCode: limitedRole.body.code, scopeType: 'NONE' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(200);
      const userSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'iam-permission-cap-pass' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${userSession.body.access_token}`)
        .send({
          code: `iam_role_escalation_${Date.now()}`,
          name: '越权角色',
          permissionCodes: ['content:write']
        })
        .expect(403);

      await request(app.getHttpServer())
        .put('/api/iam/users/admin/access')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignments: [{ roleCode: 'executor', scopeType: 'NONE' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(400);
    } finally {
      await app.close();
    }
  });

  it('prevents scoped IAM operators from widening delegated organization scope', async () => {
    const app = await boot();
    try {
      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const adminToken = adminSession.body.access_token as string;
      const role = await request(app.getHttpServer())
        .post('/api/iam/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `scoped_delegator_${Date.now()}`,
          name: '组织范围委派角色',
          permissionCodes: ['iam:users:access', 'content:read']
        })
        .expect(201);

      const actorUsername = `iam_scoped_actor_${Date.now()}`;
      const actor = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: actorUsername,
          password: 'iam-scoped-actor-pass',
          roles: [{ role: 'executor' }]
        })
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/iam/users/${actor.body.userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignments: [{ roleCode: role.body.code, scopeType: 'ORG_ONLY', orgUnitId: 'org_hq' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(200);

      const target = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: `iam_scoped_target_${Date.now()}`,
          password: 'iam-scoped-target-pass',
          roles: [{ role: 'executor' }]
        })
        .expect(201);
      const actorSession = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: actorUsername, password: 'iam-scoped-actor-pass' })
        .expect(201);
      const actorToken = actorSession.body.access_token as string;

      await request(app.getHttpServer())
        .put(`/api/iam/users/${target.body.userId}/access`)
        .set('Authorization', `Bearer ${actorToken}`)
        .send({
          assignments: [{ roleCode: role.body.code, scopeType: 'ALL' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(403);
      await request(app.getHttpServer())
        .put(`/api/iam/users/${target.body.userId}/access`)
        .set('Authorization', `Bearer ${actorToken}`)
        .send({
          assignments: [{ roleCode: role.body.code, scopeType: 'ORG_TREE', orgUnitId: 'org_hq' }],
          organizationUnitIds: ['org_hq'],
          primaryOrgUnitId: 'org_hq'
        })
        .expect(403);

      const targetAccess = await request(app.getHttpServer())
        .get(`/api/iam/users/${target.body.userId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(targetAccess.body.roleAssignments).toEqual([
        expect.objectContaining({ role: 'executor', scopeType: 'NONE', orgUnitId: null })
      ]);
    } finally {
      await app.close();
    }
  });
});
