const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    downloadMod: (url) => ipcRenderer.invoke('download-mod', url),
    onDownloadConfirmation: (callback) => ipcRenderer.on('download-confirmation', (event, args) => callback(args)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, changelog) => callback(changelog))
});

contextBridge.exposeInMainWorld('api', {
    tutorial: {
        finishTutorial: () => ipcRenderer.invoke('tutorial-finished'),
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
        checkConflicts: () => ipcRenderer.invoke('check-mod-conflicts')
    },
    pluginOperations: {
        loadPlugins: () => ipcRenderer.invoke('load-plugins'),
        installPlugin: (filePath) => ipcRenderer.invoke('install-plugin', filePath),
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
        setDiscordRpcEnabled: (enabled) => ipcRenderer.invoke('set-discord-rpc-enabled', enabled)
    },
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
});

contextBridge.exposeInMainWorld('electronAPI', {
    selectCustomCssFile: () => ipcRenderer.invoke('select-custom-css-file'),
    setCustomCssPath: (path) => ipcRenderer.invoke('set-custom-css-path', path),
    handleProtocolLink: (url) => ipcRenderer.send('handle-protocol-link', url),
    registerProtocol: () => ipcRenderer.invoke('register-protocol'),
    unregisterProtocol: () => ipcRenderer.invoke('unregister-protocol'),
});

console.log('Preload script loaded, API methods exposed');