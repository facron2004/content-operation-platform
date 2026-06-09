<template>
  <div class="app-shell">
    <div v-if="routeLoading" class="route-loading-bar"></div>
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">OP</div>
        <div>
          <strong>本地生活作战台</strong>
          <span>JeeSite 实时运营</span>
        </div>
      </div>
      <el-menu router :default-active="$route.path" class="nav-menu">
        <el-menu-item index="/">
          <el-icon><DataBoard /></el-icon>
          <span>今日作战台</span>
        </el-menu-item>
        <el-menu-item index="/recommendations">
          <el-icon><TrendCharts /></el-icon>
          <span>套餐页</span>
        </el-menu-item>
        <el-menu-item index="/generate">
          <el-icon><EditPen /></el-icon>
          <span>作战卡生成</span>
        </el-menu-item>
        <el-menu-item index="/communities">
          <el-icon><ChatLineRound /></el-icon>
          <span>社群运营</span>
        </el-menu-item>
        <el-menu-item index="/alerts">
          <el-icon><Warning /></el-icon>
          <span>异常预警</span>
        </el-menu-item>
        <el-menu-item index="/audit">
          <el-icon><Checked /></el-icon>
          <span>文稿审核</span>
        </el-menu-item>
        <el-menu-item index="/performance">
          <el-icon><Histogram /></el-icon>
          <span>效果看板</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">Local Life Ops</p>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="topbar-actions">
          <el-select v-model="roleStore.currentRole" class="role-select" @change="roleStore.setRole">
            <el-option
              v-for="option in roleStore.roleOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-tag effect="light" type="primary">{{ roleStore.roleLabel }}</el-tag>
        </div>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChatLineRound, Checked, DataBoard, EditPen, Histogram, TrendCharts, Warning } from '@element-plus/icons-vue';
import { useRoleStore } from '../stores/role';

const roleStore = useRoleStore();
const route = useRoute();
const router = useRouter();

const routeLoading = ref(false);
router.beforeEach(() => { routeLoading.value = true; });
router.afterEach(() => { nextTick(() => { routeLoading.value = false; }); });

const titles: Record<string, string> = {
  dashboard: '今日作战台',
  recommendations: '套餐页',
  'package-analysis': '套餐详情分析',
  generate: '作战卡生成',
  communities: '社群运营',
  alerts: '异常预警中心',
  audit: '文稿审核',
  performance: '内容效果看板'
};

const pageTitle = computed(() => titles[String(route.name)] ?? '内容运营中台');
</script>

<style scoped>
.route-loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  width: 100%;
  background: var(--el-color-primary, #409eff);
  z-index: 9999;
  animation: route-loading 1.5s ease-in-out infinite;
}
@keyframes route-loading {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(0); }
  100% { transform: translateX(100%); }
}
</style>