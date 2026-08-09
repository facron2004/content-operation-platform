import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload 脚本：最小化暴露桌面能力给渲染进程
 * 当前仅暴露版本信息，后续可扩展备份/恢复等 IPC
 */

contextBridge.exposeInMainWorld('desktopAPI', {
  platform: process.platform,
  version: process.versions.electron,
  getConfig: () => ipcRenderer.invoke('desktop-config:get'),
  savePublicConfig: (config: unknown) => ipcRenderer.invoke('desktop-config:save-public', config),
  setSecret: (name: string, value: string | null) =>
    ipcRenderer.invoke('desktop-config:set-secret', name, value)
});
