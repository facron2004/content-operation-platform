import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles.css';
import './styles/dark-theme.css';

// 初始化主题服务（调用 init 确保单例在应用启动时完成初始化）
import { themeService } from './services/theme.service';
themeService.init();

// Element Plus 已通过 unplugin-vue-components 按需自动导入
// 无需手动 import ElementPlus / import 'element-plus/dist/index.css'

const app = createApp(App);

// P1: Global error handler — prevents silent component errors
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Error]', info, err);
  // In production, could send to monitoring service
};

// P1: Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  event.preventDefault(); // Prevent console pollution
});

app.use(createPinia()).use(router).mount('#app');
