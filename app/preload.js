// Preload: superficie mínima y segura para el renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kasupportDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  setBadge: (count) => ipcRenderer.send('set-badge', count),
  keepAwakeStart: (id) => ipcRenderer.send('keep-awake:start', id),
  keepAwakeStop: (id) => ipcRenderer.send('keep-awake:stop', id),
});
