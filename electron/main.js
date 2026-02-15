const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');

// ---- Configuration ----
const DEV_URL = 'http://localhost:5173';
let mainWindow = null;

// ---- Wait for Vite dev server ----
function waitForServer(url, maxRetries = 30, interval = 1000) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            http.get(url, () => resolve())
                .on('error', () => {
                    if (attempts >= maxRetries) reject(new Error(`${url} not ready`));
                    else setTimeout(check, interval);
                });
        };
        check();
    });
}

// ---- Create window ----
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        title: 'Chillax.AI',
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#0d1117',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL(DEV_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    return mainWindow;
}

// ---- IPC Handlers ----
ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Open Project Folder',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
}));

// ---- App lifecycle ----
app.whenReady().then(async () => {
    console.log('[Chillax.AI] Waiting for frontend dev server...');

    try {
        await waitForServer(DEV_URL, 30, 1000);
        console.log('[Chillax.AI] Frontend ready!');
    } catch (e) {
        console.error('[Chillax.AI] Frontend not detected. Start services first:');
        console.error('  cd frontend && npm run dev');
        console.error('  cd backend && python -m uvicorn main:app --port 8000');
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
