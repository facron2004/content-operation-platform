/* 只读探测: 验证 JeeSite 会员接口 (/member/centerMember/listData) 是否支持
 * 按 createDate / updateDate 范围筛选。不写入任何数据。
 *
 * 策略:
 *   1) 不带筛选拉一页, 拿全量 count 和样例 createDate/updateDate
 *   2) 依次用多组候选参数名带本月窗口 (2026-08-01 ~ 2026-08-18) 调用
 *   3) 若某组 count 明显小于全量 count 且 > 0, 即判定该参数名生效
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = (process.env.EXTERNAL_API_BASE_URL || '').replace(/\/$/, '');
const USERNAME = process.env.EXTERNAL_API_USERNAME || '';
const PASSWORD = process.env.EXTERNAL_API_PASSWORD || '';
const MEMBER_PATH = process.env.EXTERNAL_MEMBERS_PATH || '/member/centerMember/listData';

const WINDOW_START = '2026-08-01 00:00:00';
const WINDOW_END = '2026-08-18 23:59:59';

if (!BASE) { console.error('EXTERNAL_API_BASE_URL 未配置'); process.exit(1); }

function parseAllCookies(header) {
  const out = {};
  for (const part of header.split(/, (?=[^;]+=[^;]+;)/)) {
    const [pair] = part.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

async function ensureCookie() {
  const cached = process.env.EXTERNAL_API_COOKIE || '';
  const sid = (cached.match(/jeesite\.session\.id=([^;]+)/) || [])[1];
  if (sid) {
    const probe = await fetch(`${BASE}${MEMBER_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-ajax': 'json',
        Cookie: `jeesite.session.id=${sid}`
      },
      body: new URLSearchParams({ pageNo: '1', pageSize: '1' }).toString(),
      redirect: 'manual'
    });
    if (probe.status === 200) {
      const j = await probe.json();
      if (j && j.result !== 'login') {
        console.log(`复用 .env 现有 cookie (sid=${sid.slice(0, 8)}...)`);
        return `jeesite.session.id=${sid}`;
      }
    }
  }
  console.log('.env cookie 失效, 改用用户名密码自动登录...');
  if (!USERNAME || !PASSWORD) {
    console.error('env 缺 EXTERNAL_API_USERNAME / EXTERNAL_API_PASSWORD, 无法自动登录');
    process.exit(1);
  }
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const pageRes = await fetch(`${BASE}/login`, { headers: { 'User-Agent': ua }, redirect: 'manual' });
  const initial = parseAllCookies(pageRes.headers.get('set-cookie') ?? '');
  const initialCookieStr = Object.entries(initial).map(([k, v]) => `${k}=${v}`).join('; ');
  const loginUrl = BASE.endsWith('/a') ? `${BASE}/login` : `${BASE}/a/login`;
  const encU = Buffer.from(USERNAME).toString('base64');
  const encP = Buffer.from(PASSWORD).toString('base64');
  const form = new URLSearchParams({ username: encU, password: encP, validCode: '', __url: '' });
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: initialCookieStr,
      'User-Agent': ua,
      Referer: `${BASE}/login`
    },
    body: form.toString(),
    redirect: 'manual'
  });
  const loc = loginRes.headers.get('location') || '';
  if (loc.includes('loginFailure') || loc.includes('login?')) {
    console.error('登录失败: 重定向到登录页 (可能触发验证码或账号问题)');
    process.exit(2);
  }
  if (loginRes.status !== 302 && loginRes.status !== 301) {
    console.error(`登录失败: 期望 302/301, 拿到 ${loginRes.status}`);
    process.exit(3);
  }
  const all = parseAllCookies(loginRes.headers.get('set-cookie') ?? '');
  const newSid = all['jeesite.session.id'];
  if (!newSid) { console.error('登录后未拿到 jeesite.session.id'); process.exit(4); }
  console.log(`自动登录成功 (sid=${newSid.slice(0, 8)}...)`);
  return `jeesite.session.id=${newSid}`;
}

let cookie = '';

async function call(extraFields) {
  const form = new URLSearchParams({ pageNo: '1', pageSize: '2' });
  for (const [k, v] of Object.entries(extraFields || {})) form.set(k, v);
  const url = `${BASE}${MEMBER_PATH.startsWith('/') ? '' : '/'}${MEMBER_PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'x-ajax': 'json',
      Cookie: cookie
    },
    body: form.toString(),
    redirect: 'manual'
  });
  if (res.status !== 200) {
    const loc = res.headers.get('location') || '';
    return { ok: false, status: res.status, loc };
  }
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, status: res.status, snippet: text.slice(0, 120) }; }
  if (j && j.result === 'login') return { ok: false, login: true, snippet: text.slice(0, 120) };
  const list = j.list || j.rows || [];
  const count = j.count ?? j.page?.totalRow ?? null;
  const sample = list[0] || {};
  return { ok: true, count, listLen: list.length, sample, list };
}

async function callPage(pageNo, pageSize) {
  const form = new URLSearchParams({ pageNo: String(pageNo), pageSize: String(pageSize) });
  const url = `${BASE}${MEMBER_PATH.startsWith('/') ? '' : '/'}${MEMBER_PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'x-ajax': 'json',
      Cookie: cookie
    },
    body: form.toString(),
    redirect: 'manual'
  });
  if (res.status !== 200) return { ok: false, status: res.status };
  const j = await res.json();
  if (j && j.result === 'login') return { ok: false, login: true };
  return { ok: true, list: j.list || j.rows || [], count: j.count ?? null };
}

function summarizeSample(s) {
  if (!s) return '(无)';
  const keys = ['id', 'memberId', 'createDate', 'updateDate', 'lastLoginDate', 'loginDate'];
  const out = {};
  for (const k of keys) if (s[k] != null) out[k] = s[k];
  return JSON.stringify(out);
}

const CREATE_CANDIDATES = [
  { start: 'screeningStartCreateDate', end: 'screeningEndCreateDate', label: 'screeningStart/EndCreateDate' },
  { start: 'createDate_gte', end: 'createDate_lte', label: 'createDate_gte/lte' },
  { start: 'startCreateDate', end: 'endCreateDate', label: 'start/endCreateDate' },
  { start: 'createDate_begin', end: 'createDate_end', label: 'createDate_begin/end' }
];
const UPDATE_CANDIDATES = [
  { start: 'screeningStartUpdateDate', end: 'screeningEndUpdateDate', label: 'screeningStart/EndUpdateDate' },
  { start: 'updateDate_gte', end: 'updateDate_lte', label: 'updateDate_gte/lte' },
  { start: 'startUpdateDate', end: 'endUpdateDate', label: 'start/endUpdateDate' }
];

(async () => {
  cookie = await ensureCookie();
  console.log(`\nBASE=${BASE}  path=${MEMBER_PATH}`);
  console.log(`窗口: ${WINDOW_START} ~ ${WINDOW_END}\n`);

  console.log('=== 1) 全量 (不带筛选) ===');
  const base = await call({});
  if (!base.ok) {
    console.log('全量请求失败:', base);
    if (base.login) console.log('>> 登录态失效, 请刷新 .env 的 EXTERNAL_API_COOKIE');
    return;
  }
  console.log(`全量 count=${base.count}  本页返回=${base.listLen}`);
  console.log(`样例字段: ${summarizeSample(base.sample)}\n`);
  if (!base.count) { console.log('全量 count 为 0 或缺失, 无法对比, 退出'); return; }

  const fullCount = Number(base.count) || 0;

  console.log('=== 2) createDate 范围候选 ===');
  for (const c of CREATE_CANDIDATES) {
    const r = await call({ [c.start]: WINDOW_START, [c.end]: WINDOW_END });
    if (!r.ok) { console.log(`[${c.label}] 失败: ${JSON.stringify(r)}`); continue; }
    const cnt = Number(r.count);
    const hit = cnt > 0 && cnt < fullCount;
    console.log(`[${c.label}] count=${cnt}  本页=${r.listLen}  ${hit ? '✅ 生效(小于全量)' : (cnt === fullCount ? '⚪ 无变化(参数被忽略)' : '⚠️ 异常')}`);
  }

  console.log('\n=== 3) updateDate 范围候选 ===');
  for (const c of UPDATE_CANDIDATES) {
    const r = await call({ [c.start]: WINDOW_START, [c.end]: WINDOW_END });
    if (!r.ok) { console.log(`[${c.label}] 失败: ${JSON.stringify(r)}`); continue; }
    const cnt = Number(r.count);
    const hit = cnt > 0 && cnt < fullCount;
    console.log(`[${c.label}] count=${cnt}  本页=${r.listLen}  ${hit ? '✅ 生效(小于全量)' : (cnt === fullCount ? '⚪ 无变化(参数被忽略)' : '⚠️ 异常')}`);
  }

  console.log('\n=== 4) 默认排序方向 (抓前 3 页看 createDate/updateDate/loginDate) ===');
  for (let p = 1; p <= 3; p++) {
    const r = await callPage(p, 3);
    if (!r.ok) { console.log(`第 ${p} 页失败: ${JSON.stringify(r)}`); continue; }
    const dates = r.list.map((m) => ({
      id: String(m.id || '').slice(-6),
      create: m.createDate || '?',
      update: m.updateDate || '?',
      login: m.loginDate || '?'
    }));
    console.log(`第 ${p} 页: ${JSON.stringify(dates)}`);
  }

  console.log('\n=== 5) orderBy 参数候选 (期望按 createDate 降序, 看第 1 页 create 是否为最新) ===');
  const ORDER_CANDIDATES = [
    'orderBy=createDate desc',
    'orderBy=createDate+desc',
    'sort=createDate&order=desc',
    'orderBy=updateDate desc'
  ];
  for (const raw of ORDER_CANDIDATES) {
    const fields = {};
    raw.split('&').forEach((kv) => { const [k, v] = kv.split('='); fields[k] = v.replace(/\+/g, ' '); });
    const r = await call(fields);
    if (!r.ok) { console.log(`[${raw}] 失败: ${JSON.stringify(r)}`); continue; }
    const topCreate = r.sample?.createDate || '?';
    console.log(`[${raw}] 第1条 createDate=${topCreate}  count=${r.count}`);
  }

  console.log('\n探测完成。');
})().catch(e => { console.error('探测异常:', e); process.exit(1); });
