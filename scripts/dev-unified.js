const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const publicPort = process.env.DEV_PUBLIC_PORT || process.env.VITE_DEV_SERVER_PORT || '3100';
const apiPort = process.env.DEV_API_PORT || process.env.API_DEV_PORT || '3101';
const publicUrl = `http://localhost:${publicPort}`;
const apiTarget = process.env.VITE_API_PROXY_TARGET || `http://localhost:${apiPort}`;
const children = [];

console.log('\n内容运营开发服务启动中...');
console.log(`统一访问入口: ${publicUrl}`);
console.log(`内部 API 端口: ${apiTarget}，前端通过 /api 代理访问\n`);

function run(label, args, env) {
  const child = spawn(npmCommand, args, {
    cwd: root,
    env: {
      ...process.env,
      ...env
    },
    shell: process.platform === 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  children.push(child);

  const write = (stream, chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim()) stream.write(`[${label}] ${line}\n`);
    }
  };

  child.stdout.on('data', (chunk) => write(process.stdout, chunk));
  child.stderr.on('data', (chunk) => write(process.stderr, chunk));
  child.on('exit', (code, signal) => {
    if (signal) return;
    if (code && !shuttingDown) {
      console.error(`[${label}] 服务退出，code=${code}`);
      shutdown(code);
    }
  });
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 200);
}

run('API', ['run', 'dev', '-w', 'apps/api'], {
  DEV_API_PORT: apiPort,
  PORT: apiPort,
  FRONTEND_URL: publicUrl
});

run('WEB', ['run', 'dev', '-w', 'apps/web'], {
  VITE_DEV_SERVER_PORT: publicPort,
  VITE_API_BASE_URL: '/api',
  VITE_API_PROXY_TARGET: apiTarget
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
