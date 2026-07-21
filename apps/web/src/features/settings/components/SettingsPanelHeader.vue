<script setup lang="ts">
defineProps<{ defaultsVisible: boolean }>();
defineEmits<{ 'toggle-defaults': []; create: [] }>();
</script>
<template>
  <div class="panel-head">
    <div>
      <h2>规则配置引擎</h2>
      <p class="panel-sub">
        按
        <strong>商户 × 类型</strong>
        覆盖平台默认规则，无需改代码。每条配置生成新版本，激活后即时生效。
      </p>
    </div>
    <div class="panel-actions">
      <el-button text type="primary" @click="$emit('toggle-defaults')">
        {{ defaultsVisible ? '隐藏默认基线' : '查看平台默认基线' }}
      </el-button>
      <el-button type="primary" @click="$emit('create')">新建规则</el-button>
    </div>
  </div>
</template>
