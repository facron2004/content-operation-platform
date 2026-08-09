import { ipcMain } from 'electron';
import { getConfig, savePublicConfig, setSecret } from './config-store';

export function registerConfigIpcHandlers(onChanged: () => Promise<void>): void {
  ipcMain.handle('desktop-config:get', () => getConfig());
  ipcMain.handle('desktop-config:save-public', async (_event, config: unknown) => {
    savePublicConfig(config);
    await onChanged();
    return getConfig();
  });
  ipcMain.handle('desktop-config:set-secret', async (_event, name: unknown, value: unknown) => {
    setSecret(name, value);
    await onChanged();
    return getConfig();
  });
}
