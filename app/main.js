/**
 * Kasupport — shell de Electron.
 * En desarrollo (ELECTRON_DEV=1) carga el dev server de Vite (http://localhost:7100).
 * En producción carga el build del renderer (renderer/dist/index.html).
 */
const { app, BrowserWindow, shell, desktopCapturer, ipcMain, powerSaveBlocker } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = process.env.ELECTRON_DEV === '1';
const DEV_RENDERER_ORIGIN = 'http://localhost:7100';
const powerSaveBlockers = new Map();
let mainWindow = null;
let updateStatus = { status: 'idle', info: null, progress: null, error: null };

function sendUpdateStatus(data) {
  updateStatus = { ...updateStatus, ...data };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', updateStatus);
  }
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus({ status: 'checking', error: null });
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus({ status: 'available', info, error: null });
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatus({ status: 'not-available', info, error: null });
});

autoUpdater.on('download-progress', (progress) => {
  sendUpdateStatus({ status: 'downloading', progress });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus({ status: 'downloaded', info });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus({ status: 'error', error: err ? (err.message || String(err)) : 'Error desconocido' });
});

ipcMain.handle('updater:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('updater:get-status', () => {
  return updateStatus;
});

ipcMain.handle('updater:check', async () => {
  if (isDev) {
    sendUpdateStatus({ status: 'not-available', info: { version: app.getVersion() }, error: null });
    return { dev: true };
  }
  try {
    return await autoUpdater.checkForUpdates();
  } catch (err) {
    sendUpdateStatus({ status: 'error', error: err?.message || String(err) });
    return { error: err?.message || String(err) };
  }
});

ipcMain.handle('updater:quit-and-install', () => {
  autoUpdater.quitAndInstall();
});


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
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
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

  // Forzar headers de origen para peticiones desde Electron (file://)
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (!headers.Origin || headers.Origin === 'file://' || headers.Origin === 'null') {
      headers.Origin = 'http://localhost:7100';
    }
    callback({ cancel: false, requestHeaders: headers });
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers['access-control-allow-origin'];
    delete headers['Access-Control-Allow-Origin'];
    delete headers['x-frame-options'];
    delete headers['X-Frame-Options'];
    headers['Access-Control-Allow-Origin'] = ['*'];
    callback({ cancel: false, responseHeaders: headers });
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

  // En producción, comprobar actualizaciones 5 segundos tras iniciar y luego cada 4 horas
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('Error al verificar actualizaciones automáticas:', err?.message || err);
      });
    }, 5000);

    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('Error al verificar actualizaciones periódicas:', err?.message || err);
      });
    }, FOUR_HOURS);
  }
});

app.on('window-all-closed', () => {
  powerSaveBlockers.forEach((blockerId) => powerSaveBlocker.stop(blockerId));
  powerSaveBlockers.clear();
  if (process.platform !== 'darwin') app.quit();
});
