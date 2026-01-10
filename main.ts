import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as fse from "fs-extra";
import AdmZip from "adm-zip";
import { exec } from "child_process";
import Store from "electron-store";
import * as toml from "toml";
import axios from "axios";
import * as pkg from "electron-updater";

import discordRPC from "./discordRPC.js";
import log from "electron-log";
import { format } from "date-fns";
import { createFPP } from "./src/js/createFPP.js";
import { extractFPP } from "./src/js/extractFPP.js";
import * as Sentry from "@sentry/node";
import { Mod } from "./src/types/mod";

const { autoUpdater } = pkg;
let tutorialWindow: Electron.BrowserWindow | undefined;

Sentry.init({
  dsn: "https://5775ecb986d21269a8960ce6459d1143@o4509832073773056.ingest.de.sentry.io/4509832076001360",
});

process.on("uncaughtException", (err) => {
  console.error("Erreur non capturée :", err.message);
  Sentry.captureException(err);
});

ipcMain.handle("open-tutorial-window", () => {
  openTutorialWindow();
  return true;
});

log.transports.file.level = "info";
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}";

// Set up logging configuration with date-based filenames
const logDirectory = path.join(app.getPath("userData"), "logs");
const currentDate = format(new Date(), "yyyy-MM-dd_HH-mm-ss");
const logFilename = `fightplanner_${currentDate}.log`;

// Ensure logs directory exists
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Configure electron-log
log.transports.file.resolvePathFn = () => path.join(logDirectory, logFilename);
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}";
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.level = "info";

// Log application start
log.info("Application started");
log.info(`Log file: ${logFilename}`);

// Remove old logs (keep last 7 days)
async function cleanOldLogs() {
  log.info("Cleaning old logs...");
  try {
    const files = await fsp.readdir(logDirectory);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const file of files) {
      // Ne supprimer que les fichiers .log
      if (!file.endsWith(".log")) continue;

      const filePath = path.join(logDirectory, file);
      const stats = await fsp.stat(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        await fsp.unlink(filePath);
        log.info("Deleted old log file:", file);
      }
    }
  } catch (error) {
    log.error("Error cleaning old logs:", error);
  }
}

cleanOldLogs();

// Capture console output
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

console.log = (...args) => {
  log.info(...args);
  originalConsole.log(...args);
};

console.error = (...args) => {
  log.error(...args);
  originalConsole.error(...args);
};

console.warn = (...args) => {
  log.warn(...args);
  originalConsole.warn(...args);
};

console.info = (...args) => {
  log.info(...args);
  originalConsole.info(...args);
};

// Initialize electron store
const store = new Store();

// Constants
const DISABLED_MODS_FOLDER_NAME = "{disabled_mod}";
const DISABLED_PLUGINS_FOLDER_NAME = "disabled_plugins";
const PLUGIN_EXTENSION = ".nro";

let mainWindow;
let hiddenWindow;
let initialProtocolUrl = null;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv, workingDirectory) => {
    // Someone tried to run a second instance
    if (process.platform === "win32") {
      // Check for protocol URL in the second instance's arguments
      const protocolUrl = argv.find((arg) => arg.startsWith("fightplanner://"));
      if (protocolUrl && mainWindow) {
        handleProtocolUrl(protocolUrl);
      }
    }

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("fightplanner", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("fightplanner");
  }

  app.whenReady().then(() => {
    // Only create window if it doesn't exist
    if (!mainWindow) {
      createWindow();
    }
  });

  // Remove the duplicate app.on('ready') handler and merge it with whenReady
  app.whenReady().then(() => {
    if (!mainWindow) {
      createWindow();
    }

    // Create hidden window for audio
    hiddenWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
      },
    });

    hiddenWindow.loadFile("./src/windows/audioPlayer.html");

    // Set initial volume
    const volume = store.get("volume", 100);
    hiddenWindow.webContents.on("did-finish-load", () => {
      hiddenWindow.webContents.executeJavaScript(`
            setVolume(${volume});
        `);
    });

    // Handle protocol URL if present
    if (process.platform === "win32") {
      const url = process.argv.find((arg) => arg.startsWith("fightplanner:"));
      if (url) {
        handleProtocolUrl(url);
      }
    }
    if (initialProtocolUrl) {
      handleProtocolUrl(initialProtocolUrl);
      initialProtocolUrl = null;
    }
    ipcMain.handle("get-app-version", () => {
      return app.getVersion();
    });

    ipcMain.handle("get-app-path", () => {
      return app.getAppPath();
    });
  });

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("window-all-closed", function () {
    if (hiddenWindow && !hiddenWindow.isDestroyed()) {
      hiddenWindow.destroy();
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("open-url", async (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.on("second-instance", async (event, argv) => {
    if (process.platform === "win32") {
      const url = argv.find((arg) => arg.startsWith("fightplanner:"));
      if (url) {
        handleProtocolUrl(url);
      }
    }
  });

  function showErrorModal(message) {
    if (!mainWindow || !mainWindow.webContents) return;

    const sanitizedMessage = message
      .replace(/'/g, "\\'")
      .replace(/\n/g, "<br>");
    const modalScript = `
            (function() {
                function createErrorModal(message) {
                    // Remove existing modal if any
                    let existingModal = document.getElementById('errorModal');
                    if (existingModal) {
                        existingModal.remove();
                    }

                    // Create modal HTML
                    const modalHtml = \`
                        <div class="modal fade" id="errorModal" tabindex="-1" role="dialog" aria-labelledby="errorModalLabel" aria-hidden="true">
                            <div class="modal-dialog" role="document">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title" id="errorModalLabel">Error</h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>
                                    <div class="modal-body">\${message}</div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;

                    // Add modal to body
                    document.body.insertAdjacentHTML('beforeend', modalHtml);

                    // Show modal
                    const modalElement = document.getElementById('errorModal');
                    if (modalElement) {
                        const modal = new bootstrap.Modal(modalElement, {
                            keyboard: false,
                            backdrop: 'static'
                        });
                        modal.show();
                    }
                }

                // Wait for Bootstrap to be available
                function showError() {
                    if (typeof bootstrap !== 'undefined') {
                        createErrorModal('${sanitizedMessage}');
                    } else {
                        setTimeout(showError, 100);
                    }
                }

                showError();
            })();
        `;

    mainWindow.webContents.executeJavaScript(modalScript).catch((err) => {
      console.error("Error showing modal:", err);
      // Fallback to basic alert if modal fails
      mainWindow.webContents.executeJavaScript(`alert("${sanitizedMessage}");`);
    });
  }

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    setTimeout(() => {
      showErrorModal(
        `An unexpected error occurred in launch: ${error.message}. If your config is not gone you can still use FightPlanner, but please make a suggestion with the link in the settings and put your user id in the suggestion and the error .`,
      );
    }, 1000);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
  });
}

async function createWindow() {
  // Check if it's the first launch
  const isFirstLaunch = !store.get("hasLaunchedBefore");

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    show: !isFirstLaunch, // Don't show if it's first launch
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setMenuBarVisibility(false);

  await discordRPC.connect();

  app.on("before-quit", () => {
    if (hiddenWindow && !hiddenWindow.isDestroyed()) {
      hiddenWindow.destroy();
    }

    discordRPC.disconnect();
  });

  mainWindow.loadFile("./src/windows/main.html");

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    if (hiddenWindow && !hiddenWindow.isDestroyed()) {
      hiddenWindow.destroy();
    }

    app.quit();
  });

  // Load custom CSS if it exists
  const customCssPath = store.get(
    "customCssPath",
    path.join(__dirname, "custom.css"),
  ) as string | undefined;

  try {
    await fsp.access(customCssPath);

    mainWindow.webContents.on("did-finish-load", async () => {
      const customCss = await fsp.readFile(customCssPath, "utf8");

      mainWindow.webContents.insertCSS(customCss);
      mainWindow.webContents.executeJavaScript(`
                document.body.classList.add('custom-theme');
            `);

      console.log("Custom CSS loaded");
    });
  } catch (error) {
    console.log("Custom CSS not found");
  }

  autoUpdater.checkForUpdatesAndNotify();

  // If it's the first launch, open tutorial window
  if (isFirstLaunch) {
    openTutorialWindow();

    // Mark as launched
    store.set("hasLaunchedBefore", true);
  }
  mainWindow.webContents.on("new-window", (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  const modsPath = store.get("modsPath", "") as string | undefined;
  const pluginsPath = store.get("pluginsPath", "") as string | undefined;

  // Only create disabled folders if paths are set and valid
  if (modsPath && pluginsPath) {
    try {
      const ultimatePath = path.dirname(modsPath);
      const skylinePath = path.dirname(pluginsPath);

      // Validate paths before creating any folders
      if (
        !skylinePath.toLowerCase().includes("system32") &&
        !skylinePath.toLowerCase().includes("windows") &&
        (await fse.pathExists(modsPath)) &&
        (await fse.pathExists(pluginsPath))
      ) {
        const disabledModsPath = path.join(
          ultimatePath,
          DISABLED_MODS_FOLDER_NAME,
        );
        const disabledPluginsPath = path.join(
          skylinePath,
          DISABLED_PLUGINS_FOLDER_NAME,
        );

        // Create directories with proper error handling
        await Promise.all([
          fsp
            .mkdir(disabledModsPath, { recursive: true })
            .catch((err) =>
              console.error("Failed to create disabled mods directory:", err),
            ),
          fsp
            .mkdir(disabledPluginsPath, { recursive: true })
            .catch((err) =>
              console.error(
                "Failed to create disabled plugins directory:",
                err,
              ),
            ),
        ]);

        // Move old folders if necessary
        await Promise.all([
          checkAndMoveOldDisabledFolder(modsPath, disabledModsPath),
          checkAndMoveOldDisabledFolder(pluginsPath, disabledPluginsPath),
        ]);
      }
    } catch (error) {
      console.error("Error setting up directories:", error);
    }
  }

  mainWindow.webContents.on("did-finish-load", () => {
    // Inject Bootstrap if not present
    mainWindow.webContents.executeJavaScript(`
            if (typeof bootstrap === 'undefined') {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css';
                document.head.appendChild(link);

                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js';
                document.head.appendChild(script);
            }
        `);
  });
  // Log settings on startup
  logAppSettings();

  // Handle any pending protocol URL after window is created
  mainWindow.webContents.on("did-finish-load", () => {
    if (initialProtocolUrl) {
      handleProtocolUrl(initialProtocolUrl);
      initialProtocolUrl = null;
    }
  });

  const isAprilFools =
    new Date().getMonth() === 3 && new Date().getDate() === 1;

  if (isAprilFools) {
    mainWindow.setTitle("FeetPlanner");
  }

  mainWindow.on("close", (event) => {
    if (activeDownloads.size > 0) {
      const response = dialog.showMessageBoxSync(mainWindow, {
        type: "warning",
        buttons: ["Cancel", "Quit"],
        defaultId: 0,
        cancelId: 0,
        title: "Active Downloads",
        message:
          "There are active downloads. Quitting now will cancel them. Do you want to quit?",
      });
      if (response === 0) {
        // User selected Cancel
        event.preventDefault();
      }
    }
  });
}

async function checkAndMoveOldDisabledFolder(
  folderPath,
  newDisabledFolderPath,
) {
  const oldDisabledFolderPath = path.join(
    folderPath,
    DISABLED_MODS_FOLDER_NAME,
  );
  try {
    const oldExists = await fse.pathExists(oldDisabledFolderPath);
    if (oldExists) {
      await fse.copy(oldDisabledFolderPath, newDisabledFolderPath, {
        overwrite: true,
      });
      const files = await fsp.readdir(oldDisabledFolderPath);
      for (const file of files) {
        const oldFilePath = path.join(oldDisabledFolderPath, file);
        const newFilePath = path.join(newDisabledFolderPath, file);
        await fse.move(oldFilePath, newFilePath, { overwrite: true });
      }
      await fse.remove(oldDisabledFolderPath); // Ensure the old folder is deleted
      console.log(
        `Copied and moved contents from ${oldDisabledFolderPath} to ${newDisabledFolderPath}`,
      );
    }
  } catch (error) {
    console.error(
      "Error copying and moving contents of old disabled folder:",
      error,
    );
  }
}

// Auto-update event handlers
autoUpdater.on("update-available", () => {
  log.info("Update available.");
  dialog.showMessageBox({
    type: "info",
    title: "Update available",
    message:
      "A new update is available. It will be downloaded in the background.",
  });
});

autoUpdater.on("update-downloaded", async () => {
  log.info("Update downloaded.");
  const changelog = await fetchChangelog();
  mainWindow.webContents.send("update-downloaded", changelog);
  dialog
    .showMessageBox({
      type: "info",
      title: "Update ready",
      message:
        "A new update is ready. Restart the application to apply the updates.",
      detail: changelog,
      buttons: ["Restart", "Later"],
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

console.log(app.getPath("userData"));

autoUpdater.on("error", (err) => {
  log.error("Error in auto-updater:", err);
});

async function fetchChangelog() {
  try {
    const response = await axios.get(
      "https://api.github.com/repos/FIREXDF/SSBUFightPlanner/releases/latest",
    );
    const changelog = response.data.body;
    return changelog;
  } catch (error) {
    console.error("Failed to fetch changelog:", error);
    return "Failed to fetch changelog.";
  }
}

function openTutorialWindow() {
  tutorialWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  tutorialWindow.loadFile("src/windows/tutorial.html");
}

// Add IPC handlers
ipcMain.handle("tutorial-finished", () => {
  // Show and focus the main window
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    // Rafraîchir la liste des mods après le tuto
    mainWindow.webContents.send("refresh-mods-after-tutorial");
  }

  // Close the tutorial window
  if (tutorialWindow) {
    tutorialWindow.close();
  }

  return true;
});

ipcMain.handle("show-open-dialog", async (event, options) => {
  const result = await dialog.showOpenDialog(options);
  return result;
});

ipcMain.on("download-confirmation", async (event, { confirmed, details }) => {
  const mainWindow = BrowserWindow.getAllWindows()[0];

  if (confirmed) {
    try {
      // Send download request to renderer process
      mainWindow.webContents.send("start-mod-download", details.downloadLink);
    } catch (error) {
      console.error("Download initiation error:", error);

      // Optionally send error back to renderer
      mainWindow.webContents.send("download-error", error.message);
    }
  } else {
    console.log("Mod download cancelled by user");

    // Optionally send cancellation notification
    mainWindow.webContents.send("download-cancelled");
  }
});

function extractArchive(source, destination) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      // const sevenZipPath = await findSevenZipPath();
      const sevenZipPath = "";

      // Construct extraction command
      const command = `"${sevenZipPath}" x "${source}" -o"${destination}" -y`;

      // Execute extraction
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error("Extraction command error:", error);
          console.error("stdout:", stdout);
          console.error("stderr:", stderr);
          reject(new Error(`Extraction failed: ${error.message}`));
          return;
        }

        resolve();
      });
    } catch (error) {
      console.error("Extraction setup error:", error);
      reject(error);
    }
  });
}

// Mod loading handler
ipcMain.handle("load-mods", async () => {
  const modsPath = store.get("modsPath", "") as string | null;

  if (!modsPath) return [];

  const ultimatePath = path.dirname(modsPath);
  const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);
  const removeDot = store.get("removeDot", false);

  try {
    const mods: Array<Mod> = [];

    // Read main mods folder
    const files = await fsp.readdir(modsPath);
    for (const file of files) {
      const filePath = path.join(modsPath, file);
      const stats = await fsp.stat(filePath);

      if (stats.isDirectory()) {
        // Skip the disabled mods folder if it happens to be inside the mods folder
        if (file === DISABLED_MODS_FOLDER_NAME) {
          continue;
        }

        // Any mod with a dot prefix is considered disabled, regardless of legacy mode
        const isDotPrefixed = file.startsWith(".");
        const isEnabled = !isDotPrefixed;

        // For display purposes, remove the dot from the name only
        const displayName =
          isDotPrefixed && removeDot ? file.substring(1) : file;

        mods.push({
          id: file,
          name: displayName,
          enabled: isEnabled,
          path: filePath,
          sortName: isDotPrefixed ? file.substring(1) : file, // Name without dot for sorting
        });
      }
    }

    // Always check the disabled mods folder regardless of mode
    if (await fse.pathExists(disabledModsPath)) {
      try {
        const disabledFiles = await fsp.readdir(disabledModsPath);
        for (const file of disabledFiles) {
          const filePath = path.join(disabledModsPath, file);
          const stats = await fsp.stat(filePath);

          if (stats.isDirectory()) {
            mods.push({
              id: file,
              name: file,
              enabled: false,
              path: filePath,
              sortName: file, // Already without dot prefix
            });
          }
        }
      } catch (error) {
        console.error("Error reading disabled mods folder:", error);
      }
    }

    // Sort mods: enabled first, then alphabetically within each group
    mods.sort((a, b) => {
      // First sort by enabled status
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1; // Enabled mods first
      }

      // Then sort alphabetically by name, ignoring the dot prefix
      return a.sortName.localeCompare(b.sortName);
    });

    // Remove temporary sortName property before returning
    return mods.map(({ sortName, ...mod }) => mod);
  } catch (error) {
    console.error("Error loading mods:", error);
    return [];
  }
});

// Mod installation handler
ipcMain.handle("install-mod", async (event, filePath) => {
  const modsPath = store.get("modsPath") as string | undefined;

  if (!modsPath) {
    throw new Error("Mods directory not set");
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
    await fsp.mkdir(finalDestPath, { recursive: true });

    // Determine file type and extract accordingly
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case ".zip":
        await extractZipFile(filePath, finalDestPath);
        break;
      case ".7z":
      case ".rar":
        await extractArchive(filePath, finalDestPath);
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    return {
      id: uniqueModName,
      name: uniqueModName,
      path: finalDestPath,
    };
  } catch (error) {
    console.error("Mod installation error:", error);
    throw error;
  }
});

// Zip extraction using adm-zip
function extractZipFile(source, destination) {
  return new Promise<void>((resolve, reject) => {
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
ipcMain.handle("toggle-mod", async (event, modId) => {
  const modsPath = store.get("modsPath") as string | undefined;

  if (!modsPath) {
    throw new Error("Mods directory not set");
  }

  const legacyDiscovery = store.get("legacyModDiscovery", false);
  const ultimatePath = path.dirname(modsPath);
  const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

  try {
    // Check if this is a dot-prefixed mod (disabled in legacy mode)
    if (modId.startsWith(".")) {
      // Enable: Remove the dot
      const enabledModId = modId.substring(1);
      const currentPath = path.join(modsPath, modId);
      const newPath = path.join(modsPath, enabledModId);

      // Check if paths exist before attempting rename
      if (await fse.pathExists(currentPath)) {
        await fse.rename(currentPath, newPath);
        return true; // Now enabled
      }
    } else if (legacyDiscovery) {
      // Legacy mode - check regular mod path first
      const modPath = path.join(modsPath, modId);

      if (await fse.pathExists(modPath)) {
        // Regular mod in mods folder - disable it by adding a dot
        const disabledModId = `.${modId}`;
        const newPath = path.join(modsPath, disabledModId);

        await fse.rename(modPath, newPath);
        return false; // Now disabled
      }

      // Check if the mod is in the disabled folder (from non-legacy mode)
      const disabledModPath = path.join(disabledModsPath, modId);
      if (await fse.pathExists(disabledModPath)) {
        // Mod was disabled in non-legacy mode, move to main folder WITHOUT adding dot
        // (this is the key fix - we're enabling it in legacy mode)
        await fse.move(disabledModPath, path.join(modsPath, modId));
        return true; // Now enabled
      }
    } else {
      // Non-legacy mode
      const modPath = path.join(modsPath, modId);
      const disabledModPath = path.join(disabledModsPath, modId);

      // Check if mod is in main folder
      if (await fse.pathExists(modPath)) {
        // Disable the mod by moving to disabled folder
        await fse.ensureDir(disabledModsPath);
        await fse.move(modPath, disabledModPath, { overwrite: true });
        return false; // Now disabled
      }

      // Check if mod is in disabled folder
      if (await fse.pathExists(disabledModPath)) {
        // Enable the mod
        await fse.move(disabledModPath, modPath, { overwrite: true });
        return true; // Now enabled
      }

      // Check if mod is in legacy format (has dot prefix)
      const legacyDisabledModPath = path.join(modsPath, `.${modId}`);
      if (await fse.pathExists(legacyDisabledModPath)) {
        // Move from legacy format to disabled folder
        await fse.ensureDir(disabledModsPath);
        await fse.move(legacyDisabledModPath, disabledModPath);
        return false; // Keep it disabled, but in non-legacy format
      }
    }

    throw new Error("Mod not found");
  } catch (error) {
    console.error("Mod toggle error:", error);
    hiddenWindow.webContents.executeJavaScript("playError()");
    throw error;
  }
});

// Enable all mods handler
ipcMain.handle("enable-all-mods", async () => {
  const modsPath = store.get("modsPath") as string | undefined;

  if (!modsPath) {
    throw new Error("Mods path not set");
  }

  try {
    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    // Get all disabled mods
    const disabledMods = await fsp.readdir(disabledModsPath).catch(() => []);

    // Enable each mod
    for (const mod of disabledMods) {
      const sourcePath = path.join(disabledModsPath, mod);
      const targetPath = path.join(modsPath, mod);
      await fse.move(sourcePath, targetPath);
    }

    return true;
  } catch (error) {
    console.error("Failed to enable all mods:", error);
    throw error;
  }
});

// Disable all mods handler
ipcMain.handle("disable-all-mods", async () => {
  const modsPath = store.get("modsPath") as string | undefined;

  if (!modsPath) {
    throw new Error("Mods path not set");
  }

  try {
    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    // Ensure disabled mods directory exists
    await fse.ensureDir(disabledModsPath);

    // Get all enabled mods
    const enabledMods = await fsp.readdir(modsPath);

    // Disable each mod
    for (const mod of enabledMods) {
      const sourcePath = path.join(modsPath, mod);
      const targetPath = path.join(disabledModsPath, mod);
      await fse.move(sourcePath, targetPath);
    }

    return true;
  } catch (error) {
    console.error("Failed to disable all mods:", error);
    throw error;
  }
});

// Mod uninstallation handler
ipcMain.handle("uninstall-mod", async (event, modId) => {
  const modsPath = store.get("modsPath") as string | undefined;

  if (!modsPath) {
    throw new Error("Mods directory not set");
  }

  const ultimatePath = path.dirname(modsPath);
  const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

  try {
    // Check in main and disabled folders
    const modPath = path.join(modsPath, modId);
    const disabledModPath = path.join(disabledModsPath, modId);

    if (await fse.pathExists(modPath)) {
      await fse.remove(modPath);
    } else if (await fse.pathExists(disabledModPath)) {
      await fse.remove(disabledModPath);
    } else {
      throw new Error("Mod not found");
    }

    return true;
  } catch (error) {
    console.error("Mod uninstallation error:", error);
    hiddenWindow.webContents.executeJavaScript("playError()");
    throw error;
  }
});

// Mod info handlers
ipcMain.handle("get-mod-preview", async (event, modPath) => {
  try {
    const previewPath = path.join(modPath, "preview.webp");
    if (await fse.pathExists(previewPath)) {
      return previewPath;
    }
    return null;
  } catch (error) {
    console.error("Error getting mod preview:", error);
    return null;
  }
});

ipcMain.handle("get-mod-info", async (event, modPath) => {
  try {
    const infoPath = path.join(modPath, "info.toml");
    const modName = path.basename(modPath);
    if (await fse.pathExists(infoPath)) {
      const infoContent = await fsp.readFile(infoPath, "utf8");
      try {
        return toml.parse(infoContent);
      } catch (parseError) {
        console.error(
          `TOML parse error in ${infoPath} (mod: ${modName}):`,
          parseError,
        );
        throw parseError;
      }
    }
    return null;
  } catch (error) {
    const modName = path.basename(modPath);
    console.error(`Error getting mod info for mod "${modName}":`, error);
    return null;
  }
});

ipcMain.handle("save-mod-info", async (event, modPath, info) => {
  try {
    const infoPath = path.join(modPath, "info.toml");

    // Convert the info object to TOML format
    let tomlContent = "";
    for (const [key, value] of Object.entries(info)) {
      // Skip empty values
      if (!value && key !== "version") continue;

      if (key === "description") {
        tomlContent += `${key} = """\n${value}\n"""\n`;
      } else {
        tomlContent += `${key} = "${value}"\n`;
      }
    }

    await fsp.writeFile(infoPath, tomlContent, "utf8");
    return true;
  } catch (error) {
    console.error("Failed to save mod info:", error);
    throw error;
  }
});

// Open mods folder handler
ipcMain.handle("open-mods-folder", async () => {
  const modsPath = store.get("modsPath") as string | undefined;
  if (modsPath) {
    shell.openPath(modsPath);
  }
});

// Open specific mod folder handler
ipcMain.handle("open-mod-folder", async (event, modId) => {
  const modsPath = store.get("modsPath") as string | undefined;
  if (modsPath && modId) {
    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    const modPath = path.join(modsPath, modId);
    const disabledModPath = path.join(disabledModsPath, modId);

    if (await fse.pathExists(modPath)) {
      shell.openPath(modPath);
    } else if (await fse.pathExists(disabledModPath)) {
      shell.openPath(disabledModPath);
    }
  }
});

// Settings handlers
ipcMain.handle("get-mods-path", () => {
  return store.get("modsPath", "");
});

ipcMain.handle("set-mods-path", (event, newPath) => {
  store.set("modsPath", newPath);
  log.info("Mods path updated:", newPath);
  return true;
});

ipcMain.handle("get-custom-css-path", () => {
  return store.get("customCssPath", "");
});

ipcMain.handle("set-custom-css-path", (event, newPath) => {
  store.set("customCssPath", newPath);
  return true;
});

ipcMain.handle("get-custom-css-enabled", async () => {
  try {
    return store.get("customCssEnabled", false);
  } catch (error) {
    console.error("Failed to get custom CSS enabled state:", error);
    throw error;
  }
});

ipcMain.handle("load-custom-css", async (event, path) => {
  try {
    const customCss = await fsp.readFile(path, "utf8");
    mainWindow.webContents.insertCSS(customCss);
  } catch (error) {
    console.error("Failed to load custom CSS:", error);
    throw error;
  }
});

ipcMain.handle("remove-custom-css", async () => {
  try {
    mainWindow.webContents.removeInsertedCSS();
    store.delete("customCssPath");
  } catch (error) {
    console.error("Failed to remove custom CSS:", error);
    throw error;
  }
});

ipcMain.handle("select-custom-css-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "CSS Files", extensions: ["css"] }],
  });

  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

ipcMain.handle("get-conflict-check-enabled", () => {
  return store.get("conflictCheckEnabled", true);
});

ipcMain.handle("set-conflict-check-enabled", (event, enabled) => {
  store.set("conflictCheckEnabled", enabled);
  return true;
});

ipcMain.handle("get-auto-prefix-rename", () => {
  return store.get("autoPrefixRename", false);
});

ipcMain.handle("set-auto-prefix-rename", (event, enabled) => {
  store.set("autoPrefixRename", enabled);
  return true;
});

// Legacy mod discovery handler
ipcMain.handle("get-legacy-mod-discovery", () => {
  return store.get("legacyModDiscovery", false);
});

ipcMain.handle("set-legacy-mod-discovery", (event, enabled) => {
  store.set("legacyModDiscovery", enabled);
  return true;
});

// Dark mode handler
ipcMain.handle("set-dark-mode", (event, enabled) => {
  store.set("darkMode", enabled);
  return true;
});

ipcMain.handle("get-dark-mode", () => {
  return store.get("darkMode", false);
});

ipcMain.handle("get-send-version-enabled", () => {
  return store.get("sendVersionEnabled", true);
});

ipcMain.handle("set-send-version-enabled", (event, enabled) => {
  store.set("sendVersionEnabled", enabled);
  return true;
});

let currentDownload = null;

const activeDownloads = new Map();
let downloadIdCounter = 0;

ipcMain.handle("download-mod", async (event, downloadLink) => {
  let downloadId;
  try {
    downloadId = (downloadIdCounter++).toString();
    const modsPath = store.get("modsPath") as string | undefined;
    if (!modsPath) throw new Error("Mods path not set");

    const GameBananaDownloader = require("./src/js/gameBananaDownloader");
    const downloader = new GameBananaDownloader(modsPath, {
      onStart: (message, modName) => {
        event.sender.send("download-status", {
          id: downloadId,
          type: "start",
          message,
          modName,
        });
      },
      onProgress: (message, progress, modName) => {
        event.sender.send("download-status", {
          id: downloadId,
          type: "progress",
          message,
          progress: progress || 0,
          modName,
        });
      },
      onFinish: (message, modName) => {
        event.sender.send("download-status", {
          id: downloadId,
          type: "finish",
          message,
          modName,
        });
        activeDownloads.delete(downloadId);
        hiddenWindow.webContents.executeJavaScript("playFinish()");
      },
      onError: (message) => {
        event.sender.send("download-status", {
          id: downloadId,
          type: "error",
          message,
        });
        activeDownloads.delete(downloadId);
        hiddenWindow.webContents.executeJavaScript("playError()");
      },
    });

    activeDownloads.set(downloadId, downloader);
    const result = await downloader.downloadMod(downloadLink);

    if (result && result.cancelled) {
      event.sender.send("download-status", {
        id: downloadId,
        type: "cancelled",
        message: "Download cancelled by user",
      });
      return { cancelled: true };
    }

    return result;
  } catch (error) {
    console.error("Mod download error:", error);
    event.sender.send("download-status", {
      id: downloadId,
      type: "error",
      message: error.message,
    });
    throw error;
  }
});

ipcMain.handle("cancel-download", async (event, downloadId) => {
  try {
    const downloader = activeDownloads.get(downloadId);
    if (downloader) {
      await downloader.cancel();
      currentDownload = null; // Reset current download
      activeDownloads.delete(downloadId);
      event.sender.send("download-status", {
        id: downloadId,
        type: "cancelled",
        message: "Download cancelled",
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error("Cancel download error:", error);
    throw error;
  }
});

ipcMain.handle("rename-mod", async (event, { oldName, newName }) => {
  console.log("Rename request received:", { oldName, newName });

  const modsPath = store.get("modsPath") as string | undefined;
  if (!modsPath) {
    throw new Error("Mods directory not set");
  }

  const ultimatePath = path.dirname(modsPath);
  const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

  let sourcePath: string | undefined;
  let destPath: string | undefined;

  try {
    // Paths for enabled and disabled mods
    const enabledModPath = path.join(modsPath, oldName);
    const disabledModPath = path.join(disabledModsPath, oldName);

    // Determine if mod is enabled or disabled
    if (await fse.pathExists(enabledModPath)) {
      sourcePath = enabledModPath;
      destPath = path.join(modsPath, newName);
    } else if (await fse.pathExists(disabledModPath)) {
      sourcePath = disabledModPath;
      destPath = path.join(disabledModsPath, newName);
    } else {
      throw new Error("Mod folder not found");
    }

    // Check if destination path already exists
    if (await fse.pathExists(destPath)) {
      throw new Error("A mod with this name already exists");
    }

    // Use fs.promises for renaming with better error handling
    await fsp.rename(sourcePath, destPath);

    console.log(`Renamed from ${sourcePath} to ${destPath}`);

    return true;
  } catch (error) {
    console.error("Mod rename error:", error);

    // More detailed error handling
    if (error.code === "EPERM") {
      // Try an alternative method using copy and delete
      try {
        await fse.copy(sourcePath, destPath);
        await fse.remove(sourcePath);
        console.log("Renamed using copy and delete method");
        return true;
      } catch (alternativeError) {
        console.error("Alternative rename method failed:", alternativeError);
        throw new Error(
          "Failed to rename mod. Please close any open files or applications using the mod.",
        );
      }
    }

    throw error;
  }
});
ipcMain.handle("initialize-configurations", async () => {
  try {
    const path = require("path");
    const fs = require("fs").promises;

    // Ensure mods path is set
    const modsPath = store.get("modsPath") as string | undefined;
    if (!modsPath) {
      throw new Error("Mods path not set");
    }

    // Create necessary directories
    const disabledModsPath = path.join(modsPath, DISABLED_MODS_FOLDER_NAME);
    await fs.mkdir(disabledModsPath, { recursive: true });

    // Set default settings
    const defaultSettings = {
      darkMode: false,
      autoUpdate: true,
      language: "en",
    };

    // Save default settings if not exists
    Object.keys(defaultSettings).forEach((key) => {
      if (!store.has(key)) {
        store.set(key, defaultSettings[key]);
      }
    });

    // Scan initial mods
    const mods = await scanInitialMods(modsPath);

    console.log("Initialization complete:", {
      modsPath,
      settings: defaultSettings,
      initialMods: mods,
    });

    return {
      modsPath,
      settings: defaultSettings,
      initialMods: mods,
    };
  } catch (error) {
    console.error("Configuration initialization error:", error);
    throw error;
  }
});

// Helper function to scan initial mods
async function scanInitialMods(modsPath) {
  const path = require("path");
  const fs = require("fs").promises;

  try {
    const files = await fs.readdir(modsPath);
    const modFolders = [];

    for (const file of files) {
      // Skip specific folders
      if (file === DISABLED_MODS_FOLDER_NAME) continue;

      const fullPath = path.join(modsPath, file);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        modFolders.push({
          name: file,
          path: fullPath,
          enabled: true,
        });
      }
    }

    // Check disabled mods
    const disabledPath = path.join(modsPath, DISABLED_MODS_FOLDER_NAME);
    try {
      const disabledFiles = await fs.readdir(disabledPath);
      for (const file of disabledFiles) {
        const fullPath = path.join(disabledPath, file);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          modFolders.push({
            name: file,
            path: fullPath,
            enabled: false,
          });
        }
      }
    } catch (disabledError) {
      // Ignore if disabled folder doesn't exist
      console.log("No disabled mods folder");
    }

    return modFolders;
  } catch (error) {
    console.error("Initial mod scan error:", error);
    return [];
  }
}

app.whenReady().then(() => {});

ipcMain.on("open-external", (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle("load-plugins", async () => {
  const pluginsPath = store.get("pluginsPath", "") as string | undefined;
  if (!pluginsPath) return [];

  const skylinePath = path.dirname(pluginsPath);
  const disabledPluginsPath = path.join(
    skylinePath,
    DISABLED_PLUGINS_FOLDER_NAME,
  );

  try {
    const plugins = [];
    const files = await fsp.readdir(pluginsPath);

    for (const file of files) {
      const filePath = path.join(pluginsPath, file);
      const stats = await fsp.stat(filePath);

      if (stats.isFile() && file.endsWith(PLUGIN_EXTENSION)) {
        plugins.push({ id: file, name: file, path: filePath, enabled: true });
      }
    }

    // Read disabled plugins folder
    try {
      await fsp.access(disabledPluginsPath);

      const disabledFiles = await fsp.readdir(disabledPluginsPath);

      for (const file of disabledFiles) {
        const filePath = path.join(disabledPluginsPath, file);

        try {
          const stats = await fsp.stat(filePath);
          if (stats.isFile() && file.endsWith(PLUGIN_EXTENSION)) {
            plugins.push({
              id: file,
              name: file,
              path: filePath,
              enabled: false,
            });
          }
        } catch (statError) {
          console.error(`Error reading disabled plugin ${file}:`, statError);
        }
      }
    } catch {
      // Disabled plugins folder doesn't exist, that's fine
    }

    return plugins;
  } catch (error) {
    console.error("Error loading plugins:", error);
    return [];
  }
});

ipcMain.handle("install-plugin", async (event, filePath) => {
  try {
    // Input validation
    if (!filePath) {
      throw new Error("No file path provided");
    }

    // Handle file path from different sources
    const resolvedPath =
      typeof filePath === "object" ? filePath.path : filePath;
    if (typeof resolvedPath !== "string") {
      throw new TypeError('The "path" argument must be of type string');
    }

    const pluginsPath = store.get("pluginsPath") as string | undefined;

    if (!pluginsPath) {
      throw new Error("Plugins directory not set");
    }

    // Validate file extension
    if (!resolvedPath.toLowerCase().endsWith(PLUGIN_EXTENSION)) {
      throw new Error(
        `Invalid plugin file. Must be a ${PLUGIN_EXTENSION} file`,
      );
    }

    // Check if file exists
    await fsp.access(resolvedPath);

    const fileName = path.basename(resolvedPath);

    // Ensure unique plugin name
    let uniquePluginName = fileName;
    let counter = 1;

    while (await fse.pathExists(path.join(pluginsPath, uniquePluginName))) {
      const nameWithoutExt = path.basename(fileName, PLUGIN_EXTENSION);
      uniquePluginName = `${nameWithoutExt}_${counter}${PLUGIN_EXTENSION}`;
      counter++;
    }

    const finalDestPath = path.join(pluginsPath, uniquePluginName);

    // Ensure plugins directory exists
    await fse.ensureDir(pluginsPath);

    // Copy instead of move to handle cross-device transfers
    await fse.copy(resolvedPath, finalDestPath);

    return {
      id: uniquePluginName,
      name: uniquePluginName,
      path: finalDestPath,
      enabled: true,
    };
  } catch (error) {
    console.error("Plugin installation error:", error);
    throw error; // Let the error propagate to the renderer
  }
});

ipcMain.handle("mod:createDirectory", async (event, dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
  return true;
});

ipcMain.handle("delete-plugin", async (event, pluginId) => {
  const pluginsPath = store.get("pluginsPath") as string | undefined;

  if (!pluginsPath) {
    throw new Error("Plugins directory not set");
  }

  const skylinePath = path.dirname(pluginsPath);
  const disabledPluginsPath = path.join(
    skylinePath,
    DISABLED_PLUGINS_FOLDER_NAME,
  );

  try {
    const pluginPath = path.join(pluginsPath, pluginId);
    const disabledPluginPath = path.join(disabledPluginsPath, pluginId);

    if (await fse.pathExists(pluginPath)) {
      await fse.remove(pluginPath);
    } else if (await fse.pathExists(disabledPluginPath)) {
      await fse.remove(disabledPluginPath);
    } else {
      throw new Error("Plugin not found");
    }
    return true;
  } catch (error) {
    console.error("Plugin deletion error:", error);
    throw error;
  }
});

ipcMain.handle("get-plugins-path", () => {
  return store.get("pluginsPath", "");
});

ipcMain.handle("set-plugins-path", (event, newPath) => {
  store.set("pluginsPath", newPath);
  log.info("Plugins path updated:", newPath);
  return true;
});

ipcMain.handle("toggle-plugin", async (event, pluginId) => {
  const pluginsPath = store.get("pluginsPath") as string | undefined;

  if (!pluginsPath) {
    throw new Error(
      "Plugins directory not set. Please set a plugins directory in settings first.",
    );
  }

  const skylinePath = path.dirname(pluginsPath);
  const disabledPluginsPath = path.join(
    skylinePath,
    DISABLED_PLUGINS_FOLDER_NAME,
  );

  try {
    // Create disabled plugins directory if it doesn't exist
    await fsp.mkdir(disabledPluginsPath, { recursive: true });

    const pluginPath = path.join(pluginsPath, pluginId);
    const disabledPluginPath = path.join(disabledPluginsPath, pluginId);

    if (await fse.pathExists(pluginPath)) {
      // Ensure unique destination path
      let uniqueDisabledPluginPath = disabledPluginPath;
      let counter = 1;
      while (await fse.pathExists(uniqueDisabledPluginPath)) {
        uniqueDisabledPluginPath = path.join(
          disabledPluginsPath,
          `${path.basename(
            pluginId,
            PLUGIN_EXTENSION,
          )}_${counter}${PLUGIN_EXTENSION}`,
        );
        counter++;
      }

      // Move to disabled folder
      await fse.move(pluginPath, uniqueDisabledPluginPath);
      return false; // Disabled
    } else if (await fse.pathExists(disabledPluginPath)) {
      // Ensure unique destination path
      let uniquePluginPath = pluginPath;
      let counter = 1;
      while (await fse.pathExists(uniquePluginPath)) {
        uniquePluginPath = path.join(
          pluginsPath,
          `${path.basename(
            pluginId,
            PLUGIN_EXTENSION,
          )}_${counter}${PLUGIN_EXTENSION}`,
        );
        counter++;
      }

      // Move back to main folder
      await fse.move(disabledPluginPath, uniquePluginPath);

      return true; // Enabled
    } else {
      throw new Error("Plugin not found");
    }
  } catch (error) {
    console.error("Plugin toggle error:", error);
    throw error;
  }
});

ipcMain.handle("rename-plugin", async (event, { oldName, newName }) => {
  const pluginsPath = store.get("pluginsPath") as string | undefined;

  if (!pluginsPath) {
    throw new Error("Plugins directory not set");
  }

  const skylinePath = path.dirname(pluginsPath);
  const disabledPluginsPath = path.join(
    skylinePath,
    DISABLED_PLUGINS_FOLDER_NAME,
  );

  let sourcePath: string | undefined;
  let destPath: string | undefined;

  try {
    // Paths for enabled and disabled plugins
    const enabledPluginPath = path.join(pluginsPath, oldName);
    const disabledPluginPath = path.join(disabledPluginsPath, oldName);

    // Determine if plugin is enabled or disabled
    if (await fse.pathExists(enabledPluginPath)) {
      sourcePath = enabledPluginPath;
      destPath = path.join(pluginsPath, newName);
    } else if (await fse.pathExists(disabledPluginPath)) {
      sourcePath = disabledPluginPath;
      destPath = path.join(disabledPluginsPath, newName);
    } else {
      throw new Error("Plugin folder not found");
    }

    // Check if destination path already exists
    if (await fse.pathExists(destPath)) {
      event.sender.send(
        "plugin-exists",
        "A plugin with this name already exists",
      );
      throw new Error("A plugin with this name already exists");
    }

    // Use fs.promises for renaming with better error handling
    await fsp.rename(sourcePath, destPath);

    return true;
  } catch (error) {
    console.error("Plugin rename error:", error);

    // More detailed error handling
    if (error.code === "EPERM") {
      // Try an alternative method using copy and delete
      try {
        await fse.copy(sourcePath, destPath);
        await fse.remove(sourcePath);
        return true;
      } catch (alternativeError) {
        console.error("Alternative rename method failed:", alternativeError);
        throw new Error(
          "Failed to rename plugin. Please close any open files or applications using the plugin.",
        );
      }
    }

    throw error;
  }
});

ipcMain.handle("open-plugins-folder", async () => {
  try {
    const pluginsPath = store.get("pluginsPath") as string | undefined;
    if (!pluginsPath) {
      throw new Error("Plugins path not set");
    }

    if (await fse.pathExists(pluginsPath)) {
      await shell.openPath(pluginsPath);
    } else {
      throw new Error("Plugins folder not found");
    }
  } catch (error) {
    console.error("Failed to open plugins folder:", error);
    throw error;
  }
});

// Helper function to get all files in a directory recursively
async function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = await fsp.readdir(dirPath);

  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dirPath, file);
      const stat = await fsp.stat(filePath);

      if (stat.isDirectory()) {
        arrayOfFiles.push(filePath);
        await getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    }),
  );

  return arrayOfFiles;
}

// Add this helper function
function isPathInModsDirectory(targetPath, modsPath) {
  const normTargetPath = path.normalize(targetPath).toLowerCase();
  const normModsPath = path.normalize(modsPath).toLowerCase();
  return (
    normTargetPath.startsWith(normModsPath) ||
    normTargetPath.includes("disabled_mod")
  );
}

// Update the get-mod-files handler
ipcMain.handle("get-mod-files", async (event, modPath) => {
  try {
    const modsPath = store.get("modsPath") as string | undefined;

    if (!modsPath) {
      throw new Error("Mods directory not set");
    }

    const normalizedModPath = path.normalize(modPath);
    const normalizedModsPath = path.normalize(modsPath);

    // Allow paths in both mods directory and disabled mods directory
    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    if (
      !normalizedModPath.startsWith(normalizedModsPath) &&
      !normalizedModPath.startsWith(path.normalize(disabledModsPath))
    ) {
      throw new Error("Access denied: Path is outside mods directory");
    }

    // Get all files recursively
    const files = await getAllFiles(modPath);
    return files.map((file) => path.relative(modPath, file));
  } catch (error) {
    console.error("Failed to get mod files:", error);
    throw error;
  }
});

// Settings handlers
ipcMain.handle("get-discord-rpc-enabled", () => {
  return store.get("discordRpcEnabled", true);
});

ipcMain.handle("set-discord-rpc-enabled", (event, enabled) => {
  store.set("discordRpcEnabled", enabled);
  return true;
});

// Discord RPC handlers
ipcMain.handle("connect-discord-rpc", async () => {
  try {
    await discordRPC.connect();
    return true;
  } catch (error) {
    console.error("Failed to connect Discord RPC:", error);
    throw error;
  }
});

ipcMain.handle("disconnect-discord-rpc", async () => {
  try {
    discordRPC.disconnect();
    return true;
  } catch (error) {
    console.error("Failed to disconnect Discord RPC:", error);
    throw error;
  }
});

ipcMain.handle("set-discord-rpc-activity", async (event, activity) => {
  try {
    discordRPC.setActivity(activity);
    return true;
  } catch (error) {
    console.error("Failed to set Discord RPC activity:", error);
    throw error;
  }
});

ipcMain.handle("update-discord-rpc-mod-count", async (event, count) => {
  try {
    discordRPC.updateModBrowsing(count);
    return true;
  } catch (error) {
    console.error("Failed to update Discord RPC mod count:", error);
    throw error;
  }
});

ipcMain.handle("update-discord-rpc-mod-installation", async () => {
  try {
    discordRPC.updateModInstalling();
    return true;
  } catch (error) {
    console.error("Failed to update Discord RPC mod installation:", error);
    throw error;
  }
});

// Emulator handlers
ipcMain.handle("set-emulator-path", (event, path) => {
  store.set("emulatorPath", path);
  return true;
});

ipcMain.handle("get-emulator-path", () => {
  return store.get("emulatorPath", "");
});

ipcMain.handle("set-game-path", (event, path) => {
  store.set("gamePath", path);
  return true;
});

ipcMain.handle("get-game-path", () => {
  return store.get("gamePath", "");
});

ipcMain.handle("set-selected-emulator", (event, emulator) => {
  store.set("selectedEmulator", emulator);
  return true;
});

ipcMain.handle("get-selected-emulator", () => {
  return store.get("selectedEmulator", "");
});

ipcMain.handle("set-yuzu-fullscreen", (event, enabled) => {
  store.set("yuzuFullscreen", enabled);
  return true;
});

ipcMain.handle("get-yuzu-fullscreen", () => {
  return store.get("yuzuFullscreen", false);
});

ipcMain.handle("launch-game", async () => {
  try {
    const emulatorPath = store.get("emulatorPath", "");
    const gamePath = store.get("gamePath", "");
    const selectedEmulator = store.get("selectedEmulator", "");
    const yuzuFullscreen = store.get("yuzuFullscreen", false);

    if (!emulatorPath || !gamePath || !selectedEmulator) {
      throw new Error("Please configure emulator and game paths first");
    }

    let command;
    if (selectedEmulator === "yuzu") {
      command = `"${emulatorPath}" -g "${gamePath}"${
        yuzuFullscreen ? " -f" : ""
      }`;
    } else if (selectedEmulator === "ryujinx") {
      command = `"${emulatorPath}" "${gamePath}"`;
    } else {
      throw new Error("Invalid emulator selected");
    }

    exec(command, { maxBuffer: 2048 * 2048 }, (error, stdout, stderr) => {
      if (error) {
        console.error("Failed to launch game:", error);
        console.error("stdout:", stdout);
        console.error("stderr:", stderr);
        throw new Error(`Failed to launch game: ${error.message}`);
      }
    });

    return true;
  } catch (error) {
    console.error("Failed to launch game:", error);
    throw error;
  }
});

function logAppSettings() {
  const settings = {
    modsPath: store.get("modsPath", "Not set"),
    pluginsPath: store.get("pluginsPath", "Not set"),
    darkMode: store.get("darkMode", false),
    customCssPath: store.get("customCssPath", "Not set"),
    discordRpcEnabled: store.get("discordRpcEnabled", true),
    conflictCheckEnabled: store.get("conflictCheckEnabled", true),
    emulatorPath: store.get("emulatorPath", "Not set"),
    gamePath: store.get("gamePath", "Not set"),
    selectedEmulator: store.get("selectedEmulator", "Not set"),
    appVersion: app.getVersion(),
  };

  log.info("Application Settings:", JSON.stringify(settings, null, 2));
  return settings;
}

ipcMain.handle("get-current-log", async () => {
  try {
    const logPath = log.transports.file.getFile().path;
    const consoleLog = await fsp.readFile(logPath, "utf8");

    // Get the last 1000 lines to avoid overwhelming the viewer
    const lines = consoleLog.split("\n").slice(-1000);
    return lines.join("\n");
  } catch (error) {
    console.error("Error reading log file:", error);
    throw error;
  }
});

ipcMain.handle("open-logs-folder", async () => {
  try {
    const logPath = path.dirname(log.transports.file.getFile().path);
    await shell.openPath(logPath);
    return true;
  } catch (error) {
    console.error("Error opening logs folder:", error);
    throw error;
  }
});

ipcMain.handle("open-current-log", async () => {
  try {
    const logPath = log.transports.file.getFile().path;
    await shell.openPath(logPath);
    return true;
  } catch (error) {
    console.error("Error opening current log:", error);
    throw error;
  }
});

ipcMain.handle("clear-logs", async () => {
  try {
    const logPath = log.transports.file.getFile().path;
    // Clear the log file by writing an empty string
    await fsp.writeFile(logPath, "");
    // Add a log entry indicating the logs were cleared
    log.info("Logs cleared by user");
    return true;
  } catch (error) {
    console.error("Error clearing logs:", error);
    throw error;
  }
});

function handleProtocolUrl(url) {
  if (!mainWindow || !mainWindow.webContents) {
    initialProtocolUrl = url;
    createWindow();
    return;
  }

  // Get the protocol confirmation setting (true means skip confirmation)
  const skipConfirmation = store.get("protocolConfirmEnabled", false);

  // Send URL and skipConfirmation flag to renderer
  const sendUrlToRenderer = () => {
    mainWindow.webContents.send("protocol-url", {
      url: url,
      skipConfirmation: skipConfirmation,
    });
  };

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", sendUrlToRenderer);
  } else {
    sendUrlToRenderer();
  }
}

ipcMain.handle("get-protocol-confirm-enabled", () => {
  return store.get("protocolConfirmEnabled", false);
});

ipcMain.handle("set-protocol-confirm-enabled", (event, enabled) => {
  store.set("protocolConfirmEnabled", enabled);
  return true;
});

ipcMain.handle("clear-temp-files", async () => {
  try {
    const appDataPath = app.getPath("userData");
    const modsPath = store.get("modsPath") as string | undefined;
    const tempLocations = [app.getPath("temp"), appDataPath, modsPath].filter(
      Boolean,
    ); // Remove null/undefined paths

    let filesRemoved = false;

    for (const location of tempLocations) {
      try {
        const entries = await fsp.readdir(location, { withFileTypes: true });

        for (const entry of entries) {
          if (
            entry.isDirectory() &&
            entry.name.toLowerCase().startsWith("temp")
          ) {
            const fullPath = path.join(location, entry.name);
            await fse.remove(fullPath);
            log.info(`Removed temp directory: ${fullPath}`);
            filesRemoved = true;
          }
        }
      } catch (err) {
        console.warn(`Error accessing directory ${location}:`, err);
      }
    }

    if (filesRemoved) {
      log.info("Temporary files cleared successfully");
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error clearing temporary files:", error);
    log.error("Failed to clear temporary files:", error);
    throw error;
  }
});

ipcMain.handle(
  "rename-mod-file",
  async (event, { modPath, oldPath, newPath }) => {
    try {
      const fullOldPath = path.join(modPath, oldPath);
      const fullNewPath = path.join(modPath, newPath);

      // Create parent directories if they don't exist
      await fsp.mkdir(path.dirname(fullNewPath), { recursive: true });

      // Perform the rename
      try {
        await fsp.rename(fullOldPath, fullNewPath);
      } catch (error) {
        if (error.code === "EPERM") {
          // If rename fails due to EPERM, try copying and deleting
          await fse.copy(fullOldPath, fullNewPath);
          await fse.remove(fullOldPath);
        } else {
          throw error;
        }
      }
      return true;
    } catch (error) {
      console.error("Error renaming mod file:", error);
      throw error;
    }
  },
);

ipcMain.handle("delete-mod-file", async (event, { modPath, filePath }) => {
  const fullPath = path.join(modPath, filePath);
  try {
    const stat = await fsp.stat(fullPath);

    if (stat.isDirectory()) {
      await fsp.rm(fullPath, { recursive: true });
    } else {
      await fsp.unlink(fullPath);
    }

    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn("File or directory does not exist:", fullPath);
      return false; // Indicate that the file or directory was not found
    }
    console.error("Error deleting mod file:", error);
    throw error;
  }
});

ipcMain.handle("write-mod-file", async (event, { filePath, content }) => {
  try {
    // File doesn't exist, check content for encoding hints
    if (
      content.includes('encoding="utf-16"') ||
      content.includes("encoding='utf-16'")
    ) {
      // Check if content already starts with BOM (U+FEFF / UTF-16 LE BOM character)
      const hasBOM = content.charCodeAt(0) === 0xfeff;

      // If BOM already present, remove it from content since we'll add it as bytes
      const contentWithoutBOM = hasBOM ? content.substring(1) : content;

      // Add BOM for UTF-16LE and write as buffer
      const bom = Buffer.from([0xff, 0xfe]);
      const contentBuffer = Buffer.from(contentWithoutBOM, "utf16le");
      const fullBuffer = Buffer.concat([bom, contentBuffer]);

      await fsp.writeFile(filePath, fullBuffer);

      return true;
    }

    await fsp.writeFile(filePath, content, "utf8");

    return true;
  } catch (error) {
    console.error("Error writing mod file:", error);
    throw error;
  }
});

ipcMain.handle("get-volume", () => {
  return store.get("volume", 100);
});

ipcMain.handle("set-volume", async (event, volume) => {
  try {
    store.set("volume", volume);
    if (hiddenWindow && !hiddenWindow.isDestroyed()) {
      await hiddenWindow.webContents.executeJavaScript(`
                setVolume(${volume});
            `);
    }
    return true;
  } catch (error) {
    console.error("Error setting volume:", error);
    throw error;
  }
});

ipcMain.handle("get-april-fools-enabled", () => {
  return store.get("aprilFoolsEnabled", false);
});

ipcMain.handle("set-april-fools-enabled", (event, enabled) => {
  store.set("aprilFoolsEnabled", enabled);
  return true;
});

// Add these new IPC handlers
ipcMain.handle("toggle-pause-download", async (event, id) => {
  try {
    const downloader = activeDownloads.get(id);
    if (!downloader) {
      throw new Error("No active download found");
    }

    if (downloader.isPaused) {
      await downloader.resume();
      return false; // Not paused anymore
    } else {
      await downloader.pause();
      return true; // Now paused
    }
  } catch (error) {
    console.error("Error toggling pause state:", error);
    throw error;
  }
});

ipcMain.handle("get-active-download", (event, id) => {
  return activeDownloads.has(id);
});

// Add FPP creation handler
ipcMain.handle("create-fpp", async (event, options) => {
  try {
    const modsPath = store.get("modsPath") as string | undefined;
    const pluginsPath = store.get("pluginsPath") as string | undefined;

    // Utiliser le répertoire spécifié ou téléchargements par défaut
    const outputDir = options.outputDir || app.getPath("downloads");

    const result = await createFPP({
      ...options,
      modsPath,
      pluginsPath,
      outputDir: outputDir,
    });

    return { success: true, path: result.outputPath };
  } catch (error) {
    console.error("Error creating FPP:", error);
    return { success: false, error: error.message };
  }
});

// Add FPP handlers
ipcMain.handle("import-fpp", async (event, filePath) => {
  try {
    const modsPath = store.get("modsPath") as string | undefined;
    const pluginsPath = store.get("pluginsPath") as string | undefined;

    await extractFPP(filePath, {
      modsPath,
      pluginsPath,
    });

    return { success: true };
  } catch (error) {
    console.error("Error importing FPP:", error);
    return { success: false, error: error.message };
  }
});

// Add after other settings handlers
ipcMain.handle("get-workspace-path", () => {
  return store.get("workspacePath", "");
});

ipcMain.handle("set-workspace-path", (event, newPath) => {
  store.set("workspacePath", newPath);
  return true;
});

// Add this handler near the other mod operation handlers
ipcMain.handle("get-disabled-mods", async () => {
  const workspacePath = store.get("workspacePath");
  if (!workspacePath) {
    return [];
  }

  const PresetManager = require("./src/js/presetManager");
  const presetManager = new PresetManager(workspacePath);
  await presetManager.init();

  return await presetManager.getDisabledMods();
});

// Add this handler for getting mod hash
ipcMain.handle("get-mod-hash", async (event, modName) => {
  const { getHash } = require("./src/js/hash");
  return getHash(modName);
});

ipcMain.on("play-loading-audio", () => {
  hiddenWindow.webContents
    .executeJavaScript("playLoading()")
    .catch(console.error);
});
ipcMain.on("play-conflict-audio", () => {
  hiddenWindow.webContents
    .executeJavaScript("playConflict()")
    .catch(console.error);
});
ipcMain.on("stop-loading-audio", () => {
  hiddenWindow.webContents
    .executeJavaScript("stopLoading()")
    .catch(console.error);
});

// Add file operation handlers
ipcMain.handle("file-exists", async (event, filePath) => {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("read-mod-file", async (event, filePath) => {
  try {
    // Read first few bytes as buffer to detect encoding
    const buffer = await fsp.readFile(filePath);

    let encoding;
    // Check BOM (Byte Order Mark)
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      // UTF-16 LE BOM
      encoding = "utf16le";
    } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      // UTF-16 BE BOM
      encoding = "utf16le"; // Node.js handles BE with 'utf16le' by swapping bytes
    } else if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      // UTF-8 BOM
      encoding = "utf8";
    } else {
      // No BOM, check XML declaration
      const start = buffer.toString("utf8", 0, Math.min(200, buffer.length));

      if (
        start.includes('encoding="utf-16"') ||
        start.includes("encoding='utf-16'")
      ) {
        encoding = "utf16le";
      } else {
        // Try to detect if it looks like UTF-16 by checking for null bytes
        let nullCount = 0;
        for (let i = 0; i < Math.min(100, buffer.length); i++) {
          if (buffer[i] === 0) nullCount++;
        }
        // If more than 30% null bytes, likely UTF-16
        if (nullCount > 30) {
          encoding = "utf16le";
        } else {
          encoding = "utf8";
        }
      }
    }

    return buffer.toString(encoding);
  } catch (error) {
    console.error("Error reading mod file:", error);
    throw error;
  }
});

// Export the Discord RPC instance
export default discordRPC;
