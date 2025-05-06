const { contextBridge, ipcRenderer } = require('electron');
// Global error handler to ignore specific errors
window.addEventListener('error', (event) => {
    const errorMessage = event.message || '';
    if (errorMessage.includes('Script failed to execute')) {
        console.warn('Ignored error:', errorMessage);
        event.preventDefault();
    }
});

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel, data) => ipcRenderer.send(channel, data),
        on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args))
      },
      getModInfo: async (modPath) => {
        try {
            return await ipcRenderer.invoke('get-mod-info', modPath);
        } catch (error) {
            console.error('Error getting mod info:', error);
            throw error;
        }
    },
    downloadMod: async (url) => {
        try {
            return await ipcRenderer.invoke('download-mod', url);
        } catch (error) {
            console.error('Download mod error:', error);
            throw error;
        }
    },
    onDownloadConfirmation: (callback) => {
        try {
            return ipcRenderer.on('download-confirmation', (event, args) => {
                try {
                    callback(args);
                } catch (error) {
                    console.error('Download confirmation callback error:', error);
                }
            });
        } catch (error) {
            console.error('Download confirmation listener error:', error);
        }
    },
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, changelog) => callback(changelog)),
    onProtocolUrl: (callback) => ipcRenderer.on('protocol-url', (event, url) => callback(url)),
    onDownloadStatus: (callback) => 
        ipcRenderer.on('download-status', (_, status) => callback(status)),
    cancelDownload: async (id) => {
        try {
            return await ipcRenderer.invoke('cancel-download', id);
        } catch (error) {
            console.error('Cancel download error:', error);
            throw error;
        }
    },
    togglePauseDownload: (id) => ipcRenderer.invoke('toggle-pause-download', id),
    getActiveDownload: (id) => ipcRenderer.invoke('get-active-download', id)
});

contextBridge.exposeInMainWorld('api', {
    fetchMods: (categoryId) => ipcRenderer.invoke('fetch-mods', categoryId),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    tutorial: {
        finishTutorial: () => ipcRenderer.invoke('tutorial-finished'),
        initializeConfigurations: () => ipcRenderer.invoke('initialize-configurations')
    },
    modOperations: {
        renameMod: (oldName, newName) => ipcRenderer.invoke('rename-mod', { oldName, newName }),
        installMod: (filePath) => ipcRenderer.invoke('install-mod', filePath),
        uninstall: (modId) => ipcRenderer.invoke('uninstall-mod', modId),
        toggle: (modId) => ipcRenderer.invoke('toggle-mod', modId),
        openModFolder: (modId) => ipcRenderer.invoke('open-mod-folder', modId),
        openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),
        loadMods: () => ipcRenderer.invoke('load-mods'),
        getModFiles: (modPath) => ipcRenderer.invoke('get-mod-files', modPath),
        checkConflicts: () => ipcRenderer.invoke('check-mod-conflicts'),
        renameModFile: (modPath, oldPath, newPath) => 
            ipcRenderer.invoke('rename-mod-file', { modPath, oldPath, newPath }),
        deleteModFile: (modPath, filePath) => ipcRenderer.invoke('delete-mod-file', { modPath, filePath }),
        writeModFile: (filePath, content) => ipcRenderer.invoke('write-mod-file', { filePath, content })
    },
    gamebanana: {
        fetchGameBananaInfo: (url) => ipcRenderer.invoke('fetch-gamebanana-mod-info', url)
    },
    pluginOperations: {
        loadPlugins: () => ipcRenderer.invoke('load-plugins'),
        installPlugin: (filePath) => {
            if (!filePath) {
                return Promise.reject(new Error('No file path provided'));
            }
            return ipcRenderer.invoke('install-plugin', filePath);
        },
        deletePlugin: (pluginId) => ipcRenderer.invoke('delete-plugin', pluginId),
        togglePlugin: (pluginId) => ipcRenderer.invoke('toggle-plugin', pluginId),
        renamePlugin: (oldName, newName) => ipcRenderer.invoke('rename-plugin', { oldName, newName }),
        openPluginsFolder: () => ipcRenderer.invoke('open-plugins-folder')
    },
    modDetails: {
        getPreview: (modPath) => ipcRenderer.invoke('get-mod-preview', modPath),
        getInfo: (modPath) => ipcRenderer.invoke('get-mod-info', modPath)
    },
    settings: {
        getModsPath: () => ipcRenderer.invoke('get-mods-path'),
        setModsPath: (path) => ipcRenderer.invoke('set-mods-path', path),
        setDarkMode: (enabled) => ipcRenderer.invoke('set-dark-mode', enabled),
        getDarkMode: () => ipcRenderer.invoke('get-dark-mode'),
        getCustomCssPath: () => ipcRenderer.invoke('get-custom-css-path'),
        getPluginsPath: () => ipcRenderer.invoke('get-plugins-path'),
        setCustomCssPath: (path) => ipcRenderer.invoke('set-custom-css-path', path),
        setPluginsPath: (path) => ipcRenderer.invoke('set-plugins-path', path),
        getCustomCssEnabled: () => ipcRenderer.invoke('get-custom-css-enabled').catch(error => {
            console.error('Failed to get custom CSS enabled state:', error);
        }),
        setCustomCssEnabled: (enabled) => ipcRenderer.invoke('set-custom-css-enabled', enabled).catch(error => {
            console.error('Failed to set custom CSS enabled state:', error);
        }),
        loadCustomCss: (path) => ipcRenderer.invoke('load-custom-css', path).catch(error => {
            console.error('Failed to load custom CSS:', error);
        }),
        removeCustomCss: () => ipcRenderer.invoke('remove-custom-css').catch(error => {
            console.error('Failed to remove custom CSS:', error);
        }),
        getConflictCheckEnabled: () => ipcRenderer.invoke('get-conflict-check-enabled'),
        setConflictCheckEnabled: (enabled) => ipcRenderer.invoke('set-conflict-check-enabled', enabled),
        getDiscordRpcEnabled: () => ipcRenderer.invoke('get-discord-rpc-enabled'),
        setDiscordRpcEnabled: (enabled) => ipcRenderer.invoke('set-discord-rpc-enabled', enabled),
        getSendVersionEnabled: () => ipcRenderer.invoke('get-send-version-enabled'),
        setSendVersionEnabled: (enabled) => ipcRenderer.invoke('set-send-version-enabled', enabled),
        getProtocolConfirmEnabled: () => ipcRenderer.invoke('get-protocol-confirm-enabled'),
        setProtocolConfirmEnabled: (enabled) => ipcRenderer.invoke('set-protocol-confirm-enabled', enabled),
        clearTempFiles: () => ipcRenderer.invoke('clear-temp-files'),
        getVolume: () => ipcRenderer.invoke('get-volume'),
        setVolume: (volume) => ipcRenderer.invoke('set-volume', volume),
        getAprilFoolsEnabled: () => ipcRenderer.invoke('get-april-fools-enabled'),
        setAprilFoolsEnabled: (enabled) => ipcRenderer.invoke('set-april-fools-enabled', enabled),
        getLegacyModDiscovery: async () => {
            return await ipcRenderer.invoke('get-legacy-mod-discovery');
        },
        setLegacyModDiscovery: async (enabled) => {
            return await ipcRenderer.invoke('set-legacy-mod-discovery', enabled);
        }
    },
    enableAprilFoolsMode: () => ipcRenderer.invoke('enable-april-fools-mode'),
    discordRpc: {
        connect: () => ipcRenderer.invoke('connect-discord-rpc'),
        disconnect: () => ipcRenderer.invoke('disconnect-discord-rpc'),
        setActivity: (activity) => ipcRenderer.invoke('set-discord-rpc-activity', activity),
        updateModCount: (count) => ipcRenderer.invoke('update-discord-rpc-mod-count', count),
        updateModInstallation: () => ipcRenderer.invoke('update-discord-rpc-mod-installation')
    },
    dialog: {
        showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options)
    },
    openExternal: (url) => ipcRenderer.send('open-external', url),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    emulator: {
        setEmulatorPath: (path) => ipcRenderer.invoke('set-emulator-path', path),
        getEmulatorPath: () => ipcRenderer.invoke('get-emulator-path'),
        setGamePath: (path) => ipcRenderer.invoke('set-game-path', path),
        getGamePath: () => ipcRenderer.invoke('get-game-path'),
        setSelectedEmulator: (emulator) => ipcRenderer.invoke('set-selected-emulator', emulator),
        getSelectedEmulator: () => ipcRenderer.invoke('get-selected-emulator'),
        setYuzuFullscreen: (enabled) => ipcRenderer.invoke('set-yuzu-fullscreen', enabled),
        getYuzuFullscreen: () => ipcRenderer.invoke('get-yuzu-fullscreen'),
        launchGame: () => ipcRenderer.invoke('launch-game')
    },
    logs: {
        getCurrentLog: () => ipcRenderer.invoke('get-current-log'),
        openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
        openCurrentLog: () => ipcRenderer.invoke('open-current-log'),
        clearLogs: () => ipcRenderer.invoke('clear-logs')
    },
    fppOperations: {
        createFpp: (options) => ipcRenderer.invoke('create-fpp', options),
        importFpp: (filePath) => ipcRenderer.invoke('import-fpp', filePath),
    },
    getModInfo: (modPath) => ipcRenderer.invoke('get-mod-info', modPath),
    saveModInfo: (modPath, info) => ipcRenderer.invoke('save-mod-info', modPath, info)
});

contextBridge.exposeInMainWorld('electronAPI', {
    selectCustomCssFile: () => ipcRenderer.invoke('select-custom-css-file'),
    setCustomCssPath: (path) => ipcRenderer.invoke('set-custom-css-path', path),
    handleProtocolLink: (url) => ipcRenderer.send('handle-protocol-link', url),
    registerProtocol: () => ipcRenderer.invoke('register-protocol'),
    unregisterProtocol: () => ipcRenderer.invoke('unregister-protocol'),
});

console.log('Preload script loaded, API methods exposed');