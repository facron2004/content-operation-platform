import { Test } from '@nestjs/testing';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureAppMiddleware } from '../src/bootstrap-middleware';
import { IS_PUBLIC_KEY } from '../src/auth/public.decorator';
import { ROLES_KEY } from '../src/user-access/role.decorator';
import { PERMISSIONS_KEY } from '../src/user-access/iam/require-permissions.decorator';
import { AUTH_DECLARATION_KEY } from '../src/user-access/iam/route-auth.decorator';

describe('IAM API', () => {
  async function boot() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureAppMiddleware(app);
    await app.init();
    return app;
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
      expect(routeCount).toBeGreaterThan(100);
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

      const region = await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `primary_region_${Date.now()}`,
          name: '主组织回归区域',
          unitType: 'REGION',
          parentId: 'org_hq',
          areaId: `primary-area-${Date.now()}`
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

      const organization = await request(app.getHttpServer())
        .post('/api/iam/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `area_${Date.now()}`,
          name: '测试区域',
          unitType: 'REGION',
          parentId: 'org_hq',
          areaId: `test-area-${Date.now()}`
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

  it('returns explicit auth errors and invalidates a token after access replacement', async () => {
    const app = await boot();
    try {
      await request(app.getHttpServer()).get('/api/iam/roles').expect(401);

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
});
