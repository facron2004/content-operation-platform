import { computed, onMounted, onScopeDispose, ref } from 'vue';

/** Drawer width that collapses to full viewport on narrow screens. */
export function useResponsiveDrawerSize(desktopSize: string, breakpoint = 520) {
  const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);

  function onResize() {
    viewportWidth.value = window.innerWidth;
  }

  onMounted(() => window.addEventListener('resize', onResize));
  onScopeDispose(() => window.removeEventListener('resize', onResize));

  const drawerSize = computed(() => (viewportWidth.value < breakpoint ? '100%' : desktopSize));

  return { drawerSize, viewportWidth };
}
