import { describe, expect, it } from 'vitest';
import { appRoutes } from '../router-routes';
import { PROTO_NAV, buildNavTree, resolveOpenGroupKeys } from './shell-layout-nav';

describe('V2 navigation information architecture', () => {
  it('keeps exactly the nine PRD centers at the first level', () => {
    expect(PROTO_NAV.filter((node) => node.kind === 'group').map((node) => node.title)).toEqual([
      '经营中心',
      '用户中心',
      '商品中心',
      '商家中心',
      '交易中心',
      '营销中心',
      '私域中心',
      '资金中心',
      '平台治理'
    ]);
  });

  it('does not expose compatibility labels in the visible tree', () => {
    const labels = buildNavTree().flatMap((node) =>
      node.kind === 'group' ? node.children.map((child) => child.title) : node.title
    );

    expect(labels.some((label) => label.includes('兼容'))).toBe(false);
    expect(labels).toContain('商品经营分析');
    expect(labels).toContain('库存预警');
    expect(labels).toContain('营销效果');
  });

  it('exposes the homepage as a standalone first-level entry', () => {
    expect(PROTO_NAV[0]).toMatchObject({
      kind: 'item',
      path: '/dashboard',
      title: '首页',
      icon: 'HomeFilled'
    });
  });

  it('keeps legacy URLs associated with their canonical center', () => {
    expect(resolveOpenGroupKeys('/attribution')).toContain('marketing');
    expect(resolveOpenGroupKeys('/governance/message-templates')).toContain('governance');
    expect(resolveOpenGroupKeys('/movement')).toContain('products');
    expect(resolveOpenGroupKeys('/dashboard')).not.toContain('operation');
  });

  it('keeps the operation center entries and the data analysis entry', () => {
    const operation = PROTO_NAV.find(
      (node): node is Extract<(typeof PROTO_NAV)[number], { kind: 'group' }> =>
        node.kind === 'group' && node.key === 'operation'
    );

    expect(operation?.children.map((child) => [child.path, child.title])).toEqual([
      ['/operation/gmv', 'GMV 分析'],
      ['/data-analysis', '数据分析'],
      ['/operation/realtime', '今日运营'],
      ['/operation/analysis', '区域 / 类目分析'],
      ['/operation/alerts', '经营预警'],
      ['/tasks', '运营任务']
    ]);
  });

  it('redirects obsolete operation landing URLs to the canonical GMV page', () => {
    const redirectFor = (path: string) => appRoutes.find((item) => item.path === path)?.redirect;

    expect(redirectFor('')).toBe('/dashboard');
    expect(redirectFor('operation')).toBe('/operation/gmv');
    expect(redirectFor('operation/dashboard')).toBe('/operation/gmv');
    expect(redirectFor('gmv-cockpit')).toBe('/operation/gmv');
    expect(redirectFor('packages')).toBe('/products');
  });

  it('removes the duplicate package management entry', () => {
    const products = PROTO_NAV.find(
      (node): node is Extract<(typeof PROTO_NAV)[number], { kind: 'group' }> =>
        node.kind === 'group' && node.key === 'products'
    );

    expect(products?.children.map((child) => child.path)).not.toContain('/packages');
    expect(products?.children.map((child) => child.path)).toContain('/products');
    expect(products?.children.map((child) => child.path)).toContain('/packages/combinations');
  });
});
