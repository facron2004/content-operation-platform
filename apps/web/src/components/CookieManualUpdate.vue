<template>
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
      :model-value="newCookieString"
      type="textarea"
      :rows="3"
      placeholder="粘贴 document.cookie 输出的字符串..."
      resize="none"
      style="margin-top: 10px"
      @update:model-value="$emit('update:newCookieString', $event)"
    />
  </div>
</template>
<script setup lang="ts">
defineProps<{ newCookieString: string }>();
defineEmits<{ 'update:newCookieString': [value: string] }>();
</script>
