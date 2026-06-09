import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles.css';

// Element Plus 已通过 unplugin-vue-components 按需自动导入
// 无需手动 import ElementPlus / import 'element-plus/dist/index.css'

createApp(App).use(createPinia()).use(router).mount('#app');
