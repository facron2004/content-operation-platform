import type { PluginOption, UserConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import AutoImport from 'unplugin-auto-import/vite';
import { resolveManualChunk } from './vite.manual-chunks';

export function createVitePlugins(): PluginOption[] {
  return [
    vue(),
    Components({
      dts: false,
      resolvers: [ElementPlusResolver({ importStyle: 'css' })]
    }),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      imports: ['vue', 'vue-router', 'pinia']
    })
  ];
}

export { resolveManualChunk };

export function createViteBuild(isDev: boolean): UserConfig['build'] {
  return {
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: isDev ? false : 'hidden',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: resolveManualChunk
      }
    },
    reportCompressedSize: false,
    chunkSizeWarningLimit: 800
  };
}
