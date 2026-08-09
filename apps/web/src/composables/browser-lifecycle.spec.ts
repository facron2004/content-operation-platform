import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { Notification } from '../services/notification.service';

const mocks = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  getAll: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  routerPush: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (callback: () => void) => callback()
  };
});

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn()
  }
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.routerPush })
}));

vi.mock('../services/notification.service', () => ({
  useNotifications: () => ({
    getAll: mocks.getAll,
    subscribe: mocks.subscribe,
    markAsRead: mocks.markAsRead,
    markAllAsRead: mocks.markAllAsRead,
    remove: mocks.remove,
    clear: mocks.clear
  })
}));

import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useNotificationCenter } from './useNotificationCenter';
import { useResponsiveDrawerSize } from './useResponsiveDrawerSize';

describe('browser composable scope cleanup', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      innerWidth: 1024,
      addEventListener: mocks.addEventListener,
      removeEventListener: mocks.removeEventListener
    });
    mocks.getAll.mockReturnValue([]);
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
    vi.unstubAllGlobals();
  });

  it('removes the global keyboard listener when its scope stops', () => {
    scope = effectScope();
    scope.run(() => useKeyboardShortcuts());

    const handler = mocks.addEventListener.mock.calls[0][1];
    expect(mocks.addEventListener).toHaveBeenCalledWith('keydown', handler);

    scope.stop();

    expect(mocks.removeEventListener).toHaveBeenCalledWith('keydown', handler);
  });

  it('removes the responsive drawer listener when its scope stops', () => {
    scope = effectScope();
    const drawer = scope.run(() => useResponsiveDrawerSize('440px'))!;
    const handler = mocks.addEventListener.mock.calls[0][1];

    expect(drawer.drawerSize.value).toBe('440px');
    (globalThis.window as { innerWidth: number }).innerWidth = 400;
    handler();
    expect(drawer.drawerSize.value).toBe('100%');

    scope.stop();

    expect(mocks.removeEventListener).toHaveBeenCalledWith('resize', handler);
  });

  it('unsubscribes the notification listener when its scope stops', () => {
    const initial: Notification = {
      id: 'initial',
      type: 'info',
      title: '初始通知',
      message: 'message',
      timestamp: 1,
      read: false
    };
    mocks.getAll.mockReturnValue([initial]);
    scope = effectScope();
    const center = scope.run(() => useNotificationCenter())!;

    expect(center.notifications.value).toEqual([initial]);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);

    scope.stop();

    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
