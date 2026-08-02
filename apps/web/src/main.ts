import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import 'element-plus/dist/index.css';
import './styles.css';
import './styles/dark-theme.css';
import { themeService } from './services/theme.service';
themeService.init();
const app = createApp(App);
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Error]', info, err);
};
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  event.preventDefault();
});
app.use(createPinia()).use(router).mount('#app');
