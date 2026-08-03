// Preload: superficie mínima y segura para el renderer.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('kasupportDesktop', {
  platform: process.platform,
  version: process.versions.electron,
});
