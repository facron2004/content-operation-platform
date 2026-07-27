<template>
  <div class="login-actions">
    <AppleButton variant="primary" class="login-button" :loading="loading" @click="$emit('submit')">
      登录进入作战台
    </AppleButton>
  </div>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{ loading: boolean }>();
defineEmits<{ submit: [] }>();
</script>
