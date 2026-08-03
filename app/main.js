/**
 * Kasupport — shell de Electron.
 * En desarrollo (ELECTRON_DEV=1) carga el dev server de Vite (http://localhost:7100).
 * En producción carga el build del renderer (renderer/dist/index.html).
 */
const { app, BrowserWindow, shell, desktopCapturer } = require('electron');
const path = require('path');

const isDev = process.env.ELECTRON_DEV === '1';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'Kasupport',
    backgroundColor: '#19171d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Compartir pantalla en llamadas (getDisplayMedia): elegir la pantalla principal
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const screen = sources.find((s) => s.id.startsWith('screen')) || sources[0];
        callback(screen ? { video: screen } : {});
      })
      .catch(() => callback({}));
  });

  // Permisos de cámara/micrófono para las llamadas WebRTC
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
    callback(allowed.includes(permission));
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return ['media', 'mediaKeySystem', 'display-capture', 'notifications'].includes(permission);
  });

  // Links externos se abren en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://localhost:7100');
  } else {
    win.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
