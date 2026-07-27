<script setup lang="ts">
// Parent passes a reactive filters object; child writes fields in place.
/* eslint-disable vue/no-mutating-props */
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{
  filters: { merchantId: string; type: string; isActive: string | boolean };
  typeOptions: Array<{ label: string; value: string }>;
  isActiveOptions: Array<{ label: string; value: string | boolean }>;
}>();
defineEmits<{ load: [] }>();
</script>
<template>
  <el-form :inline="true" class="filter-bar">
    <el-form-item label="商户ID">
      <el-input v-model="filters.merchantId" placeholder="留空=全部" clearable />
    </el-form-item>
    <el-form-item label="类型">
      <el-select v-model="filters.type" placeholder="全部" clearable style="width: 140px">
        <el-option
          v-for="opt in typeOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="状态">
      <el-select v-model="filters.isActive" placeholder="全部" style="width: 120px">
        <el-option
          v-for="opt in isActiveOptions"
          :key="String(opt.value)"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </el-form-item>
    <el-form-item>
      <AppleButton variant="tinted" @click="$emit('load')">查询</AppleButton>
    </el-form-item>
  </el-form>
</template>
