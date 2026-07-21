import { computed, ref, watch, type Ref } from 'vue';

export type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'theme_preference';

function loadStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['light', 'dark', 'auto'].includes(stored)) return stored as Theme;
  } catch {
    /* ignore */
  }
  return 'auto';
}

function saveStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function resolveEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto')
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return theme;
}

function applyThemeToDom(effective: 'light' | 'dark') {
  const root = document.documentElement;
  if (effective === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
}

function loadThemeInto(theme: Ref<Theme>) {
  theme.value = loadStoredTheme();
}

function saveThemeFrom(theme: Ref<Theme>) {
  saveStoredTheme(theme.value);
}

function applyThemeState(theme: Ref<Theme>, effectiveTheme: Ref<'light' | 'dark'>) {
  const effective = resolveEffectiveTheme(theme.value);
  effectiveTheme.value = effective;
  applyThemeToDom(effective);
}

function watchSystemTheme(theme: Ref<Theme>, apply: () => void) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'auto') apply();
  });
}

function nextTheme(current: Theme): Theme {
  const themes: Theme[] = ['light', 'dark', 'auto'];
  return themes[(themes.indexOf(current) + 1) % themes.length];
}

export class ThemeService {
  private theme = ref<Theme>('auto');
  private effectiveTheme = ref<'light' | 'dark'>('light');
  constructor() {
    loadThemeInto(this.theme);
    this.applyTheme();
    watchSystemTheme(this.theme, () => this.applyTheme());
    watch(this.theme, () => {
      saveThemeFrom(this.theme);
      this.applyTheme();
    });
  }
  init(): void {}
  get themeRef() {
    return this.theme;
  }
  get effectiveThemeRef() {
    return this.effectiveTheme;
  }
  setTheme(theme: Theme) {
    this.theme.value = theme;
  }
  toggleTheme() {
    this.theme.value = nextTheme(this.theme.value);
  }
  private applyTheme() {
    applyThemeState(this.theme, this.effectiveTheme);
  }
}

export const themeService = new ThemeService();

export function useTheme() {
  return {
    theme: computed(() => themeService.themeRef.value),
    effectiveTheme: computed(() => themeService.effectiveThemeRef.value),
    setTheme: (theme: Theme) => themeService.setTheme(theme),
    toggleTheme: () => themeService.toggleTheme()
  };
}
