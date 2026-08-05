/**
 * Kasupport — shell de Electron.
 * En desarrollo (ELECTRON_DEV=1) carga el dev server de Vite (http://localhost:7100).
 * En producción carga el build del renderer (renderer/dist/index.html).
 */
const { app, BrowserWindow, shell, desktopCapturer, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');

const isDev = process.env.ELECTRON_DEV === '1';
const DEV_RENDERER_ORIGIN = 'http://localhost:7100';
const powerSaveBlockers = new Map();


function isTrustedRendererUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (isDev) return url.origin === DEV_RENDERER_ORIGIN;
    return url.protocol === 'file:';
  } catch {
    return false;
  }
}

ipcMain.on('set-badge', (_event, count) => {
  const num = Number(count) || 0;
  if (app.setBadgeCount) {
    app.setBadgeCount(num);
  }
  if (process.platform === 'darwin' && app.dock) {
    if (num > 0) {
      app.dock.setBadge(String(num));
    } else {
      app.dock.setBadge('');
    }
  }
});

// Mantener la pantalla activa durante llamadas/reuniones y permitir recuperarla al terminar.
ipcMain.on('keep-awake:start', (_event, id) => {
  const key = String(id || 'default');
  if (powerSaveBlockers.has(key)) return;
  powerSaveBlockers.set(key, powerSaveBlocker.start('prevent-display-sleep'));
});

ipcMain.on('keep-awake:stop', (_event, id) => {
  const key = String(id || 'default');
  const blockerId = powerSaveBlockers.get(key);
  if (blockerId !== undefined) {
    powerSaveBlocker.stop(blockerId);
    powerSaveBlockers.delete(key);
  }
});

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
      sandbox: true,
    },
  });

  // Compartir pantalla solo desde el renderer confiable. Electron usará el
  // selector del sistema cuando esté disponible y este fallback en el resto.
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    const requestingUrl = request.frame?.url || win.webContents.getURL();
    if (!isTrustedRendererUrl(requestingUrl)) {
      callback({});
      return;
    }
    desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const screen = sources.find((source) => source.id.startsWith('screen')) || sources[0];
        callback(screen ? { video: screen } : {});
      })
      .catch(() => callback({}));
  }, { useSystemPicker: true });

  const mediaPermissions = new Set(['media', 'mediaKeySystem', 'display-capture', 'notifications']);
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || details.requestingOrigin || webContents.getURL();
    callback(isTrustedRendererUrl(requestingUrl) && mediaPermissions.has(permission));
  });
  win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const requestingUrl = requestingOrigin || details.requestingUrl || webContents.getURL();
    return isTrustedRendererUrl(requestingUrl) && mediaPermissions.has(permission);
  });

  // Impedir que contenido web reemplace la aplicación y abrir únicamente HTTPS fuera.
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    if (url.startsWith('https://')) void shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
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
  powerSaveBlockers.forEach((blockerId) => powerSaveBlocker.stop(blockerId));
  powerSaveBlockers.clear();
  if (process.platform !== 'darwin') app.quit();
});
