import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createViteBuild, createVitePlugins } from './vite.chunks';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.resolve(rootDir, '../../packages/shared/src/index.ts');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number(env.VITE_DEV_SERVER_PORT || 3100);
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3101';
  const isDev = mode === 'development';

  return {
    plugins: createVitePlugins(),
    // Shared is CJS with export*; resolve to TS source so Vite/Rollup can tree-shake named exports.
    resolve: {
      alias: {
        '@content/shared': sharedSrc
      }
    },
    optimizeDeps: { exclude: ['@content/shared'] },
    server: {
      host: env.VITE_DEV_SERVER_HOST || '127.0.0.1',
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true }
      }
    },
    css: { devSourcemap: true },
    build: createViteBuild(isDev)
  };
});
