<template>
  <el-dialog
    :model-value="visible"
    title="JeeSite 数据源连接配置"
    width="500px"
    append-to-body
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
    @open="onOpen"
  >
    <div class="cookie-dialog-content">
      <el-alert
        v-if="!cookieStatus?.isValid"
        title="JeeSite 认证已失效"
        type="error"
        description="因为多次登录失败触发验证码或 Cookie 过期，系统无法自动抓取库存。请在浏览器中手动登录后更新 Cookie。"
        show-icon
        :closable="false"
        style="margin-bottom: 16px"
      />
      <el-alert
        v-else
        title="JeeSite 连通正常"
        type="success"
        description="系统正使用有效 Session 自动同步最新数据。无需额外操作。"
        show-icon
        :closable="false"
        style="margin-bottom: 16px"
      />

      <div class="status-items">
        <div class="status-item">
          <span>账号名</span>
          <strong>{{ cookieStatus?.username || '未配置' }}</strong>
        </div>
        <div class="status-item">
          <span>连接状态</span>
          <el-tag :type="cookieStatus?.isValid ? 'success' : 'danger'" size="small">
            {{ cookieStatus?.isValid ? '在线' : '离线' }}
          </el-tag>
        </div>
        <div v-if="(cookieStatus?.cooldownMinutes ?? 0) > 0" class="status-item">
          <span>安全冷却</span>
          <span class="warning-text">
            自动登录冷却中（余 {{ cookieStatus?.cooldownMinutes }} 分钟）
          </span>
        </div>
        <div v-if="cookieStatus?.lastLoginTime" class="status-item">
          <span>上次成功登录</span>
          <span>{{ formatTime(cookieStatus.lastLoginTime) }}</span>
        </div>
        <div class="status-item code-row">
          <span>Session ID</span>
          <code>{{ cookieStatus?.maskedCookie || '无' }}</code>
        </div>
      </div>

      <div class="manual-cookie-section">
        <h4>手动更新 Cookie</h4>
        <ol class="instructions">
          <li>
            在浏览器中访问并登录：
            <a href="https://zdm.zhsh1.cn/a/login" target="_blank" rel="noopener noreferrer">
              zdm.zhsh1.cn/a/login
            </a>
          </li>
          <li>输入账号密码及验证码登录成功。</li>
          <li>
            在页面任意处按
            <strong>F12</strong>
            ，进入 Console 输入
            <code>document.cookie</code>
            。
          </li>
          <li>复制输出的完整字符串，粘贴在下方。</li>
        </ol>

        <el-input
          v-model="newCookieString"
          type="textarea"
          :rows="3"
          placeholder="粘贴 document.cookie 输出的字符串..."
          resize="none"
          style="margin-top: 10px"
        />
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="$emit('update:visible', false)">取消</el-button>
        <el-button type="primary" :loading="updatingCookie" @click="saveCookie">
          验证并更新
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../services/api';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();

type CookieStatus = Awaited<ReturnType<typeof api.getCookieStatus>>;
const cookieStatus = ref<CookieStatus | null>(null);
const updatingCookie = ref(false);
const newCookieString = ref('');

const fetchCookieStatus = async () => {
  try {
    cookieStatus.value = await api.getCookieStatus();
  } catch {
    // 拦截器已处理错误提示
  }
};

const onOpen = async () => {
  newCookieString.value = '';
  await fetchCookieStatus();
};

const saveCookie = async () => {
  if (!newCookieString.value.trim()) {
    ElMessage.warning('请输入 Cookie 字符串');
    return;
  }
  updatingCookie.value = true;
  try {
    const res = await api.updateCookie(newCookieString.value.trim());
    if (res.success) {
      ElMessage.success('Cookie 更新成功，连接已恢复！');
      emit('update:visible', false);
      await fetchCookieStatus();
    } else {
      ElMessage.error(res.error || '更新失败，请检查 Cookie 是否有效');
    }
  } catch {
    // 拦截器处理
  } finally {
    updatingCookie.value = false;
  }
};

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  return new Date(timeStr).toLocaleString();
};

let cookiePoller: ReturnType<typeof setInterval> | null = null;
cookiePoller = setInterval(fetchCookieStatus, 30000);
onUnmounted(() => {
  if (cookiePoller) clearInterval(cookiePoller);
});
</script>

<style scoped>
.cookie-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.status-items {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--soft, #f8fafc);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.status-item span {
  color: var(--muted);
}

.status-item strong {
  color: var(--ink);
}

.warning-text {
  color: var(--warning);
  font-weight: 700;
  text-align: right;
}

.code-row code {
  max-width: 280px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #e2e8f0;
  word-break: break-all;
  font-family: monospace;
  font-size: 11px;
}

.manual-cookie-section {
  margin-top: 6px;
}

.manual-cookie-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: var(--ink);
}

.instructions {
  margin: 0;
  padding-left: 20px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.7;
}

.instructions a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}

.instructions a:hover {
  text-decoration: underline;
}

.instructions code {
  background: #f1f5f9;
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
