const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const net = require('net');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCommand = isWin ? 'npm.cmd' : 'npm';
const publicPort = String(process.env.DEV_PUBLIC_PORT || process.env.VITE_DEV_SERVER_PORT || '3100');
const apiPort = String(process.env.DEV_API_PORT || process.env.API_DEV_PORT || '3101');
const publicUrl = `http://localhost:${publicPort}`;
const apiTarget = process.env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;
const openBrowser = process.env.DEV_OPEN_BROWSER === '1' || process.env.DEV_OPEN_BROWSER === 'true';
const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(msg);
}

function fail(msg, code = 1) {
  console.error(`\n[dev] ${msg}`);
  shutdown(code);
}

function run(label, args, env) {
  const child = spawn(npmCommand, args, {
    cwd: root,
    env: { ...process.env, ...env },
    shell: isWin,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  children.push({ label, child });

  const write = (stream, chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim()) stream.write(`[${label}] ${line}\n`);
    }
  };

  child.stdout.on('data', (chunk) => write(process.stdout, chunk));
  child.stderr.on('data', (chunk) => write(process.stderr, chunk));
  child.on('exit', (code, signal) => {
    if (shuttingDown || signal) return;
    if (code) {
      console.error(`[${label}] 服务退出，code=${code}`);
      shutdown(code);
    }
  });

  return child;
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (isWin) {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

function freePort(port) {
  if (!isWin) return;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      { encoding: 'utf8' }
    );
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(String(line).trim());
      if (pid > 0) {
        log(`[dev] 释放端口 ${port} (pid=${pid})`);
        killTree(pid);
      }
    }
  } catch {
    // port free or query failed
  }
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port: Number(port), host }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`等待 ${host}:${port} 超时（${timeoutMs}ms）`));
          return;
        }
        setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function waitForHttpOk(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(res.statusCode);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`等待 ${url} 就绪超时，最后状态 ${res.statusCode}`));
          return;
        }
        setTimeout(tryOnce, 500);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`等待 ${url} 就绪超时`));
          return;
        }
        setTimeout(tryOnce, 500);
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
    };
    tryOnce();
  });
}

function buildShared() {
  log('[dev] 构建 @content/shared（只构建一次，避免 api/web 并行编译触发 tsx 连环重启）...');
  execSync(`${npmCommand} run build -w @content/shared`, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: isWin
  });
  log('[dev] @content/shared 构建完成');
}

function openPublicUrl() {
  try {
    if (isWin) {
      spawn('cmd', ['/c', 'start', '', publicUrl], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [publicUrl], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [publicUrl], { detached: true, stdio: 'ignore' }).unref();
    }
    log(`[dev] 已打开浏览器: ${publicUrl}`);
  } catch (err) {
    console.warn(`[dev] 打开浏览器失败: ${err && err.message ? err.message : err}`);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('[dev] 正在停止服务...');
  for (const { child } of children) {
    killTree(child.pid);
  }
  setTimeout(() => process.exit(code), 300);
}

async function main() {
  log('\n内容运营开发服务启动中...');
  log(`统一访问入口: ${publicUrl}`);
  log(`内部 API: ${apiTarget}/api（前端通过 /api 代理）\n`);

  freePort(publicPort);
  freePort(apiPort);

  try {
    buildShared();
  } catch (err) {
    fail(`@content/shared 构建失败: ${err && err.message ? err.message : err}`);
    return;
  }

  run('API', ['run', 'dev', '-w', 'apps/api'], {
    DEV_API_PORT: apiPort,
    PORT: apiPort,
    HOST: process.env.HOST || '127.0.0.1',
    FRONTEND_URL: publicUrl,
    NODE_ENV: process.env.NODE_ENV || 'development'
  });

  try {
    log(`[dev] 等待 API 监听 ${apiPort}...`);
    await waitForPort(apiPort, '127.0.0.1', 90000);
    await waitForHttpOk(`http://127.0.0.1:${apiPort}/api/content/health`, 90000);
    log('[dev] API 已就绪');
  } catch (err) {
    fail(err.message || String(err));
    return;
  }

  run('WEB', ['run', 'dev', '-w', 'apps/web'], {
    VITE_DEV_SERVER_PORT: publicPort,
    VITE_DEV_SERVER_HOST: process.env.VITE_DEV_SERVER_HOST || '0.0.0.0',
    VITE_API_BASE_URL: '/api',
    VITE_API_PROXY_TARGET: apiTarget
  });

  try {
    log(`[dev] 等待前端监听 ${publicPort}...`);
    await waitForPort(publicPort, '127.0.0.1', 90000);
    log('[dev] 前端已就绪');
  } catch (err) {
    fail(err.message || String(err));
    return;
  }

  log(`\n[dev] 启动完成`);
  log(`[dev] 前端: ${publicUrl}`);
  log(`[dev] API : http://127.0.0.1:${apiPort}/api`);
  log(`[dev] 健康检查: http://127.0.0.1:${apiPort}/api/content/health\n`);

  if (openBrowser) openPublicUrl();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
