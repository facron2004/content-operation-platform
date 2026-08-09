<template>
  <section v-if="isDesktop" class="desktop-runtime-config panel-card">
    <div class="panel-card__header">
      <div>
        <h3>桌面运行配置</h3>
        <p>公开配置保存在当前用户目录；保存后会重启本地服务并重新检查就绪状态。</p>
      </div>
      <el-tag size="small" type="info">不显示敏感密钥</el-tag>
    </div>

    <el-form class="desktop-runtime-config__form" label-position="top">
      <el-form-item label="内容数据源">
        <el-select v-model="form.CONTENT_DATA_SOURCE" placeholder="选择数据源">
          <el-option label="JeeSite" value="jeesite" />
          <el-option label="外部 API" value="external" />
          <el-option label="本地生活" value="local-life" />
        </el-select>
      </el-form-item>
      <el-form-item label="外部数据源 Base URL">
        <el-input
          v-model="form.EXTERNAL_API_BASE_URL"
          placeholder="https://example.com/a"
          clearable
        />
      </el-form-item>
      <el-form-item label="外部套餐路径">
        <el-input
          v-model="form.EXTERNAL_PACKAGES_PATH"
          placeholder="/bargain/bargainCommodity/listData"
          clearable
        />
      </el-form-item>
      <el-form-item label="本地生活 API Base URL">
        <el-input v-model="form.LOCAL_LIFE_API_BASE_URL" placeholder="可选" clearable />
      </el-form-item>
      <el-form-item class="desktop-runtime-config__actions">
        <el-button type="primary" :loading="loading" @click="save">保存并重启服务</el-button>
      </el-form-item>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

const isDesktop = computed(() => Boolean(window.desktopAPI));
const loading = ref(false);
const form = reactive({
  CONTENT_DATA_SOURCE: 'jeesite',
  EXTERNAL_API_BASE_URL: '',
  EXTERNAL_PACKAGES_PATH: '',
  LOCAL_LIFE_API_BASE_URL: ''
});

async function load(): Promise<void> {
  if (!window.desktopAPI) return;
  try {
    const config = await window.desktopAPI.getConfig();
    form.CONTENT_DATA_SOURCE = config.public.CONTENT_DATA_SOURCE ?? 'jeesite';
    form.EXTERNAL_API_BASE_URL = config.public.EXTERNAL_API_BASE_URL ?? '';
    form.EXTERNAL_PACKAGES_PATH = config.public.EXTERNAL_PACKAGES_PATH ?? '';
    form.LOCAL_LIFE_API_BASE_URL = config.public.LOCAL_LIFE_API_BASE_URL ?? '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '读取桌面配置失败');
  }
}

async function save(): Promise<void> {
  if (!window.desktopAPI) return;
  loading.value = true;
  try {
    await window.desktopAPI.savePublicConfig({ ...form });
    ElMessage.success('配置已保存，本地服务正在重启');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存桌面配置失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.desktop-runtime-config {
  margin-bottom: 16px;
}

.panel-card {
  padding: 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
}

.panel-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 15px;
}

p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.desktop-runtime-config__form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 12px;
}

.desktop-runtime-config__form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.desktop-runtime-config__actions {
  align-self: end;
}

@media (max-width: 900px) {
  .desktop-runtime-config__form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
