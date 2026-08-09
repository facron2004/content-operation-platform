import { ElMessageBox } from 'element-plus';
import { onMounted, onScopeDispose } from 'vue';
import { useRouter, type Router } from 'vue-router';

export interface ShortcutDefinition {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  handler: () => void;
}
export function isInputEvent(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  );
}
export const IS_MAC = /mac|iphone|ipad/i.test(navigator.platform);
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition,
  cmdOrCtrl: boolean
): boolean {
  const ctrlMatch = shortcut.ctrl ? cmdOrCtrl : !cmdOrCtrl,
    altMatch = shortcut.alt ? event.altKey : !event.altKey;
  const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
  return (
    ctrlMatch && altMatch && shiftMatch && event.key.toLowerCase() === shortcut.key.toLowerCase()
  );
}

export function useKeyboardShortcuts() {
  const shortcuts: ShortcutDefinition[] = [];
  function register(shortcut: ShortcutDefinition) {
    shortcuts.push(shortcut);
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (isInputEvent(event)) return;
    const cmdOrCtrl = IS_MAC ? event.metaKey : event.ctrlKey;
    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut, cmdOrCtrl)) {
        event.preventDefault();
        shortcut.handler();
        break;
      }
    }
  }
  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });
  onScopeDispose(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
  return { register, shortcuts };
}

export function buildGlobalShortcutDefs(router: Router): ShortcutDefinition[] {
  const shortcuts: ShortcutDefinition[] = [
    {
      key: '1',
      ctrl: true,
      description: '首页',
      handler: () => {
        router.push('/dashboard');
      }
    },
    {
      key: '2',
      ctrl: true,
      description: '推荐列表',
      handler: () => {
        router.push('/recommendations');
      }
    },
    {
      key: '3',
      ctrl: true,
      description: '生成文案',
      handler: () => {
        router.push('/generate');
      }
    },
    {
      key: '4',
      ctrl: true,
      description: '预警中心',
      handler: () => {
        router.push('/alerts');
      }
    },
    {
      key: '5',
      ctrl: true,
      description: '效果看板',
      handler: () => {
        router.push('/performance');
      }
    },
    {
      key: '/',
      ctrl: true,
      description: '显示快捷键帮助',
      handler: () => {
        showShortcutHelp(shortcuts);
      }
    }
  ];
  return shortcuts;
}
export function showShortcutHelp(shortcuts: ShortcutDefinition[]) {
  const modKey = IS_MAC ? 'Cmd' : 'Ctrl';
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const helpHtml = shortcuts
    .map((s) => {
      const keys: string[] = [];
      if (s.ctrl) keys.push(`<kbd>${modKey}</kbd>`);
      if (s.alt) keys.push('<kbd>Alt</kbd>');
      if (s.shift) keys.push('<kbd>Shift</kbd>');
      keys.push(`<kbd>${escapeHtml(s.key.toUpperCase())}</kbd>`);
      return `<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${keys.join(' + ')}</span><span style="color:var(--muted)">${escapeHtml(s.description)}</span></div>`;
    })
    .join('');
  ElMessageBox.alert(helpHtml, '键盘快捷键', {
    dangerouslyUseHTMLString: true,
    confirmButtonText: '关闭',
    customStyle: { maxWidth: '400px' }
  });
}

export function useGlobalShortcuts() {
  const router = useRouter();
  const { register } = useKeyboardShortcuts();
  const globalShortcuts = buildGlobalShortcutDefs(router);
  globalShortcuts.forEach((shortcut) => register(shortcut));
  return { shortcuts: globalShortcuts };
}
