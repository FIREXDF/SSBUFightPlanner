const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    downloadMod: (url) => ipcRenderer.invoke('download-mod', url),
    openExternal: (url) => ipcRenderer.send('open-external', url)
});
contextBridge.exposeInMainWorld('api', {

    tutorial: {
        finishTutorial: () => ipcRenderer.invoke('tutorial-finished'),
        initializeConfigurations: () => ipcRenderer.invoke('initialize-configurations')
    },
    modOperations: {
        renameMod: (oldName, newName) => {
            console.log('Preload: Calling rename mod', { oldName, newName });
            return ipcRenderer.invoke('rename-mod', { oldName, newName });
        },
        installMod: (filePath) => ipcRenderer.invoke('install-mod', filePath),
        uninstall: (modId) => ipcRenderer.invoke('uninstall-mod', modId),
        toggle: (modId) => ipcRenderer.invoke('toggle-mod', modId),
        openModFolder: (modId) => ipcRenderer.invoke('open-mod-folder', modId),
        openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),
        loadMods: () => ipcRenderer.invoke('load-mods')
    },

    modDetails: {
        getPreview: (modPath) => ipcRenderer.invoke('get-mod-preview', modPath),
        getInfo: (modPath) => ipcRenderer.invoke('get-mod-info', modPath)
    },
    settings: {
        getModsPath: () => ipcRenderer.invoke('get-mods-path'),
        setModsPath: (path) => ipcRenderer.invoke('set-mods-path', path),
        setDarkMode: (enabled) => ipcRenderer.invoke('set-dark-mode', enabled),
        getDarkMode: () => ipcRenderer.invoke('get-dark-mode')
    },
    dialog: {
        showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options)
    },
});


console.log('Preload script loaded, API methods exposed');
window.debugAPI = function() {
    console.log('API Methods:', Object.keys(window.api));
    Object.keys(window.api).forEach(category => {
        console.log(`${category} methods:`, Object.keys(window.api[category]));
    });

};


