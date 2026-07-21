<script setup lang="ts">
// Parent passes a reactive form object; child writes fields in place.
/* eslint-disable vue/no-mutating-props */
defineProps<{
  form: { type: string; name: string; merchantId: string; comment: string; payloadText: string };
  ruleTypeLabels: Record<string, string>;
}>();
defineEmits<{ 'type-change': []; 'load-default': [] }>();
</script>
<template>
  <el-form label-position="top">
    <el-form-item label="类型" required>
      <el-select v-model="form.type" style="width: 100%" @change="$emit('type-change')">
        <slot name="type-options" />
      </el-select>
    </el-form-item>
    <el-form-item label="规则名称" required>
      <el-input v-model="form.name" placeholder="如：A商户春节促销评分" />
    </el-form-item>
    <el-form-item label="商户ID">
      <el-input v-model="form.merchantId" placeholder="留空=平台默认规则" />
    </el-form-item>
    <el-form-item label="备注"><el-input v-model="form.comment" placeholder="选填" /></el-form-item>
    <el-form-item label="规则 payload（JSON）">
      <div class="payload-toolbar">
        <el-button size="small" text type="primary" @click="$emit('load-default')">
          载入{{ ruleTypeLabels[form.type] }}默认
        </el-button>
        <span class="payload-hint">仅填写需覆盖的字段，其余回落默认</span>
      </div>
      <el-input
        v-model="form.payloadText"
        type="textarea"
        :rows="12"
        class="payload-editor"
        spellcheck="false"
      />
    </el-form-item>
  </el-form>
</template>
