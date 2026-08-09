<template>
  <button
    class="apple-btn"
    :class="[
      `apple-btn--${variant}`,
      `apple-btn--${size}`,
      {
        'is-loading': loading,
        'is-block': block,
        'is-icon-only': iconOnly
      }
    ]"
    :type="nativeType"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    v-bind="$attrs"
    @click="onClick"
  >
    <span v-if="loading" class="apple-btn__spinner" aria-hidden="true" />
    <span v-if="!loading && $slots.icon" class="apple-btn__icon">
      <slot name="icon" />
    </span>
    <span v-if="!iconOnly" class="apple-btn__label">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /**
     * primary  — filled iOS blue
     * secondary — grey fill (default)
     * ghost     — text/link, blue label
     * tinted    — light blue fill (plain primary)
     * danger    — filled red
     * success   — filled green
     * warning   — filled orange
     * quiet     — muted text (el text default)
     */
    variant?:
      'primary' | 'secondary' | 'ghost' | 'tinted' | 'danger' | 'success' | 'warning' | 'quiet';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    /** Square icon-only control (el-button circle) */
    iconOnly?: boolean;
    nativeType?: 'button' | 'submit' | 'reset';
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    loading: false,
    disabled: false,
    block: false,
    iconOnly: false,
    nativeType: 'button'
  }
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

function onClick(event: MouseEvent) {
  emit('click', event);
}
</script>

<style scoped src="../styles/components/apple-button.css"></style>
