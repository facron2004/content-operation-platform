/* 只读探测: 验证 JeeSite 会话是否有效, 并比较"缺口窗口"与"现有窗口"的订单量。
 * 不写入任何数据。 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.EXTERNAL_API_BASE_URL;
const fullCookie = process.env.EXTERNAL_API_COOKIE || '';
const sid = (fullCookie.match(/jeesite\.session\.id=([^;]+)/) || [])[1];
const cookie = sid ? `jeesite.session.id=${sid}` : '';

if (!BASE) { console.error('EXTERNAL_API_BASE_URL 未配置'); process.exit(1); }
if (!cookie) { console.error('EXTERNAL_API_COOKIE 中未找到 jeesite.session.id'); process.exit(1); }

async function probe(label, start, end) {
  const url = `${BASE}/bargain/bargainOrder/listData?pageNo=1&pageSize=2` +
    `&screeningStartPayDate=${encodeURIComponent(start + ' 00:00:00')}` +
    `&screeningEndPayDate=${encodeURIComponent(end + ' 23:59:59')}`;
  try {
    const res = await fetch(url, { headers: { Cookie: cookie }, redirect: 'manual' });
    const loc = res.headers.get('location') || '';
    console.log(`[${label}] ${start} ~ ${end}  ->  HTTP ${res.status}${loc ? '  location=' + loc : ''}`);
    if (res.status === 200) {
      const j = await res.json();
      const rows = j.rows || j.list || [];
      const total = j.page?.totalRow ?? j.count ?? '(未知)';
      const dates = rows.slice(0, 2).map(r => r.orderTime || r.payTime || '?');
      console.log(`     totalRow=${total}  本页返回=${rows.length}  样例时间=${JSON.stringify(dates)}`);
      return { ok: true, total };
    }
    return { ok: false, status: res.status };
  } catch (e) {
    console.log(`[${label}] 请求异常: ${e.message}`);
    return { ok: false, err: e.message };
  }
}

(async () => {
  console.log(`BASE=${BASE}  sid=${(sid || '').slice(0, 8)}...`);
  await probe('缺口窗口 Jul01-11', '2026-07-01', '2026-07-11');
  await probe('现有窗口 Jul12-16', '2026-07-12', '2026-07-16');
})();
