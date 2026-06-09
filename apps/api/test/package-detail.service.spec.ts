import { describe, expect, it } from 'vitest';
import { PackageDetailService } from '../src/content/package-detail.service';

const createService = () => new PackageDetailService({} as any, {} as any);

const parseDetail = (html: string) =>
  (createService() as any).parsePackageDetail('PKG_DETAIL', `<div id="commodityDetailUE">${html}</div>`, false);

describe('PackageDetailService detail parser', () => {
  it('parses menu streams made of title, dish, quantity and price tokens', () => {
    const detail = parseDetail(`
      <section><p><strong>商品详情</strong></p></section>
      <section><p>周六周日需要提前预约，节假日不可用</p></section>
      <section><p><strong>鲜香家常双人D套餐</strong></p></section>
      <section><p><strong>套餐内容</strong></p></section>
      <section><p>洋葱拌木耳</p><p>（1份）</p><p>¥38</p></section>
      <section><p>咸金桔蒸凤尾鱼</p><p>（1份）</p><p>¥108</p></section>
      <section><p>丝苗白饭</p><p>（2份）</p><p>¥14</p></section>
    `);

    expect(detail.packageTitle).toBe('鲜香家常双人D套餐');
    expect(detail.sections).toEqual([
      {
        title: '套餐内容',
        selectionRule: undefined,
        items: [
          { name: '洋葱拌木耳', quantity: '1份' },
          { name: '咸金桔蒸凤尾鱼', quantity: '1份' },
          { name: '丝苗白饭', quantity: '2份' }
        ]
      }
    ]);
  });

  it('skips warm reminder text and parses later grouped menu sections', () => {
    const detail = parseDetail(`
      <section><p><strong>商品详情</strong></p></section>
      <section><p><strong>温馨提示</strong></p><p>1.请您提前电话预约，同时告知商家为圳惠生活平台用户。</p></section>
      <section><p>2.本套餐</p><p>不允许使用截图</p><p>核销</p></section>
      <section><p><strong>2-3人豪华餐8荤4素炭烤鲜牛肉</strong></p></section>
      <section><p><strong>巨满足炫肉圈</strong></p></section>
      <section><p><strong>8荤4素2主食</strong></p></section>
      <section><p>新鲜牛肉</p><p>（1份）</p><p>¥0.01</p></section>
      <section><p>新鲜肥牛</p><p>（1份）</p><p>¥0.01</p></section>
      <section><p>淄博小饼</p><p>（6片）</p><p>¥0.06</p></section>
      <section><p><strong>饮品2选1</strong></p></section>
      <section><p>1.25L可乐</p><p>（1瓶）</p><p>¥12</p></section>
      <section><p>1.25L东鹏海岛椰</p><p>（1瓶）</p><p>¥16</p></section>
      <section><p><strong>其他</strong></p></section>
      <section><p>炭火+蘸料+纸巾</p><p>（3份）</p><p>¥15</p></section>
    `);

    expect(detail.packageTitle).toBe('2-3人豪华餐8荤4素炭烤鲜牛肉');
    expect(detail.sections.map((section: any) => section.title)).toEqual(['8荤4素2主食', '饮品2选1', '其他']);
    expect(detail.sections[0].items).toContainEqual({ name: '新鲜牛肉', quantity: '1份' });
    expect(detail.sections[0].items).toContainEqual({ name: '淄博小饼', quantity: '6片' });
    expect(detail.sections[1].selectionRule).toBe('2选1');
    expect(detail.sections[1].items).toContainEqual({ name: '1.25L可乐', quantity: '1瓶' });
    expect(detail.sections[2].items).toEqual([{ name: '炭火+蘸料+纸巾', quantity: '3份' }]);
  });

  it('falls back to loose item and duration tokens when the detail page has no menu section', () => {
    const detail = parseDetail(`
      <section><p><strong>商品详情</strong></p></section>
      <section><p><strong>温馨提示</strong></p><p>该套餐可叠加使用</p></section>
      <section><p>一号果岭练习场场地费</p></section>
      <section><p>可用时长</p><p>1小时</p></section>
    `);

    expect(detail.packageTitle).toBe('一号果岭练习场场地费');
    expect(detail.sections).toEqual([
      {
        title: '套餐内容',
        items: [{ name: '一号果岭练习场场地费', quantity: '1小时' }]
      }
    ]);
  });
});
