// Preload: superficie mínima y segura para el renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kasupportDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  setBadge: (count) => ipcRenderer.send('set-badge', count),
  keepAwakeStart: (id) => ipcRenderer.send('keep-awake:start', id),
  keepAwakeStop: (id) => ipcRenderer.send('keep-awake:stop', id),
  // Auto-updates
  getAppVersion: () => ipcRenderer.invoke('updater:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('updater:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
});
