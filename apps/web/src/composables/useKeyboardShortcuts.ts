import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';

export interface ShortcutDefinition {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  handler: () => void;
}

/** 判断事件来源是否为表单输入元素 */
function isInputEvent(event: KeyboardEvent): boolean {
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

/** 平台判断：用户是否为 macOS（决定快捷键展示使用 ⌘ 还是 Ctrl）。模块级一次性计算。 */
const IS_MAC = /mac|iphone|ipad/i.test(navigator.platform);

export function useKeyboardShortcuts() {
  const shortcuts: ShortcutDefinition[] = [];

  // 注册快捷键
  function register(shortcut: ShortcutDefinition) {
    shortcuts.push(shortcut);
  }

  // 处理键盘事件
  function handleKeyDown(event: KeyboardEvent) {
    // 不在表单输入元素中触发快捷键
    if (isInputEvent(event)) return;

    const cmdOrCtrl = IS_MAC ? event.metaKey : event.ctrlKey;

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? cmdOrCtrl : !cmdOrCtrl;
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

      if (ctrlMatch && altMatch && shiftMatch && keyMatch) {
        event.preventDefault();
        shortcut.handler();
        break;
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  return {
    register,
    shortcuts
  };
}

// 全局快捷键 composable
export function useGlobalShortcuts() {
  const router = useRouter();
  const { register } = useKeyboardShortcuts();

  // 定义全局快捷键（移除 Ctrl+R 以避免与浏览器原生刷新冲突）
  const globalShortcuts: ShortcutDefinition[] = [
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
        showShortcutHelp();
      }
    }
  ];

  // 注册所有快捷键
  globalShortcuts.forEach((shortcut) => register(shortcut));

  // 显示快捷键帮助（使用 Element Plus 弹窗替代原生 alert）
  function showShortcutHelp() {
    const modKey = IS_MAC ? 'Cmd' : 'Ctrl';

    const helpHtml = globalShortcuts
      .map((s) => {
        const keys: string[] = [];
        if (s.ctrl) keys.push(`<kbd>${modKey}</kbd>`);
        if (s.alt) keys.push('<kbd>Alt</kbd>');
        if (s.shift) keys.push('<kbd>Shift</kbd>');
        keys.push(`<kbd>${s.key.toUpperCase()}</kbd>`);
        return `<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${keys.join(' + ')}</span><span style="color:var(--muted)">${s.description}</span></div>`;
      })
      .join('');

    ElMessageBox.alert(helpHtml, '键盘快捷键', {
      dangerouslyUseHTMLString: true,
      confirmButtonText: '关闭',
      customStyle: { maxWidth: '400px' }
    });
  }

  return {
    shortcuts: globalShortcuts
  };
}
