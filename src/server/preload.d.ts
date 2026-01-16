declare const electronAPI: {
    downloadMod: (url: any) => Promise<any>;
    onDownloadConfirmation: (callback: any) => Electron.IpcRenderer;
    onUpdateDownloaded: (callback: any) => Electron.IpcRenderer;
    onProtocolUrl: (callback: any) => Electron.IpcRenderer;
    onDownloadStatus: (callback: any) => Electron.IpcRenderer;
    cancelDownload: (id: string) => Promise<any>;
    togglePauseDownload: (id: any) => Promise<any>;
    getActiveDownload: (id: any) => Promise<any>;
    ipcRenderer: {
        send: (channel: any, data?: any) => void;
        on: (channel: any, func: any) => Electron.IpcRenderer;
    };
    getPathForFile: (file: File) => string;
    selectCustomCssFile: () => Promise<any>;
    setCustomCssPath: (path: any) => Promise<any>;
    handleProtocolLink: (url: any) => void;
    registerProtocol: () => Promise<any>;
    unregisterProtocol: () => Promise<any>;
};
declare const generalAPI: {
    getAppVersion: () => Promise<any>;
    openTutorial: () => Promise<any>;
    tutorial: {
        finishTutorial: () => Promise<any>;
        initializeConfigurations: () => Promise<any>;
    };
    getAppPath: () => Promise<any>;
    modOperations: {
        renameMod: (oldName: any, newName: any) => Promise<any>;
        installMod: (filePath: any) => Promise<any>;
        uninstall: (modId: any) => Promise<any>;
        toggle: (modId: any) => Promise<any>;
        openModFolder: (modId: any) => Promise<any>;
        openModsFolder: () => Promise<any>;
        loadMods: () => Promise<any>;
        getModFiles: (modPath: any) => Promise<any>;
        checkConflicts: () => Promise<any>;
        createDirectory: (path: any) => Promise<any>;
        renameModFile: (modPath: any, oldPath: any, newPath: any) => Promise<any>;
        deleteModFile: (modPath: any, filePath: any) => Promise<any>;
        writeModFile: (filePath: any, content: any) => Promise<any>;
        fileExists: (filePath: any) => Promise<any>;
        readModFile: (filePath: any) => Promise<any>;
        enableAllMods: () => Promise<any>;
        disableAllMods: () => Promise<any>;
    };
    pluginOperations: {
        loadPlugins: () => Promise<any>;
        installPlugin: (filePath: string) => Promise<any>;
        deletePlugin: (pluginId: any) => Promise<any>;
        togglePlugin: (pluginId: any) => Promise<any>;
        renamePlugin: (oldName: any, newName: any) => Promise<any>;
        openPluginsFolder: () => Promise<any>;
    };
    modDetails: {
        getPreview: (modPath: any) => Promise<any>;
        getInfo: (modPath: any) => Promise<any>;
    };
    settings: {
        getModsPath: () => Promise<any>;
        setModsPath: (path: any) => Promise<any>;
        setDarkMode: (enabled: any) => Promise<any>;
        getDarkMode: () => Promise<any>;
        getCustomCssPath: () => Promise<any>;
        getPluginsPath: () => Promise<any>;
        setCustomCssPath: (path: any) => Promise<any>;
        setPluginsPath: (path: any) => Promise<any>;
        getCustomCssEnabled: () => Promise<any>;
        setCustomCssEnabled: (enabled: any) => Promise<any>;
        loadCustomCss: (path: any) => Promise<any>;
        removeCustomCss: () => Promise<any>;
        getConflictCheckEnabled: () => Promise<any>;
        setConflictCheckEnabled: (enabled: any) => Promise<any>;
        getAutoPrefixRename: () => Promise<any>;
        setAutoPrefixRename: (enabled: any) => Promise<any>;
        getDiscordRpcEnabled: () => Promise<any>;
        setDiscordRpcEnabled: (enabled: any) => Promise<any>;
        getSendVersionEnabled: () => Promise<any>;
        setSendVersionEnabled: (enabled: any) => Promise<any>;
        getProtocolConfirmEnabled: () => Promise<any>;
        setProtocolConfirmEnabled: (enabled: any) => Promise<any>;
        clearTempFiles: () => Promise<any>;
        getVolume: () => Promise<any>;
        setVolume: (volume: any) => Promise<any>;
        getAprilFoolsEnabled: () => Promise<any>;
        setAprilFoolsEnabled: (enabled: any) => Promise<any>;
        getLegacyModDiscovery: () => Promise<any>;
        setLegacyModDiscovery: (enabled: any) => Promise<any>;
    };
    enableAprilFoolsMode: () => Promise<any>;
    discordRpc: {
        connect: () => Promise<any>;
        disconnect: () => Promise<any>;
        setActivity: (activity: any) => Promise<any>;
        updateModCount: (count: any) => Promise<any>;
        updateModInstallation: () => Promise<any>;
    };
    dialog: {
        showOpenDialog: (options: any) => Promise<any>;
    };
    openExternal: (url: any) => void;
    emulator: {
        setEmulatorPath: (path: any) => Promise<any>;
        getEmulatorPath: () => Promise<any>;
        setGamePath: (path: any) => Promise<any>;
        getGamePath: () => Promise<any>;
        setSelectedEmulator: (emulator: any) => Promise<any>;
        getSelectedEmulator: () => Promise<any>;
        setYuzuFullscreen: (enabled: any) => Promise<any>;
        getYuzuFullscreen: () => Promise<any>;
        launchGame: () => Promise<any>;
    };
    logs: {
        getCurrentLog: () => Promise<any>;
        openLogsFolder: () => Promise<any>;
        openCurrentLog: () => Promise<any>;
        clearLogs: () => Promise<any>;
    };
    fppOperations: {
        createFpp: (options: any) => Promise<any>;
        importFpp: (filePath: any) => Promise<any>;
    };
    getModInfo: (modPath: any) => Promise<any>;
    saveModInfo: (modPath: any, info: any) => Promise<any>;
    resourcesPath: string;
};
export type ElectronAPI = typeof electronAPI;
export type GeneralAPI = typeof generalAPI;
export {};
//# sourceMappingURL=preload.d.ts.map