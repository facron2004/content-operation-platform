const cookie = 'skinName=skin-green; jeesite.session.id=5b93c47b55dc4d3ca2c6cb46224ee586; pageSize=10; pageNo=1';

async function main() {
  let totalPayPrice = 0, totalDeduction = 0, totalBonus = 0;
  let totalRows = 0;
  let orderCountPerDay = {};
  const byDay = {};
  for (let p = 1; p <= 21; p++) {
    const url = `https://zdm.zhsh1.cn/a/bargain/bargainOrder/listData?pageNo=${p}&pageSize=50&screeningStartPayDate=2026-07-01%2000:00:00&screeningEndPayDate=2026-07-14%2023:59:59`;
    const r = await fetch(url, { headers: { Cookie: cookie }, redirect: 'manual' });
    if (r.status !== 200) {
      console.log(`第 ${p} 页 status=${r.status}`);
      if (r.status === 302) {
        console.log('  session 又过期了!');
        break;
      }
      continue;
    }
    const j = await r.json();
    const rows = j.list || [];
    totalRows += rows.length;
    for (const o of rows) {
      totalPayPrice += Number(o.payPrice || 0);
      totalDeduction += Number(o.deductionBalance || 0);
      totalBonus += Number(o.balanceIntegral || 0);
      const day = (o.createDate || '').slice(0, 10);
      orderCountPerDay[day] = (orderCountPerDay[day] || 0) + 1;
      if (!byDay[day]) byDay[day] = { payPrice: 0, deduction: 0, bonus: 0, count: 0 };
      byDay[day].payPrice += Number(o.payPrice || 0);
      byDay[day].deduction += Number(o.deductionBalance || 0);
      byDay[day].bonus += Number(o.balanceIntegral || 0);
      byDay[day].count += 1;
    }
  }
  console.log('订单数:', totalRows);
  console.log('sum payPrice (在线现金):', totalPayPrice.toFixed(2));
  console.log('sum deductionBalance (余额):', totalDeduction.toFixed(2));
  console.log('sum balanceIntegral (积分):', totalBonus);
  console.log('积分抵现 = balanceIntegral/100:', (totalBonus / 100).toFixed(2));
  console.log('');
  console.log('GMV = payPrice + deductionBalance:', (totalPayPrice + totalDeduction).toFixed(2));
  console.log('GMV = payPrice + deductionBalance + 积分抵现:', (totalPayPrice + totalDeduction + totalBonus / 100).toFixed(2));
  console.log('');
  console.log('按日订单数:');
  Object.keys(orderCountPerDay).sort().forEach(d => console.log(' ', d, '→', orderCountPerDay[d]));
  console.log('\n按日 GMV (payPrice + deductionBalance):');
  Object.keys(byDay).sort().forEach(d => {
    const x = byDay[d];
    const gmv = x.payPrice + x.deduction;
    console.log(`  ${d}: ¥${gmv.toFixed(2)} (payPrice=¥${x.payPrice.toFixed(2)} + deductionBalance=¥${x.deduction.toFixed(2)}), ${x.count} 单`);
  });
}
main().catch(e => { console.error(e); process.exit(1); });