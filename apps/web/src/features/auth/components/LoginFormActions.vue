<template>
  <div class="login-actions">
    <el-button type="primary" class="login-button" :loading="loading" @click="$emit('submit')">
      登录进入作战台
    </el-button>
    <el-button
      type="info"
      plain
      class="login-fill"
      :disabled="loading"
      title="填入默认开发账号 admin / contentops2024"
      @click="$emit('fill-defaults')"
    >
      一键填默认账号
    </el-button>
  </div>
</template>
<script setup lang="ts">
defineProps<{ loading: boolean }>();
defineEmits<{ submit: []; 'fill-defaults': [] }>();
</script>
