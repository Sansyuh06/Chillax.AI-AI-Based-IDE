const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ---- Configuration ----
const DEV_URL = 'http://localhost:5173';
const BACKEND_PORT = 8000;
let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;

// ---- Wait for a URL to respond ----
function waitForServer(url, maxRetries = 30, interval = 1000) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            http.get(url, (res) => {
                resolve();
            }).on('error', () => {
                if (attempts >= maxRetries) {
                    reject(new Error(`Server at ${url} not ready after ${maxRetries} attempts`));
                } else {
                    setTimeout(check, interval);
                }
            });
        };
        check();
    });
}

function startBackend() {
    const backendDir = path.join(__dirname, '..', 'backend');
    backendProcess = spawn('python', ['-m', 'uvicorn', 'main:app', '--port', String(BACKEND_PORT)], {
        cwd: backendDir,
        stdio: 'pipe',
        shell: true,
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
    });
    backendProcess.stderr.on('data', (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
    });
    backendProcess.on('error', (err) => {
        console.error('Failed to start backend:', err);
    });
}

function startFrontend() {
    const frontendDir = path.join(__dirname, '..', 'frontend');
    frontendProcess = spawn('npm', ['run', 'dev'], {
        cwd: frontendDir,
        stdio: 'pipe',
        shell: true,
    });

    frontendProcess.stdout.on('data', (data) => {
        console.log(`[Frontend] ${data.toString().trim()}`);
    });
    frontendProcess.stderr.on('data', (data) => {
        console.log(`[Frontend] ${data.toString().trim()}`);
    });
    frontendProcess.on('error', (err) => {
        console.error('Failed to start frontend:', err);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        title: 'SpaghettiMap',
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
    console.log('[SpaghettiMap] Starting services...');
    startBackend();
    startFrontend();

    try {
        console.log('[SpaghettiMap] Waiting for frontend dev server...');
        await waitForServer(DEV_URL, 30, 1000);
        console.log('[SpaghettiMap] Frontend ready! Opening window...');
    } catch (e) {
        console.error('[SpaghettiMap]', e.message);
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (backendProcess) backendProcess.kill();
    if (frontendProcess) frontendProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (backendProcess) backendProcess.kill();
    if (frontendProcess) frontendProcess.kill();
});
