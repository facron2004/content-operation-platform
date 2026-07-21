<template>
  <el-row :gutter="12" class="community-filter-bar">
    <el-col :span="6">
      <el-input
        v-model="local.keyword"
        placeholder="搜索社群名称"
        clearable
        @clear="emitSearch"
        @keyup.enter="emitSearch"
      />
    </el-col>
    <el-col :span="4">
      <el-select v-model="local.groupType" placeholder="社群类型" clearable @change="emitSearch">
        <el-option label="全部" value="" />
        <el-option label="微信群" value="wechat_group" />
        <el-option label="朋友圈" value="moments" />
        <el-option label="商家转发" value="merchant_share" />
      </el-select>
    </el-col>
    <el-col :span="4">
      <el-select v-model="local.activityLevel" placeholder="活跃度" clearable @change="emitSearch">
        <el-option label="全部" value="" />
        <el-option label="高" value="high" />
        <el-option label="中" value="medium" />
        <el-option label="低" value="low" />
      </el-select>
    </el-col>
    <el-col :span="3">
      <el-select v-model="local.isActive" placeholder="状态" clearable @change="emitSearch">
        <el-option label="全部" :value="undefined" />
        <el-option label="启用" :value="true" />
        <el-option label="停用" :value="false" />
      </el-select>
    </el-col>
    <el-col :span="7">
      <el-button type="primary" @click="emitSearch">搜索</el-button>
      <el-button @click="emitReset">重置</el-button>
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';

const props = defineProps<{
  modelValue: {
    groupType: string;
    areaId: string;
    activityLevel: string;
    isActive?: boolean;
    keyword: string;
  };
}>();

const emit = defineEmits<{
  'update:modelValue': [value: typeof props.modelValue];
  search: [];
  reset: [];
}>();

const local = reactive({ ...props.modelValue });

watch(
  () => props.modelValue,
  (v) => {
    Object.assign(local, v);
  },
  { deep: true }
);

function emitSearch() {
  emit('update:modelValue', { ...local });
  emit('search');
}

function emitReset() {
  local.groupType = '';
  local.areaId = '';
  local.activityLevel = '';
  local.isActive = undefined;
  local.keyword = '';
  emit('update:modelValue', { ...local });
  emit('reset');
}
</script>

<style scoped>
.community-filter-bar {
  margin-bottom: 16px;
  align-items: center;
}
</style>
