const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra');
const electronFs = require('original-fs');
const AdmZip = require('adm-zip');
const extractZip = require('extract-zip');
const { exec } = require('child_process');
const os = require('os');
const Store = require('electron-store');
const toml = require('toml');
const discordRPC = require('./discordRPC');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

log.transports.file.level = 'info';
autoUpdater.logger = log;

// Initialize electron store
const store = new Store();

// Constants
const DISABLED_FOLDER_NAME = '{disabled_mod}';

let mainWindow;

function createWindow() {
    // Check if it's the first launch
    const isFirstLaunch = !store.get('hasLaunchedBefore');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: !isFirstLaunch, // Don't show if it's first launch
        webPreferences: {
            nodeIntegration: false,
            enableRemoteModule: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenuBarVisibility(false);

    discordRPC.connect();

    app.on('before-quit', () => {
        discordRPC.disconnect();
    });

    // Load main window
    mainWindow.loadFile('./src/windows/main.html');

    autoUpdater.checkForUpdatesAndNotify();

    

    // If it's the first launch, open tutorial window
    if (isFirstLaunch) {
        openTutorialWindow();
        
        // Mark as launched
        store.set('hasLaunchedBefore', true);
    }
}

// Auto-update event handlers
autoUpdater.on('update-available', () => {
  log.info('Update available. Downloading...');
});

autoUpdater.on('update-downloaded', () => {
  log.info('Update downloaded. Will install now.');
  autoUpdater.quitAndInstall(); // Restarts the app with the update applied
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater:', err);
});

function openTutorialWindow() {
    tutorialWindow = new BrowserWindow({
        width: 800,
        height: 850,
        parent: mainWindow,
        modal: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    tutorialWindow.loadFile('src/windows/tutorial.html');
}
// Add IPC handlers
ipcMain.handle('tutorial-finished', () => {
    // Show and focus the main window
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    }

    // Close the tutorial window
    if (tutorialWindow) {
        tutorialWindow.close();
    }

    return true;
});

ipcMain.on('download-confirmation', async (event, { confirmed, details }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (confirmed) {
        try {
            // Send download request to renderer process
            mainWindow.webContents.send('start-mod-download', details.downloadLink);
        } catch (error) {
            console.error('Download initiation error:', error);
            
            // Optionally send error back to renderer
            mainWindow.webContents.send('download-error', error.message);
        }
    } else {
        console.log('Mod download cancelled by user');
        
        // Optionally send cancellation notification
        mainWindow.webContents.send('download-cancelled');
    }
});

app.whenReady().then(() => {
    createWindow();
    checkExtractionTools();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// 7-Zip paths for different platforms
const SEVEN_ZIP_PATHS = {
    win32: [
        "C:\\Program Files\\7-Zip\\7z.exe",
        "C:\\Program Files (x86)\\7-Zip\\7z.exe",
        '7z'
    ],
    darwin: [
        "/usr/local/bin/7z",
        "/opt/homebrew/bin/7z",
        "brew --prefix p7zip",
        '7z'
    ],
    linux: [
        "/usr/bin/7z",
        "/usr/local/bin/7z",
        '7z'
    ]
};
function findSevenZipPath() {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        const paths = SEVEN_ZIP_PATHS[platform] || [];

        const tryNext = (index) => {
            if (index >= paths.length) {
                reject(new Error('7-Zip not found'));
                return;
            }

            const currentPath = paths[index];

            // Special handling for brew prefix
            if (currentPath.startsWith('brew --prefix')) {
                exec(currentPath, (error, stdout) => {
                    if (error) {
                        tryNext(index + 1);
                    } else {
                        const brewPath = stdout.trim();
                        const fullPath = path.join(brewPath, 'bin', 'p7zip');
                        checkSevenZipExecutable(fullPath, resolve, () => tryNext(index + 1));
                    }
                });
                return;
            }

            // Check executable
            checkSevenZipExecutable(currentPath, resolve, () => tryNext(index + 1));
        };

        tryNext(0);
    });
}

function checkSevenZipExecutable(path, onSuccess, onFailure) {
    exec(`"${path}" -h`, (error) => {
        if (error) {
            onFailure();
        } else {
            onSuccess(path);
        }
    });
}

function extractArchive(source, destination) {
    return new Promise(async (resolve, reject) => {
        try {
            const sevenZipPath = await findSevenZipPath();
            
            // Construct extraction command
            const command = `"${sevenZipPath}" x "${source}" -o"${destination}" -y`;

            // Execute extraction
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Extraction command error:', error);
                    console.error('stdout:', stdout);
                    console.error('stderr:', stderr);
                    reject(new Error(`Extraction failed: ${error.message}`));
                    return;
                }
                resolve();
            });
        } catch (error) {
            console.error('Extraction setup error:', error);
            reject(error);
        }
    });
}

// Mod loading handler
ipcMain.handle('load-mods', async () => {
    const modsPath = store.get('modsPath', '');
    if (!modsPath) return [];

    try {
        const mods = [];
        
        // Read main mods folder
        const files = await fs.readdir(modsPath);
        for (const file of files) {
            if (file === DISABLED_FOLDER_NAME) continue;
            const filePath = path.join(modsPath, file);
            
            try {
                const stats = await fs.stat(filePath);
                if (stats.isDirectory()) {
                    mods.push({
                        id: file,
                        name: file,
                        enabled: true,
                        path: filePath
                    });
                }
            } catch (statError) {
                console.error(`Error reading mod ${file}:`, statError);
            }
        }

        // Read disabled mods folder
        const disabledPath = path.join(modsPath, DISABLED_FOLDER_NAME);
        try {
            await fs.access(disabledPath);
            const disabledFiles = await fs.readdir(disabledPath);
            
            for (const file of disabledFiles) {
                const filePath = path.join(disabledPath, file);
                
                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isDirectory()) {
                        mods.push({
                            id: file,
                            name: file,
                            enabled: false,
                            path: filePath
                        });
                    }
                } catch (statError) {
                    console.error(`Error reading disabled mod ${file}:`, statError);
                }
            }
        } catch {
            // Disabled mod folder doesn't exist, that's fine
        }
        
        return mods;
    } catch (error) {
        console.error('Error loading mods:', error);
        return [];
    }
});

// Mod installation handler
ipcMain.handle('install-mod', async (event, filePath) => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    try {
        // Generate a unique mod name
        const fileName = path.basename(filePath, path.extname(filePath));
        const modDestPath = path.join(modsPath, fileName);

        // Create a unique folder name if exists
        let uniqueModName = fileName;
        let counter = 1;
        while (await fse.pathExists(path.join(modsPath, uniqueModName))) {
            uniqueModName = `${fileName}_${counter}`;
            counter++;
        }

        // Create destination directory
        const finalDestPath = path.join(modsPath, uniqueModName);
        await fs.mkdir(finalDestPath, { recursive: true });

        // Determine file type and extract accordingly
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case '.zip':
                await extractZipFile(filePath, finalDestPath);
                break;
            case '.7z':
            case '.rar':
                await extractArchive(filePath, finalDestPath);
                break;
            default:
                throw new Error(`Unsupported file type: ${ext}`);
        }

        return {
            id: uniqueModName,
            name: uniqueModName,
            path: finalDestPath
        };
    } catch (error) {
        console.error('Mod installation error:', error);
        throw error;
    }
});

// Zip extraction using adm-zip
function extractZipFile(source, destination) {
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip(source);
            zip.extractAllTo(destination, true);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// Mod toggle handler
ipcMain.handle('toggle-mod', async (event, modId) => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    try {
        const modPath = path.join(modsPath, modId);
        const disabledPath = path.join(modsPath, DISABLED_FOLDER_NAME);
        const disabledModPath = path.join(disabledPath, modId);

        // Ensure disabled_mod folder exists
        await fs.mkdir(disabledPath, { recursive: true });

        if (await fse.pathExists(modPath)) {
            // Move to disabled folder
            await fse.move(modPath, disabledModPath);
            return false; // Disabled
        } else if (await fse.pathExists(disabledModPath)) {
            // Move back to main folder
            await fse.move(disabledModPath, modPath);
            return true; // Enabled
        } else {
            throw new Error('Mod not found');
        }
    } catch (error) {
        console.error('Mod toggle error:', error);
        throw error;
    }
});

// Mod uninstallation handler
ipcMain.handle('uninstall-mod', async (event, modId) => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    try {
        // Check in main and disabled folders
        const modPath = path.join(modsPath, modId);
        const disabledModPath = path.join(modsPath, DISABLED_FOLDER_NAME, modId);

        if (await fse.pathExists(modPath)) {
            await fse.remove(modPath);
        } else if (await fse.pathExists(disabledModPath)) {
            await fse.remove(disabledModPath);
        } else {
            throw new Error('Mod not found');
        }

        return true;
    } catch (error) {
        console.error('Mod uninstallation error:', error);
        throw error;
    }
});

// Mod info handlers
ipcMain.handle('get-mod-preview', async (event, modPath) => {
    try {
        const previewPath = path.join(modPath, 'preview.webp');
        if (await fse.pathExists(previewPath)) {
            return previewPath;
        }
        return null;
    } catch (error) {
        console.error('Error getting mod preview:', error);
        return null;
    }
});

ipcMain.handle('get-mod-info', async (event, modPath) => {
    try {
        const infoPath = path.join(modPath, 'info.toml');
        if (await fse.pathExists(infoPath)) {
            const infoContent = await fs.readFile(infoPath, 'utf8');
            return toml.parse(infoContent);
        }
        return null;
    } catch (error) {
        console.error('Error getting mod info:', error);
        return null;
    }
});

// Open mods folder handler
ipcMain.handle('open-mods-folder', async () => {
    const modsPath = store.get('modsPath');
    if (modsPath) {
        shell.openPath(modsPath);
    }
});

// Open specific mod folder handler
ipcMain.handle('open-mod-folder', async (event, modId) => {
    const modsPath = store.get('modsPath');
    if (modsPath && modId) {
        const modPath = path.join(modsPath, modId);
        const disabledModPath = path.join(modsPath, DISABLED_FOLDER_NAME, modId);

        if (await fse.pathExists(modPath)) {
            shell.openPath(modPath);
        } else if (await fse.pathExists(disabledModPath)) {
            shell.openPath(disabledModPath);
        }
    }
});

// Settings handlers
ipcMain.handle('get-mods-path', () => {
    return store.get('modsPath', '');
});

ipcMain.handle('set-mods-path', (event, newPath) => {
    store.set('modsPath', newPath);
    return true;
});

// Dialog handler
ipcMain.handle('show-open-dialog', async (event, options) => {
    return dialog.showOpenDialog(mainWindow, options);
});

// Dark mode handler
ipcMain.handle('set-dark-mode', (event, enabled) => {
    store.set('darkMode', enabled);
    return true;
});

ipcMain.handle('get-dark-mode', () => {
    return store.get('darkMode', false);
});

// Check extraction tools
function checkExtractionTools() {
    const platform = os.platform();
    
    findSevenZipPath()
        .then(() => console.log('7-Zip found successfully'))
        .catch(() => console.warn('7-Zip not found. Please install 7-Zip.'));
}
ipcMain.handle('download-mod', async (event, downloadLink) => {
    try {
        // Get mods path from electron-store
        const modsPath = store.get('modsPath');

        if (!modsPath) {
            throw new Error('Mods path not set');
        }

        // Ensure directory exists
        if (!electronFs.existsSync(modsPath)) {
            electronFs.mkdirSync(modsPath, { recursive: true });
        }

        // Import downloader
        const GameBananaDownloader = require('./src/js/gameBananaDownloader');
        const downloader = new GameBananaDownloader(modsPath);

        // Perform download
        const result = await downloader.downloadMod(downloadLink);

        return result;
    } catch (error) {
        console.error('Mod download error:', error);
        throw error;
    }
});

ipcMain.handle('rename-mod', async (event, { oldName, newName }) => {
    console.log('Rename request received:', { oldName, newName });

    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    try {
        // Paths for enabled and disabled mods
        const enabledModPath = path.join(modsPath, oldName);
        const disabledModPath = path.join(modsPath, DISABLED_FOLDER_NAME, oldName);

        let sourcePath, destPath;

        // Determine if mod is enabled or disabled
        if (await fse.pathExists(enabledModPath)) {
            sourcePath = enabledModPath;
            destPath = path.join(modsPath, newName);
        } else if (await fse.pathExists(disabledModPath)) {
            sourcePath = disabledModPath;
            destPath = path.join(modsPath, DISABLED_FOLDER_NAME, newName);
        } else {
            throw new Error('Mod folder not found');
        }

        // Check if destination path already exists
        if (await fse.pathExists(destPath)) {
            throw new Error('A mod with this name already exists');
        }

        // Use fs.promises for renaming with better error handling
        await fs.rename(sourcePath, destPath);

        console.log(`Renamed from ${sourcePath} to ${destPath}`);

        return true;
    } catch (error) {
        console.error('Mod rename error:', error);

        // More detailed error handling
        if (error.code === 'EPERM') {
            // Try an alternative method using copy and delete
            try {
                await fse.copy(sourcePath, destPath);
                await fse.remove(sourcePath);
                console.log('Renamed using copy and delete method');
                return true;
            } catch (alternativeError) {
                console.error('Alternative rename method failed:', alternativeError);
                throw new Error('Failed to rename mod. Please close any open files or applications using the mod.');
            }
        }

        throw error;
    }
});
    ipcMain.handle('initialize-configurations', async () => {
        try {
            const path = require('path');
            const fs = require('fs').promises;
    
            // Ensure mods path is set
            const modsPath = store.get('modsPath');
            if (!modsPath) {
                throw new Error('Mods path not set');
            }
    
            // Create necessary directories
            const disabledModsPath = path.join(modsPath, '{disabled_mod}');
            await fs.mkdir(disabledModsPath, { recursive: true });
    
            // Set default settings
            const defaultSettings = {
                darkMode: false,
                autoUpdate: true,
                language: 'en'
            };
    
            // Save default settings if not exists
            Object.keys(defaultSettings).forEach(key => {
                if (!store.has(key)) {
                    store.set(key, defaultSettings[key]);
                }
            });
    
            // Scan initial mods
            const mods = await scanInitialMods(modsPath);
    
            console.log('Initialization complete:', {
                modsPath,
                settings: defaultSettings,
                initialMods: mods
            });
    
            return {
                modsPath,
                settings: defaultSettings,
                initialMods: mods
            };
        } catch (error) {
            console.error('Configuration initialization error:', error);
            throw error;
        }
    });
    
    // Helper function to scan initial mods
    async function scanInitialMods(modsPath) {
        const path = require('path');
        const fs = require('fs').promises;
    
        try {
            const files = await fs.readdir(modsPath);
            const modFolders = [];
    
            for (const file of files) {
                // Skip specific folders
                if (file === '{disabled_mod}') continue;
    
                const fullPath = path.join(modsPath, file);
                const stats = await fs.stat(fullPath);
    
                if (stats.isDirectory()) {
                    modFolders.push({
                        name: file,
                        path: fullPath,
                        enabled: true
                    });
                }
            }
    
            // Check disabled mods
            const disabledPath = path.join(modsPath, '{disabled_mod}');
            try {
                const disabledFiles = await fs.readdir(disabledPath);
                for (const file of disabledFiles) {
                    const fullPath = path.join(disabledPath, file);
                    const stats = await fs.stat(fullPath);
    
                    if (stats.isDirectory()) {
                        modFolders.push({
                            name: file,
                            path: fullPath,
                            enabled: false
                        });
                    }
                }
            } catch (disabledError) {
                // Ignore if disabled folder doesn't exist
                console.log('No disabled mods folder');
            }
    
            return modFolders;
        } catch (error) {
            console.error('Initial mod scan error:', error);
            return [];
        }
    }
    class DiscordRichPresence {
        constructor() {
            this.client = null;
            this.clientId = '1304806839115972628'; // Replace with your Discord app's client ID
            this.startTimestamp = new Date();
        }
    
        async connect() {
            if (this.client) return;
    
            this.client = new discordRPC.Client({ transport: 'ipc' });
    
            try {
                await this.client.login({ clientId: this.clientId });
                this.setActivity({
                    state: 'Browsing Mods',
                    details: 'Exploring Mod Collection',
                    largeImageKey: 'app_logo',
                    largeImageText: 'FightPlanner',
                    startTimestamp: this.startTimestamp
                });
    
                this.client.on('ready', () => {
                    console.log('Discord RPC connected');
                });
            } catch (error) {
                console.error('Discord RPC connection failed', error);
            }
        }
    
        setActivity(options) {
            if (!this.client) return;
    
            this.client.setActivity({
                ...options,
                instance: false
            });
        }
    
        updateModCount(count) {
            this.setActivity({
                state: 'Browsing Mods',
                details: `Managing ${count} Mods`,
                largeImageKey: 'app_logo',
                largeImageText: 'FightPlanner',
                startTimestamp: this.startTimestamp
            });
        }
    
        updateModInstallation() {
            this.setActivity({
                state: 'Modding',
                details: 'Installing Mod',
                largeImageKey: 'app_logo',
                largeImageText: 'FightPlanner',
                smallImageKey: 'install_icon',
                smallImageText: 'Installing'
            });
        }
    
        disconnect() {
            if (this.client) {
                this.client.clearActivity();
                this.client.destroy();
                this.client = null;
            }
        }
        
    }
    
    // Export the Discord RPC instance
    module.exports = new DiscordRichPresence();
    app.whenReady().then(() => {
        setupProtocolHandler();
    });