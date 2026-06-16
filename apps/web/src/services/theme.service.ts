import { ref, watch, computed } from 'vue';

type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'theme_preference';

class ThemeService {
  private theme = ref<Theme>('auto');
  private effectiveTheme = ref<'light' | 'dark'>('light');

  constructor() {
    this.loadTheme();
    this.applyTheme();
    this.watchSystemTheme();

    // 监听主题变化
    watch(this.theme, () => {
      this.saveTheme();
      this.applyTheme();
    });
  }

  /** 显式初始化入口，确保单例在应用启动时完成构造 */
  init(): void {
    // 构造函数已完成所有初始化，此方法仅作为显式调用点
  }

  getTheme() {
    return this.theme;
  }

  getEffectiveTheme() {
    return this.effectiveTheme;
  }

  setTheme(theme: Theme) {
    this.theme.value = theme;
  }

  toggleTheme() {
    const themes: Theme[] = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(this.theme.value);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.theme.value = themes[nextIndex];
  }

  private loadTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['light', 'dark', 'auto'].includes(stored)) {
        this.theme.value = stored as Theme;
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private saveTheme() {
    try {
      localStorage.setItem(STORAGE_KEY, this.theme.value);
    } catch {
      // Ignore localStorage errors
    }
  }

  private applyTheme() {
    const effective = this.resolveEffectiveTheme();
    this.effectiveTheme.value = effective;

    // 应用到 DOM
    if (effective === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  private resolveEffectiveTheme(): 'light' | 'dark' {
    if (this.theme.value === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return this.theme.value;
  }

  private watchSystemTheme() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (this.theme.value === 'auto') {
        this.applyTheme();
      }
    });
  }
}

// 单例
export const themeService = new ThemeService();

// Vue composable — 返回响应式引用
export function useTheme() {
  return {
    theme: computed(() => themeService.getTheme().value),
    effectiveTheme: computed(() => themeService.getEffectiveTheme().value),
    setTheme: (theme: Theme) => themeService.setTheme(theme),
    toggleTheme: () => themeService.toggleTheme()
  };
}
