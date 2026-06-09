import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import AutoImport from 'unplugin-auto-import/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number(env.VITE_DEV_SERVER_PORT || 3100);
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3101';

  return {
    plugins: [
      vue(),
      // Element Plus 按需自动导入组件
      Components({
        resolvers: [ElementPlusResolver({ importStyle: 'css' })]
      }),
      // Vue / Element Plus API 自动导入
      AutoImport({
        resolvers: [ElementPlusResolver()],
        imports: ['vue', 'vue-router', 'pinia']
      })
    ],
    server: {
      host: env.VITE_DEV_SERVER_HOST || '127.0.0.1',
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/vue') || id.includes('node_modules/@vue')
              || id.includes('node_modules/pinia') || id.includes('node_modules/vue-router')) {
              return 'vendor-vue';
            }
            // Element Plus 按需导入后会自动 tree-shake，剩余组件放一起
            if (id.includes('node_modules/element-plus') || id.includes('node_modules/@element-plus')) {
              return 'vendor-ui';
            }
            if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/axios') || id.includes('node_modules/@content')) {
              return 'vendor-http';
            }
            if (id.includes('node_modules')) {
              return 'vendor-misc';
            }
          }
        }
      },
      reportCompressedSize: false,
      chunkSizeWarningLimit: 600
    }
  };
});
