// Global type declarations for Electron IPC exposed APIs

interface ElectronAPI {
  downloadMod: (url: string) => Promise<any>;
  onDownloadConfirmation: (callback: (args: any) => void) => void;
  onUpdateDownloaded: (callback: (changelog: string) => void) => void;
  onProtocolUrl: (
    callback: (data: { url: string; skipConfirmation: boolean }) => void,
  ) => void;
  onDownloadStatus: (callback: (status: any) => void) => void;
  cancelDownload: (id?: string) => Promise<any>;
  togglePauseDownload: (id: string) => Promise<any>;
  getActiveDownload: (id: string) => Promise<any>;
  ipcRenderer: {
    send: (channel: string, data?: any) => void;
    on: (channel: string, func: (...args: any[]) => void) => void;
  };
}

interface ModOperations {
  renameMod: (oldName: string, newName: string) => Promise<any>;
  installMod: (filePath: string) => Promise<any>;
  uninstall: (modId: string) => Promise<any>;
  toggle: (modId: string) => Promise<any>;
  openModFolder: (modId: string) => Promise<any>;
  openModsFolder: () => Promise<any>;
  loadMods: () => Promise<any>;
  getModFiles: (modPath: string) => Promise<Array<string>>;
  checkConflicts: () => Promise<any>;
  createDirectory: (path: string) => Promise<any>;
  renameModFile: (
    modPath: string,
    oldPath: string,
    newPath: string,
  ) => Promise<any>;
  deleteModFile: (modPath: string, filePath: string) => Promise<any>;
  writeModFile: (filePath: string, content: string) => Promise<any>;
  fileExists: (filePath: string) => Promise<boolean>;
  readModFile: (filePath: string) => Promise<string>;
  enableAllMods: () => Promise<any>;
  disableAllMods: () => Promise<any>;
}

interface PluginOperations {
  loadPlugins: () => Promise<any>;
  installPlugin: (filePath: string) => Promise<any>;
  deletePlugin: (pluginId: string) => Promise<any>;
  togglePlugin: (pluginId: string) => Promise<any>;
  renamePlugin: (oldName: string, newName: string) => Promise<any>;
  openPluginsFolder: () => Promise<any>;
}

interface ModDetails {
  getPreview: (modPath: string) => Promise<any>;
  getInfo: (modPath: string) => Promise<any>;
}

interface Settings {
  getModsPath: () => Promise<string>;
  setModsPath: (path: string) => Promise<any>;
  setDarkMode: (enabled: boolean) => Promise<any>;
  getDarkMode: () => Promise<boolean>;
  getCustomCssPath: () => Promise<string>;
  getPluginsPath: () => Promise<string>;
  setCustomCssPath: (path: string) => Promise<any>;
  setPluginsPath: (path: string) => Promise<any>;
  getCustomCssEnabled: () => Promise<boolean>;
  setCustomCssEnabled: (enabled: boolean) => Promise<any>;
  loadCustomCss: (path: string) => Promise<any>;
  removeCustomCss: () => Promise<any>;
  getConflictCheckEnabled: () => Promise<boolean>;
  setConflictCheckEnabled: (enabled: boolean) => Promise<any>;
  getAutoPrefixRename: () => Promise<boolean>;
  setAutoPrefixRename: (enabled: boolean) => Promise<any>;
  getDiscordRpcEnabled: () => Promise<boolean>;
  setDiscordRpcEnabled: (enabled: boolean) => Promise<any>;
  getSendVersionEnabled: () => Promise<boolean>;
  setSendVersionEnabled: (enabled: boolean) => Promise<any>;
  getProtocolConfirmEnabled: () => Promise<boolean>;
  setProtocolConfirmEnabled: (enabled: boolean) => Promise<any>;
  clearTempFiles: () => Promise<any>;
  getVolume: () => Promise<number>;
  setVolume: (volume: number) => Promise<any>;
  getAprilFoolsEnabled: () => Promise<boolean>;
  setAprilFoolsEnabled: (enabled: boolean) => Promise<any>;
  getLegacyModDiscovery: () => Promise<boolean>;
  setLegacyModDiscovery: (enabled: boolean) => Promise<any>;
}

interface DiscordRpc {
  connect: () => Promise<any>;
  disconnect: () => Promise<any>;
  setActivity: (activity: any) => Promise<any>;
  updateModCount: (count: number) => Promise<any>;
  updateModInstallation: () => Promise<any>;
}

interface DialogOptions {
  title?: string;
  properties?: string[];
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
  buttonLabel?: string;
}

interface Dialog {
  showOpenDialog: (options: DialogOptions) => Promise<any>;
}

interface Emulator {
  setEmulatorPath: (path: string) => Promise<any>;
  getEmulatorPath: () => Promise<string>;
  setGamePath: (path: string) => Promise<any>;
  getGamePath: () => Promise<string>;
  setSelectedEmulator: (emulator: string) => Promise<any>;
  getSelectedEmulator: () => Promise<string>;
  setYuzuFullscreen: (enabled: boolean) => Promise<any>;
  getYuzuFullscreen: () => Promise<boolean>;
  launchGame: () => Promise<any>;
}

interface Logs {
  getCurrentLog: () => Promise<string>;
  openLogsFolder: () => Promise<any>;
  openCurrentLog: () => Promise<any>;
  clearLogs: () => Promise<any>;
}

interface FppOperations {
  createFpp: (options: any) => Promise<any>;
  importFpp: (filePath: string) => Promise<any>;
}

interface Tutorial {
  finishTutorial: () => Promise<any>;
  initializeConfigurations: () => Promise<any>;
}

interface ApiInterface {
  getAppVersion: () => Promise<string>;
  openTutorial: () => Promise<any>;
  tutorial: Tutorial;
  getAppPath: () => Promise<string>;
  modOperations: ModOperations;
  pluginOperations: PluginOperations;
  modDetails: ModDetails;
  settings: Settings;
  enableAprilFoolsMode: () => Promise<any>;
  discordRpc: DiscordRpc;
  dialog: Dialog;
  openExternal: (url: string) => void;
  emulator: Emulator;
  logs: Logs;
  fppOperations: FppOperations;
  getModInfo: (modPath: string) => Promise<any>;
  saveModInfo: (modPath: string, info: any) => Promise<any>;
  resourcesPath: string;
}

interface ElectronAPIInterface {
  selectCustomCssFile: () => Promise<any>;
  setCustomCssPath: (path: string) => Promise<any>;
  handleProtocolLink: (url: string) => void;
  registerProtocol: () => Promise<any>;
  unregisterProtocol: () => Promise<any>;
}

// Bootstrap types
interface BootstrapModalOptions {
  backdrop?: boolean | "static";
  keyboard?: boolean;
  focus?: boolean;
}

interface BootstrapModal {
  show(): void;

  hide(): void;

  toggle(): void;

  dispose(): void;
}

interface BootstrapModalStatic {
  new (element: HTMLElement, options?: BootstrapModalOptions): BootstrapModal;

  getInstance(element: HTMLElement): BootstrapModal | null;

  getOrCreateInstance(element: HTMLElement): BootstrapModal;
}

interface BootstrapToast {
  show(): void;

  hide(): void;

  dispose(): void;
}

interface BootstrapToastStatic {
  new (element: HTMLElement): BootstrapToast;

  getInstance(element: HTMLElement): BootstrapToast | null;
}

interface BootstrapDropdown {
  show(): void;

  hide(): void;

  toggle(): void;

  update(): void;

  dispose(): void;
}

interface BootstrapDropdownStatic {
  new (element: HTMLElement, options?: any): BootstrapDropdown;

  getInstance(element: HTMLElement): BootstrapDropdown | null;
}

interface Bootstrap {
  Modal: BootstrapModalStatic;
  Toast: BootstrapToastStatic;
  Dropdown: BootstrapDropdownStatic;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: ApiInterface;
    electronAPI: ElectronAPIInterface;
    bootstrap: Bootstrap;
    uiController?: any;
    _cachedModList?: any;
  }

  const bootstrap: Bootstrap;

  // Electron extends the File interface with a path property
  interface File {
    path?: string;
  }
}

export {};
