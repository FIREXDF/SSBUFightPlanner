import { Mod } from "../types/mod";
import { ModManager } from "./modManager.js";
import { SlotScanner } from "./slotScanner.js";
import ModConflictDetector from "./modConflictDetector.js";
import { languageService } from "./services/languageService.js";
import { ChangeSlots } from "./changeSlots.js";
import { CharacterScanner } from "./scanallfoldercharacter.js";
import { getInternalFighterName } from "./fighterNames.js";

class UIController {
  modManager: ModManager;
  selectedMod: string | null;
  downloadQueue: string[];
  isDownloading: boolean;
  mods: Mod[];
  conflictDetector: ModConflictDetector;
  conflicts: Map<string, string[]>;
  downloadModal: any;
  characterScanner: CharacterScanner;
  selectedCategories: Set<string>;
  searchInput: HTMLElement;
  enabledFilter: HTMLElement;
  disabledFilter: HTMLElement;
  conflictButton: HTMLElement;
  isDialogOpen = false;
  isBatchProcessing = false;

  constructor() {
    try {
      this.modManager = new ModManager();
      this.selectedMod = null;
      this.initializeEventListeners();
      this.loadSettings();
      this.loadMods();
      this.updateModPreview();
      this.initializeDarkMode();
      this.initializeErrorHandling();
      this.initializeSearchBar();
      this.initializeSearchBar = this.initializeSearchBar.bind(this);
      this.performSearch = this.performSearch.bind(this);
      this.addErrorStyles();
      this.loadMods = this.loadMods.bind(this);
      this.initializeEventListeners = this.initializeEventListeners.bind(this);
      this.showLoading = this.showLoading.bind(this);
      this.hideLoading = this.hideLoading.bind(this);
      this.showError = this.showError.bind(this);
      this.handleGameBananaDownload = this.handleGameBananaDownload.bind(this);
      this.handleSelectCustomCssFile =
        this.handleSelectCustomCssFile.bind(this);
      this.handleAddDownloadField = this.handleAddDownloadField.bind(this);
      this.downloadQueue = [];
      this.isDownloading = false;
      window.uiController = this;
      this.mods = [];
      this.initializePluginTab();
      this.initializeSettingsTab();
      this.conflictDetector = new ModConflictDetector();
      this.conflicts = new Map();
      this.initializeConflictButton();
      this.initializeDiscordRpcToggle();
      this.downloadModal = null; // Define downloadModal as a class property
      this.handleClearLogs = this.handleClearLogs.bind(this);
      this.handleRefreshLogs = this.handleRefreshLogs.bind(this);
      this.handleChangeSlots = this.handleChangeSlots.bind(this);
      this.showChangeSlotsDialog = this.showChangeSlotsDialog.bind(this);
      this.initializeDownloadsPanel();
      this.characterScanner = new CharacterScanner();
      this.initializeCharactersTab();
      this.initializeModSelection();
      this.initializeFppHandlers();
      this.selectedCategories = new Set();
      this.initializeCategoryFilters();

      // Add event listener for update downloaded
      window.electron.onUpdateDownloaded((changelog) => {
        try {
          this.showToast(`New update installed:\n${changelog}`, "info");
        } catch (error) {
          console.error("Error showing update toast:", error);
        }
      });

      // Add download status listener
      window.electron.onDownloadStatus((status) => {
        try {
          const { id, type, message, modName, progress } = status;

          const downloadsList = document.getElementById("downloadsList");
          if (!downloadsList) {
            console.error("Downloads list element not found");
            return;
          }

          // Remove "no downloads" message when adding first download
          const noDownloadsMsg = downloadsList.querySelector(
            ".nodownloadsmessage",
          );
          if (noDownloadsMsg && type === "start") {
            noDownloadsMsg.remove();
          }

          switch (type) {
            case "start":
              this.addDownloadItem(id, message, modName);
              break;
            case "progress":
              this.updateDownloadProgress(id, message, progress, modName);
              break;
            case "finish":
            case "error":
            case "cancelled":
              this.completeDownload(id, type, message, modName);
              break;
          }
        } catch (error) {
          console.error("Error handling download status:", error);
        }
      });
    } catch (error) {
      console.error("UIController initialization error:", error);
      this.showError("Failed to initialize UI: " + error.message);
    }
  }

  showToast(message, type = "success") {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toastContainer";
      toastContainer.className =
        "toast-container position-fixed top-0 end-0 p-3";
      document.body.appendChild(toastContainer);
    }

    // Create the toast element
    const toast = document.createElement("div");
    toast.className = `toast align-items-center text-bg-${type} border-0 show fade-in`;
    toast.role = "alert";
    toast.ariaLive = "assertive";
    toast.ariaAtomic = "true";

    // Create the toast body
    const toastBody = document.createElement("div");
    toastBody.className = "d-flex";
    toastBody.innerHTML = `
        <div class="toast-body">
            ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    `;

    // Append the toast body to the toast
    toast.appendChild(toastBody);

    // Append the toast to the toast container
    toastContainer.appendChild(toast);

    const closeBtn = toast.querySelector(".btn-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        toast.classList.remove("fade-in");
        toast.classList.add("fade-out");
        // Empêche Bootstrap de supprimer le toast tout de suite
        setTimeout(() => {
          toast.remove();
        }, 400); // 400ms = durée de l'animation CSS
      });
    }

    // Remove toast with fade-out animation
    setTimeout(() => {
      toast.classList.remove("fade-in");
      toast.classList.add("fade-out");
      toast.addEventListener("animationend", () => toast.remove());
    }, 5000); // 5 seconds
  }

  async handleGameBananaDownload() {
    const linkInputs =
      document.querySelectorAll<HTMLInputElement>(".gameBananaLink");

    const links = Array.from(linkInputs)
      .map((input) => input.value.trim())
      .filter((link) => link);

    if (links.length === 0) {
      this.showToast("Please enter at least one GameBanana mod link", "danger");
      return;
    }

    // Download each mod in parallel
    links.forEach((link) => {
      window.electron.downloadMod(link);
    });

    if (this.downloadModal) {
      this.downloadModal.hide();
    }
  }

  showGameBananaDownloadDialog() {
    // Create a modal dialog
    const dialog = `
            <div class="modal fade" id="gameBananaDownloadModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Download Mods</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div id="downloadFieldsContainer">
                                <div class="mb-3">
                                    <input type="text" class="form-control gameBananaLink" placeholder="Paste GameBanana mod link here">
                                </div>
                            </div>
                            <button type="button" class="btn btn-outline-secondary" id="addDownloadField">Add Another Mod</button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmDownloadBtn">Download</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    // Remove existing modal if it exists
    const existingModal = document.getElementById("gameBananaDownloadModal");
    if (existingModal) {
      existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML("beforeend", dialog);

    // Initialize and show the modal
    this.downloadModal = new bootstrap.Modal(
      document.getElementById("gameBananaDownloadModal"),
    );
    this.downloadModal.show();

    // Add event listeners
    document
      .getElementById("addDownloadField")
      .addEventListener("click", this.handleAddDownloadField);
    document
      .getElementById("confirmDownloadBtn")
      .addEventListener("click", this.handleGameBananaDownload);
    document
      .getElementById("downloadFieldsContainer")
      .addEventListener("click", (event) => {
        const target = event.target as HTMLElement;

        if (
          target.classList.contains("remove-download-field") ||
          target.closest(".remove-download-field")
        ) {
          target.closest(".input-group").remove();
        }
      });
  }

  initializeSearchBar() {
    console.log("Initializing search bar");

    // Get search elements
    this.searchInput = document.getElementById("modSearchInput");
    this.enabledFilter = document.getElementById("enabledFilter");
    this.disabledFilter = document.getElementById("disabledFilter");

    // Log elements for debugging
    console.log("Search elements:", {
      searchInput: this.searchInput ? "Found" : "Not Found",
      enabledFilter: this.enabledFilter ? "Found" : "Not Found",
      disabledFilter: this.disabledFilter ? "Found" : "Not Found",
    });

    // Ensure elements exist before adding listeners
    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => this.performSearch());
    }

    if (this.enabledFilter) {
      this.enabledFilter.addEventListener("change", () => this.performSearch());
    }

    if (this.disabledFilter) {
      this.disabledFilter.addEventListener("change", () =>
        this.performSearch(),
      );
    }

    console.log("Search bar initialization complete");
  }

  async performSearch() {
    const searchTerm =
      (
        document.getElementById("modSearchInput") as HTMLInputElement
      )?.value.toLowerCase() || "";
    const showEnabled =
      (document.getElementById("enabledFilter") as HTMLInputElement)?.checked ||
      false;
    const showDisabled =
      (document.getElementById("disabledFilter") as HTMLInputElement)
        ?.checked || false;

    // Filter mods based on search criteria
    const filteredMods = await Promise.all(
      this.mods.map(async (mod) => {
        // Name filter
        const matchesSearch = mod.name.toLowerCase().includes(searchTerm);

        // Enabled/Disabled filter
        const matchesEnabledFilter =
          (showEnabled && mod.enabled) ||
          (showDisabled && !mod.enabled) ||
          (!showEnabled && !showDisabled);

        try {
          // Get mod info from info.toml
          const modInfo = await window.api.modDetails.getInfo(mod.path);

          // Category filter - check if category from info.toml matches
          const matchesCategory =
            this.selectedCategories.size === 0 ||
            (modInfo?.category &&
              this.selectedCategories.has(modInfo.category));

          // For debugging
          if (this.selectedCategories.size > 0) {
            console.log(
              "Mod:",
              mod.name,
              "Category from info.toml:",
              modInfo?.category,
              "Selected categories:",
              Array.from(this.selectedCategories),
              "Matches:",
              matchesCategory,
            );
          }

          // Only include mod if it matches all filters
          return matchesSearch && matchesEnabledFilter && matchesCategory
            ? mod
            : null;
        } catch (error) {
          console.error(`Error processing mod ${mod.name}:`, error);
          return matchesSearch && matchesEnabledFilter ? mod : null;
        }
      }),
    );

    // Filter out null values and render the list
    this.renderModList(filteredMods.filter((mod) => mod !== null));
  }

  createModElement(mod) {
    // Create a div for the mod
    const modElement = document.createElement("div");
    modElement.classList.add("mod-item");

    // Add enabled/disabled class
    modElement.classList.add(mod.enabled ? "mod-enabled" : "mod-disabled");

    // Set mod details
    modElement.innerHTML = `
            <span class="mod-name">${mod.name}</span>
            <span class="mod-status">${
              mod.enabled ? "Enabled" : "Disabled"
            }</span>
            <!-- Add more mod details as needed -->
        `;

    return modElement;
  }

  initializeErrorHandling() {
    // Create a container for error messages if it doesn't exist
    if (!document.getElementById("error-container")) {
      const errorContainer = document.createElement("div");
      errorContainer.id = "error-container";
      errorContainer.classList.add("error-container");
      document.body.appendChild(errorContainer);
    }
  }

  // Add CSS for error container and messages
  addErrorStyles() {
    const style = document.createElement("style");
    style.textContent = `
            .error-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                max-width: 300px;
            }
            .error-message {
                background-color: #f8d7da;
                color: #721c24;
                padding: 10px;
                margin-bottom: 10px;
                border-radius: 4px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
        `;
    document.head.appendChild(style);
  }

  initializeDarkMode() {
    // Load dark mode setting
    window.api.settings.getDarkMode().then((enabled) => {
      this.updateThemeSelector(enabled);
      this.applyDarkMode(enabled);
    });

    // Theme selector event listeners
    document
      .querySelectorAll(".theme-option")
      .forEach((option: HTMLElement) => {
        option.addEventListener("click", () => {
          const isDark = option.dataset.theme === "dark";

          window.api.settings.setDarkMode(isDark);

          this.updateThemeSelector(isDark);
          this.applyDarkMode(isDark);
        });
      });
  }

  updateThemeSelector(isDark) {
    document
      .querySelectorAll(".theme-option")
      .forEach((option: HTMLElement) => {
        option.classList.toggle(
          "active",
          option.dataset.theme === (isDark ? "dark" : "light"),
        );
      });
  }

  applyDarkMode(enabled) {
    if (enabled) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }

  async loadSettings() {
    try {
      const modsPath = await window.api.settings.getModsPath();
      (document.getElementById("modsPath") as HTMLInputElement).value =
        modsPath || "No folder selected";

      const customCssPath = await window.api.settings.getCustomCssPath();
      (document.getElementById("customCssPath") as HTMLInputElement).value =
        customCssPath || "No folder selected";

      const pluginsPath = await window.api.settings.getPluginsPath();
      (document.getElementById("pluginsPath") as HTMLInputElement).value =
        pluginsPath || "No folder selected";
    } catch (error) {
      this.showError("Failed to load settings, error: " + error.message);
    }
  }

  async loadMods() {
    let spinner;
    try {
      // Affiche l'overlay uniquement pour le chargement initial
      await this.showLoading("Loading mods...");

      this.mods =
        (await this.modManager?.loadMods?.()) ??
        (await this.modManager.loadMods());

      // On cache l'overlay dès que les mods sont chargés
      this.hideLoading();

      // Affiche le spinner de conflit dans la top bar
      spinner = document.getElementById("conflictLoadingSpinner");
      if (spinner) spinner.style.display = "inline-block";

      const conflictCheckEnabled =
        await window.api.settings.getConflictCheckEnabled();
      this.conflicts = new Map();

      if (conflictCheckEnabled) {
        const conflicts = await this.conflictDetector.detectConflicts(
          this.mods,
        );

        const conflictedMods = new Set();

        for (const mods of conflicts.values()) {
          mods.forEach((modName) => conflictedMods.add(modName));
        }

        // Marque les mods avec conflits
        this.mods.forEach((mod) => {
          mod.hasConflict = conflictedMods.has(mod.name);
        });

        this.conflicts = conflicts;

        if (conflicts.size > 0) {
          this.showConflictsWarning();
          this.conflictButton.style.display = "inline-block";

          window.electron.ipcRenderer.send("play-conflict-audio");
        } else {
          this.conflictButton.style.display = "none";
        }
      } else {
        this.conflictButton.style.display = "none";
      }

      // Mise à jour Discord RPC
      window.api.discordRpc.updateModCount(this.mods.length);

      // Affichage + recherche
      this.renderModList(this.mods);
      this.initializeSearchBar?.();
      this.performSearch?.();
    } catch (error) {
      console.error("Error loading mods:", error);
      this.showError(`Failed to load mods: ${error.message}`);
    } finally {
      // Cache le spinner de conflit
      if (!spinner) spinner = document.getElementById("conflictLoadingSpinner");
      if (spinner) spinner.style.display = "none";
    }
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  renderModList(mods) {
    const modList = document.getElementById("modList");
    modList.innerHTML = "";

    if (!mods || mods.length === 0) {
      modList.innerHTML = `
            <div class="text-center p-4 textmuted">
                <i class="bi bi-inbox-fill fs-1"></i>
                <p class="mt-2">No mods found</p>
            </div>
        `;
      return;
    }

    modList.innerHTML = mods
      .map((mod) => {
        let iconHtml = "";
        if (mod.hasConflict) {
          // Icône de conflit : cercle jaune avec point d'exclamation
          iconHtml = `<i class="bi bi-exclamation-circle-fill text-warning"></i>`;
        } else if (mod.enabled) {
          iconHtml = `<i class="bi bi-check-circle-fill text-success"></i>`;
        } else {
          iconHtml = `<i class="bi bi-x-circle-fill text-danger"></i>`;
        }
        return `
            <div class="mod-item ${
              mod.enabled ? "enabled" : "disabled"
            }" data-mod-id="${mod.id}">
                <div class="mod-status me-3">
                    ${iconHtml}
                </div>
                <div>
                    <div class="fw-medium">${this.escapeHtml(mod.name)}</div>
                </div>
            </div>
        `;
      })
      .join("");
  }

  initializeEventListeners() {
    // Rename mod in context menu
    const contextMenu = document.getElementById("contextMenu");
    const renameModOption = contextMenu.querySelector("#renameMod");

    const downloadButton = document.getElementById("gameBananaDownloadBtn");
    if (downloadButton) {
      downloadButton.addEventListener("click", () =>
        this.showGameBananaDownloadDialog(),
      );
    }

    // Remove existing listeners first
    const oldRenameOption = renameModOption.cloneNode(true);
    renameModOption.parentNode.replaceChild(oldRenameOption, renameModOption);

    oldRenameOption.addEventListener("click", async (event) => {
      event.stopPropagation();
      event.preventDefault();

      // Close context menu
      contextMenu.classList.remove("show");

      // Call rename method
      await this.handleRenameMod();
    });

    // Button handlers
    document
      .getElementById("installMod")
      .addEventListener("click", () => this.handleInstallMod());
    document
      .getElementById("uninstallMod")
      .addEventListener("click", () => this.handleUninstallMod());
    document
      .getElementById("openFolder")
      .addEventListener("click", () => this.handleOpenFolder());
    document
      .getElementById("reloadList")
      .addEventListener("click", () => this.handleReloadList());
    document
      .getElementById("batchChangeSlots")
      .addEventListener("click", () => this.handleBatchChangeSlots());
    document
      .getElementById("selectModsFolder")
      .addEventListener("click", () => this.handleSelectModsFolder());

    // Mod selection
    document.getElementById("modList").addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const modItem = target.closest(".mod-item") as HTMLElement | undefined;

      if (modItem) {
        this.selectMod(modItem.dataset.modId);
      }
    });

    // Context menu
    document.getElementById("modList").addEventListener("contextmenu", (e) => {
      e.preventDefault();

      const target = e.target as HTMLElement;
      const modItem = target.closest(".mod-item") as HTMLElement | undefined;

      if (modItem) {
        // Hide any existing context menu first
        document.getElementById("contextMenu").style.display = "none";
        // Show new context menu
        this.showContextMenu(e, modItem.dataset.modId);
      }
    });

    // Context menu items
    document
      .getElementById("toggleMod")
      .addEventListener("click", () => this.handleToggleMod());
    document
      .getElementById("openModFolder")
      .addEventListener("click", () => this.handleOpenModFolder());
    document
      .getElementById("renameMod")
      .addEventListener("click", () => this.handleRenameMod());

    document.getElementById("changeSlots").addEventListener("click", () => {
      if (this.selectedMod) {
        this.showChangeSlotsDialog(this.selectedMod);
      } else {
        this.showError("Please select at least one mod");
      }
    });

    // Hide context menu when clicking outside
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      const modItem = target.closest(".mod-item") as HTMLElement | undefined;
      const isContextMenuClick = target.closest("#contextMenu");

      // Only keep menu open if clicking inside it
      if (!isContextMenuClick) {
        this.hideContextMenu();
      }

      // Handle mod selection
      if (modItem) {
        this.selectMod(modItem.dataset.modId);
      }
    });
    const dropZone = document.body; // Or a specific container

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over
    dropZone.addEventListener("dragenter", highlight, false);
    dropZone.addEventListener("dragover", highlight, false);
    dropZone.addEventListener("dragleave", unhighlight, false);
    dropZone.addEventListener("drop", handleDrop, false);

    // Prevent default drag behaviors
    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    window.electron.onProtocolUrl(async (data) => {
      try {
        const { url, skipConfirmation } = data;
        const parsedUrl = parseFightPlannerUrl(url);

        console.log("Converted Mod URL:", parsedUrl.downloadLink);
        console.log("Skip confirmation:", skipConfirmation);

        let shouldInstall = false;

        if (skipConfirmation) {
          shouldInstall = true;
        } else {
          // Show confirmation modal
          shouldInstall = await new Promise((resolve) => {
            const modal = document.createElement("div");
            modal.className = "modal fade";
            modal.tabIndex = -1;
            modal.innerHTML = `
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Install Mod</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <p>Do you want to install this mod?</p>
                                <p><strong>URL:</strong> ${parsedUrl}</p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" id="confirmInstall">Install</button>
                            </div>
                        </div>
                    </div>
                `;

            document.body.appendChild(modal);
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            modal
              .querySelector("#confirmInstall")
              .addEventListener("click", () => {
                resolve(true);
                bsModal.hide();
              });

            modal.addEventListener("hidden.bs.modal", () => {
              resolve(false);
              document.body.removeChild(modal);
            });
          });
        }

        if (shouldInstall) {
          this.showToast("Mod download started !", "success");

          const result = await window.electron.downloadMod(
            parsedUrl.downloadLink,
          );

          this.updateLoadingMessage("Finishing up...");

          console.log("Mod downloaded successfully:", result);

          this.showToast("Mod downloaded successfully", "success");
          this.updateLoadingMessage("Reloading Mods...");

          this.loadMods();
        }
      } catch (error) {
        console.error("Error downloading mod:", error);
        this.showError("Failed to download mod: " + error.message);
      } finally {
        this.hideLoading();
      }
    });

    function highlight() {
      dropZone.classList.add("drag-over");
    }

    function parseFightPlannerUrl(url: string) {
      try {
        // Remove the protocol prefix
        const cleanUrl = url.replace("fightplanner:", "");

        // Split the URL components
        const [gbUrl, type, id, fileExt] = cleanUrl.split(",");

        // Extract the download ID (mmdl number)
        const downloadId = gbUrl.split("/").pop();

        // Depending on the type, construct the appropriate GameBanana URL
        let properGbUrl;
        if (type.toLowerCase() === "mod") {
          properGbUrl = `https://gamebanana.com/mods/download/${id}#FileInfo_${downloadId}`;
        } else if (type.toLowerCase() === "sound") {
          properGbUrl = `https://gamebanana.com/sounds/download/${id}#FileInfo_${downloadId}`;
        } else {
          throw new Error("Unsupported content type");
        }

        return {
          downloadLink: properGbUrl,
          type: type,
          id: id,
          fileExt: fileExt,
        };
      } catch (error) {
        console.error("Error parsing FightPlanner URL:", error);
        throw new Error("Invalid FightPlanner URL format");
      }
    }

    // Remove highlight
    function unhighlight() {
      dropZone.classList.remove("drag-over");
    }

    // Handle drop event
    async function handleDrop(e: DragEvent) {
      unhighlight();

      const dt = e.dataTransfer;
      const files = dt.files;

      handleFiles(files);
    }

    // Handle files
    const handleFiles = async (files: FileList) => {
      // Convert FileList to Array and filter
      const validFiles = Array.from(files).filter((file) => {
        const validExtensions = [".zip", ".rar", ".7z", ".nro"];
        return validExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext.toLowerCase()),
        );
      });

      // If no valid files, show error
      if (validFiles.length === 0) {
        this.showError(
          "No valid mod or plugin files found. Please drop .zip, .rar, .7z, or .nro files.",
        );
        return;
      }

      try {
        // Show loading
        await this.showLoading("Installing files...");

        // Track installation results
        const installResults = [];

        // Install each dropped file
        for (const file of validFiles) {
          const ext = file.name.split(".").pop().toLowerCase();

          if (ext === "nro") {
            // Handle .nro files as plugins
            const result = await window.api.pluginOperations.installPlugin(
              file.path,
            );

            installResults.push({ fileName: file.name, success: true, result });
          } else {
            // Handle other archive files as mods
            const result = await this.modManager.installMod(file.path);
            installResults.push({ fileName: file.name, success: true, result });
          }
        }

        // Reload mods and plugins list
        await this.loadMods();
        await this.loadPlugins();

        // Provide detailed feedback
        this.provideInstallationFeedback(installResults);
      } catch (error) {
        console.error("Drag and drop installation error:", error);
        this.showError("Failed to install files: " + error.message);
      } finally {
        this.hideLoading();
      }
    };

    // Drag and drop for plugins
    const pluginDropZone = document.getElementById("pluginList");
    if (pluginDropZone) {
      pluginDropZone.addEventListener("dragover", (e) => e.preventDefault());
      pluginDropZone.addEventListener("drop", (e) => this.handlePluginDrop(e));
    }

    // Add FPP creation button handler
    const createFppBtn = document.getElementById("createFpp");
    if (createFppBtn) {
      createFppBtn.addEventListener("click", () => this.showCreateFppDialog());
    }

    // Add FPP confirm button handler
    document
      .getElementById("createFppBtn")
      ?.addEventListener("click", () => this.createFpp());

    // Add keyboard shortcuts
    document.addEventListener("keydown", async (e) => {
      const target = e.target as HTMLElement;

      // Only handle keystrokes if we're not in an input field
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      // Delete key for uninstalling selected mod
      if (e.key === "Delete" && this.selectedMod) {
        this.handleUninstallMod();
      }
    });

    // Add enter key handler for confirmation modals
    const confirmationModal = document.getElementById("confirmationModal");
    if (confirmationModal) {
      confirmationModal.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const confirmButton = confirmationModal.querySelector(
            "#confirmUninstallBtn",
          ) as HTMLInputElement;

          if (confirmButton) {
            confirmButton.click();
          }
        }
      });
    }

    // Add vertical resize handler
    this.initializeVerticalResizer();

    // Add handlers for enable/disable all mods buttons
    const enableAllModsBtn = document.getElementById("enableAllModsBtn");
    const disableAllModsBtn = document.getElementById("disableAllModsBtn");

    if (enableAllModsBtn) {
      enableAllModsBtn.addEventListener("click", async () => {
        try {
          await this.showLoading("Enabling all mods...");
          await this.modManager.enableAllMods();
          await this.loadMods();

          this.showToast("All mods enabled successfully", "success");
        } catch (error) {
          console.error("Failed to enable all mods:", error);
          this.showError("Failed to enable all mods: " + error.message);
        } finally {
          this.hideLoading();
        }
      });
    }

    if (disableAllModsBtn) {
      disableAllModsBtn.addEventListener("click", async () => {
        try {
          const confirmed = await this.showConfirmationModal(
            "Are you sure you want to disable all mods?",
          );
          if (!confirmed) return;

          await this.showLoading("Disabling all mods...");
          await this.modManager.disableAllMods();
          await this.loadMods();
          this.showToast("All mods disabled successfully", "success");
        } catch (error) {
          console.error("Failed to disable all mods:", error);
          this.showError("Failed to disable all mods: " + error.message);
        } finally {
          this.hideLoading();
        }
      });
    }
  }

  initializeVerticalResizer() {
    const resizer = document.querySelector(".resizer-horizontal");
    if (!resizer) return;

    const modPreview = document.querySelector(".mod-preview") as
      | HTMLElement
      | undefined;
    const modMetadata = document.querySelector(".mod-metadata") as
      | HTMLElement
      | undefined;

    let startY = 0;
    let startHeightPreview = 0;
    let startHeightMetadata = 0;

    const startResize = (e) => {
      startY = e.clientY;
      startHeightPreview = modPreview.offsetHeight;
      startHeightMetadata = modMetadata.offsetHeight;

      document.documentElement.style.cursor = "row-resize";

      document.addEventListener("mousemove", resize);
      document.addEventListener("mouseup", stopResize);
    };

    const resize = (e) => {
      const diffY = e.clientY - startY;
      modPreview.style.height = `${startHeightPreview + diffY}px`;
      modMetadata.style.height = `${startHeightMetadata - diffY}px`;
    };

    const stopResize = () => {
      document.documentElement.style.cursor = "";
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", stopResize);
    };

    resizer.addEventListener("mousedown", startResize);
  }

  // Provide detailed feedback about installations
  provideInstallationFeedback(results) {
    const successfulInstalls = results.filter((r) => r.success);
    const failedInstalls = results.filter((r) => !r.success);

    if (successfulInstalls.length > 0) {
      this.showSuccess(
        `Successfully installed ${successfulInstalls.length} mod(s)`,
      );
    }

    if (failedInstalls.length > 0) {
      const errorMessages = failedInstalls
        .map((f) => `• ${f.fileName}: ${f.error}`)
        .join("\n");

      this.showError(
        `Failed to install ${failedInstalls.length} mod(s):\n${errorMessages}`,
      );
    }
  }

  async handleInstallMod() {
    try {
      const result = await window.api.dialog.showOpenDialog({
        filters: [
          {
            name: "Mod Files",
            extensions: ["zip", "7z", "rar", "fpp"],
          },
        ],
        properties: ["openFile"],
      });

      if (!result.canceled) {
        await this.showLoading("Installing mod...");
        const filePath = result.filePaths[0];

        // Vérifier si c'est un fichier FPP
        if (filePath.toLowerCase().endsWith(".fpp")) {
          const importResult =
            await window.api.fppOperations.importFpp(filePath);
          if (importResult.success) {
            this.showToast("FPP package imported successfully", "success");
            await this.loadMods();
            await this.loadPlugins();
          } else {
            this.showError("Failed to import FPP: " + importResult.error);
          }
        } else {
          // Installation normale de mod
          const installedMod = await this.modManager.installMod(filePath);
          if (installedMod) {
            this.showToast("Mod installed successfully", "success");
            await this.loadMods();
          }
        }
      }
    } catch (error) {
      console.error("Full installation error:", error);
      this.showError("Failed to install: " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  async handleUninstallMod() {
    this.hideContextMenu();
    if (!this.selectedMod) {
      this.showError("Please select a mod to uninstall");
      return;
    }

    if (
      await this.showConfirmationModal(
        "Are you sure you want to uninstall this mod?",
      )
    ) {
      try {
        await this.showLoading("Uninstalling mod...");
        await this.modManager.uninstallMod(this.selectedMod);
        await this.loadMods();
        this.selectedMod = null;
        this.updateModPreview();
        this.showSuccess("Mod uninstalled successfully");
      } catch (error) {
        this.showError(
          "Failed to uninstall mod, Cause " + ": " + error.message,
        );
      } finally {
        this.hideLoading();
      }
    }
  }

  async handleOpenFolder() {
    try {
      await this.modManager.openModsFolder();
      // Update Discord RPC
      window.api.discordRpc.setActivity({
        state: "Browsing Mods Folder",
        details: "Exploring Mod Collection",
        largeImageKey: "app_logo",
        largeImageText: "FightPlanner",
      });
    } catch (error) {
      this.showError(
        "Failed to open mods folder, Cause " + ": " + error.message,
      );
    }
  }

  async handleReloadList() {
    try {
      await this.showLoading("Reloading mods...");
      await this.loadMods();
      this.showSuccess("Mods reloaded successfully");
    } catch (error) {
      this.showError("Failed to reload mods, Cause " + ": " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  async handleBatchChangeSlots() {
    try {
      // Get all mods
      if (!this.mods || this.mods.length === 0) {
        this.showError("No mods available. Please add some mods first.");
        return;
      }

      // Update the modal with the mod count
      document.getElementById("batchModCountText").textContent =
        `${this.mods.length}`;

      // Show the confirmation modal
      const modal = new bootstrap.Modal(
        document.getElementById("batchChangeSlotsModal"),
      );
      modal.show();

      // Wait for user confirmation
      const confirmed = await this.waitForModalConfirmation(
        "batchChangeSlotsModal",
        "confirmBatchChangeSlots",
      );

      if (!confirmed) {
        return;
      }

      // Set batch mode flag to prevent rescanning after each mod
      this.isBatchProcessing = true;
      console.log(
        "🚀 Batch processing started - isBatchProcessing set to TRUE",
      );

      // Loop through each mod
      for (let i = 0; i < this.mods.length; i++) {
        const mod = this.mods[i];

        // Show which mod we're processing
        console.log(
          `\n📦 Processing mod ${i + 1}/${this.mods.length}: ${mod.name}`,
        );
        console.log("Batch mode status:", this.isBatchProcessing);

        try {
          // Trigger the change slots dialog for this mod
          await this.showChangeSlotsDialog(mod.name);

          // Wait for the user to close the modal before continuing to the next mod
          await this.waitForModalClose("changeSlotsModal");
          await this.waitForModalClose("confirmRename");
        } catch (error) {
          console.error(`Error processing mod ${mod.name}:`, error);

          // Show error modal instead of confirm
          const continueProcessing = await this.showErrorWithContinue(
            "Batch Process Error",
            `Error processing mod "${mod.name}": ${error.message}`,
            "Do you want to continue with the remaining mods?",
          );

          if (!continueProcessing) {
            break;
          }
        }
      }

      // Clear batch mode flag
      this.isBatchProcessing = false;

      // Rescan mods once at the end
      console.log("Batch processing complete, rescanning mods...");
      await this.loadMods();

      this.showSuccess("Batch slot change process completed!");
    } catch (error) {
      // Make sure to clear batch mode flag on error
      this.isBatchProcessing = false;

      this.showError("Failed to process batch slot changes: " + error.message);
      console.error("Batch change slots error:", error);
    }
  }

  // Helper method to wait for a modal confirmation
  waitForModalConfirmation(modalId, confirmButtonId) {
    return new Promise((resolve) => {
      const modalElement = document.getElementById(modalId);
      const confirmButton = document.getElementById(confirmButtonId);

      if (!modalElement || !confirmButton) {
        resolve(false);
        return;
      }

      let confirmed = false;

      const handleConfirm = () => {
        confirmed = true;
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
          modalInstance.hide();
        }
      };

      const handleHidden = () => {
        confirmButton.removeEventListener("click", handleConfirm);
        modalElement.removeEventListener("hidden.bs.modal", handleHidden);
        resolve(confirmed);
      };

      confirmButton.addEventListener("click", handleConfirm);
      modalElement.addEventListener("hidden.bs.modal", handleHidden);
    });
  }

  // Helper method to show error with continue option
  async showErrorWithContinue(title, message, question) {
    return new Promise((resolve) => {
      // Create a temporary modal for error continuation
      const modalHtml = `
                <div class="modal fade" id="errorContinueModal" tabindex="-1">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header bg-danger text-white">
                                <h5 class="modal-title">
                                    <i class="bi bi-exclamation-triangle me-2"></i>${title}
                                </h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p class="mb-2"><strong>${message}</strong></p>
                                <p class="mb-0">${question}</p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    <i class="bi bi-x-circle me-2"></i>Stop Process
                                </button>
                                <button type="button" class="btn btn-primary" id="continueProcessBtn">
                                    <i class="bi bi-arrow-right me-2"></i>Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

      // Remove existing modal if present
      const existingModal = document.getElementById("errorContinueModal");
      if (existingModal) {
        existingModal.remove();
      }

      // Add modal to body
      document.body.insertAdjacentHTML("beforeend", modalHtml);

      const modalElement = document.getElementById("errorContinueModal");
      const continueButton = document.getElementById("continueProcessBtn");
      const modal = new bootstrap.Modal(modalElement);

      let shouldContinue = false;

      const handleContinue = () => {
        shouldContinue = true;
        modal.hide();
      };

      const handleHidden = () => {
        continueButton.removeEventListener("click", handleContinue);
        modalElement.removeEventListener("hidden.bs.modal", handleHidden);
        modalElement.remove();
        resolve(shouldContinue);
      };

      continueButton.addEventListener("click", handleContinue);
      modalElement.addEventListener("hidden.bs.modal", handleHidden);

      modal.show();
    });
  }

  // Helper method to wait for a modal to be closed
  waitForModalClose(modalId) {
    return new Promise<void>((resolve) => {
      const modalElement = document.getElementById(modalId);
      if (!modalElement) {
        resolve();
        return;
      }

      // Listen for the modal hidden event
      const handleHidden = () => {
        modalElement.removeEventListener("hidden.bs.modal", handleHidden);
        resolve();
      };

      modalElement.addEventListener("hidden.bs.modal", handleHidden);
    });
  }

  async handleSelectModsFolder() {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ["openDirectory"],
      });

      if (!result.canceled) {
        await this.showLoading("Updating mods folder...");
        await window.api.settings.setModsPath(result.filePaths[0]);
        (document.getElementById("modsPath") as HTMLInputElement).value =
          result.filePaths[0];
        await this.loadMods();
        this.showSuccess("Mods folder updated successfully");

        // Update Discord RPC
        window.api.discordRpc.setActivity({
          state: "Updating Mods Folder",
          details: "Changing Mods Directory",
          largeImageKey: "app_logo",
          largeImageText: "FightPlanner",
        });
      }
    } catch (error) {
      this.showError(
        "Failed to update mods folder, Cause " + ": " + error.message,
      );
    } finally {
      this.hideLoading();
    }
  }

  async handleToggleMod() {
    if (!this.selectedMod) return;

    try {
      await this.showLoading("Toggling mod...");
      await this.modManager.toggleMod(this.selectedMod);
      await this.loadMods();
      this.showSuccess("Mod toggled successfully");

      // Update Discord RPC
      window.api.discordRpc.updateModCount(this.mods.length);
    } catch (error) {
      this.showError("Failed to toggle mod, Cause " + ": " + error.message);
    } finally {
      this.hideLoading();
      this.hideContextMenu();
    }
  }

  hideContextMenu() {
    const menu = document.getElementById("contextMenu");
    menu.classList.remove("show");
  }

  async handleOpenModFolder() {
    if (!this.selectedMod) return;

    try {
      await this.modManager.openModFolder(this.selectedMod);
    } catch (error) {
      this.showError(
        "Failed to open mod folder, Cause " + ": " + error.message,
      );
    } finally {
      this.hideContextMenu();
    }
  }

  async generateModPrefix(modPath) {
    try {
      // Scan for slots in the mod
      const { currentSlots, pathData } =
        await SlotScanner.scanForSlots(modPath);

      if (!currentSlots || currentSlots.length === 0) {
        return null;
      }

      const fighterNameInternal = getInternalFighterName(pathData);

      if (!fighterNameInternal) {
        return null;
      }

      // Get character display name from messages.data using cspName
      const defaultNames =
        await ChangeSlots.getDefaultCustomNames(fighterNameInternal);
      const characterName = defaultNames.cspName || fighterNameInternal;

      // Format slots with ranges for consecutive slots
      const formatSlots = (slots) => {
        if (!slots || slots.length === 0) return "";

        // Sort slots by their numeric value
        const sorted = [...slots].sort((a, b) => {
          const numA = parseInt(a.replace("c", ""));
          const numB = parseInt(b.replace("c", ""));

          return numA - numB;
        });

        const ranges = [];
        let rangeStart = 0;

        for (let i = 0; i < sorted.length; i++) {
          const currentNum = parseInt(sorted[i].replace("c", ""));
          const nextNum =
            i < sorted.length - 1
              ? parseInt(sorted[i + 1].replace("c", ""))
              : null;

          // Check if next slot is consecutive
          if (nextNum !== currentNum + 1) {
            // End of range or single slot
            if (i === rangeStart) {
              // Single slot
              ranges.push(sorted[i]);
            } else if (i === rangeStart + 1) {
              // Just two slots, don't make a range
              ranges.push(sorted[rangeStart], sorted[i]);
            } else {
              // Range of 3 or more
              ranges.push(`${sorted[rangeStart]}-${sorted[i]}`);
            }

            rangeStart = i + 1;
          }
        }

        return ranges.join(", ");
      };

      const slotsStr = formatSlots(currentSlots);

      return `[${characterName}] [${slotsStr}]`;
    } catch (error) {
      console.error("Error generating mod prefix:", error);
      return null;
    }
  }

  async handleRenameMod(skipRenameOnPrefixMatch = false) {
    if (this.isDialogOpen) return;

    if (!this.selectedMod) {
      this.showError("No mod selected");
      return;
    }

    try {
      this.isDialogOpen = true;

      const currentName = this.selectedMod;
      let defaultName = currentName;

      // Check if auto-prefix setting is enabled
      const autoPrefixEnabled = await window.api.settings.getAutoPrefixRename();

      if (autoPrefixEnabled) {
        try {
          const mod = await this.modManager.getMod(this.selectedMod);
          const prefix = await this.generateModPrefix(mod.path);

          if (prefix) {
            // Regex to match existing prefix format: [Character] [slots with ranges...]
            // Matches patterns like: [Mario] [c00-c03, c05] or [Link] [c00, c02]
            const prefixRegex =
              /^\[([^\]]+)]\s*\[(c\d+(?:-c\d+)?(?:,\s*c\d+(?:-c\d+)?)*)]\s*/;
            const match = currentName.match(prefixRegex);

            if (match) {
              const nameClone = currentName;
              // Replace existing prefix with new one
              defaultName = currentName.replace(prefixRegex, `${prefix} `);

              if (defaultName === nameClone && skipRenameOnPrefixMatch) {
                this.isDialogOpen = false;
                return;
              }
            } else {
              // No existing prefix, add new one
              defaultName = `${prefix} ${currentName}`;
            }
          }
        } catch (error) {
          console.error("Error generating prefix:", error);
          // Continue with original name if prefix generation fails
        }
      }

      const newName = await this.promptDialog(
        "Rename Mod",
        "Enter a new name for the mod:",
        defaultName,
      );

      this.isDialogOpen = false;

      // Trim and validate the new name
      const trimmedNewName = newName ? newName.trim() : "";

      if (trimmedNewName && trimmedNewName !== currentName) {
        await this.showLoading("Renaming mod...");

        if (!this.isValidModName(trimmedNewName)) {
          this.showError("Invalid mod name");
          return;
        }

        try {
          // Call rename method
          await this.modManager.renameMod(currentName, trimmedNewName);

          if (!this.isBatchProcessing) {
            await this.loadMods();
          }

          // Select the newly renamed mod
          await this.selectMod(trimmedNewName);

          this.showSuccess("Mod renamed successfully");

          // Update Discord RPC
          window.api.discordRpc.updateModCount(this.mods.length);
        } catch (renameError) {
          console.error("Rename error:", renameError);
          this.showError(`Failed to rename mod: ${renameError.message}`);
        } finally {
          this.hideLoading();
        }
      }
    } catch (error) {
      console.error("Rename dialog error:", error);
      this.isDialogOpen = false;
    }
  }

  // Validate mod name method
  isValidModName(name) {
    // Basic validation
    return (
      name &&
      name.trim().length > 0 &&
      name.trim().length <= 255 &&
      !/[<>:"/\\|?*]/g.test(name.trim())
    );
  }

  async promptDialog(
    title: string,
    message: string,
    defaultValue: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const modalId = "renameModal";

      // Remove existing modal if it exists
      const existingModal = document.getElementById(modalId);
      if (existingModal) {
        existingModal.remove();
      }

      const modal = document.createElement("div");
      modal.className = "modal fade";
      modal.id = modalId;
      modal.tabIndex = -1;
      modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                        <input type="text" class="form-control" value="${
                          defaultValue || ""
                        }">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirmRename">OK</button>
                    </div>
                </div>
            </div>
        `;

      document.body.appendChild(modal);
      const bsModal = new bootstrap.Modal(modal);

      // Handle confirm button click
      modal.querySelector("#confirmRename").addEventListener("click", () => {
        const input = modal.querySelector("input");
        const value = input?.value;
        resolve(value);
        bsModal.hide();
      });

      // Handle Enter key press
      modal.querySelector("input").addEventListener("keyup", (e) => {
        const target = e.target as HTMLInputElement;

        if (e.key === "Enter") {
          const value = target.value;
          bsModal.hide();
          resolve(value);
        }
      });

      // Handle modal close/dismiss
      modal.addEventListener("hidden.bs.modal", () => {
        resolve(null); // Return null on cancel/dismiss
        modal.remove(); // Remove modal from DOM
      });

      bsModal.show();
    });
  }

  showContextMenu(event, modId) {
    const contextMenu = document.getElementById("contextMenu");
    contextMenu.classList.remove("show");
    contextMenu.style.left = "-9999px";
    contextMenu.style.top = "-9999px";
    contextMenu.style.display = "block"; // Pour mesurer

    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = event.pageX;
    let top;

    // Ajuste horizontalement
    if (left + menuWidth > screenWidth) {
      left = screenWidth - menuWidth - 5;
    }
    if (left < 5) left = 5;

    // 1. Si le menu tient sous le curseur
    if (event.pageY + menuHeight <= screenHeight) {
      top = event.pageY;
    }
    // 2. Sinon, si le menu tient au-dessus du curseur
    else if (event.pageY - menuHeight >= 0) {
      top = event.pageY - menuHeight;
    }
    // 3. Sinon, colle-le en haut
    else {
      top = 5;
    }

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;

    setTimeout(() => {
      contextMenu.classList.add("show");
    }, 10);

    this.selectedMod = modId;
  }

  async showLoading(message = "Loading...") {
    const loadingOverlay = document.getElementById("loading-overlay");
    console.log("Showing loading message:", message);

    if (!loadingOverlay) return;
    window.electron.ipcRenderer.send("play-loading-audio");
    const messageElement = loadingOverlay.querySelector("#loadingMessage");
    if (messageElement) {
      messageElement.textContent = message;
    }

    // Show overlay
    loadingOverlay.classList.add("visible");

    // Add close button event listener
    const closeBtn = document.getElementById("closeLoadingBtn");
    if (closeBtn) {
      closeBtn.onclick = () => this.hideLoading();
    }

    // Show/hide cancel button based on if it's a download
    const cancelBtn = document.getElementById("cancelDownloadBtn");
    if (cancelBtn) {
      cancelBtn.style.display = message.toLowerCase().includes("download")
        ? "block"
        : "none";

      // Remove old listener before adding new one
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));

      // Add new listener
      document
        .getElementById("cancelDownloadBtn")
        .addEventListener("click", async () => {
          try {
            // TODO: Fix this? We probably need a download ID here
            await window.electron.cancelDownload();

            this.hideLoading();
            this.showToast("Download cancelled", "info");
          } catch (error) {
            console.error("Error cancelling download:", error);
            this.showError("Failed to cancel download: " + error.message);
          }
        });
    }
  }

  hideLoading() {
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) {
      window.electron.ipcRenderer.send("stop-loading-audio");
      loadingOverlay.classList.add("fade-out");
      // Remove the overlay from DOM after transition completes
      setTimeout(() => {
        loadingOverlay.classList.remove("visible", "fade-out");
      }, 300); // Match this with the CSS transition duration
    }
  }

  updateLoadingMessage(message) {
    const messageElement = document.querySelector("#loadingMessage") as
      | HTMLInputElement
      | undefined;

    if (messageElement) {
      messageElement.classList.remove("loading-message-fade");
      // Trigger reflow
      void messageElement.offsetWidth;
      messageElement.textContent = message;
      messageElement.classList.add("loading-message-fade");
    }
  }

  showError(message) {
    // Log the error message to the console
    console.error("Error:", message);

    // Create error toast container if it doesn't exist
    let toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toastContainer";
      toastContainer.className =
        "toast-container position-fixed top-0 end-0 p-3";
      document.body.appendChild(toastContainer);
    }

    // Create the toast element
    const toast = document.createElement("div");
    toast.className = "toast align-items-center text-bg-danger border-0 show";
    toast.role = "alert";
    toast.ariaLive = "assertive";
    toast.ariaAtomic = "true";

    // Create the toast body
    const toastBody = document.createElement("div");
    toastBody.className = "d-flex";
    toastBody.innerHTML = `
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        `;

    // Append the toast body to the toast
    toast.appendChild(toastBody);

    // Append the toast to the toast container
    toastContainer.appendChild(toast);

    // Automatically remove the toast after a certain time
    setTimeout(() => {
      toast.remove();
    }, 5000); // 5 seconds
  }

  showSuccess(message) {
    // Implement success toast/notification
    console.log(message);
  }

  async showConfirmationModal(message) {
    return new Promise((resolve) => {
      const confirmationModal = new bootstrap.Modal(
        document.getElementById("confirmationModal"),
      );
      const confirmUninstallBtn = document.getElementById(
        "confirmUninstallBtn",
      );

      // Set the message
      document.querySelector("#confirmationModal .modal-body").textContent =
        message;

      // Add event listener for the confirm button
      confirmUninstallBtn.onclick = () => {
        resolve(true);
        confirmationModal.hide();
      };

      // Show the modal
      confirmationModal.show();

      // Add event listener for the cancel button
      (
        document.querySelector(
          "#confirmationModal .btn-secondary",
        ) as HTMLElement
      ).onclick = () => {
        resolve(false);
        confirmationModal.hide();
      };
    });
  }

  async showPrompt(message, defaultValue) {
    return prompt(message, defaultValue); // Replace with a better prompt dialog
  }

  async updateModPreview(modId?: string) {
    const modMetadata = document.getElementById("modMetadata");
    const modPreview = document.querySelector(".mod-preview") as
      | HTMLElement
      | undefined;
    const modImage = document.getElementById("modImage") as
      | HTMLImageElement
      | undefined;

    if (!modMetadata) {
      console.error("Metadata container not found");
      return;
    }

    let metadataContent = modMetadata.querySelector(".metadata-content");
    if (!metadataContent) {
      metadataContent = document.createElement("div");
      metadataContent.className = "metadata-content";
      modMetadata.appendChild(metadataContent);
    }

    if (modId) {
      if (!modImage) {
        console.error("Mod image element not found");
        return;
      }

      // Add error handler to show broken image placeholder
      modImage.onerror = () => {
        modImage.src =
          "data:image/svg+xml," +
          encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
                <rect width="200" height="200" fill="#f5f5f5"/>
                <text x="50%" y="50%" fill="#999" font-family="Arial" font-size="16" text-anchor="middle">
                    No Image Available
                </text>
                <path d="M60,40 L140,160 M140,40 L60,160" stroke="#999" stroke-width="4"/>
            </svg>
        `);
      };

      modPreview.style.display = "block";
    } else {
      console.log("setting display to none");
      modPreview.style.display = "none";
      return;
    }

    try {
      const mod = await this.modManager.getMod(modId);
      if (!mod) {
        metadataContent.innerHTML = `<p class="text-danger">${await languageService.translate(
          "metadata.unknown",
        )}</p>`;
        modImage.src = "";
        return;
      }

      try {
        const [previewPath, modInfo] = await Promise.all([
          window.api.modDetails.getPreview(mod.path),
          window.api.modDetails.getInfo(mod.path),
        ]);

        modImage.src = previewPath || "";

        // If no info.toml exists or it's empty, show the "no description" message
        if (!modInfo) {
          metadataContent.innerHTML = `
                    <div class="alert alert-warning">
                        <p>${await languageService.translate(
                          "mods.details.title",
                        )}:</p>
                        <h5>${this.escapeHtml(mod.name)}</h5>
                        <p class="text-muted">${await languageService.translate(
                          "metadata.description.empty",
                        )}</p>
                    </div>
                `;
          return;
        }

        // Build metadata HTML with translations
        const metadataHtml = `
                <h5>${this.escapeHtml(
                  modInfo?.display_name || modInfo?.mod_name || mod.name,
                )}</h5>
                ${
                  modInfo?.version
                    ? `
                    <p><strong>${await languageService.translate(
                      "metadata.version.label",
                    )}:</strong> 
                    ${this.escapeHtml(modInfo.version)}</p>`
                    : ""
                }
                ${
                  modInfo?.authors
                    ? `
                    <p><strong>${await languageService.translate(
                      "metadata.author.name",
                    )}:</strong> 
                    ${this.escapeHtml(modInfo.authors)}</p>`
                    : ""
                }
                ${
                  modInfo?.category
                    ? `
                    <p><strong>${await languageService.translate(
                      "metadata.category.label",
                    )}:</strong> 
                    ${
                      (await languageService.translate(
                        `metadata.category.${modInfo.category.toLowerCase()}`,
                      )) || this.escapeHtml(modInfo.category)
                    }</p>`
                    : ""
                }
                ${
                  typeof modInfo?.wifi_safe !== "undefined"
                    ? `
                    <p><strong>${await languageService.translate(
                      "mods.details.wifiSafe",
                    )}:</strong> 
                    ${modInfo.wifi_safe ? "✔️" : "❌"}</p>`
                    : ""
                }
                ${
                  modInfo?.description
                    ? `
                    <div class="description-section">
                        <strong>${await languageService.translate(
                          "metadata.description.title",
                        )}:</strong>
                        <p class="description-text">
                            ${this.escapeHtml(modInfo.description)}
                        </p>
                    </div>`
                    : ""
                }
                ${
                  modInfo?.url
                    ? `
                    <p><strong>${await languageService.translate(
                      "metadata.author.website",
                    )}:</strong> 
                    <a href="#" onclick="window.api.openExternal('${this.escapeHtml(
                      modInfo.url,
                    )}'); return false;">
                        ${this.escapeHtml(modInfo.url)}
                    </a></p>`
                    : ""
                }
            `;

        metadataContent.innerHTML = metadataHtml;

        // Add event listener for description toggle
        const toggleBtn = metadataContent.querySelector(".toggle-description");
        if (toggleBtn) {
          toggleBtn.addEventListener("click", async (e) => {
            const target = e.target as HTMLElement;

            const descText = target.parentElement;
            const isExpanded = target.dataset.expanded === "true";

            descText.style.maxHeight = isExpanded ? "100px" : "none";

            target.textContent = await languageService.translate(
              isExpanded
                ? "metadata.description.readMore"
                : "metadata.description.readLess",
            );

            target.dataset.expanded = `${!isExpanded}`;
          });
        }
      } catch (error) {
        console.error("Error loading mod details:", error);
        metadataContent.innerHTML = `
                <div class="alert alert-warning">
                    <p>${await languageService.translate(
                      "mods.details.title",
                    )}:</p>
                    <h5>${this.escapeHtml(mod.name)}</h5>
                    <p class="text-muted">${await languageService.translate(
                      "metadata.description.empty",
                    )}</p>
                </div>
            `;
      }

      // Show edit button when a mod is selected
      const editButton = document.getElementById("editModInfo");
      editButton.style.display = "block";
      editButton.onclick = () => this.showModInfoEditor(mod.path);
    } catch (error) {
      console.error("Error in updateModPreview:", error);
      metadataContent.innerHTML = `
            <div class="alert alert-danger">
                <p>${await languageService.translate("metadata.unknown")}</p>
                <small>${this.escapeHtml(error.message)}</small>
            </div>
        `;
    }
  }

  async showModInfoEditor(modPath: string) {
    try {
      const modInfo = await window.api.getModInfo(modPath);
      const currentModId = this.selectedMod;

      const form = document.getElementById("modInfoForm") as HTMLFormElement;

      const modal = new bootstrap.Modal(
        document.getElementById("editModInfoModal"),
      );

      // Clear all form fields first
      form.reset();

      // Populate form with current values
      if (modInfo) {
        for (const [key, value] of Object.entries(modInfo)) {
          const input = form.elements[key];
          if (input) {
            input.value = value || "";
          }
        }
      }

      // Remove old event listener if exists
      const saveButton = document.getElementById("saveModInfo");
      const newSaveButton = saveButton.cloneNode(true) as HTMLButtonElement;

      saveButton.parentNode.replaceChild(newSaveButton, saveButton);

      // Add new event listener
      newSaveButton.onclick = async () => {
        // Reset validation
        form
          .querySelectorAll(".is-invalid")
          .forEach((el) => el.classList.remove("is-invalid"));

        // Check required fields except version and description
        const required = ["display_name", "authors", "category"];
        let isValid = true;

        required.forEach((field) => {
          const input = form.elements[field];
          if (!input.value.trim()) {
            input.classList.add("is-invalid");
            isValid = false;
          }
        });

        if (!isValid) {
          return;
        }

        const formData = new FormData(form);
        const updatedInfo = Object.fromEntries(formData.entries());

        try {
          await window.api.saveModInfo(modPath, updatedInfo);
          this.showToast("Mod info saved successfully", "success");
          modal.hide();
          await this.loadMods();

          // Reselect the mod after saving
          if (currentModId) {
            this.selectMod(currentModId);
            await this.updateModPreview(currentModId);
          }
        } catch (error) {
          this.showError("Failed to save mod info: " + error.message);
        }
      };

      modal.show();
    } catch (error) {
      console.error("Error loading mod info:", error);
      this.showError("Failed to load mod info: " + error.message);
    }
  }

  async selectMod(modId) {
    console.log("Selecting mod:", modId);
    console.log("All mod items:", document.querySelectorAll(".mod-item"));

    // Find the specific mod item
    const modItem = document.querySelector(`[data-mod-id="${modId}"]`);
    console.log("Mod item found:", modItem);

    if (modItem) {
      // Remove selection from all items
      document.querySelectorAll(".mod-item").forEach((item) => {
        item.classList.remove("selected");
      });

      // Add selection to clicked item
      modItem.classList.add("selected");
      this.selectedMod = modId;

      try {
        console.log("Calling updateModPreview");
        await this.updateModPreview(modId);
      } catch (error) {
        console.error("Error in selectMod:", error);
      }
    } else {
      console.error("No mod item found for ID:", modId);
    }
  }

  initializePluginTab() {
    this.loadPlugins();
    document
      .getElementById("selectPluginsFolder")
      .addEventListener("click", () => this.handleSelectPluginsFolder());
    document
      .getElementById("installPlugin")
      .addEventListener("click", () => this.handleInstallPlugin());
    document
      .getElementById("reloadPluginsList")
      .addEventListener("click", () => this.loadPlugins());
  }

  async loadPlugins() {
    try {
      await this.showLoading("Reloading Plugins...");
      const plugins = await window.api.pluginOperations.loadPlugins();
      this.renderPluginList(plugins);
    } catch (error) {
      this.showError("Failed to load plugins, Cause " + ": " + error.message);
    }
    this.hideLoading();
  }

  renderPluginList(plugins) {
    const pluginList = document.getElementById("pluginList");
    pluginList.innerHTML = "";

    if (!plugins || plugins.length === 0) {
      pluginList.innerHTML = `
                <div class="text-center textmuted py-3">
                    No plugins found
                </div>
            `;
      return;
    }

    plugins.forEach((plugin) => {
      const pluginElement = document.createElement("div");
      pluginElement.classList.add(
        "plugin-item",
        "d-flex",
        "justify-content-between",
        "align-items-center",
        "p-2",
        "border-bottom",
      );
      pluginElement.innerHTML = `
                <div class="plugin-info">
                    <strong>${this.escapeHtml(plugin.name)}</strong>
                </div>
                <div class="plugin-actions">
                    <button class="btn btn-sm btn-outline-secondary me-1 toggle-plugin" data-plugin-id="${
                      plugin.id
                    }">
                        <i class="bi bi-${
                          plugin.enabled ? "toggle-on" : "toggle-off"
                        }"></i>
                    <button class="btn btn-sm btn-outline-danger me-1 delete-plugin" data-plugin-id="${
                      plugin.id
                    }">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;

      pluginElement
        .querySelector(".toggle-plugin")
        .addEventListener("click", () => this.handleTogglePlugin(plugin.id));
      pluginElement
        .querySelector(".delete-plugin")
        .addEventListener("click", () => this.handleDeletePlugin(plugin.id));
      pluginList.appendChild(pluginElement);
    });
  }

  async handleSelectPluginsFolder() {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ["openDirectory"],
      });

      if (!result.canceled) {
        await this.showLoading("Updating plugins folder...");
        await window.api.settings.setPluginsPath(result.filePaths[0]);
        (document.getElementById("pluginsPath") as HTMLInputElement).value =
          result.filePaths[0];
        this.loadPlugins();
        this.showSuccess("Plugins folder updated successfully");

        // Update Discord RPC
        window.api.discordRpc.setActivity({
          state: "Updating Plugins Folder",
          details: "Changing Plugins Directory",
          largeImageKey: "app_logo",
          largeImageText: "FightPlanner",
        });
      }
    } catch (error) {
      console.error("Failed to update plugins folder:", error);
      this.showError(
        "Failed to update plugins folder, Cause " + ": " + error.message,
      );
    } finally {
      this.hideLoading();
    }
  }

  async handleInstallPlugin() {
    try {
      const result = await window.api.dialog.showOpenDialog({
        filters: [{ name: "Plugin Files", extensions: ["nro"] }],
        properties: ["openFile"],
      });

      if (!result.canceled) {
        await this.showLoading("Installing plugin...");
        await window.api.pluginOperations.installPlugin(result.filePaths[0]);
        this.loadPlugins();
        this.showSuccess("Plugin installed successfully");

        // Update Discord RPC
        window.api.discordRpc.updateModInstallation();
      }
    } catch (error) {
      this.showError("Failed to install plugin, Cause " + ": " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  async handleDeletePlugin(pluginId) {
    if (
      await this.showConfirmationModal(
        "Are you sure you want to delete this plugin?",
      )
    ) {
      try {
        await this.showLoading("Deleting plugin...");
        await window.api.pluginOperations.deletePlugin(pluginId);
        this.loadPlugins();
        this.showSuccess("Plugin deleted successfully");

        // Update Discord RPC
        window.api.discordRpc.updateModCount(this.mods.length);
      } catch (error) {
        this.showError(
          "Failed to delete plugin, Cause " + ": " + error.message,
        );
      } finally {
        this.hideLoading();
      }
    }
  }

  async handleTogglePlugin(pluginId) {
    try {
      const result = await window.api.pluginOperations.togglePlugin(pluginId);
      if (result) {
        this.showToast("Plugin enabled successfully", "success");
      } else {
        this.showToast("Plugin disabled successfully", "success");
      }
      this.loadPlugins();
    } catch (error) {
      console.error("Failed to toggle plugin:", error);
      this.showError("Failed to toggle plugin: " + error.message);
    }
  }

  async handleOpenPluginsFolder() {
    try {
      await window.api.pluginOperations.openPluginsFolder();
      // Update Discord RPC
      window.api.discordRpc.setActivity({
        state: "Browsing Plugins Folder",
        details: "Exploring Plugin Collection",
        largeImageKey: "app_logo",
        largeImageText: "FightPlanner",
      });
    } catch (error) {
      this.showError("Failed to open plugins folder, Cause: " + error.message);
    }
  }

  async handlePluginDrop(event: DragEvent) {
    event.preventDefault();
    const files = event.dataTransfer.files;

    if (files.length === 0) return;

    const nroFiles = Array.from(files).filter((file) =>
      file.name.toLowerCase().endsWith(".nro"),
    );

    if (nroFiles.length === 0) {
      this.showError("No valid plugin files found. Please drop .nro files.");
      return;
    }

    try {
      await this.showLoading("Installing plugins...");

      for (const file of nroFiles) {
        try {
          await window.api.pluginOperations.installPlugin(file.path);
        } catch (installError) {
          this.showError(
            `Failed to install ${file.name}: ${installError.message}`,
          );
        }
      }

      this.loadPlugins();
      this.showSuccess(`Installed ${nroFiles.length} plugin(s) successfully`);

      // Update Discord RPC
      window.api.discordRpc.updateModInstallation();
    } catch (error) {
      console.error("Drag and drop installation error:", error);
      this.showError(
        "Failed to install plugins, Cause " + ": " + error.message,
      );
    } finally {
      this.hideLoading();
    }
  }

  initializeConflictButton() {
    this.conflictButton = document.getElementById("showConflictsBtn");

    if (this.conflictButton) {
      this.conflictButton.addEventListener("click", () => {
        if (this.conflicts && this.conflicts.size > 0) {
          this.showConflictsWarning(this.conflicts);
        }
      });
    }
  }

  initializeSettingsTab() {
    document
      .getElementById("selectCustomCssFile")
      .addEventListener("click", this.handleSelectCustomCssFile);
    document
      .getElementById("removeCustomCssFile")
      .addEventListener("click", this.handleRemoveCustomCssFile);
    this.initializeDarkMode();
    this.initializeConflictCheckToggle();
    this.initializeAutoPrefixRenameToggle();
    this.initializeDiscordRpcToggle();
    this.initializeEmulatorSettings();
    this.initializeLegacyModDiscoveryToggle();
    // Add log viewer functionality
    document
      .getElementById("openCurrentLog")
      .addEventListener("click", this.handleOpenCurrentLog.bind(this));
    document
      .getElementById("openLogsFolder")
      .addEventListener("click", this.handleOpenLogsFolder.bind(this));
    document
      .getElementById("clearLogs")
      .addEventListener("click", this.handleClearLogs);
    document
      .getElementById("refreshLogs")
      .addEventListener("click", this.handleRefreshLogs);
    this.initializeLogViewer();
    this.initializeProtocolConfirmToggle();
    this.initializeAprilFoolsToggle();

    // Add clear temp files handler
    document
      .getElementById("clearTempFiles")
      .addEventListener("click", async () => {
        try {
          await this.showLoading("Clearing temporary files...");
          const cleared = await window.api.settings.clearTempFiles();
          if (cleared) {
            this.showToast("Temporary files cleared successfully", "success");
          } else {
            this.showToast("No temporary files to clear", "info");
          }
        } catch (error) {
          this.showError("Failed to clear temporary files: " + error.message);
        } finally {
          this.hideLoading();
        }
      });

    // Initialize volume control
    const volumeControl = document.getElementById("volumeControl") as
      | HTMLInputElement
      | undefined;

    if (volumeControl) {
      // Load saved volume
      window.api.settings.getVolume().then((volume) => {
        volumeControl.value = `${volume}`;
      });

      // Add change event listener
      volumeControl.addEventListener("input", (e) => {
        const volume = parseInt((e.target as HTMLInputElement).value);
        window.api.settings.setVolume(volume);
      });
    }
  }

  async initializeLogViewer() {
    try {
      const logContent = await window.api.logs.getCurrentLog();
      const logElement = document.getElementById("logContent");
      if (logElement) {
        logElement.textContent = logContent;
        // Auto-scroll to bottom
        logElement.scrollTop = logElement.scrollHeight;
      }
    } catch (error) {
      this.showError("Failed to load logs: " + error.message);
    }
  }

  async handleOpenCurrentLog() {
    try {
      await window.api.logs.openCurrentLog();
    } catch (error) {
      this.showError("Failed to open current log: " + error.message);
    }
  }

  async handleOpenLogsFolder() {
    try {
      await window.api.logs.openLogsFolder();
    } catch (error) {
      this.showError("Failed to open logs folder: " + error.message);
    }
  }

  async handleRefreshLogs() {
    try {
      const logContent = await window.api.logs.getCurrentLog();
      const logElement = document.getElementById("logContent");
      if (logElement) {
        const wasScrolledToBottom =
          logElement.scrollHeight - logElement.clientHeight <=
          logElement.scrollTop + 1;
        logElement.textContent = logContent;
        // If it was scrolled to bottom, keep it scrolled to bottom
        if (wasScrolledToBottom) {
          logElement.scrollTop = logElement.scrollHeight;
        }
      }
      this.showSuccess("Logs refreshed");
    } catch (error) {
      this.showError("Failed to refresh logs: " + error.message);
    }
  }

  async handleClearLogs() {
    try {
      await window.api.logs.clearLogs();
      await this.handleRefreshLogs(); // Refresh logs after clearing
      this.showToast("Logs cleared successfully", "success");
    } catch (error) {
      this.showError("Failed to clear logs: " + error.message);
    }
  }

  initializeDiscordRpcToggle() {
    const discordRpcToggle = document.getElementById("discordRpcToggle") as
      | HTMLInputElement
      | undefined;

    window.api.settings.getDiscordRpcEnabled().then((enabled) => {
      discordRpcToggle.checked = enabled;
    });

    discordRpcToggle.addEventListener("change", (e) => {
      const enabled = (e.target as HTMLInputElement).checked;

      window.api.settings.setDiscordRpcEnabled(enabled).then(() => {
        if (enabled) {
          window.api.discordRpc.connect();
        } else {
          window.api.discordRpc.disconnect();
        }
      });
    });
  }

  initializeConflictCheckToggle() {
    const conflictCheckToggle = document.getElementById(
      "conflictCheckToggle",
    ) as HTMLInputElement | undefined;

    window.api.settings.getConflictCheckEnabled().then((enabled) => {
      conflictCheckToggle.checked = enabled;
    });

    conflictCheckToggle.addEventListener("change", (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      window.api.settings.setConflictCheckEnabled(enabled);
    });
  }

  initializeAutoPrefixRenameToggle() {
    const autoPrefixRenameToggle = document.getElementById(
      "autoPrefixRenameToggle",
    ) as HTMLInputElement | undefined;

    if (autoPrefixRenameToggle) {
      window.api.settings.getAutoPrefixRename().then((enabled) => {
        autoPrefixRenameToggle.checked = enabled;
      });

      autoPrefixRenameToggle.addEventListener("change", (e) => {
        const enabled = (e.target as HTMLInputElement).checked;
        window.api.settings.setAutoPrefixRename(enabled);
      });
    }
  }

  handleRemoveCustomCssFile() {
    (document.getElementById("customCssPath") as HTMLInputElement).value = "";

    window.api.settings.removeCustomCss().catch((error) => {
      this.showError(
        "Failed to remove custom CSS, Cause " + ": " + error.message,
      );
    });

    this.showSuccess("Custom CSS file removed successfully");
    this.showRestartNeededPopup();
  }

  showRestartNeededPopup() {
    const restartNeededModal = new bootstrap.Modal(
      document.getElementById("restartNeededModal"),
    );

    restartNeededModal.show();
  }

  async handleSelectCustomCssFile() {
    try {
      const filePath = await window.electronAPI.selectCustomCssFile();
      if (filePath) {
        (document.getElementById("customCssPath") as HTMLInputElement).value =
          filePath;

        await window.electronAPI.setCustomCssPath(filePath);

        this.showSuccess("Custom CSS file updated successfully");
        this.showRestartNeededPopup();
      }
    } catch (error) {
      this.showError(
        "Failed to select custom CSS file, Cause " + ": " + error.message,
      );
    }
  }

  handleAddDownloadField() {
    const downloadFieldsContainer = document.getElementById(
      "downloadFieldsContainer",
    );
    const newField = document.createElement("div");
    newField.classList.add("mb-3", "input-group");
    newField.innerHTML = `
            <input type="text" class="form-control gameBananaLink" placeholder="Paste GameBanana mod link here">
            <button type="button" class="btn btn-outline-danger remove-download-field">
                <i class="bi bi-x"></i>
            </button>
        `;
    downloadFieldsContainer.appendChild(newField);
  }

  showConflictsWarning() {
    const descriptions = this.conflictDetector.getConflictDescriptions();

    if (descriptions.length === 0) {
      this.showToast("No conflicts detected", "info");
      return;
    }

    // Create modal for conflicts
    const isDark = document.body.classList.contains("dark-mode");
    const modalHtml = `
    <div class="modal fade" id="conflictsModal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content border-warning shadow ${
              isDark ? "bg-dark text-black" : ""
            }">
                <div class="modal-header bg-warning bg-gradient">
                    <h5 class="modal-title d-flex align-items-center">
                        <i class="bi bi-exclamation-triangle-fill me-2 text-danger fs-3"></i>
                        Mod Conflicts Detected
                        <span class="badge bg-danger ms-3">${
                          descriptions.length
                        } files in conflict${
                          descriptions.length > 1 ? "s" : ""
                        }</span>
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-3">
                        <strong>The following conflicts were found between mods:</strong>
                    </p>
                    <div class="table-responsive">
                        <table class="table table-bordered align-middle table-hover ${
                          isDark ? "table-dark" : ""
                        }">
                            <thead class="table-warning">
                                <tr>
                                    <th scope="col"><i class="bi bi-file-earmark"></i> File</th>
                                    <th scope="col"><i class="bi bi-people"></i> Conflicting Mods</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${descriptions
                                  .map(
                                    (conflict) => `
                                    <tr>
                                        <td class="fw-bold text-break" style="min-width:180px">${
                                          conflict.file
                                        }</td>
                                        <td>
                                            <ul class="list-unstyled mb-0">
                                                ${conflict.mods
                                                  .map(
                                                    (mod) => `
                                                    <li class="d-flex align-items-center mb-1">
                                                        <i class="bi bi-exclamation-circle-fill text-warning me-2"></i>
                                                        <span>${mod}</span>
                                                    </li>
                                                `,
                                                  )
                                                  .join("")}
                                            </ul>
                                        </td>
                                    </tr>
                                `,
                                  )
                                  .join("")}
                            </tbody>
                        </table>
                    </div>
                    <div class="alert alert-warning mt-3 d-flex align-items-center" style="font-size:0.95em">
                        <i class="bi bi-info-circle-fill me-2"></i>
                        You can change the slot of a mod to resolve conflicts.
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="changeSlotButton">
                        <i class="bi bi-arrow-repeat me-1"></i> Change Slot
                    </button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        <i class="bi bi-x-lg me-1"></i> Close
                    </button>
                </div>
            </div>
        </div>
    </div>
`;

    // Remove existing modal if present
    const existingModal = document.getElementById("conflictsModal");
    if (existingModal) {
      existingModal.remove();
    }

    // Add modal to document
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    // Show the modal
    const modal = new bootstrap.Modal(
      document.getElementById("conflictsModal"),
    );
    modal.show();

    // Add event listener for change slot button
    document
      .getElementById("changeSlotButton")
      .addEventListener("click", () => {
        modal.hide();
        this.showSelectModsModal(descriptions);
      });
  }

  showSelectModsModal(conflicts) {
    // Create a set to store unique mods
    const uniqueMods = new Set(conflicts.flatMap((conflict) => conflict.mods));

    // Create a modal dialog for selecting mods to change slots
    const selectModsModalHtml = `
            <div class="modal fade" id="selectModsModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Select Mods to Change Slots</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>Select the mod you want to change slots for:</p>
                            <div class="list-group">
                                ${Array.from(uniqueMods)
                                  .map(
                                    (mod) => `
                                    <button type="button" class="list-group-item list-group-item-action mod-button" data-mod-id="${mod}">
                                        ${mod}
                                    </button>
                                `,
                                  )
                                  .join("")}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    // Remove existing modal if present
    const existingSelectModsModal = document.getElementById("selectModsModal");
    if (existingSelectModsModal) {
      existingSelectModsModal.remove();
    }

    // Add modal to document
    document.body.insertAdjacentHTML("beforeend", selectModsModalHtml);

    // Show the modal
    const selectModsModal = new bootstrap.Modal(
      document.getElementById("selectModsModal"),
    );
    selectModsModal.show();

    // Add event listener for mod buttons
    document.querySelectorAll(".mod-button").forEach((button: HTMLElement) => {
      button.addEventListener("click", () => {
        const selectedMod = button.dataset.modId;
        this.showChangeSlotsDialog(selectedMod);

        selectModsModal.hide();
      });
    });
  }

  async showChangeSlotsDialog(selectedMod: string) {
    this.hideContextMenu();

    if (!selectedMod) {
      this.showError("Please select a mod");
      return;
    }

    try {
      this.showLoading("Scanning mod files...");

      const mod = await this.modManager.getMod(selectedMod);
      const { currentSlots, pathData } = await SlotScanner.scanForSlots(
        mod.path,
      );
      const fighterNameInternal = getInternalFighterName(pathData);

      const existingCustomNames = fighterNameInternal
        ? await ChangeSlots.readExistingCustomNames(
            mod.path,
            fighterNameInternal,
            currentSlots,
          )
        : {};

      // Get default custom names for each slot from messages.data
      const defaultCustomNames = {};

      if (fighterNameInternal) {
        for (const slot of currentSlots) {
          defaultCustomNames[slot] =
            await ChangeSlots.getDefaultCustomNames(fighterNameInternal);
        }
      }

      const modDetails = {
        mod,
        pathData,
        currentSlots,
        defaultCustomNames,
        fighterNameInternal,
        existingCustomNames,
      };

      // Collect all slots in use for the same fighter across all mods
      // Only consider a slot "in use" if it shares files with the mod being changed
      const slotsInUse = new Map(); // Map<slot, Array<modName>>
      const fighterName = modDetails.fighterNameInternal;

      if (fighterName) {
        // Get all files from the mod being changed for this fighter
        const modBeingChangedFiles = new Set();

        if (modDetails.pathData && modDetails.pathData[fighterName]) {
          for (const { filesToBeModified } of Object.values(
            modDetails.pathData[fighterName],
          )) {
            filesToBeModified.forEach((file) => {
              modBeingChangedFiles.add(file.normalized);
            });
          }
        }

        for (const mod of this.mods) {
          try {
            const { pathData } = await SlotScanner.scanForSlots(mod.path);

            if (pathData[fighterName]) {
              for (const slot of Object.keys(pathData[fighterName])) {
                // Check if any files from this slot overlap with the mod being changed
                let hasOverlap = false;

                for (const file of pathData[fighterName][slot]
                  .filesToBeModified) {
                  if (modBeingChangedFiles.has(file.normalized)) {
                    hasOverlap = true;
                    break;
                  }
                }

                // Only add to slotsInUse if there's a file overlap
                if (hasOverlap) {
                  if (!slotsInUse.has(slot)) {
                    slotsInUse.set(slot, []);
                  }

                  slotsInUse.get(slot).push(mod.name);
                }
              }
            }
          } catch (error) {
            console.error(`Error scanning mod ${mod.name}:`, error);
          }
        }
      }

      // Génération du HTML avec tous les slots détectés (y compris > c07)
      const slotsInfo = document.getElementById("currentSlotsInfo");

      // Build slots in use display
      let slotsInUseHtml = "";
      if (slotsInUse.size > 0) {
        const sortedSlots = Array.from(slotsInUse.keys()).sort((a, b) => {
          const numA = parseInt(a.replace("c", ""));
          const numB = parseInt(b.replace("c", ""));
          return numA - numB;
        });

        slotsInUseHtml = `
          <div class="alert alert-info mb-3">
            <h6 class="mb-2"><i class="bi bi-info-circle me-2"></i>Slots currently in use for this fighter:</h6>
            <div class="d-flex flex-wrap gap-2">
              ${sortedSlots
                .map((slot) => {
                  const mods = slotsInUse.get(slot);
                  const isConflict = mods.length > 1;
                  return `
                  <span class="badge ${isConflict ? "bg-warning text-dark" : "bg-secondary"}" 
                        title="${mods.join(", ")}"
                        style="cursor: help;">
                    ${slot} ${isConflict ? `⚠️ (${mods.length})` : ""}
                  </span>
                `;
                })
                .join("")}
            </div>
            ${slotsInUse.size > 0 ? '<small class="text-muted d-block mt-2">⚠️ = Multiple mods use this slot (hover for details)</small>' : ""}
          </div>
        `;
      }

      const standardSlots = Array.from({ length: 8 }, (_, i) => `c0${i}`);

      const extraSlots = modDetails.currentSlots.filter(
        (s) => !standardSlots.includes(s),
      );

      const allSlots = Array.from(new Set([...standardSlots, ...extraSlots]));

      const allAffectedFiles = Object.values(modDetails.pathData).flatMap(
        (slotData) => {
          return Object.values(slotData).flatMap((data) => {
            return data.filesToBeModified.flatMap((file) => file.original);
          });
        },
      );

      slotsInfo.innerHTML =
        slotsInUseHtml +
        `
            <div class="mb-3">
                <strong>${mod.name} - Current slots found:</strong> 
                ${modDetails.currentSlots
                  .map((slot) => {
                    return `
                    <div class="input-group mb-3 slot-group" data-slot="${slot}">
                        <span class="input-group-text">${slot}</span>
                        <div style="flex:1;">
                            <select class="form-select target-slot" data-current-slot="${slot}">
                                <option value="">Select new slot</option>
                                ${allSlots
                                  .filter((s) => s !== slot)
                                  .map(
                                    (newSlot) => `
                                    <option value="${newSlot}">${newSlot}</option>
                                `,
                                  )
                                  .join("")}
                                <option value="custom">Custom... (EXPERIMENTAL)</option>
                            </select>
                            <input type="text" class="form-control custom-slot-input mt-2 d-none" placeholder="Enter custom slot (e.g. c123)">
                            
                            <!-- Custom names section (for all slots) -->
                            <div class="custom-names-section mt-2 p-2 border rounded bg-light">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <small class="fw-bold text-muted">Custom Names (Optional)</small>
                                    <button type="button" class="btn btn-sm btn-outline-primary copy-to-all-btn" data-slot="${slot}" title="Copy these names to all other slots">
                                        <i class="bi bi-files"></i> Copy to All
                                    </button>
                                </div>
                                <div class="row g-2">
                                    <div class="col-6">
                                        <input type="text" class="form-control form-control-sm custom-csp-name" 
                                               placeholder="${modDetails.defaultCustomNames[slot]?.cspName || "CSP Name"}" 
                                               value="${modDetails.existingCustomNames[slot]?.cspName || ""}"
                                               data-slot="${slot}">
                                    </div>
                                    <div class="col-6">
                                        <input type="text" class="form-control form-control-sm custom-vs-name" 
                                               placeholder="${modDetails.defaultCustomNames[slot]?.vsName || "VS NAME"}" 
                                               value="${modDetails.existingCustomNames[slot]?.vsName || ""}"
                                               data-slot="${slot}">
                                    </div>
                                    <div class="col-6">
                                        <input type="text" class="form-control form-control-sm custom-boxing-ring" 
                                               placeholder="${modDetails.defaultCustomNames[slot]?.boxingRing || "Boxing Ring Title"}" 
                                               value="${modDetails.existingCustomNames[slot]?.boxingRing || ""}"
                                               data-slot="${slot}">
                                    </div>
                                    <div class="col-6">
                                        <input type="text" class="form-control form-control-sm custom-announcer" 
                                               placeholder="${modDetails.defaultCustomNames[slot]?.announcer || "Narration File"}" 
                                               value="${modDetails.existingCustomNames[slot]?.announcer || ""}"
                                               data-slot="${slot}">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button class="btn btn-danger remove-slot" data-slot="${slot}">Remove Slot</button>
                        <div class="overlay"></div>
                    </div>
                `;
                  })
                  .join("")}
            </div>
            <div class="mb-3">
                <strong>Files to be changed (${allAffectedFiles.length}):</strong>
                <div class="small textmuted" style="max-height: 100px; overflow-y: auto;">
                    ${allAffectedFiles
                      .map((file) => `<div>${file}</div>`)
                      .join("")}
                </div>
            </div>
        `;

      // Show the modal
      const modal = new bootstrap.Modal(
        document.getElementById("changeSlotsModal"),
      );
      modal.show();

      // Track if the custom slot warning has been shown in this dialog session
      let customWarningShown = false;

      // Affiche le champ custom si "Custom..." est choisi
      document.querySelectorAll(".target-slot").forEach((select) => {
        select.addEventListener("change", function (this: HTMLSelectElement) {
          const customInput = this.parentElement.querySelector(
            ".custom-slot-input",
          ) as HTMLInputElement;

          if (this.value === "custom") {
            // Affiche le champ custom
            customInput.classList.remove("d-none");
            customInput.focus();

            // Affiche un modal d'avertissement (only once per dialog session)
            if (!customWarningShown) {
              customWarningShown = true;

              if (!document.getElementById("customSlotWarningModal")) {
                const warningModalHtml = `
                                <div class="modal fade" id="customSlotWarningModal" tabindex="-1">
                                    <div class="modal-dialog">
                                        <div class="modal-content">
                                            <div class="modal-header bg-warning">
                                                <h5 class="modal-title">
                                                    <i class="bi bi-exclamation-triangle me-2"></i>
                                                    Experimental Feature
                                                </h5>
                                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                            </div>
                                            <div class="modal-body">
                                                <p>
                                                    The custom slot feature is experimental and may break your mod or cause unexpected issues.<br>
                                                    Use at your own risk!
                                                </p>
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-warning" data-bs-dismiss="modal">Understood</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                document.body.insertAdjacentHTML("beforeend", warningModalHtml);
              }
              const warningModal = new bootstrap.Modal(
                document.getElementById("customSlotWarningModal"),
              );
              warningModal.show();
            }
          } else {
            customInput.classList.add("d-none");
          }
        });
      });

      // Handle "Copy to All" button clicks
      document.querySelectorAll(".copy-to-all-btn").forEach((btn) => {
        btn.addEventListener("click", function (this: HTMLButtonElement) {
          const sourceSlot = this.getAttribute("data-slot");
          const sourceSection = this.closest(".custom-names-section");

          const cspNameElement = sourceSection.querySelector(
            ".custom-csp-name",
          ) as HTMLInputElement;
          const vsNameElement = sourceSection.querySelector(
            ".custom-vs-name",
          ) as HTMLInputElement;
          const boxingRingElement = sourceSection.querySelector(
            ".custom-boxing-ring",
          ) as HTMLInputElement;
          const announcerElement = sourceSection.querySelector(
            ".custom-announcer",
          ) as HTMLInputElement;

          // Get values from the source slot
          const cspName = cspNameElement.value;
          const vsName = vsNameElement.value;
          const boxingRing = boxingRingElement.value;
          const announcer = announcerElement.value;

          // Copy to all other slots
          document
            .querySelectorAll(".custom-names-section")
            .forEach((section) => {
              const targetSlot = section
                .querySelector(".custom-csp-name")
                .getAttribute("data-slot");

              // Skip the source slot itself
              if (targetSlot !== sourceSlot) {
                cspNameElement.value = cspName;
                vsNameElement.value = vsName;
                boxingRingElement.value = boxingRing;
                announcerElement.value = announcer;
              }
            });

          // Show a brief success indicator
          const originalText = this.innerHTML;
          this.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
          this.classList.remove("btn-outline-primary");
          this.classList.add("btn-success");

          setTimeout(() => {
            this.innerHTML = originalText;
            this.classList.remove("btn-success");
            this.classList.add("btn-outline-primary");
          }, 1500);
        });
      });

      // Handle slot change confirmation
      const confirmBtn = document.getElementById("confirmChangeSlots");

      confirmBtn.onclick = async () => {
        try {
          const slotAssignments: Record<string, string> = {};
          const slotChanges: Record<string, string> = {};
          const slotsToRemove: string[] = [];
          const slotCustomNames: Record<string, {
              cspName?: string;
              vsName?: string;
              boxingRing?: string;
              announcer?: string;
            }> = {};

          document
            .querySelectorAll(".target-slot")
            .forEach((select: HTMLSelectElement) => {
              const currentSlot = select.getAttribute("data-current-slot");

              let targetSlot = select.value.trim();

              if (targetSlot === "custom") {
                const customInput = select.parentElement.querySelector(
                  ".custom-slot-input",
                ) as HTMLInputElement;

                if (customInput && customInput.value.trim()) {
                  targetSlot = customInput.value.trim();
                } else {
                  targetSlot = "";
                }
              }

              if (targetSlot) {
                slotChanges[currentSlot] = targetSlot;
              }

              slotAssignments[currentSlot] = targetSlot || currentSlot;

              // Collect custom names for this slot (all slots supported)
              const finalSlot = targetSlot || currentSlot;
              const slotGroup = select.closest(".slot-group");

              const cspNameElement = slotGroup.querySelector(
                ".custom-csp-name",
              ) as HTMLInputElement;
              const vsNameElement = slotGroup.querySelector(
                ".custom-vs-name",
              ) as HTMLInputElement;
              const boxingRingElement = slotGroup.querySelector(
                ".custom-boxing-ring",
              ) as HTMLInputElement;
              const announcerElement = slotGroup.querySelector(
                ".custom-announcer",
              ) as HTMLInputElement;

              const cspName = cspNameElement.value.trim();
              const vsName = vsNameElement.value.trim();
              const boxingRing = boxingRingElement.value.trim();
              const announcer = announcerElement.value.trim();

              // Only add if at least one field is filled
              if (cspName || vsName || boxingRing || announcer) {
                slotCustomNames[finalSlot] = {
                  cspName: cspName || "",
                  vsName: vsName || "",
                  boxingRing: boxingRing || "",
                  announcer: announcer || "",
                };
              }
            });

          document.querySelectorAll(".slot-group.removed").forEach((group) => {
            const slot = group.getAttribute("data-slot");
            slotsToRemove.push(slot);
            delete slotAssignments[slot];
          });

          const finalSlots = Object.values(slotAssignments);

          await this.handleChangeSlots(
            mod.path,
            slotChanges,
            slotsToRemove,
            finalSlots,
            modDetails.pathData,
            fighterName,
            slotCustomNames,
            defaultCustomNames,
          );

          modal.hide();

          // Check if we're in batch processing mode
          const isBatchMode = this.isBatchProcessing || false;

          // Check if slots actually changed by comparing current and final slots
          const currentSlotsSet = new Set(modDetails.currentSlots);
          const finalSlotsSet = new Set(finalSlots);

          const slotsChanged =
            currentSlotsSet.size !== finalSlotsSet.size ||
            [...currentSlotsSet].some((slot) => !finalSlotsSet.has(slot)) ||
            [...finalSlotsSet].some((slot) => !currentSlotsSet.has(slot));

          // Check if auto-prefix is enabled and prompt for rename only if slots changed
          const autoPrefixEnabled =
            await window.api.settings.getAutoPrefixRename();

          if (autoPrefixEnabled) {
            this.selectedMod = selectedMod;
            await this.handleRenameMod(!slotsChanged);
          } else if (!isBatchMode) {
            await this.loadMods();
          }
        } catch (error) {
          this.showError(`Failed to change slots: ${error.message}`);
        }
      };

      // Handle slot removal
      document
        .querySelectorAll(".remove-slot")
        .forEach((button: HTMLButtonElement) => {
          button.onclick = () => {
            const slotGroup = button.closest(".slot-group");
            slotGroup.classList.toggle("removed");
          };
        });
    } catch (error) {
      this.showError(`Failed to scan mod: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  async handleChangeSlots(
    modPath,
    slotChanges,
    slotsToRemove,
    finalSlots: string[],
    pathData,
    fighterName,
    slotCustomNames,
    defaultCustomNames,
  ) {
    try {
      this.showLoading("Changing character slots...");

      let deletedPaths = 0;

      for (const slot of slotsToRemove) {
        deletedPaths += await ChangeSlots.removeSlot(modPath, slot, pathData);
      }

      const changedFiles = await ChangeSlots.changeSlots(
        modPath,
        slotChanges,
        finalSlots,
        pathData,
        fighterName,
        slotCustomNames,
        defaultCustomNames,
      );

      this.showSuccess(
        `Character slots changed successfully (${changedFiles} files/folders updated, ${deletedPaths} files/folders deleted)`,
      );
    } catch (error) {
      this.showError(`Failed to change slots: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  initializeEmulatorSettings() {
    // Get elements
    const emulatorSelect = document.getElementById(
      "emulatorSelect",
    ) as HTMLSelectElement;
    const emulatorPath = document.getElementById(
      "emulatorPath",
    ) as HTMLInputElement;
    const gamePath = document.getElementById("gamePath") as HTMLInputElement;
    const yuzuFullscreen = document.getElementById(
      "yuzuFullscreen",
    ) as HTMLInputElement;
    const yuzuOptions = document.getElementById(
      "yuzuOptions",
    ) as HTMLDivElement;
    const selectEmulatorPath = document.getElementById(
      "selectEmulatorPath",
    ) as HTMLButtonElement;
    const selectGamePath = document.getElementById(
      "selectGamePath",
    ) as HTMLButtonElement;
    const launchGame = document.getElementById(
      "launchGame",
    ) as HTMLButtonElement;

    // Load saved settings
    window.api.emulator.getSelectedEmulator().then((emulator) => {
      emulatorSelect.value = emulator;
      yuzuOptions.style.display = emulator === "yuzu" ? "block" : "none";
    });
    window.api.emulator
      .getEmulatorPath()
      .then((path) => (emulatorPath.value = path));
    window.api.emulator.getGamePath().then((path) => (gamePath.value = path));
    window.api.emulator
      .getYuzuFullscreen()
      .then((enabled) => (yuzuFullscreen.checked = enabled));

    // Add event listeners
    emulatorSelect.addEventListener("change", async (e: Event) => {
      const emulator = (e.target as HTMLSelectElement).value;
      await window.api.emulator.setSelectedEmulator(emulator);
      yuzuOptions.style.display = emulator === "yuzu" ? "block" : "none";
    });

    selectEmulatorPath.addEventListener("click", async () => {
      const result = await window.api.dialog.showOpenDialog({
        properties: ["openFile"],
      });
      if (!result.canceled) {
        const path = result.filePaths[0];
        emulatorPath.value = path;
        await window.api.emulator.setEmulatorPath(path);
      }
    });

    selectGamePath.addEventListener("click", async () => {
      const result = await window.api.dialog.showOpenDialog({
        properties: ["openFile"],
      });
      if (!result.canceled) {
        const path = result.filePaths[0];
        gamePath.value = path;
        await window.api.emulator.setGamePath(path);
      }
    });

    yuzuFullscreen.addEventListener("change", async (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      await window.api.emulator.setYuzuFullscreen(enabled);
    });

    launchGame.addEventListener("click", async () => {
      try {
        await window.api.emulator.launchGame();
      } catch (error) {
        this.showError(`Failed to launch game: ${error.message}`);
      }
    });
  }

  initializeProtocolConfirmToggle() {
    const protocolConfirmToggle = document.getElementById(
      "protocolConfirmToggle",
    ) as HTMLInputElement;

    window.api.settings.getProtocolConfirmEnabled().then((enabled) => {
      protocolConfirmToggle.checked = enabled;
    });

    protocolConfirmToggle.addEventListener("change", (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      window.api.settings.setProtocolConfirmEnabled(enabled);
    });
  }

  initializeDownloadsPanel() {
    // ...existing code...
    const panel = document.getElementById("downloadsPanel");
    const header = panel.querySelector(".downloads-header");
    const downloadsList = document.getElementById("downloadsList");
    const downloadCount = document.getElementById("downloadCount");

    // Start with the "no downloads" message
    downloadsList.innerHTML = `<div class="text-center p-3 text-muted nodownloadsmessage">
            No downloads ongoing
        </div>`;

    header.addEventListener("click", () => {
      panel.classList.toggle("expanded");
    });

    window.electron.onDownloadStatus((status) => {
      // For a start event, remove the nodownloads message if present
      if (status.type === "start") {
        const msg = downloadsList.querySelector(".nodownloadsmessage");
        if (msg) {
          msg.remove();
        }
        this.addDownloadItem(status.id, status.message, status.modName);
      } else if (status.type === "progress") {
        this.updateDownloadProgress(
          status.id,
          status.message,
          status.progress,
          status.modName,
        );
      } else if (["finish", "error", "cancelled"].includes(status.type)) {
        this.completeDownload(
          status.id,
          status.type,
          status.message,
          status.modName,
        );
      }

      // Update download count
      const activeCount =
        downloadsList.querySelectorAll(".download-item").length;

      downloadCount.textContent = `${activeCount}`;

      // If there are no active downloads, restore the message (only once)
      if (
        activeCount === 0 &&
        !downloadsList.querySelector(".nodownloadsmessage")
      ) {
        downloadsList.innerHTML = `<div class="text-center p-3 text-muted nodownloadsmessage">
                    No downloads ongoing
                </div>`;
      }
    });
    // ...existing code...
  }

  addDownloadItem(id, message, modName = "Unknown Mod") {
    try {
      const downloadsList = document.getElementById("downloadsList");
      if (!downloadsList) return;

      // Check if an entry for this mod already exists
      const existing = downloadsList.querySelector(
        `.download-item[data-mod-name="${modName}"]`,
      );
      if (existing) {
        // Optionally update its message instead of creating a duplicate
        const msgEl = existing.querySelector(".message");
        if (msgEl) msgEl.textContent = message;
        return;
      }

      const item = document.createElement("div");
      item.className = "download-item";
      item.id = `download-${id}`;
      // Set data-mod-name so we can check duplicates
      item.setAttribute("data-mod-name", modName);
      item.innerHTML = `
                <div class="download-info">
                    <strong class="mod-name">${this.escapeHtml(
                      modName,
                    )}</strong>
                    <div class="message">${message}</div>
                    <div class="progress">
                        <div class="progress-bar" role="progressbar" style="width: 0%"></div>
                    </div>
                </div>
                <div class="download-actions">
                    <button class="btn btn-sm btn-primary pause-download" onclick="window.uiController.pauseDownload('${id}')">
                        <i class="bi bi-pause-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.uiController.cancelDownload('${id}')">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            `;
      downloadsList.appendChild(item);
      document.getElementById("downloadsPanel").classList.add("expanded");
    } catch (error) {
      console.error("Error adding download item:", error);
    }
  }

  async pauseDownload(id) {
    try {
      const item = document.getElementById(`download-${id}`);
      if (!item) return;

      const pauseBtn = item.querySelector(".pause-download");
      const messageEl = item.querySelector(".message");
      const downloader = window.electron.getActiveDownload(id);

      if (!downloader) {
        console.error("No active downloader found for ID:", id);
        return;
      }

      const isPaused = await window.electron.togglePauseDownload(id);

      // Update UI based on pause state
      if (isPaused) {
        pauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        messageEl.textContent = "Paused";
        item.classList.add("paused");
      } else {
        pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
        messageEl.textContent = "Downloading...";
        item.classList.remove("paused");
      }
    } catch (error) {
      console.error("Failed to pause/resume download:", error);
      this.showError("Failed to pause/resume download: " + error.message);
    }
  }

  updateDownloadProgress(id, message, progress, modName) {
    try {
      const item = document.getElementById(`download-${id}`);
      if (!item) return;

      const messageEl = item.querySelector(".message");
      const progressBar = item.querySelector(".progress-bar") as HTMLDivElement;

      if (messageEl) messageEl.textContent = message;
      if (progressBar) progressBar.style.width = `${progress}%`;

      const modNameEl = item.querySelector(".mod-name");
      if (modNameEl && modName) modNameEl.textContent = modName;
    } catch (error) {
      console.error("Error updating download progress:", error);
    }
  }

  completeDownload(id, type, message, modName) {
    try {
      const item = document.getElementById(`download-${id}`);
      if (!item) return;

      const messageEl = item.querySelector(".message");
      const progressBar = item.querySelector(".progress-bar") as HTMLDivElement;
      const modNameEl = item.querySelector(".mod-name");
      const downloadCount = document.getElementById("downloadCount") as
        | HTMLSpanElement
        | undefined;

      if (messageEl) messageEl.textContent = message;
      if (progressBar) {
        progressBar.style.width = "100%";
        progressBar.className = `progress-bar ${
          type === "error"
            ? "bg-danger"
            : type === "cancelled"
              ? "bg-warning"
              : "bg-success"
        }`;
      }
      if (modNameEl && modName) modNameEl.textContent = modName;

      // Don't show any toasts here - they will be handled by the specific handlers

      setTimeout(() => {
        if (item && item.parentNode) {
          item.remove();

          const activeCount =
            document.querySelectorAll(".download-item").length;

          if (downloadCount) downloadCount.textContent = `${activeCount}`;

          if (activeCount === 0) {
            const downloadsList = document.getElementById("downloadsList");
            if (downloadsList) {
              downloadsList.innerHTML = `
                                <div class="text-center p-3 text-muted nodownloadsmessage">
                                    No downloads ongoing
                                </div>
                            `;
            }
          }
        }
      }, 5000);
    } catch (error) {
      console.error("Error completing download:", error);
    }
  }

  async cancelDownload(id: string) {
    try {
      const item = document.getElementById(`download-${id}`);
      const downloadCount = document.getElementById("downloadCount");

      if (item) {
        const progressBar = item.querySelector(".progress-bar");

        if (progressBar) {
          progressBar.className = "progress-bar bg-warning";
        }

        const info = item.querySelector(".download-info");

        if (info) {
          info.textContent = "Cancelling download...";
        }
      }

      await window.electron.cancelDownload(id);
      this.hideLoading();

      if (item) {
        const info = item.querySelector(".download-info");
        if (info) {
          info.textContent = "Download cancelled";
        }
        const progressBar = item.querySelector(
          ".progress-bar",
        ) as HTMLDivElement;

        if (progressBar) {
          progressBar.className = "progress-bar bg-warning";
          progressBar.style.width = "100%";
        }

        // Show cancellation toast only here
        this.showToast("Download cancelled", "warning");

        setTimeout(() => {
          item.remove();

          // Update download count after removing item
          const activeCount =
            document.querySelectorAll(".download-item").length;

          if (downloadCount) downloadCount.textContent = `${activeCount}`;

          // Check if there are any remaining downloads
          if (!document.querySelector(".download-item")) {
            const downloadsList = document.getElementById("downloadsList");
            if (downloadsList) {
              downloadsList.innerHTML = `
                                <div class="text-center p-3 text-muted nodownloadsmessage">
                                    No downloads ongoing
                                </div>
                            `;
            }
            document
              .getElementById("downloadsPanel")
              .classList.remove("expanded");
          }
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to cancel download:", error);
      this.showError("Failed to cancel download: " + error.message);
    }
  }

  initializeAprilFoolsToggle() {
    const today = new Date();
    const isAprilFools = today.getMonth() === 3 && today.getDate() === 1;

    if (isAprilFools) {
      this.applyAprilFoolsMode();
    }
  }

  async applyAprilFoolsMode() {
    // Change window title
    document.title = "FeetPlanner";

    // Change main app name in the interface
    const appTitles = document.querySelectorAll("h5.mb-0");
    appTitles.forEach((title) => {
      if (title.textContent.includes("FightPlanner")) {
        title.textContent = title.textContent.replace(
          "FightPlanner",
          "FeetPlanner",
        );
      }
    });

    // Change logo
    const appLogo = document.getElementById("appLogo") as
      | HTMLImageElement
      | undefined;

    if (appLogo) {
      // Create a new image
      const newLogo = new Image();

      newLogo.onload = () => {
        appLogo.src = newLogo.src;
      };

      newLogo.src = "https://files.gamebanana.com/bitpit/feetplanner.png";
      appLogo.alt = "FeetPlanner Logo";
    }

    // Update credits modal
    const creditsModal = document.getElementById("creditsModal");
    if (creditsModal) {
      // Update modal title
      const modalTitle = creditsModal.querySelector("#creditsModalLabel");
      if (modalTitle) {
        modalTitle.textContent = "About FeetPlanner";
      }

      // Update modal content
      const modalBody = creditsModal.querySelector(".modal-body");
      if (modalBody) {
        // Change logo in modal
        const modalLogo = modalBody.querySelector("img");
        if (modalLogo) {
          modalLogo.src = "https://files.gamebanana.com/bitpit/feetplanner.png";
          modalLogo.alt = "FeetPlanner Logo";
        }

        // Change heading
        const modalHeading = modalBody.querySelector("h4");
        if (modalHeading) {
          modalHeading.textContent = "FeetPlanner";
        }

        // Change description
        const modalDesc = modalBody.querySelector("p:not(.small)");
        if (modalDesc) {
          modalDesc.textContent = "A foot manager for Smash Ultimate";
        }
      }
    }

    // Change any other mentions of FightPlanner in the interface
    document.querySelectorAll("*").forEach((element) => {
      if (
        element.childNodes &&
        element.childNodes.length === 1 &&
        element.childNodes[0].nodeType === 3
      ) {
        if (element.textContent.includes("FightPlanner")) {
          element.textContent = element.textContent.replace(
            /FightPlanner/g,
            "FeetPlanner",
          );
        }
      }
    });
  }

  static updateDownloadStatus(status) {
    const downloadsList = document.getElementById("downloadsList");
    let downloadItem = document.getElementById(`download-${status.id}`);

    if (!downloadItem) {
      downloadItem = document.createElement("div");
      downloadItem.id = `download-${status.id}`;
      downloadItem.className = "download-item";
      downloadsList.appendChild(downloadItem);
    }

    downloadItem.innerHTML = `
            <div class="download-info">
                <strong class="download-title">${
                  status.modName || "Downloading..."
                }</strong>
                <p class="download-message">${status.message}</p>
                <div class="progress">
                    <div class="progress-bar" role="progressbar" 
                         style="width: ${status.progress || 0}%" 
                         aria-valuenow="${status.progress || 0}" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                    </div>
                </div>
            </div>
        `;

    if (
      status.type === "finish" ||
      status.type === "error" ||
      status.type === "cancelled"
    ) {
      setTimeout(() => {
        downloadItem.remove();
      }, 5000);
    }
  }

  initializeCharactersTab() {
    // Initialize refresh button
    const refreshBtn = document.getElementById("refreshCharacters");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        if (this.characterScanner) {
          this.characterScanner.refresh();
        }
      });
    }

    // Only scan when tab is first shown
    document
      .getElementById("characters-tab")
      .addEventListener("shown.bs.tab", () => {
        if (this.characterScanner) {
          this.characterScanner.scanMods();
        }
      });
  }

  initializeModSelection() {
    // Listen for the custom event
    window.addEventListener(
      "select-mod-from-character",
      async (event: CustomEvent) => {
        const modName = event.detail.modName;

        // Switch to mods tab
        document.getElementById("mods-tab").click();

        // Wait a brief moment for tab switch animation
        setTimeout(() => {
          // Find and select the mod
          const modItem = document.querySelector(`[data-mod-id="${modName}"]`);
          if (modItem) {
            modItem.scrollIntoView({ behavior: "smooth", block: "center" });
            this.selectMod(modName);
          }
        }, 150);
      },
    );
  }

  async showCreateFppDialog() {
    try {
      // Load mods and plugins
      const mods = await this.modManager.loadMods();
      const plugins = await window.api.pluginOperations.loadPlugins();

      const renderModsList = (filteredMods) => {
        const modsListHtml = filteredMods
          .map(
            (mod) => `
                    <label class="list-group-item">
                        <input class="form-check-input me-2 fpp-mod" type="checkbox" value="${
                          mod.id
                        }">
                        ${this.escapeHtml(mod.name)}
                    </label>
                `,
          )
          .join("");
        document.getElementById("fppModsList").innerHTML = modsListHtml;
      };

      const renderPluginsList = (filteredPlugins) => {
        const pluginsListHtml = filteredPlugins
          .map(
            (plugin) => `
                    <label class="list-group-item">
                        <input class="form-check-input me-2 fpp-plugin" type="checkbox" value="${
                          plugin.id
                        }">
                        ${this.escapeHtml(plugin.name)}
                    </label>
                `,
          )
          .join("");
        document.getElementById("fppPluginsList").innerHTML = pluginsListHtml;
      };

      // Initial render
      renderModsList(mods);
      renderPluginsList(plugins);

      // Add search functionality
      document
        .getElementById("fppModSearch")
        ?.addEventListener("input", (e) => {
          const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
          const filteredMods = mods.filter((mod) =>
            mod.name.toLowerCase().includes(searchTerm),
          );
          renderModsList(filteredMods);
        });

      document
        .getElementById("fppPluginSearch")
        ?.addEventListener("input", (e) => {
          const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
          const filteredPlugins = plugins.filter((plugin) =>
            plugin.name.toLowerCase().includes(searchTerm),
          );
          renderPluginsList(filteredPlugins);
        });

      // Show modal
      const modal = new bootstrap.Modal(
        document.getElementById("createFppModal"),
      );
      modal.show();
    } catch (error) {
      this.showError("Failed to load mods/plugins: " + error.message);
    }
  }

  async createFpp() {
    try {
      const name = (
        document.getElementById("fppName") as HTMLInputElement
      ).value.trim();

      if (!name) {
        this.showError("Please enter a package name");
        return;
      }

      // Ouvrir la boîte de dialogue pour choisir l'emplacement de sauvegarde
      const saveResult = await window.api.dialog.showOpenDialog({
        title: "Choose where to save the FPP package",
        properties: ["openDirectory"],
        buttonLabel: "Save Here",
      });

      if (saveResult.canceled) {
        return;
      }

      await this.showLoading("Creating FPP package...");

      const selectedMods = Array.from(
        document.querySelectorAll(".fpp-mod:checked"),
      ).map((cb: HTMLInputElement) => cb.value);

      const selectedPlugins = Array.from(
        document.querySelectorAll(".fpp-plugin:checked"),
      ).map((cb: HTMLInputElement) => cb.value);

      // Passer le répertoire choisi au créateur de FPP
      const result = await window.api.fppOperations.createFpp({
        name,
        mods: selectedMods,
        plugins: selectedPlugins,
        outputDir: saveResult.filePaths[0],
      });

      if (result.success) {
        this.showSuccess(`Package created successfully at: ${result.path}`);
        const modal = bootstrap.Modal.getInstance(
          document.getElementById("createFppModal"),
        );
        modal.hide();
      } else {
        this.showError("Failed to create package: " + result.error);
      }
    } catch (error) {
      this.showError("Failed to create package: " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  // Ajouter un gestionnaire pour l'import FPP
  async handleImportFpp(filePath) {
    try {
      await this.showLoading("Importing FPP package...");
      const result = await window.api.fppOperations.importFpp(filePath);

      if (result.success) {
        this.showSuccess("Package imported successfully");
        await this.loadMods();
        await this.loadPlugins();
      } else {
        this.showError("Failed to import package: " + result.error);
      }
    } catch (error) {
      this.showError("Failed to import package: " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  initializeFppHandlers() {
    // Handler pour le drag & drop de FPP
    document.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files);
      const fppFiles = files.filter((file) =>
        file.name.toLowerCase().endsWith(".fpp"),
      );

      if (fppFiles.length > 0) {
        await this.handleFppFiles(fppFiles);
      }
    });

    // Add select all handlers
    document
      .getElementById("selectAllMods")
      ?.addEventListener("change", (e) => {
        const modCheckboxes = document.querySelectorAll(".fpp-mod");
        modCheckboxes.forEach((checkbox: HTMLInputElement) => {
          checkbox.checked = (e.target as HTMLInputElement).checked;
        });
      });

    document
      .getElementById("selectAllPlugins")
      ?.addEventListener("change", (e) => {
        const pluginCheckboxes = document.querySelectorAll(".fpp-plugin");
        pluginCheckboxes.forEach((checkbox: HTMLInputElement) => {
          checkbox.checked = (e.target as HTMLInputElement).checked;
        });
      });

    // Update "Select All" checkboxes when individual items are clicked
    document.getElementById("fppModsList")?.addEventListener("change", () => {
      const modCheckboxes = document.querySelectorAll(".fpp-mod");
      const selectAllMods = document.getElementById(
        "selectAllMods",
      ) as HTMLInputElement;

      if (selectAllMods) {
        selectAllMods.checked = Array.from(modCheckboxes).every(
          (cb: HTMLInputElement) => cb.checked,
        );

        selectAllMods.indeterminate =
          !selectAllMods.checked &&
          Array.from(modCheckboxes).some((cb: HTMLInputElement) => cb.checked);
      }
    });

    document
      .getElementById("fppPluginsList")
      ?.addEventListener("change", () => {
        const pluginCheckboxes = document.querySelectorAll(".fpp-plugin");
        const selectAllPlugins = document.getElementById(
          "selectAllPlugins",
        ) as HTMLInputElement;

        if (selectAllPlugins) {
          selectAllPlugins.checked = Array.from(pluginCheckboxes).every(
            (cb: HTMLInputElement) => cb.checked,
          );

          selectAllPlugins.indeterminate =
            !selectAllPlugins.checked &&
            Array.from(pluginCheckboxes).some(
              (cb: HTMLInputElement) => cb.checked,
            );
        }
      });

    // Rest of your existing FPP handlers...
    // ...existing code...
  }

  async handleImportFppClick() {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "FightPlanner Packages", extensions: ["fpp"] }],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        await this.handleFppFiles([{ path: result.filePaths[0] }]);
      }
    } catch (error) {
      this.showError("Failed to import FPP: " + error.message);
    }
  }

  async handleFppFiles(files) {
    try {
      await this.showLoading("Importing FPP package...");

      for (const file of files) {
        const result = await window.api.fppOperations.importFpp(file.path);

        if (result.success) {
          this.showToast("Package imported successfully", "success");
          await this.loadMods(); // Recharger la liste des mods
          await this.loadPlugins(); // Recharger la liste des plugins
        } else {
          this.showError("Failed to import package: " + result.error);
        }
      }
    } catch (error) {
      this.showError("Import error: " + error.message);
    } finally {
      this.hideLoading();
    }
  }

  initializeCategoryFilters() {
    const dropdownToggle = document.getElementById("toggleCategories");

    // Initialize the Bootstrap dropdown with options
    const dropdown = new bootstrap.Dropdown(dropdownToggle, {
      autoClose: true, // Enable auto-closing when clicking outside
    });

    const categoryItems = document.querySelectorAll(
      "#categoryFilters .dropdown-item[data-category]",
    );

    categoryItems.forEach((item: HTMLButtonElement) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent the dropdown from closing when clicking items

        const category = item.dataset.category;

        item.classList.toggle("active");

        if (item.classList.contains("active")) {
          this.selectedCategories.add(category);
        } else {
          this.selectedCategories.delete(category);
        }

        // Update button appearance
        if (this.selectedCategories.size > 0) {
          dropdownToggle.classList.add("btn-primary");
          dropdownToggle.classList.remove("btn-outline-secondary");
        } else {
          dropdownToggle.classList.remove("btn-primary");
          dropdownToggle.classList.add("btn-outline-secondary");
        }

        this.performSearch();
      });
    });

    // Clear filters handler
    const clearButton = document.getElementById("clearCategoryFilters");
    if (clearButton) {
      clearButton.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectedCategories.clear();
        categoryItems.forEach((item) => item.classList.remove("active"));
        dropdownToggle.classList.remove("btn-primary");
        dropdownToggle.classList.add("btn-outline-secondary");
        this.performSearch();
        dropdown.hide(); // Explicitly hide the dropdown after clearing
      });
    }
  }

  // Legacy mod discovery toggle
  initializeLegacyModDiscoveryToggle() {
    const legacyModDiscoveryToggle = document.getElementById(
      "legacyModDiscoveryToggle",
    ) as HTMLInputElement | undefined;

    if (legacyModDiscoveryToggle) {
      // Load current setting without showing notification
      window.api.settings
        .getLegacyModDiscovery()
        .then((enabled) => {
          // Set the checkbox without triggering the change event
          legacyModDiscoveryToggle.checked = enabled;
        })
        .catch((error) => {
          console.error("Failed to get legacy mod discovery setting:", error);
        });

      // Add change event listener
      legacyModDiscoveryToggle.addEventListener("change", async (e) => {
        try {
          const enabled = (e.target as HTMLInputElement).checked;
          await window.api.settings.setLegacyModDiscovery(enabled);
          console.log("Legacy mod discovery set to:", enabled);
        } catch (error) {
          console.error("Failed to set legacy mod discovery:", error);
          this.showError(
            "Failed to update legacy mod discovery setting: " + error.message,
          );
        }
      });
    } else {
      console.error("Legacy mod discovery toggle element not found");
    }
  }
}

// Add drag and drop handling
document.body.addEventListener("dragenter", (e) => {
  e.preventDefault();
  document.body.classList.add("dragging");
});

document.body.addEventListener("dragleave", (e) => {
  e.preventDefault();
  // Only remove class if we're leaving the body element itself
  const rect = document.body.getBoundingClientRect();
  if (
    e.clientX <= rect.left ||
    e.clientX >= rect.right ||
    e.clientY <= rect.top ||
    e.clientY >= rect.bottom
  ) {
    document.body.classList.remove("dragging");
  }
});

document.body.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.body.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dragging");
});

// Add a dragend event listener as a fallback
document.body.addEventListener("dragend", (e) => {
  e.preventDefault();
  document.body.classList.remove("dragging");
});

async function selectCustomCssFile() {
  const filePath = await window.electronAPI.selectCustomCssFile();
  if (filePath) {
    (document.getElementById("customCssPath") as HTMLInputElement).value =
      filePath;
    await window.electronAPI.setCustomCssPath(filePath);
  }
}

window.uiController = {
  selectCustomCssFile,
};

async function initializeUI() {
  await languageService.init();

  // Add language change handler
  const languageSelect = document.getElementById(
    "languageSelect",
  ) as HTMLSelectElement;
  languageSelect.value = languageService.currentLanguage;

  languageSelect.addEventListener("change", async (e) => {
    await languageService.loadTranslations(
      (e.target as HTMLSelectElement).value,
    );
  });
}

// Add this to your DOMContentLoaded event listener or initialization code
async function updateAppVersion() {
  try {
    const version = await window.api.getAppVersion();
    const versionBadge = document.getElementById("appVersionBadge");
    if (versionBadge) {
      versionBadge.textContent = `Version ${version}`;
    }
  } catch (error) {
    console.error("Failed to get app version:", error);
  }
}

// Call this when the credits modal is shown
document
  .getElementById("creditsModal")
  .addEventListener("show.bs.modal", updateAppVersion);

// Initialize the UI when the document is loaded
document.addEventListener("DOMContentLoaded", () => {
  const ui = new UIController();
  const openPluginsFolderButton = document.getElementById(
    "openPluginsFolderButton",
  );

  if (openPluginsFolderButton) {
    openPluginsFolderButton.addEventListener("click", () => {
      ui.handleOpenPluginsFolder();
    });
  }

  initializeUI();
});
