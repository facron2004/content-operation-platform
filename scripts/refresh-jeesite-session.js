const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = process.env.EXTERNAL_API_BASE_URL;
const USERNAME = process.env.EXTERNAL_API_USERNAME;
const PASSWORD = process.env.EXTERNAL_API_PASSWORD;

if (!BASE_URL || !USERNAME || !PASSWORD) {
  console.error('env 缺 EXTERNAL_API_BASE_URL / EXTERNAL_API_USERNAME / EXTERNAL_API_PASSWORD');
  process.exit(1);
}

async function main() {
  // 第一步：访问登录页拿初始 cookie
  const loginPageUrl = `${BASE_URL}/login`;
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  console.log(`[1/3] GET ${loginPageUrl}`);
  const pageRes = await fetch(loginPageUrl, { headers: { 'User-Agent': ua }, redirect: 'manual' });
  const setCookie = pageRes.headers.get('set-cookie') ?? '';
  console.log('  status:', pageRes.status, 'set-cookie 长度:', setCookie.length);

  function parseAll(header) {
    const out = {};
    for (const part of header.split(/, (?=[^;]+=[^;]+;)/)) {
      const [pair] = part.split(';');
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
    return out;
  }
  const initialCookies = parseAll(setCookie);
  const initialCookieStr = Object.entries(initialCookies).map(([k, v]) => `${k}=${v}`).join('; ');
  console.log('  初始 cookies:', Object.keys(initialCookies).join(','));

  // 第二步：POST 登录
  const loginUrl = BASE_URL.endsWith('/a') ? `${BASE_URL}/login` : `${BASE_URL}/a/login`;
  console.log(`[2/3] POST ${loginUrl}`);
  const encU = Buffer.from(USERNAME).toString('base64');
  const encP = Buffer.from(PASSWORD).toString('base64');
  const form = new URLSearchParams({ username: encU, password: encP, validCode: '', __url: '' });
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: initialCookieStr,
      'User-Agent': ua,
      Referer: loginPageUrl
    },
    body: form.toString(),
    redirect: 'manual'
  });
  console.log('  status:', loginRes.status);
  const loginSetCookie = loginRes.headers.get('set-cookie') ?? '';
  console.log('  set-cookie 长度:', loginSetCookie.length);
  const location = loginRes.headers.get('location');
  console.log('  location:', location);
  if (location && (location.includes('loginFailure') || location.includes('login?'))) {
    console.error('登录失败: 重定向到登录页。可能触发验证码或账号问题');
    process.exit(2);
  }
  if (loginRes.status !== 302 && loginRes.status !== 301) {
    console.error('登录失败: 期望 302/301, 拿到', loginRes.status);
    const body = await loginRes.text();
    console.error('body 前 300:', body.slice(0, 300));
    process.exit(3);
  }
  const all = parseAll(loginSetCookie);
  console.log('  cookies 拿到:', Object.keys(all).join(','));
  const sid = all['jeesite.session.id'];
  if (!sid) {
    console.error('没拿到 jeesite.session.id');
    process.exit(4);
  }
  console.log('  新 sid:', sid);

  // 第三步：写回 .env / .cookie.cache
  const newCookie = `skinName=skin-green; jeesite.session.id=${sid}; pageSize=10; pageNo=1`;
  fs.writeFileSync(path.join(__dirname, '..', '.cookie.cache'), newCookie);
  console.log('[3/3] 写入 .cookie.cache');

  // 同步更新 .env 里的 EXTERNAL_API_COOKIE
  const envPath = path.join(__dirname, '..', '.env');
  let env = fs.readFileSync(envPath, 'utf8');
  env = env.replace(/^EXTERNAL_API_COOKIE=.*$/m, `EXTERNAL_API_COOKIE=${newCookie}`);
  fs.writeFileSync(envPath, env);
  console.log('  同步更新 .env 里的 EXTERNAL_API_COOKIE');

  // 验证
  console.log('\n[验证] 用新 cookie 拉 listData');
  const testRes = await fetch(`${BASE_URL}/bargain/bargainOrder/listData?pageNo=1&pageSize=1`, {
    headers: { Cookie: newCookie },
    redirect: 'manual'
  });
  console.log('  status:', testRes.status, 'location:', testRes.headers.get('location'));
  if (testRes.status === 200) {
    const j = await testRes.json();
    console.log('  返回 totalRow:', j.page?.totalRow ?? '(无 page)');
  } else {
    console.log('  ⚠️ 新 cookie 也不对,可能触发验证码');
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(99); });