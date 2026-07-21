<!-- eslint-disable vue/no-mutating-props -- parent-owned draft object -->
<template>
  <section class="panel review-panel">
    <div class="panel-head"><h2>审核内容</h2></div>
    <el-empty v-if="!selected" description="选择一条文案" />
    <template v-else>
      <el-form label-position="top">
        <el-form-item label="标题" required>
          <el-input v-model="draft.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="正文" required>
          <el-input v-model="draft.body" type="textarea" :rows="8" placeholder="请输入正文内容" />
        </el-form-item>
        <el-form-item label="审核备注">
          <el-input
            v-model="draft.auditRemark"
            type="textarea"
            :rows="3"
            placeholder="选填，记录审核意见"
          />
        </el-form-item>
      </el-form>
      <div class="check-list">
        <span>价格一致</span>
        <span>库存一致</span>
        <span>时间准确</span>
        <span>保留限制</span>
        <span>渠道风格</span>
      </div>
      <div class="button-row">
        <el-button type="success" @click="emit('audit', 'approved')">通过</el-button>
        <el-button type="warning" @click="emit('audit', 'risk')">标记风险</el-button>
        <el-button type="danger" @click="emit('audit', 'rejected')">驳回</el-button>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
// Parent owns a mutable draft object and passes it by reference for in-place edits.

defineProps<{ selected: unknown; draft: { title: string; body: string; auditRemark: string } }>();
const emit = defineEmits<{ audit: [status: 'approved' | 'risk' | 'rejected'] }>();
</script>
