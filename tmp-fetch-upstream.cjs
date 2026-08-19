// 拉取 JeeSite 上游积分记录全量，统计 integralType 分布，找类型2和类型9 的 remarks
const BASE_URL = 'https://zdm.zhsh1.cn/a';
const INTEGRAL_PATH = '/member/centerMemberIntegralRecord/listData';
const ENV_COOKIE =
  'skinName=skin-green; jeesite.session.id=3577e413b4e441a49d8232da729c62d0; pageSize=10; pageNo=1';
const USERNAME = '13072785570';
const PASSWORD = 'Feng2004@';
const PAGE_SIZE = 200;
const SLEEP_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, init, timeout = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

function parseSetCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(', ')) {
    const nv = part.split(';')[0];
    const eq = nv.indexOf('=');
    if (eq > 0) cookies[nv.slice(0, eq).trim()] = nv.slice(eq + 1).trim();
  }
  return cookies;
}

async function login() {
  console.log('Cookie 过期，尝试登录...');
  const pageRes = await fetchWithTimeout(`${BASE_URL}/login`, { method: 'GET' });
  const initialCookies = parseSetCookies(pageRes.headers.get('set-cookie'));
  const initialCookieStr = Object.entries(initialCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  const formData = new URLSearchParams({
    username: Buffer.from(USERNAME).toString('base64'),
    password: Buffer.from(PASSWORD).toString('base64'),
    validCode: '',
    __url: ''
  });
  const loginRes = await fetchWithTimeout(`${BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: initialCookieStr,
      'User-Agent': 'Mozilla/5.0'
    },
    body: formData.toString()
  });
  const sc = parseSetCookies(loginRes.headers.get('set-cookie'));
  const sid = sc['jeesite.session.id'];
  if (!sid) {
    console.error('登录失败：无 session id');
    return null;
  }
  const cookie = `skinName=skin-green; jeesite.session.id=${sid}; pageSize=10; pageNo=1`;
  console.log('登录成功，新 cookie 已获取');
  return cookie;
}

async function fetchIntegralPage(cookie, pageNo) {
  const res = await fetchWithTimeout(`${BASE_URL}${INTEGRAL_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-ajax': 'json',
      Cookie: cookie
    },
    body: `pageNo=${pageNo}&pageSize=${PAGE_SIZE}`
  });
  const text = await res.text();
  if (text.includes('loginForm') || text.includes('"result":"login"')) {
    return { loginRequired: true };
  }
  try {
    const data = JSON.parse(text);
    if (data.result === 'login') return { loginRequired: true };
    return {
      loginRequired: false,
      list: Array.isArray(data.list) ? data.list : [],
      count: Number(data.count ?? 0),
      pageNo: Number(data.pageNo ?? pageNo)
    };
  } catch {
    console.error(`第${pageNo}页 JSON 解析失败`);
    return { loginRequired: false, list: [], count: 0 };
  }
}

(async () => {
  let cookie = ENV_COOKIE;
  let page1 = await fetchIntegralPage(cookie, 1);
  if (page1.loginRequired) {
    cookie = await login();
    if (!cookie) {
      console.error('无法登录，退出');
      return;
    }
    page1 = await fetchIntegralPage(cookie, 1);
    if (page1.loginRequired) {
      console.error('登录后仍无法访问');
      return;
    }
  }

  const count = page1.count;
  console.log(`上游总数: ${count}`);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  console.log(`总页数: ${totalPages}`);

  const merged = [...(page1.list ?? [])];
  for (let p = 2; p <= totalPages; p++) {
    await sleep(SLEEP_MS);
    const page = await fetchIntegralPage(cookie, p);
    if (page.loginRequired) {
      cookie = await login();
      if (!cookie) break;
      const retry = await fetchIntegralPage(cookie, p);
      if (retry.list) merged.push(...retry.list);
    } else if (page.list) {
      merged.push(...page.list);
    }
    if (p % 10 === 0) console.log(`  已拉取 ${p}/${totalPages} 页...`);
  }

  console.log(`\n拉取完成，共 ${merged.length} 条`);

  // 统计 integralType 分布
  const byType = {};
  const remarksByType = {};
  for (const row of merged) {
    const t = Number(row.integralType);
    byType[t] = (byType[t] || 0) + 1;
    if (!remarksByType[t]) remarksByType[t] = new Set();
    if (row.remarks) remarksByType[t].add(String(row.remarks).slice(0, 60));
  }

  console.log('\n=== 上游 integralType 分布 ===');
  for (const t of Object.keys(byType).map(Number).sort((a, b) => a - b)) {
    const samples = [...remarksByType[t]].slice(0, 5).join(' | ');
    console.log(`  类型${t}: ${byType[t]}条 | remarks样本: ${samples}`);
  }

  console.log('\n=== 类型2 的 remarks ===');
  if (remarksByType[2]) {
    for (const r of [...remarksByType[2]].slice(0, 10)) console.log(`  ${r}`);
  } else {
    console.log('  上游也无类型2');
  }

  console.log('\n=== 类型9 的 remarks ===');
  if (remarksByType[9]) {
    for (const r of [...remarksByType[9]].slice(0, 10)) console.log(`  ${r}`);
  } else {
    console.log('  上游也无类型9');
  }
})().catch((e) => console.error('脚本异常:', e.message));
