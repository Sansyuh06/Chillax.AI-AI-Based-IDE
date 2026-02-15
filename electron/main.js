const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ---- Configuration ----
const DEV_URL = 'http://localhost:5173';
const BACKEND_PORT = 8000;
const IS_WIN = process.platform === 'win32';
let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;

// ---- Check if a server is already running ----
function isServerUp(url) {
    return new Promise((resolve) => {
        http.get(url, () => resolve(true)).on('error', () => resolve(false));
    });
}

// ---- Wait for server with retries ----
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

// ---- Start backend ----
function startBackend() {
    const backendDir = path.join(__dirname, '..', 'backend');
    const cmd = IS_WIN ? 'python' : 'python3';
    backendProcess = spawn(cmd, ['-m', 'uvicorn', 'main:app', '--port', String(BACKEND_PORT)], {
        cwd: backendDir,
        stdio: 'pipe',
        shell: true,
    });
    backendProcess.stdout.on('data', d => console.log(`[Backend] ${d.toString().trim()}`));
    backendProcess.stderr.on('data', d => console.log(`[Backend] ${d.toString().trim()}`));
    backendProcess.on('error', e => console.error('Backend error:', e));
}

// ---- Start frontend ----
function startFrontend() {
    const frontendDir = path.join(__dirname, '..', 'frontend');

    // On Windows, npm scripts can't find local binaries.
    // Fix: add node_modules/.bin to PATH explicitly.
    const env = { ...process.env };
    const binDir = path.join(frontendDir, 'node_modules', '.bin');
    env.PATH = binDir + (IS_WIN ? ';' : ':') + (env.PATH || '');

    const npmCmd = IS_WIN ? 'npm.cmd' : 'npm';
    frontendProcess = spawn(npmCmd, ['run', 'dev'], {
        cwd: frontendDir,
        stdio: 'pipe',
        env: env,
        shell: false, // Don't use shell — npm.cmd handles it
    });
    frontendProcess.stdout.on('data', d => console.log(`[Frontend] ${d.toString().trim()}`));
    frontendProcess.stderr.on('data', d => console.log(`[Frontend] ${d.toString().trim()}`));
    frontendProcess.on('error', e => console.error('Frontend error:', e));
}

// ---- Create window ----
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
    console.log('[SpaghettiMap] Starting...');

    // Check if backend already running
    const backendUp = await isServerUp(`http://localhost:${BACKEND_PORT}/health`);
    if (!backendUp) {
        console.log('[SpaghettiMap] Starting backend...');
        startBackend();
    } else {
        console.log('[SpaghettiMap] Backend already running.');
    }

    // Check if frontend already running
    const frontendUp = await isServerUp(DEV_URL);
    if (!frontendUp) {
        console.log('[SpaghettiMap] Starting frontend...');
        startFrontend();
    } else {
        console.log('[SpaghettiMap] Frontend already running.');
    }

    // Wait for frontend
    try {
        console.log('[SpaghettiMap] Waiting for frontend...');
        await waitForServer(DEV_URL, 30, 1000);
        console.log('[SpaghettiMap] Frontend ready!');
    } catch (e) {
        console.error('[SpaghettiMap]', e.message);
        console.log('[SpaghettiMap] Opening window anyway...');
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
