<template>
  <div class="cookie-dialog-content">
    <CookieStatusAlerts :cookie-status="cookieStatus" />
    <CookieStatusItems :cookie-status="cookieStatus" :format-time="formatTime" />
    <CookieManualUpdate
      :new-cookie-string="newCookieString"
      @update:new-cookie-string="$emit('update:newCookieString', $event)"
    />
  </div>
</template>
<script setup lang="ts">
import CookieStatusAlerts from './CookieStatusAlerts.vue';
import CookieStatusItems from './CookieStatusItems.vue';
import CookieManualUpdate from './CookieManualUpdate.vue';
defineProps<{
  cookieStatus: {
    isValid?: boolean;
    hasCookie?: boolean;
    username?: string | null;
    cooldownMinutes?: number;
    lastLoginTime?: number | string | null;
  } | null;
  newCookieString: string;
  formatTime: (value: string) => string;
}>();
defineEmits<{ 'update:newCookieString': [value: string] }>();
</script>
<style src="../styles/components/cookie-config-dialog.css" scoped></style>
