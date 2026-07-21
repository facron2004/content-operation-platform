export function resolveManualChunk(id: string): string | undefined {
  if (
    id.includes('node_modules/vue') ||
    id.includes('node_modules/@vue') ||
    id.includes('node_modules/pinia') ||
    id.includes('node_modules/vue-router')
  ) {
    return 'vendor-vue';
  }
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
