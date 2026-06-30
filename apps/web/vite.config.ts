import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import AutoImport from 'unplugin-auto-import/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number(env.VITE_DEV_SERVER_PORT || 3100);
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3101';
  const isDev = mode === 'development';

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
    optimizeDeps: {
      include: ['@content/shared']
    },
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
    css: {
      // 生产环境提取 CSS 到独立文件，开发环境保持内联以加速 HMR
      devSourcemap: true
    },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      cssCodeSplit: true,
      // 生产环境生成 sourcemap 便于线上问题定位
      sourcemap: isDev ? false : 'hidden',
      rollupOptions: {
        output: {
          // 入口文件使用 hash，确保缓存失效
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id) {
            if (
              id.includes('node_modules/vue') ||
              id.includes('node_modules/@vue') ||
              id.includes('node_modules/pinia') ||
              id.includes('node_modules/vue-router')
            ) {
              return 'vendor-vue';
            }
            // Element Plus 按需导入后会自动 tree-shake，剩余组件放一起
            if (
              id.includes('node_modules/element-plus') ||
              id.includes('node_modules/@element-plus')
            ) {
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
      chunkSizeWarningLimit: 800
    }
  };
});
