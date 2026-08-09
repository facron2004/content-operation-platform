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
    <CookieConfigBody
      v-model:new-cookie-string="newCookieString"
      :cookie-status="cookieStatus"
      :status-error="statusError"
      :save-error="saveError"
      :format-time="formatTime"
    />
    <template #footer>
      <div class="dialog-footer">
        <AppleButton variant="secondary" @click="$emit('update:visible', false)">取消</AppleButton>
        <AppleButton variant="primary" :loading="updatingCookie" @click="saveCookie">
          验证并更新
        </AppleButton>
      </div>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { useCookieConfigDialog } from '../composables/useCookieConfigDialog';
import CookieConfigBody from './CookieConfigBody.vue';
import AppleButton from './AppleButton.vue';
defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();
const {
  cookieStatus,
  statusError,
  saveError,
  updatingCookie,
  newCookieString,
  onOpen,
  saveCookie,
  formatTime
} = useCookieConfigDialog(emit);
</script>
