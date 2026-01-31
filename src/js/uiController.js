console.log('UIController loading...');
import { ModManager } from './modManager.js';
import ModConflictDetector from './modConflictDetector.js';
import { languageService } from './services/languageService.js';
import { ChangeSlots } from './changeSlots.js';
import { CharacterScanner } from './scanallfoldercharacter.js';
import { AnnouncementModal } from './announcementModal.js';
import { SmartRename } from './smartRename.js';

class UIController {
    constructor() {
        try {
            this.modManager = new ModManager();
            this.selectedMod = null;
            this.initializeEventListeners();
            this.loadSettings();
            this.loadMods();
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
            this.handleSelectCustomCssFile = this.handleSelectCustomCssFile.bind(this);
            this.handleAddDownloadField = this.handleAddDownloadField.bind(this);
            this.handleGameBananaDownload = this.handleGameBananaDownload.bind(this);
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
            this.activeDownloads = new Map();
            this.initializeDownloadsPanel();
            this.characterScanner = new CharacterScanner();
            this.initializeCharactersTab();
            this.initializeModSelection();
            this.initializeFppHandlers();
            this.selectedCategories = new Set();
            this.initializeCategoryFilters();
            this.initializeAnnouncementSystem();
            this.smartRename = new SmartRename();
            this.smartRenamePreviews = [];
            this.initializeSmartRenameHandlers();

            // Add event listener for update downloaded
            window.electron.onUpdateDownloaded((changelog) => {
                try {
                    this.showToast(`New update installed:\n${changelog}`, 'info');
                } catch (error) {
                    console.error('Error showing update toast:', error);
                }
            });

            // Add download status listener
            window.electron.onDownloadStatus((status) => {
                try {
                    const { id, type, message, modName, progress } = status;
                    
                    const downloadsList = document.getElementById('downloadsList');
                    if (!downloadsList) {
                        console.error('Downloads list element not found');
                        return;
                    }

                    // Remove "no downloads" message when adding first download
                    const noDownloadsMsg = downloadsList.querySelector('.nodownloadsmessage');
                    if (noDownloadsMsg && type === 'start') {
                        noDownloadsMsg.remove();
                    }

                    switch (type) {
                        case 'start':
                            this.addDownloadItem(id, message, modName);
                            break;
                        case 'progress':
                            this.updateDownloadProgress(id, message, progress, modName);
                            break;
                        case 'finish':
                        case 'error':
                        case 'cancelled':
                            this.completeDownload(id, type, message, modName);
                            break;
                    }
                } catch (error) {
                    console.error('Error handling download status:', error);
                }
            });

            // Refresh plugin list when main notifies updates
            if (window.electron?.ipcRenderer?.on) {
                window.electron.ipcRenderer.on('plugins-updated', async () => {
                    try { await this.loadPlugins(); } catch {}
                });
            }
        } catch (error) {
            console.error('UIController initialization error:', error);
            this.showError('Failed to initialize UI: ' + error.message);
        }
    }

    
    initializeLogoEvent() {
        const appLogo = document.getElementById('appLogo');
        
        if (appLogo) {
            // Add click event listener
            appLogo.addEventListener('click', this.showCreditsModal.bind(this));
            
            console.log('Logo event listener added');
        } else {
            console.error('App logo element not found');
        }
    }
    
    initializeLinkClickEvent() {
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target.tagName === 'A' && target.href.startsWith('http')) {
                event.preventDefault();
                window.api.openExternal(target.href);
            }
        });
    }

    initialize() {
        // Add event listener to the Install Mod button
        const installModButton = document.getElementById('installModButton');
        if (installModButton) {
            installModButton.addEventListener('click', () => this.showInstallModConfirmationDialog());
        }
    }

    // Placeholder method for showing errors
    showError(message) {
        // Create or update error toast
        let errorToast = document.getElementById('error-toast');
        
        if (!errorToast) {
            errorToast = document.createElement('div');
            errorToast.id = 'error-toast';
            errorToast.className = 'toast align-items-center text-bg-danger border-0';
            errorToast.setAttribute('role', 'alert');
            errorToast.setAttribute('aria-live', 'assertive');
            errorToast.setAttribute('aria-atomic', 'true');
            
            errorToast.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            `;
            
            document.body.appendChild(errorToast);
        } else {
            const toastBody = errorToast.querySelector('.toast-body');
            toastBody.textContent = message;
        }

        // Use Bootstrap toast if available
        if (window.bootstrap && window.bootstrap.Toast) {
            const toast = new window.bootstrap.Toast(errorToast);
            toast.show();
        } else {
            // Fallback toast display
            errorToast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: red;
                color: white;
                padding: 10px;
                border-radius: 5px;
                z-index: 9999;
            `;
            errorToast.style.display = 'block';
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                errorToast.style.display = 'none';
            }, 5000);
        }
    }

showToast(message, type = 'success') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }

    // Create the toast element
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0 show fade-in`;
    toast.role = 'alert';
    toast.ariaLive = 'assertive';
    toast.ariaAtomic = 'true';

    // Create the toast body
    const toastBody = document.createElement('div');
    toastBody.className = 'd-flex';
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

    const closeBtn = toast.querySelector('.btn-close');
if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toast.classList.remove('fade-in');
        toast.classList.add('fade-out');
        // Empêche Bootstrap de supprimer le toast tout de suite
        setTimeout(() => {
            toast.remove();
        }, 400); // 400ms = durée de l'animation CSS
    });
}
    
    // Remove toast with fade-out animation
    setTimeout(() => {
        toast.classList.remove('fade-in');
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 5000); // 5 seconds
}

async handleGameBananaDownload() {
    const linkInputs = document.querySelectorAll('.gameBananaLink');
    const links = Array.from(linkInputs)
        .map(input => input.value.trim())
        .filter(link => link);
    
    if (links.length === 0) {
        this.showToast('Please enter at least one GameBanana mod link', 'danger');
        return;
    }

    // Download each mod in parallel
    links.forEach(link => {
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
        const existingModal = document.getElementById('gameBananaDownloadModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', dialog);

        // Initialize and show the modal
        this.downloadModal = new bootstrap.Modal(document.getElementById('gameBananaDownloadModal'));
        this.downloadModal.show();

        // Add event listeners
        document.getElementById('addDownloadField').addEventListener('click', this.handleAddDownloadField);
        document.getElementById('confirmDownloadBtn').addEventListener('click', this.handleGameBananaDownload);
        document.getElementById('downloadFieldsContainer').addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-download-field') || event.target.closest('.remove-download-field')) {
                event.target.closest('.input-group').remove();
            }
        });
    }


    
    async downloadMod(url) {
        try {
            // Show loading
            await this.showLoading('Downloading mod...');
        
            // Download mod
            const filePath = await this.modDownloader.downloadMod(url);
            

            // Reload mods
            await this.loadMods();
            await this.showLoading('Reloading...');

            // Show success
            this.showSuccess('Mod downloaded successfully');

            return filePath;
        } catch (error) {
            console.error('Mod download error:', error);
            this.showError('Failed to download mod, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    showCreditsModal() {
        console.log('Credits modal triggered');
        
        // Use Bootstrap's modal method
        const creditsModal = new bootstrap.Modal(document.getElementById('creditsModal'));
        creditsModal.show();
    }

    initializeSearchBar() {
        console.log('Initializing search bar');
    
        // Get search elements
        this.searchInput = document.getElementById('modSearchInput');
        this.enabledFilter = document.getElementById('enabledFilter');
        this.disabledFilter = document.getElementById('disabledFilter');
    
        // Log elements for debugging
        console.log('Search elements:', {
            searchInput: this.searchInput ? 'Found' : 'Not Found',
            enabledFilter: this.enabledFilter ? 'Found' : 'Not Found', 
            disabledFilter: this.disabledFilter ? 'Found' : 'Not Found'
        });
    
        // Ensure elements exist before adding listeners
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.performSearch());
        }
    
        if (this.enabledFilter) {
            this.enabledFilter.addEventListener('change', () => this.performSearch());
        }
    
        if (this.disabledFilter) {
            this.disabledFilter.addEventListener('change', () => this.performSearch());
        }
    
        console.log('Search bar initialization complete');
    }
    
    async performSearch() {
        const searchTerm = document.getElementById('modSearchInput')?.value.toLowerCase() || '';
        const showEnabled = document.getElementById('enabledFilter')?.checked || false;
        const showDisabled = document.getElementById('disabledFilter')?.checked || false;
    
        // Filter mods based on search criteria
        const filteredMods = await Promise.all(this.mods.map(async mod => {
            try {
                // Name filter
                const matchesSearch = mod.name.toLowerCase().includes(searchTerm);
    
                // Enabled/Disabled filter
                const matchesEnabledFilter = 
                    (showEnabled && mod.enabled) || 
                    (showDisabled && !mod.enabled) || 
                    (!showEnabled && !showDisabled);
    
                // Get mod info from info.toml
                const modInfo = await window.api.modDetails.getInfo(mod.path);
                
                // Category filter - check if category from info.toml matches
                const matchesCategory = this.selectedCategories.size === 0 || 
                    (modInfo?.category && this.selectedCategories.has(modInfo.category));
    
                // For debugging
                if (this.selectedCategories.size > 0) {
                    console.log('Mod:', mod.name, 
                        'Category from info.toml:', modInfo?.category,
                        'Selected categories:', Array.from(this.selectedCategories),
                        'Matches:', matchesCategory);
                }
    
                // Only include mod if it matches all filters
                return matchesSearch && matchesEnabledFilter && matchesCategory ? mod : null;
    
            } catch (error) {
                console.error(`Error processing mod ${mod.name}:`, error);
                return matchesSearch && matchesEnabledFilter ? mod : null;
            }
        }));
    
        // Filter out null values and render the list
        this.renderModList(filteredMods.filter(mod => mod !== null));
    }

    // Method to update mods list
    updateMods(newMods) {
        this.mods = newMods;
        this.performSearch();
    }

    renderModList(mods) {
        const modList = document.getElementById('modList');
        
        // Clear existing list
        if (modList) {
            modList.innerHTML = '';

            // Render each mod
            mods.forEach(mod => {
                const modElement = this.createModElement(mod);
                modList.appendChild(modElement);
            });
        } else {
            console.error('Mod list element not found');
        }
    }

    createModElement(mod) {
        // Create a div for the mod
        const modElement = document.createElement('div');
        modElement.classList.add('mod-item');
        
        // Add enabled/disabled class
        modElement.classList.add(mod.enabled ? 'mod-enabled' : 'mod-disabled');

        // Set mod details
        modElement.innerHTML = `
            <span class="mod-name">${mod.name}</span>
            <span class="mod-status">${mod.enabled ? 'Enabled' : 'Disabled'}</span>
            <!-- Add more mod details as needed -->
        `;

        return modElement;
    }

    // Method to handle mod download and update
    handleModDownload(downloadedMod) {
        // Add the new mod to the list
        this.mods.push(downloadedMod);
        
        // Trigger search to refresh the list
        this.performSearch();
    }

    // Reinitialize search bar (useful after dynamic content changes)
    reinitializeSearchBar() {
        // Remove existing listeners
        if (this.searchInput) {
            this.searchInput.removeEventListener('input', () => this.performSearch());
        }
        if (this.enabledFilter) {
            this.enabledFilter.removeEventListener('change', () => this.performSearch());
        }
        if (this.disabledFilter) {
            this.disabledFilter.removeEventListener('change', () => this.performSearch());
        }

        // Reinitialize
        this.initializeSearchBar();
    }

    initializeErrorHandling() {
        // Create a container for error messages if it doesn't exist
        if (!document.getElementById('error-container')) {
            const errorContainer = document.createElement('div');
            errorContainer.id = 'error-container';
            errorContainer.classList.add('error-container');
            document.body.appendChild(errorContainer);
        }
    }
    showError(message) {
        console.error('Error:', message);

        // Find or create error container
        let errorContainer = document.getElementById('error-container');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.id = 'error-container';
            errorContainer.classList.add('error-container');
            document.body.appendChild(errorContainer);
        }

        // Create error message element
        const errorElement = document.createElement('div');
        errorElement.classList.add('error-message');
        errorElement.textContent = message;

        // Add to container
        errorContainer.appendChild(errorElement);

        // Remove after 3 seconds
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.parentNode.removeChild(errorElement);
            }
        }, 3000);
    }

    // Add CSS for error container and messages
    addErrorStyles() {
        const style = document.createElement('style');
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

    isValidModName(name) {
        // Basic validation
        return name && 
               name.trim().length > 0 && 
               name.trim().length <= 255 && 
               !/[<>:"/\\|?*]/g.test(name.trim());
    }
    initializeDarkMode() {
        // Load dark mode setting
        window.api.settings.getDarkMode().then(enabled => {
            this.updateThemeSelector(enabled);
            this.applyDarkMode(enabled);
        });

        // Theme selector event listeners
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                const isDark = option.dataset.theme === 'dark';
                window.api.settings.setDarkMode(isDark);
                this.updateThemeSelector(isDark);
                this.applyDarkMode(isDark);
            });
        });
    }

    updateThemeSelector(isDark) {
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.toggle('active', option.dataset.theme === (isDark ? 'dark' : 'light'));
        });
    }

    applyDarkMode(enabled) {
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    async loadSettings() {
        try {
            const modsPath = await window.api.settings.getModsPath();
            document.getElementById('modsPath').value = modsPath || 'No folder selected';

            const customCssPath = await window.api.settings.getCustomCssPath();
            document.getElementById('customCssPath').value = customCssPath || 'No folder selected';

            const pluginsPath = await window.api.settings.getPluginsPath();
            document.getElementById('pluginsPath').value = pluginsPath || 'No folder selected';
        } catch (error) {
            this.showError('Failed to load settings, error: ' + error.message);
        }
    }

async loadMods() {
    let spinner;
    try {
        // Affiche l'overlay uniquement pour le chargement initial
        await this.showLoading('Loading mods...');

        const mods = await window.api.modOperations?.loadMods?.() ?? await this.modManager.loadMods();
        this.mods = mods;

        // On cache l'overlay dès que les mods sont chargés
        this.hideLoading();

        // Affiche le spinner de conflit dans la top bar
        spinner = document.getElementById('conflictLoadingSpinner');
        if (spinner) spinner.style.display = 'inline-block';

        const conflictCheckEnabled = await window.api.settings.getConflictCheckEnabled();
        this.conflicts = new Map();

        if (conflictCheckEnabled) {
            const spinnerEl = document.getElementById('conflictLoadingSpinner');
            const tipEl = spinnerEl ? spinnerEl.querySelector('#conflictSpinnerTip') : null;
            if (tipEl) tipEl.textContent = 'Checking conflicts…';

            const conflicts = await this.conflictDetector.detectConflicts(this.mods, (modName) => {
                if (tipEl) tipEl.textContent = `Checking conflicts: ${modName}`;
            });
            const conflictedMods = new Set();

            for (const mods of conflicts.values()) {
                mods.forEach(modName => conflictedMods.add(modName));
            }

            // Marque les mods avec conflits
            this.mods.forEach(mod => {
                mod.hasConflict = conflictedMods.has(mod.name);
            });

            this.conflicts = conflicts;

            if (conflicts.size > 0) {
                this.showConflictsWarning?.(conflicts);
                this.conflictButton.style.display = 'inline-block';
                window.electron.ipcRenderer.send('play-conflict-audio');
            } else {
                this.conflictButton.style.display = 'none';
            }
        } else {
            this.conflictButton.style.display = 'none';
        }

        // Mise à jour Discord RPC
        window.api.discordRpc.updateModCount(this.mods.length);

        // Affichage + recherche
        this.renderModList(this.mods);
        this.initializeSearchBar?.();
        this.performSearch?.();
    } catch (error) {
        console.error('Error loading mods:', error);
        this.showError(`Failed to load mods: ${error.message}`);
    } finally {
        // Cache le spinner de conflit
        if (!spinner) spinner = document.getElementById('conflictLoadingSpinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
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
    const modList = document.getElementById('modList');
    modList.innerHTML = '';

    if (!mods || mods.length === 0) {
        modList.innerHTML = `
            <div class="text-center p-4 textmuted">
                <i class="bi bi-inbox-fill fs-1"></i>
                <p class="mt-2">No mods found</p>
            </div>
        `;
        return;
    }

    modList.innerHTML = mods.map(mod => {
        let iconHtml = '';
        if (mod.hasConflict) {
            // Icône de conflit : cercle jaune avec point d'exclamation
            iconHtml = `<i class="bi bi-exclamation-circle-fill text-warning"></i>`;
        } else if (mod.enabled) {
            iconHtml = `<i class="bi bi-check-circle-fill text-success"></i>`;
        } else {
            iconHtml = `<i class="bi bi-x-circle-fill text-danger"></i>`;
        }
        return `
            <div class="mod-item ${mod.enabled ? 'enabled' : 'disabled'}" data-mod-id="${mod.id}">
                <div class="mod-status me-3">
                    ${iconHtml}
                </div>
                <div>
                    <div class="fw-medium">${this.escapeHtml(mod.name)}</div>
                </div>
            </div>
        `;
    }).join('');
}

    initializeEventListeners() {
    // Rename mod in context menu
    const contextMenu = document.getElementById('contextMenu');
    const renameModOption = contextMenu.querySelector('#renameMod');

    const downloadButton = document.getElementById('gameBananaDownloadBtn');
    if (downloadButton) {
        downloadButton.addEventListener('click', () => this.showGameBananaDownloadDialog());
    }


    // Remove existing listeners first
    const oldRenameOption = renameModOption.cloneNode(true);
    renameModOption.parentNode.replaceChild(oldRenameOption, renameModOption);

    oldRenameOption.addEventListener('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        // Close context menu
        contextMenu.classList.remove('show');

        // Call rename method
        await this.handleRenameMod();
    });
        // Button handlers
        document.getElementById('installMod').addEventListener('click', () => this.handleInstallMod());
        document.getElementById('uninstallMod').addEventListener('click', () => this.handleUninstallMod());
        document.getElementById('openFolder').addEventListener('click', () => this.handleOpenFolder());
        document.getElementById('reloadList').addEventListener('click', () => this.handleReloadList());
        document.getElementById('selectModsFolder').addEventListener('click', () => this.handleSelectModsFolder());

        // Mod selection
        document.getElementById('modList').addEventListener('click', (e) => {
            const modItem = e.target.closest('.mod-item');
            if (modItem) {
                this.selectMod(modItem.dataset.modId);
            }
        });

        // Context menu
        document.getElementById('modList').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const modItem = e.target.closest('.mod-item');
            if (modItem) {
                // Hide any existing context menu first
                document.getElementById('contextMenu').style.display = 'none';
                // Show new context menu
                this.showContextMenu(e, modItem.dataset.modId);
            }
        });

        // Context menu items
        document.getElementById('toggleMod').addEventListener('click', () => this.handleToggleMod());
        document.getElementById('openModFolder').addEventListener('click', () => this.handleOpenModFolder());
        document.getElementById('renameMod').addEventListener('click', () => this.handleRenameMod());
        document.getElementById('smartRenameMod').addEventListener('click', () => this.handleSmartRenameSingleMod());
        document.getElementById('changeSlots').addEventListener('click', () => {
            if (this.selectedMod) {
                this.showChangeSlotsDialog([this.selectedMod]);
            } else {
                this.showError('Please select at least one mod');
            }
        });

        // Hide context menu when clicking outside
        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('contextMenu');
            const modItem = e.target.closest('.mod-item');
            const isContextMenuClick = e.target.closest('#contextMenu');
            
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
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over
    dropZone.addEventListener('dragenter', highlight, false);
    dropZone.addEventListener('dragover', highlight, false);
    dropZone.addEventListener('dragleave', unhighlight, false);
    dropZone.addEventListener('drop', handleDrop, false);

    // Prevent default drag behaviors
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    

window.electron.onProtocolUrl(async (data) => {
    try {
        const { url, skipConfirmation } = data;
        const modUrl = parseFightPlannerUrl(url);
        console.log('Converted Mod URL:', modUrl);
        console.log('Skip confirmation:', skipConfirmation);

        let shouldInstall = false;

        if (skipConfirmation) {
            shouldInstall = true;
        } else {
            // Show confirmation modal with optional GameBanana thumbnail
            // Try to fetch GameBanana thumbnail using the mod id extracted from the protocol URL
            const modId = (typeof modUrl === 'object' && modUrl?.id) ? modUrl.id : null;
            let thumbnailUrl = null;
            try {
                thumbnailUrl = await this.fetchGameBananaThumbnail(modId);
                if (thumbnailUrl) {
                    console.log('Protocol mod thumbnail URL:', thumbnailUrl);
                } else {
                    console.log('No thumbnail URL found for mod id', modId);
                }
            } catch (e) {
                console.warn('Failed to retrieve GameBanana thumbnail:', e);
            }

            const displayUrl = typeof modUrl === 'string' ? modUrl : (modUrl?.downloadLink || '');
            const thumbImgHtml = thumbnailUrl
                ? `<div class="text-center mb-2"><img src="${thumbnailUrl}" alt="Mod thumbnail" class="img-fluid rounded" style="max-height: 240px; object-fit: cover;" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; console.warn('Failed to load thumbnail image:', this.src);"></div>`
                : '';

            shouldInstall = await new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'modal fade';
                modal.tabIndex = -1;
                modal.innerHTML = `
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Install Mod</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                ${thumbImgHtml}
                                <p>Do you want to install this mod?</p>
                                <p><strong>URL:</strong> ${displayUrl}</p>
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

                modal.querySelector('#confirmInstall').addEventListener('click', () => {
                    resolve(true);
                    bsModal.hide();
                });

                modal.addEventListener('hidden.bs.modal', () => {
                    resolve(false);
                    document.body.removeChild(modal);
                });
            });
        }

        if (shouldInstall) {
            this.showToast('Mod download started !', 'success');
            const result = await window.electron.downloadMod(modUrl);
            this.updateLoadingMessage('Finishing up...');
            console.log('Mod downloaded successfully:', result);
            this.showToast('Mod downloaded successfully', 'success');
            this.updateLoadingMessage('Reloading Mods...');
            this.loadMods();
        }
    } catch (error) {
        console.error('Error downloading mod:', error);
        this.showError('Failed to download mod: ' + error.message);
    } finally {
        this.hideLoading();
    }
});

    function highlight() {
        dropZone.classList.add('drag-over');
    }

function parseFightPlannerUrl(url) {
    try {
        // Remove the protocol prefix
        const cleanUrl = url.replace('fightplanner:', '');

        // Split the URL components
        const [gbUrl, type, id, fileExt] = cleanUrl.split(',');

        // Extract the download ID (mmdl number)
        const downloadId = gbUrl.split('/').pop();

        // Depending on the type, construct the appropriate GameBanana URL
        let properGbUrl;
        if (type.toLowerCase() === 'mod') {
            properGbUrl = `https://gamebanana.com/mods/download/${id}#FileInfo_${downloadId}`;
        } else if (type.toLowerCase() === 'sound') {
            properGbUrl = `https://gamebanana.com/sounds/download/${id}#FileInfo_${downloadId}`;
        } else {
            throw new Error('Unsupported content type');
        }

        return {
            downloadLink: properGbUrl,
            type: type,
            id: id,
            fileExt: fileExt
        };
    } catch (error) {
        console.error('Error parsing FightPlanner URL:', error);
        throw new Error('Invalid FightPlanner URL format');
    }
}

    // Remove highlight
    function unhighlight() {
        dropZone.classList.remove('drag-over');
    }

    // Handle drop event
    async function handleDrop(e) {
        unhighlight();
        
        const dt = e.dataTransfer;
        const files = dt.files;

        handleFiles(files);
    }

    
    
    // Handle files
    const handleFiles = async (files) => {
        // Convert FileList to Array and filter
        const validFiles = Array.from(files).filter(file => {
            const validExtensions = ['.zip', '.rar', '.7z', '.nro'];
            return validExtensions.some(ext => 
                file.name.toLowerCase().endsWith(ext.toLowerCase())
            );
        });

        // If no valid files, show error
        if (validFiles.length === 0) {
            this.showError('No valid mod or plugin files found. Please drop .zip, .rar, .7z, or .nro files.');
            return;
        }

        try {
            // Show loading
            await this.showLoading('Installing files...');

            // Track installation results
            const installResults = [];

            // Install each dropped file
            for (const file of validFiles) {
                const ext = file.name.split('.').pop().toLowerCase();
                if (ext === 'nro') {
                    // Handle .nro files as plugins
                    const result = await window.api.pluginOperations.installPlugin(file.path);
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
            console.error('Drag and drop installation error:', error);
            this.showError('Failed to install files: ' + error.message);
        } finally {
            this.hideLoading();
        }
    };

    // Drag and drop for plugins
    const pluginDropZone = document.getElementById('pluginList');
    if (pluginDropZone) {
        pluginDropZone.addEventListener('dragover', (e) => e.preventDefault());
        pluginDropZone.addEventListener('drop', (e) => this.handlePluginDrop(e));
    }

    // Add FPP creation button handler
    const createFppBtn = document.getElementById('createFpp');
    if (createFppBtn) {
        createFppBtn.addEventListener('click', () => this.showCreateFppDialog());
    }

    // Add FPP confirm button handler
    document.getElementById('createFppBtn')?.addEventListener('click', () => this.createFpp());

    // Add keyboard shortcuts
    document.addEventListener('keydown', async (e) => {
        // Only handle keystrokes if we're not in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Delete key for uninstalling selected mod
        if (e.key === 'Delete' && this.selectedMod) {
            this.handleUninstallMod();
        }
    });

    // Add enter key handler for confirmation modals
    const confirmationModal = document.getElementById('confirmationModal');
    if (confirmationModal) {
        confirmationModal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const confirmButton = confirmationModal.querySelector('#confirmUninstallBtn');
                if (confirmButton) {
                    confirmButton.click();
                }
            }
        });
    }

    // Add vertical resize handler
    this.initializeVerticalResizer();

    // Add handlers for enable/disable all mods buttons
    const enableAllModsBtn = document.getElementById('enableAllModsBtn');
    const disableAllModsBtn = document.getElementById('disableAllModsBtn');

    if (enableAllModsBtn) {
        enableAllModsBtn.addEventListener('click', async () => {
            try {
                await this.showLoading('Enabling all mods...');
                await window.api.modOperations.enableAllMods();
                await this.loadMods();
                this.showToast('All mods enabled successfully', 'success');
            } catch (error) {
                console.error('Failed to enable all mods:', error);
                this.showError('Failed to enable all mods: ' + error.message);
            } finally {
                this.hideLoading();
            }
        });
    }

    if (disableAllModsBtn) {
        disableAllModsBtn.addEventListener('click', async () => {
            try {
                const confirmed = await this.showConfirmationModal('Are you sure you want to disable all mods?');
                if (!confirmed) return;

                await this.showLoading('Disabling all mods...');
                await window.api.modOperations.disableAllMods();
                await this.loadMods();
                this.showToast('All mods disabled successfully', 'success');
            } catch (error) {
                console.error('Failed to disable all mods:', error);
                this.showError('Failed to disable all mods: ' + error.message);
            } finally {
                this.hideLoading();
            }
        });
    }
}

initializeVerticalResizer() {
    const resizer = document.querySelector('.resizer-horizontal');
    if (!resizer) return;

    const modPreview = document.querySelector('.mod-preview');
    const modMetadata = document.querySelector('.mod-metadata');

    let startY = 0;
    let startHeightPreview = 0;
    let startHeightMetadata = 0;

    const startResize = (e) => {
        startY = e.clientY;
        startHeightPreview = modPreview.offsetHeight;
        startHeightMetadata = modMetadata.offsetHeight;
        document.documentElement.style.cursor = 'row-resize';

        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
    };

    const resize = (e) => {
        const diffY = e.clientY - startY;
        modPreview.style.height = `${startHeightPreview + diffY}px`;
        modMetadata.style.height = `${startHeightMetadata - diffY}px`;
    };

    const stopResize = () => {
        document.documentElement.style.cursor = '';
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
    };

    resizer.addEventListener('mousedown', startResize);
}

// Provide detailed feedback about installations
provideInstallationFeedback(results) {
    const successfulInstalls = results.filter(r => r.success);
    const failedInstalls = results.filter(r => !r.success);

    if (successfulInstalls.length > 0) {
        this.showSuccess(`Successfully installed ${successfulInstalls.length} mod(s)`);
    }

    if (failedInstalls.length > 0) {
        const errorMessages = failedInstalls.map(f => 
            `• ${f.fileName}: ${f.error}`
        ).join('\n');

        this.showError(`Failed to install ${failedInstalls.length} mod(s):\n${errorMessages}`);
    }
    }

    async handleInstallMod() {
        try {
            const result = await window.api.dialog.showOpenDialog({ 
                filters: [
                    { 
                        name: 'Mod Files', 
                        extensions: ['zip', '7z', 'rar', 'fpp'] 
                    }
                ],
                properties: ['openFile']
            });
    
            if (!result.canceled) {
                await this.showLoading('Installing mod...');
                const filePath = result.filePaths[0];
                
                // Vérifier si c'est un fichier FPP
                if (filePath.toLowerCase().endsWith('.fpp')) {
                    const importResult = await window.api.fppOperations.importFpp(filePath);
                    if (importResult.success) {
                        this.showToast('FPP package imported successfully', 'success');
                        await this.loadMods();
                        await this.loadPlugins();
                    } else {
                        this.showError('Failed to import FPP: ' + importResult.error);
                    }
                } else {
                    // Installation normale de mod
                    const installedMod = await window.api.modOperations.installMod(filePath);
                    if (installedMod) {
                        this.showToast('Mod installed successfully', 'success');
                        await this.loadMods();
                    }
                }
            }
        } catch (error) {
            console.error('Full installation error:', error);
            this.showError('Failed to install: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // Ensure these methods are bound or use arrow functions
    showError(message) {
        // Your error showing logic
        console.error(message);
    }

    async handleUninstallMod() {
        this.hideContextMenu();
        if (!this.selectedMod) {
            this.showError('Please select a mod to uninstall');
            return;
        }

        if (await this.showConfirmationModal('Are you sure you want to uninstall this mod?')) {
            try {
                await this.showLoading('Uninstalling mod...');
                await this.modManager.uninstallMod(this.selectedMod);
                await this.loadMods();
                this.selectedMod = null;
                this.updateModPreview();
                this.showSuccess('Mod uninstalled successfully');
            } catch (error) {
                this.showError('Failed to uninstall mod, Cause ' +  ': ' + error.message);
            } finally {
                this.hideLoading();
            }
        }
    }


    
    async handleOpenFolder() {
        try {
            await window.api.modOperations.openModsFolder();
            // Update Discord RPC
            window.api.discordRpc.setActivity({
                state: 'Browsing Mods Folder',
                details: 'Exploring Mod Collection',
                largeImageKey: 'app_logo',
                largeImageText: 'FightPlanner'
            });
        } catch (error) {
            this.showError('Failed to open mods folder, Cause ' +  ': ' + error.message);
        }
    }

    async handleReloadList() {
        try {
            await this.showLoading('Reloading mods...');
            await this.loadMods();
            this.showSuccess('Mods reloaded successfully');
        } catch (error) {
            this.showError('Failed to reload mods, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleSelectModsFolder() {
        try {
            const result = await window.api.dialog.showOpenDialog({
                properties: ['openDirectory']
            });

            if (!result.canceled) {
                await this.showLoading('Updating mods folder...');
                await window.api.settings.setModsPath(result.filePaths[0]);
                document.getElementById('modsPath').value = result.filePaths[0];
                await this.loadMods();
                this.showSuccess('Mods folder updated successfully');
                
                // Update Discord RPC
                window.api.discordRpc.setActivity({
                    state: 'Updating Mods Folder',
                    details: 'Changing Mods Directory',
                    largeImageKey: 'app_logo',
                    largeImageText: 'FightPlanner'
                });
            }
        } catch (error) {
            this.showError('Failed to update mods folder, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleToggleMod() {
        if (!this.selectedMod) return;

        try {
            await this.showLoading('Toggling mod...');
            await this.modManager.toggleMod(this.selectedMod);
            await this.loadMods();
            this.showSuccess('Mod toggled successfully');
            
            // Update Discord RPC
            window.api.discordRpc.updateModCount(this.mods.length);
        } catch (error) {
            this.showError('Failed to toggle mod, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
            this.hideContextMenu();
        }
    }

hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    menu.classList.remove('show');
}

    async handleOpenModFolder() {
        if (!this.selectedMod) return;

        try {
            await this.modManager.openModFolder(this.selectedMod);
        } catch (error) {
            this.showError('Failed to open mod folder, Cause ' +  ': ' + error.message);
        } finally {
            this.hideContextMenu();
        }
    }

    
    async handleRenameMod() {
        if (this.isDialogOpen) return;
    
        if (!this.selectedMod) {
            this.showError('No mod selected');
            return;
        }
    
        try {
            this.isDialogOpen = true;
    
            const currentName = this.selectedMod;
            
            const newName = await this.promptDialog(
                'Rename Mod', 
                'Enter a new name for the mod:',
                currentName
            );
    
            this.isDialogOpen = false;
    
            // Trim and validate the new name
            const trimmedNewName = newName ? newName.trim() : '';
    
            if (trimmedNewName && trimmedNewName !== currentName) {
                await this.showLoading('Renaming mod...');
                
                if (!this.isValidModName(trimmedNewName)) {
                    this.showError('Invalid mod name');
                    return;
                }
    
                try {
                    // Call rename method
                    await window.api.modOperations.renameMod(currentName, trimmedNewName);
    
                    // Reload mods
                    await this.loadMods();
                    
                    // Select the newly renamed mod
                    await this.selectMod(trimmedNewName);
                    
                    this.showSuccess('Mod renamed successfully');
                    
                    // Update Discord RPC
                    window.api.discordRpc.updateModCount(this.mods.length);
                } catch (renameError) {
                    console.error('Rename error:', renameError);
                    this.showError(`Failed to rename mod: ${renameError.message}`);
                } finally {
                    this.hideLoading();
                }
            }
        } catch (error) {
            console.error('Rename dialog error:', error);
            this.isDialogOpen = false;
        }
    }
    
    // Validate mod name method
    isValidModName(name) {
        // Basic validation
        return name && 
               name.trim().length > 0 && 
               name.trim().length <= 255 && 
               !/[<>:"/\\|?*]/g.test(name.trim());
    }
    
async promptDialog(title, message, defaultValue) {
    return new Promise((resolve) => {
        const modalId = 'renameModal';
        
        // Remove existing modal if it exists
        let existingModal = document.getElementById(modalId);
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'modal fade';
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
                        <input type="text" class="form-control" value="${defaultValue || ''}">
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
        modal.querySelector('#confirmRename').addEventListener('click', () => {
            const input = modal.querySelector('input');
            const value = input?.value;
            resolve(value);
            bsModal.hide();
        });

        // Handle Enter key press
        modal.querySelector('input').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const value = e.target.value;
                bsModal.hide();
                resolve(value);
            }
        });

        // Handle modal close/dismiss
        modal.addEventListener('hidden.bs.modal', () => {
            resolve(null); // Return null on cancel/dismiss
            modal.remove(); // Remove modal from DOM
        });

        bsModal.show();
    });
}

    selectMod(modId) {
        document.querySelectorAll('.mod-item').forEach(item => {
            item.classList.remove('selected');
        });

        const modItem = document.querySelector(`[data-mod-id="${modId}"]`);
        if (modItem) {
            modItem.classList.add('selected');
            this.selectedMod = modId;
            this.updateModPreview(modId);
        }
    }

    showContextMenu(event, modId) {
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.classList.remove('show');
        contextMenu.style.left = '-9999px';
        contextMenu.style.top = '-9999px';
        contextMenu.style.display = 'block'; // Pour mesurer

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
            contextMenu.classList.add('show');
        }, 10);

        this.selectedMod = modId;
    }

    async showLoading(message = 'Loading...') {
        let loadingOverlay = document.getElementById('loading-overlay');
        console.log('Showing loading message:', message);
        
        if (!loadingOverlay) return;
        window.electron.ipcRenderer.send('play-loading-audio');
        const messageElement = loadingOverlay.querySelector('#loadingMessage');
        if (messageElement) {
            messageElement.textContent = message;
        }
    
        // Show overlay
        loadingOverlay.classList.add('visible');
    
        // Add close button event listener
        const closeBtn = document.getElementById('closeLoadingBtn');
        if (closeBtn) {
            closeBtn.onclick = () => this.hideLoading();
        }
    
        // Show/hide cancel button based on if it's a download
        const cancelBtn = document.getElementById('cancelDownloadBtn');
        if (cancelBtn) {
            cancelBtn.style.display = message.toLowerCase().includes('download') ? 'block' : 'none';
            
            // Remove old listener before adding new one
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            
            // Add new listener
            document.getElementById('cancelDownloadBtn').addEventListener('click', async () => {
                try {
                    await window.electron.cancelDownload();
                    this.hideLoading();
                    this.showToast('Download cancelled', 'info');
                } catch (error) {
                    console.error('Error cancelling download:', error);
                    this.showError('Failed to cancel download: ' + error.message);
                }
            });
        }
    }
    
    hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            window.electron.ipcRenderer.send('stop-loading-audio');
            loadingOverlay.classList.add('fade-out');
            // Remove the overlay from DOM after transition completes
            setTimeout(() => {
                loadingOverlay.classList.remove('visible', 'fade-out');
            }, 300); // Match this with the CSS transition duration
        }
    }

    updateLoadingMessage(message) {
        const messageElement = document.querySelector('#loadingMessage');
        if (messageElement) {
            messageElement.classList.remove('loading-message-fade');
            // Trigger reflow
            void messageElement.offsetWidth;
            messageElement.textContent = message;
            messageElement.classList.add('loading-message-fade');
        }
    }

    // Fetch the first GameBanana thumbnail URL for a given Mod ID
    async fetchGameBananaThumbnail(modId) {
        try {
            if (!modId) return null;
            const apiUrl = `https://gamebanana.com/apiv11/Mod/${encodeURIComponent(modId)}?_csvProperties=%40gbprofile`;

            // 7s timeout to avoid hanging the confirm modal
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 7000);

            const resp = await fetch(apiUrl, {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            const obj = Array.isArray(data) ? (data[0] || {}) : data;

            // Prefer _aImages as requested; fall back to other common fields if present
            const images = obj?._aImages || obj?._aPreviewMedia || obj?._aMedia || [];
            if (!images || images.length === 0) return null;

            const first = images[0] || {};
            const imgNode = first._aImage || first;
            // Some responses provide a full URL as _sUrl
            if (imgNode._sUrl || imgNode._sURL) {
                return imgNode._sUrl || imgNode._sURL;
            }
            const base = imgNode._sBaseUrl || imgNode._sbaseUrl || 'https://images.gamebanana.com/img/ss/mods';
            const file = imgNode._sFile || imgNode._sFilename || imgNode._sFileName || first._sFile || first._sFileName;
            if (!file) return null;

            const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
            const normalizedFile = String(file).startsWith('/') ? String(file).slice(1) : String(file);
            return `${normalizedBase}/${normalizedFile}`;
        } catch (err) {
            console.warn('fetchGameBananaThumbnail failed:', err);
            return null;
        }
    }

    showError(message) {
        // Log the error message to the console
        console.error('Error:', message );
    
        // Create error toast container if it doesn't exist
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
    
        // Create the toast element
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-danger border-0 show';
        toast.role = 'alert';
        toast.ariaLive = 'assertive';
        toast.ariaAtomic = 'true';
    
        // Create the toast body
        const toastBody = document.createElement('div');
        toastBody.className = 'd-flex';
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
            const confirmationModal = new bootstrap.Modal(document.getElementById('confirmationModal'));
            const confirmUninstallBtn = document.getElementById('confirmUninstallBtn');
    
            // Set the message
            document.querySelector('#confirmationModal .modal-body').textContent = message;
    
            // Add event listener for the confirm button
            confirmUninstallBtn.onclick = () => {
                resolve(true);
                confirmationModal.hide();
            };
    
            // Show the modal
            confirmationModal.show();
    
            // Add event listener for the cancel button
            document.querySelector('#confirmationModal .btn-secondary').onclick = () => {
                resolve(false);
                confirmationModal.hide();
            };
        });
    }

    async showPrompt(message, defaultValue) {
        return prompt(message, defaultValue); // Replace with a better prompt dialog
    }
    async selectMod(modId) {
        console.log('Selecting mod:', modId);
        console.log('All mod items:', document.querySelectorAll('.mod-item'));
        
        // Find the specific mod item
        const modItem = document.querySelector(`[data-mod-id="${modId}"]`);
        console.log('Mod item found:', modItem);
    
        if (modItem) {
            // Remove selection from all items
            document.querySelectorAll('.mod-item').forEach(item => {
                item.classList.remove('selected');
            });
    
            // Add selection to clicked item
            modItem.classList.add('selected');
            this.selectedMod = modId;
    
            try {
                console.log('Calling updateModPreview');
                await this.updateModPreview(modId);
                const mod = await this.modManager.getMod(modId);
            } catch (error) {
                console.error('Error in selectMod:', error);
            }
        } else {
            console.error('No mod item found for ID:', modId);
            this.showError(`Mod "${modId}" not found`);
        }
    }
    
async updateModPreview(modId) {
    const modMetadata = document.getElementById('modMetadata');
    if (!modMetadata) {
        console.error('Metadata container not found');
        return;
    }

    let metadataContent = modMetadata.querySelector('.metadata-content');
    if (!metadataContent) {
        metadataContent = document.createElement('div');
        metadataContent.className = 'metadata-content';
        modMetadata.appendChild(metadataContent);
    }

    const modImage = document.getElementById('modImage');
    if (!modImage) {
        console.error('Mod image element not found');
        return;
    }

    // Add error handler to show broken image placeholder
    modImage.onerror = () => {
        modImage.src = 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
                <rect width="200" height="200" fill="#f5f5f5"/>
                <text x="50%" y="50%" fill="#999" font-family="Arial" font-size="16" text-anchor="middle">
                    No Image Available
                </text>
                <path d="M60,40 L140,160 M140,40 L60,160" stroke="#999" stroke-width="4"/>
            </svg>
        `);
    };

    // Clear preview if no mod selected
    if (!modId) {
        metadataContent.innerHTML = `<p class="textmuted">${await languageService.translate('mods.details.selectToView')}</p>`;
        modImage.src = '';
        return;
    }

    try {
        const mod = await this.modManager.getMod(modId);
        if (!mod) {
            metadataContent.innerHTML = `<p class="text-danger">${await languageService.translate('metadata.unknown')}</p>`;
            modImage.src = '';
            return;
        }

        try {
            const [previewPath, modInfo] = await Promise.all([
                window.api.modDetails.getPreview(mod.path),
                window.api.modDetails.getInfo(mod.path)
            ]);

            modImage.src = previewPath || '';

            // If no info.toml exists or it's empty, show the "no description" message
            if (!modInfo) {
                metadataContent.innerHTML = `
                    <div class="alert alert-warning">
                        <p>${await languageService.translate('mods.details.title')}:</p>
                        <h5>${this.escapeHtml(mod.name)}</h5>
                        <p class="text-muted">${await languageService.translate('metadata.description.empty')}</p>
                    </div>
                `;
                return;
            }

            // Build metadata HTML with translations
            const metadataHtml = `
                <h5>${this.escapeHtml(modInfo?.display_name || modInfo?.mod_name || mod.name)}</h5>
                ${modInfo?.version ? `
                    <p><strong>${await languageService.translate('metadata.version.label')}:</strong> 
                    ${this.escapeHtml(modInfo.version)}</p>` : ''
                }
                ${modInfo?.authors ? `
                    <p><strong>${await languageService.translate('metadata.author.name')}:</strong> 
                    ${this.escapeHtml(modInfo.authors)}</p>` : ''
                }
                ${modInfo?.category ? `
                    <p><strong>${await languageService.translate('metadata.category.label')}:</strong> 
                    ${await languageService.translate(`metadata.category.${modInfo.category.toLowerCase()}`) || this.escapeHtml(modInfo.category)}</p>` : ''
                }
                ${typeof modInfo?.wifi_safe !== 'undefined' ? `
                    <p><strong>${await languageService.translate('mods.details.wifiSafe')}:</strong> 
                    ${modInfo.wifi_safe ? '✔️' : '❌'}</p>` : ''
                }
                ${modInfo?.description ? `
                    <div class="description-section">
                        <strong>${await languageService.translate('metadata.description.title')}:</strong>
                        <p class="description-text">
                            ${this.escapeHtml(modInfo.description)}
                        </p>
                    </div>` : ''
                }
                ${modInfo?.url ? `
                    <p><strong>${await languageService.translate('metadata.author.website')}:</strong> 
                    <a href="#" onclick="window.api.openExternal('${this.escapeHtml(modInfo.url)}'); return false;">
                        ${this.escapeHtml(modInfo.url)}
                    </a></p>` : ''
                }
            `;
            
            metadataContent.innerHTML = metadataHtml;

            // Add event listener for description toggle
            const toggleBtn = metadataContent.querySelector('.toggle-description');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', async (e) => {
                    const descText = e.target.parentElement;
                    const isExpanded = e.target.dataset.expanded === 'true';
                    descText.style.maxHeight = isExpanded ? '100px' : 'none';
                    e.target.textContent = await languageService.translate(
                        isExpanded ? 'metadata.description.readMore' : 'metadata.description.readLess'
                    );
                    e.target.dataset.expanded = !isExpanded;
                });
            }

        } catch (error) {
            console.error('Error loading mod details:', error);
            metadataContent.innerHTML = `
                <div class="alert alert-warning">
                    <p>${await languageService.translate('mods.details.title')}:</p>
                    <h5>${this.escapeHtml(mod.name)}</h5>
                    <p class="text-muted">${await languageService.translate('metadata.description.empty')}</p>
                </div>
            `;
        }

        // Show edit button when a mod is selected
        const editButton = document.getElementById('editModInfo');
        editButton.style.display = 'block';
        editButton.onclick = () => this.showModInfoEditor(mod.path);

        

    } catch (error) {
        console.error('Error in updateModPreview:', error);
        metadataContent.innerHTML = `
            <div class="alert alert-danger">
                <p>${await languageService.translate('metadata.unknown')}</p>
                <small>${this.escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

async showModInfoEditor(modPath) {
    try {
        const modInfo = await window.api.getModInfo(modPath);
        const currentModId = this.selectedMod;
        
        const form = document.getElementById('modInfoForm');
        const modal = new bootstrap.Modal(document.getElementById('editModInfoModal'));
    const toggleBtn = document.getElementById('toggleModInfoEditor');
    const formView = document.getElementById('modInfoFormView');
    const rawView = document.getElementById('modInfoRawView');
    const rawTextarea = document.getElementById('modInfoRawTextarea');
    const saveFormBtn = document.getElementById('saveModInfo');
        
        // Clear all form fields first
        form.reset();
        
        // Populate form with current values
        if (modInfo) {
            for (const [key, value] of Object.entries(modInfo)) {
                const input = form.elements[key];
                if (input) {
                    input.value = value || '';
                }
            }
        }

        // Load raw info.toml content
        try {
            const infoPath = `${modPath}\\info.toml`;
            if (await window.api.modOperations.fileExists(infoPath)) {
                const content = await window.api.modOperations.readModFile(infoPath);
                rawTextarea.value = content;
            } else {
                rawTextarea.value = '';
            }
        } catch (e) {
            console.warn('Could not load raw info.toml:', e);
            rawTextarea.value = '';
        }

        // Remove old event listener if exists
    const newSaveButton = saveFormBtn.cloneNode(true);
    saveFormBtn.parentNode.replaceChild(newSaveButton, saveFormBtn);

        // Add new event listener
        newSaveButton.onclick = async () => {
            // If advanced (raw) view is visible, save raw TOML
            const advancedMode = rawView && rawView.style.display !== 'none';
            if (advancedMode) {
                try {
                    const infoPath = `${modPath}\\info.toml`;
                    await window.api.modOperations.writeModFile(infoPath, rawTextarea.value);
                    this.showToast('Mod info saved successfully', 'success');
                    modal.hide();
                    await this.loadMods();
                    if (currentModId) {
                        this.selectMod(currentModId);
                        await this.updateModPreview(currentModId);
                    }
                } catch (error) {
                    this.showError('Failed to save info.toml: ' + error.message);
                }
                return;
            }

            // Form mode: validate and save structured fields
            form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
            const required = ['display_name', 'authors', 'category'];
            let isValid = true;
            required.forEach(field => {
                const input = form.elements[field];
                if (!input.value.trim()) {
                    input.classList.add('is-invalid');
                    isValid = false;
                }
            });
            if (!isValid) return;
            const formData = new FormData(form);
            const updatedInfo = Object.fromEntries(formData.entries());
            try {
                await window.api.saveModInfo(modPath, updatedInfo);
                this.showToast('Mod info saved successfully', 'success');
                modal.hide();
                await this.loadMods();
                if (currentModId) {
                    this.selectMod(currentModId);
                    await this.updateModPreview(currentModId);
                }
            } catch (error) {
                this.showError('Failed to save mod info: ' + error.message);
            }
        };

        // Toggle advanced editor
        if (toggleBtn) {
            // Reset to form view by default
            formView.style.display = '';
            rawView.style.display = 'none';

            // Remove any previous handler by cloning toggle button
            const newToggleBtn = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);

            newToggleBtn.addEventListener('click', () => {
                const showingForm = formView.style.display !== 'none';
                if (showingForm) {
                    formView.style.display = 'none';
                    rawView.style.display = '';
                } else {
                    formView.style.display = '';
                    rawView.style.display = 'none';
                }
            });
        }

        modal.show();
    } catch (error) {
        console.error('Error loading mod info:', error);
        this.showError('Failed to load mod info: ' + error.message);
    }
}

    
    // Ensure this method is in your ModManager class
    async getMod(modId) {
        console.log('Getting mod:', modId); // Debug log
        try {
            const mods = await this.loadMods();
            const mod = mods.find(m => m.id === modId);
            console.log('Found mod:', mod); // Debug log
            return mod;
        } catch (error) {
            console.error('Error getting mod:', error);
            throw error;
        }
    }
    async selectMod(modId) {
        console.log('Selecting mod:', modId);
        console.log('All mod items:', document.querySelectorAll('.mod-item'));
        
        // Find the specific mod item
        const modItem = document.querySelector(`[data-mod-id="${modId}"]`);
        console.log('Mod item found:', modItem);
    
        if (modItem) {
            // Remove selection from all items
            document.querySelectorAll('.mod-item').forEach(item => {
                item.classList.remove('selected');
            });
    
            // Add selection to clicked item
            modItem.classList.add('selected');
            this.selectedMod = modId;
    
            try {
                console.log('Calling updateModPreview');
                await this.updateModPreview(modId);
            } catch (error) {
                console.error('Error in selectMod:', error);
            }
        } else {
            console.error('No mod item found for ID:', modId);
        }
    }
    

    async initializeApp() {
        try {
            // Show loading screen
            await this.showLoading('Initializing application...');
    
            // Get initial configurations
            const config = await window.api.tutorial.initializeConfigurations();
    
            // Set up dark mode if applicable
            if (config.settings.darkMode) {
                this.enableDarkMode();
            }
    
            // Load initial mods
            if (config.initialMods && config.initialMods.length > 0) {
                await this.loadMods();
            }
    
            // Additional initialization steps
            this.setupEventListeners();
            this.checkForUpdates();
    
        } catch (error) {
            console.error('App initialization error:', error);
            this.showError('Failed to initialize application, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    initializePluginTab() {
        this.loadPlugins();
        document.getElementById('selectPluginsFolder').addEventListener('click', () => this.handleSelectPluginsFolder());
        document.getElementById('installPlugin').addEventListener('click', () => this.handleInstallPlugin());
        document.getElementById('reloadPluginsList').addEventListener('click', () => this.loadPlugins());
        // Discover Plugins button
        const discoverBtn = document.getElementById('discoverPluginsBtn');
        if (discoverBtn) {
            discoverBtn.addEventListener('click', () => this.showDiscoverPluginsModal());
        }
        // Soft reminder: if plugin versions map is empty, recommend reinstalling via Plugins tab
        this.checkPluginVersionsAndWarn()?.catch?.(console.error);
    }

    // Show an informational modal if no plugin versions are recorded yet
    async checkPluginVersionsAndWarn() {
        try {
            if (this.hasShownPluginVersionsEmptyModal) return;
            const meta = await window.api.pluginsMeta.get();
            const versions = meta && meta.versions ? meta.versions : {};
            const hasAny = versions && Object.keys(versions).length > 0;
            if (hasAny) return;

            this.hasShownPluginVersionsEmptyModal = true;

            // Build a small Bootstrap modal dynamically
            const modalId = 'pluginVersionsInfoModal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = modalId;
            modal.tabIndex = -1;
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Enable automatic plugin updates</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>It looks like your plugin versions file is empty.</p>
                            <p>For FightPlanner to check for plugin updates automatically, it's recommended to reinstall your plugins from the Plugins tab using the <strong>Discover Plugins</strong> button. This will record their versions and allow update checks at startup.</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            const bsModal = new bootstrap.Modal(modal, { backdrop: 'static' });
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            }, { once: true });
            bsModal.show();
        } catch (err) {
            console.error('checkPluginVersionsAndWarn error:', err);
        }
    }

    async loadPlugins() {
        try {
            await this.showLoading('Reloading Plugins...');
            const plugins = await window.api.pluginOperations.loadPlugins();
            this.renderPluginList(plugins);
        } catch (error) {
            this.showError('Failed to load plugins, Cause ' +  ': ' + error.message);
        }
        this.hideLoading();
    }

    showDiscoverPluginsModal() {
        const modalEl = document.getElementById('discoverPluginsModal');
        if (!modalEl) return;

        // Example data; user will replace later
    const examples = [
            {
                id: 'nro-hook-plugin',
                name: 'NRO hook plugin',
                description: 'A plugin allowing for centralized hooking of NROs, allowing multiple plugins to all hook NRO load.',
                url: 'https://github.com/ultimate-research/nro-hook-plugin/releases/latest/download/libnro_hook.nro'
            },
            {
                id: 'paramconfig',
                name: 'lib_paramconfig',
                description: 'A common problem across "single slot movesets"(SSMs) is that because they often hook the same functions, they will cause crashes when multiple SSMs are active at once. This plugin serves as a middleman between the source code and mods, so that even though multiple SSMs are active, this is the only plugin that actually hooks param functions.',
                url: 'https://github.com/CSharpM7/lib_paramconfig/releases/latest/download/libparam_config.nro'
            },
            {
                id: 'param-hook-plugin',
                name: 'Param hook plugin',
                description: 'A plugin allowing for centralized hooking of parameter files, allowing multiple plugins to all hook param file loads.',
                url: 'https://github.com/ultimate-research/params-hook-plugin/releases/latest/download/libparam_hook.nro'
            },
            {
                id: 'smashline',
                name: 'Smashline',
                description: 'libsmashline_hook.nro',
                url: 'https://github.com/blu-dev/smashline_hook/releases/latest/download/libsmashline_hook.nro'
            },
            {
                id: 'arcropolis',
                name: 'ARCropolis',
                description: 'libarcropolis.nro (Mod loader, if you want to setup arcropolis see our tutorial for emulator.)',
                url: 'https://github.com/Raytwo/ARCropolis/releases/latest/download/release.zip'
            }
        ];

        const list = document.getElementById('discoverPluginsList');
        // Insert a simple info label placeholder above the list (user can edit later)
        if (list) {
            let info = modalEl.querySelector('#discoverPluginsInfo');
            if (!info) {
                info = document.createElement('div');
                info.id = 'discoverPluginsInfo';
                info.className = 'alert alert-info py-2 px-3 mb-2';
                info.textContent = 'ARCropois Plugin, CSK Collections and other will be added in future updates.';
                list.parentNode.insertBefore(info, list);
            }
        }
    list.innerHTML = examples.map(p => `
            <div class="list-group-item d-flex justify-content-between align-items-start">
                <div class="me-3" style="min-width:0;">
                    <div class="fw-semibold text-truncate" title="${this.escapeHtml(p.name)}">${this.escapeHtml(p.name)}</div>
                    <div class="small textmuted">${this.escapeHtml(p.description)}</div>
                </div>
                <div class="ms-3 flex-shrink-0">
            <button class="btn btn-sm btn-primary" data-plugin-url="${p.url}" data-plugin-name="${this.escapeHtml(p.name)}" data-plugin-id="${this.escapeHtml(p.id)}">
                        <i class="bi bi-cloud-download me-1"></i>Download
                    </button>
                </div>
            </div>
        `).join('');

        // Attach click handlers
    list.querySelectorAll('button[data-plugin-url]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const url = e.currentTarget.getAttribute('data-plugin-url');
                const name = e.currentTarget.getAttribute('data-plugin-name');
                const pluginId = e.currentTarget.getAttribute('data-plugin-id');
                try {
                    await this.showLoading(`Downloading ${name}...`);
                    // Pass object payload so main can track versions when known
                    await window.api.pluginOperations.installPluginFromUrl({ url, pluginId });
                    await this.loadPlugins();
                    this.showToast(`${name} installed`, 'success');
                } catch (err) {
                    console.error('Plugin download failed:', err);
                    this.showError('Failed to download plugin: ' + err.message);
                } finally {
                    this.hideLoading();
                }
            });
        });

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }

    renderPluginList(plugins) {
        const pluginList = document.getElementById('pluginList');
        pluginList.innerHTML = '';

        if (!plugins || plugins.length === 0) {
            pluginList.innerHTML = `
                <div class="text-center textmuted py-3">
                    No plugins found
                </div>
            `;
            return;
        }

        plugins.forEach(plugin => {
            const pluginElement = document.createElement('div');
            pluginElement.classList.add('plugin-item', 'd-flex', 'justify-content-between', 'align-items-center', 'p-2', 'border-bottom');
            pluginElement.innerHTML = `
                <div class="plugin-info">
                    <strong>${this.escapeHtml(plugin.name)}</strong>
                </div>
                <div class="plugin-actions">
                    <button class="btn btn-sm btn-outline-secondary me-1 toggle-plugin" data-plugin-id="${plugin.id}">
                        <i class="bi bi-${plugin.enabled ? 'toggle-on' : 'toggle-off'}"></i>
                    <button class="btn btn-sm btn-outline-danger me-1 delete-plugin" data-plugin-id="${plugin.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;

            pluginElement.querySelector('.toggle-plugin').addEventListener('click', () => this.handleTogglePlugin(plugin.id));
            pluginElement.querySelector('.delete-plugin').addEventListener('click', () => this.handleDeletePlugin(plugin.id));
            pluginList.appendChild(pluginElement);
        });
    }

    async handleSelectPluginsFolder() {
        try {
            const result = await window.api.dialog.showOpenDialog({
                properties: ['openDirectory']
            });

            if (!result.canceled) {
                await this.showLoading('Updating plugins folder...');
                await window.api.settings.setPluginsPath(result.filePaths[0]);
                document.getElementById('pluginsPath').value = result.filePaths[0];
                this.loadPlugins();
                this.showSuccess('Plugins folder updated successfully');
                
                // Update Discord RPC
                window.api.discordRpc.setActivity({
                    state: 'Updating Plugins Folder',
                    details: 'Changing Plugins Directory',
                    largeImageKey: 'app_logo',
                    largeImageText: 'FightPlanner'
                });
            }
        } catch (error) {
            console.error('Failed to update plugins folder:', error);
            this.showError('Failed to update plugins folder, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleInstallPlugin() {
        try {
            const result = await window.api.dialog.showOpenDialog({
                filters: [{ name: 'Plugin Files', extensions: ['nro'] }],
                properties: ['openFile']
            });

            if (!result.canceled) {
                await this.showLoading('Installing plugin...');
                await window.api.pluginOperations.installPlugin(result.filePaths[0]);
                this.loadPlugins();
                this.showSuccess('Plugin installed successfully');
                
                // Update Discord RPC
                window.api.discordRpc.updateModInstallation();
            }
        } catch (error) {
            this.showError('Failed to install plugin, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleDeletePlugin(pluginId) {
        if (await this.showConfirmationModal('Are you sure you want to delete this plugin?')) {
            try {
                await this.showLoading('Deleting plugin...');
                await window.api.pluginOperations.deletePlugin(pluginId);
                this.loadPlugins();
                this.showSuccess('Plugin deleted successfully');
                
                // Update Discord RPC
                window.api.discordRpc.updateModCount(this.mods.length);
            } catch (error) {
                this.showError('Failed to delete plugin, Cause ' +  ': ' + error.message);
            } finally {
                this.hideLoading();
            }
        }
    }

    async handleTogglePlugin(pluginId) {
        try {
            const result = await window.api.pluginOperations.togglePlugin(pluginId);
            if (result) {
                this.showToast('Plugin enabled successfully', 'success');
            } else {
                this.showToast('Plugin disabled successfully', 'success');
            }
            this.loadPlugins();
        } catch (error) {
            console.error('Failed to toggle plugin:', error);
            this.showError('Failed to toggle plugin: ' + error.message);
        }
    }

    async handleRenamePlugin(pluginId) {
        // Get the current plugin name
        const currentName = await window.api.pluginOperations.getPluginName(pluginId);
        const nameParts = currentName.split('.');
        const baseName = nameParts.slice(0, -1).join('.'); // Name without extension
        const extension = nameParts.slice(-1); // Extension
    
        // Prompt the user to enter a new name
        const newName = await this.promptDialog('Rename Plugin', 'Enter a new name for the plugin:', baseName);
        if (newName) {
            try {
                this.showLoading('Renaming plugin...');
                const fullNewName = `${newName}.${extension}`;
                await window.api.pluginOperations.renamePlugin(pluginId, fullNewName);
                this.loadPlugins();
                this.showToast('Plugin renamed successfully', 'success');
                
                // Update Discord RPC
                window.api.discordRpc.updateModCount(this.mods.length);
            } catch (error) {
                this.showToast('Failed to rename plugin', 'danger');
            } finally {
                this.hideLoading();
            }
        }
    }
    
    async handleOpenPluginsFolder() {
        try {
            await window.api.pluginOperations.openPluginsFolder();
            // Update Discord RPC
            window.api.discordRpc.setActivity({
                state: 'Browsing Plugins Folder',
                details: 'Exploring Plugin Collection',
                largeImageKey: 'app_logo',
                largeImageText: 'FightPlanner'
            });
        } catch (error) {
            this.showError('Failed to open plugins folder, Cause: ' + error.message);
        }
    }

    async handlePluginDrop(event) {
        event.preventDefault();
        const files = event.dataTransfer.files;
    
        if (files.length === 0) return;
    // 
        const nroFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.nro'));
    
        if (nroFiles.length === 0) {
            this.showError('No valid plugin files found. Please drop .nro files.');
            return;
        }
    
        try {
            await this.showLoading('Installing plugins...');
    
            for (const file of nroFiles) {
                try {
                    await window.api.pluginOperations.installPlugin(file.path);
                } catch (installError) {
                    this.showError(`Failed to install ${file.name}: ${installError.message}`);
                }
            }
    
            this.loadPlugins();
            this.showSuccess(`Installed ${nroFiles.length} plugin(s) successfully`);
            
            // Update Discord RPC
            window.api.discordRpc.updateModInstallation();
        } catch (error) {
            console.error('Drag and drop installation error:', error);
            this.showError('Failed to install plugins, Cause ' +  ': ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    initializeConflictButton() {
        this.conflictButton = document.getElementById('showConflictsBtn');
        if (this.conflictButton) {
            this.conflictButton.addEventListener('click', () => {
                if (this.conflicts && this.conflicts.size > 0) {
                    this.showConflictsWarning(this.conflicts);
                }
            });
        }
    }
    
    initializeSettingsTab() {
        document.getElementById('selectCustomCssFile').addEventListener('click', this.handleSelectCustomCssFile);
        document.getElementById('removeCustomCssFile').addEventListener('click', this.handleRemoveCustomCssFile);
        this.initializeDarkMode();
        this.initializeConflictCheckToggle();
        this.initializeDiscordRpcToggle();
        this.initializeEmulatorSettings();
        this.initializeLegacyModDiscoveryToggle();
        this.initializeSentryToggle();
        // Add log viewer functionality
        document.getElementById('openCurrentLog').addEventListener('click', this.handleOpenCurrentLog.bind(this));
        document.getElementById('openLogsFolder').addEventListener('click', this.handleOpenLogsFolder.bind(this));
        document.getElementById('clearLogs').addEventListener('click', this.handleClearLogs);
        document.getElementById('refreshLogs').addEventListener('click', this.handleRefreshLogs);
        this.initializeLogViewer();
        this.initializeProtocolConfirmToggle();
        this.initializeAprilFoolsToggle();
    this.initializeModsSortToggle();

        // Add clear temp files handler
        document.getElementById('clearTempFiles').addEventListener('click', async () => {
            try {
                await this.showLoading('Clearing temporary files...');
                const cleared = await window.api.settings.clearTempFiles();
                if (cleared) {
                    this.showToast('Temporary files cleared successfully', 'success');
                } else {
                    this.showToast('No temporary files to clear', 'info');
                }
            } catch (error) {
                this.showError('Failed to clear temporary files: ' + error.message);
            } finally {
                this.hideLoading();
            }
        });

        // Initialize volume control
        const volumeControl = document.getElementById('volumeControl');
        if (volumeControl) {
            // Load saved volume
            window.api.settings.getVolume().then(volume => {
                volumeControl.value = volume;
            });

            // Add change event listener
            volumeControl.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                window.api.settings.setVolume(volume);
            });
        }
    }

    initializeModsSortToggle() {
        const toggle = document.getElementById('modsSortRecentToggle');
        if (!toggle) return;
        // Load current value
        window.api.settings.getModsSortRecentEnabled().then(enabled => {
            toggle.checked = !!enabled;
        });
        // Listen to changes
        toggle.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            await window.api.settings.setModsSortRecentEnabled(enabled);
            // Reload list to apply new ordering
            await this.loadMods();
        });
    }
initializeSentryToggle() {
    const sentryToggle = document.getElementById('sentryToggle');

    // Charger l'état actuel depuis le processus principal
    window.api.invoke('get-sentry-enabled').then((isEnabled) => {
        sentryToggle.checked = isEnabled;
    }).catch((error) => {
        console.error('Failed to get Sentry status:', error);
    });

    // Ajouter un gestionnaire d'événements pour les changements
    sentryToggle.addEventListener('change', async (event) => {
        const enabled = event.target.checked;
        try {
            await window.api.invoke('set-sentry-enabled', enabled);
            this.showToast(`Error reporting has been ${enabled ? 'enabled' : 'disabled'}.`, 'info');
        } catch (error) {
            console.error('Failed to set Sentry status:', error);
        }
    });
}

    async initializeLogViewer() {
        try {
            const logContent = await window.api.logs.getCurrentLog();
            const logElement = document.getElementById('logContent');
            if (logElement) {
                logElement.textContent = logContent;
                // Auto-scroll to bottom
                logElement.scrollTop = logElement.scrollHeight;
            }
        } catch (error) {
            this.showError('Failed to load logs: ' + error.message);
        }
    }

    async handleOpenCurrentLog() {
        try {
            await window.api.logs.openCurrentLog();
        } catch (error) {
            this.showError('Failed to open current log: ' + error.message);
        }
    }

    async handleOpenLogsFolder() {
        try {
            await window.api.logs.openLogsFolder();
        } catch (error) {
            this.showError('Failed to open logs folder: ' + error.message);
        }
    }

    async handleRefreshLogs() {
        try {
            const logContent = await window.api.logs.getCurrentLog();
            const logElement = document.getElementById('logContent');
            if (logElement) {
                const wasScrolledToBottom = logElement.scrollHeight - logElement.clientHeight <= logElement.scrollTop + 1;
                logElement.textContent = logContent;
                // If it was scrolled to bottom, keep it scrolled to bottom
                if (wasScrolledToBottom) {
                    logElement.scrollTop = logElement.scrollHeight;
                }
            }
            this.showSuccess('Logs refreshed');
        } catch (error) {
            this.showError('Failed to refresh logs: ' + error.message);
        }
    }

    async handleClearLogs() {
        try {
            await window.api.logs.clearLogs();
            await this.handleRefreshLogs(); // Refresh logs after clearing
            this.showToast('Logs cleared successfully', 'success');
        } catch (error) {
            this.showError('Failed to clear logs: ' + error.message);
        }
    }

    initializeDiscordRpcToggle() {
        const discordRpcToggle = document.getElementById('discordRpcToggle');
        window.api.settings.getDiscordRpcEnabled().then(enabled => {
            discordRpcToggle.checked = enabled;
        });

        discordRpcToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
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
        const conflictCheckToggle = document.getElementById('conflictCheckToggle');
        window.api.settings.getConflictCheckEnabled().then(enabled => {
            conflictCheckToggle.checked = enabled;
        });

        conflictCheckToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            window.api.settings.setConflictCheckEnabled(enabled);
        });
    }

    handleRemoveCustomCssFile() {
        document.getElementById('customCssPath').value = '';
        window.api.settings.removeCustomCss().catch(error => {
            this.showError('Failed to remove custom CSS, Cause ' +  ': ' + error.message);
        });
        this.showSuccess('Custom CSS file removed successfully');
        this.showRestartNeededPopup();
    }

    showRestartNeededPopup() {
        const restartNeededModal = new bootstrap.Modal(document.getElementById('restartNeededModal'));
        restartNeededModal.show();
    }

    applyCustomCss(enabled) {
        if (enabled) {
            const customCssPath = document.getElementById('customCssPath').value;
            if (customCssPath) {
                window.api.settings.loadCustomCss(customCssPath).catch(error => {
                    this.showError('Failed to load custom CSS, Cause ' +  ': ' + error.message);
                });
            }
        } else {
            window.api.settings.removeCustomCss().catch(error => {
                this.showError('Failed to remove custom CSS, Cause ' +  ': ' + error.message);
            });
        }
    }

    async handleSelectCustomCssFile() {
        try {
            const filePath = await window.electronAPI.selectCustomCssFile();
            if (filePath) {
                document.getElementById('customCssPath').value = filePath;
                await window.electronAPI.setCustomCssPath(filePath);
                this.showSuccess('Custom CSS file updated successfully');
                this.showRestartNeededPopup();
            }
        } catch (error) {
            this.showError('Failed to select custom CSS file, Cause ' +  ': ' + error.message);
        }
    }

    handleAddDownloadField() {
        const downloadFieldsContainer = document.getElementById('downloadFieldsContainer');
        const newField = document.createElement('div');
        newField.classList.add('mb-3', 'input-group');
        newField.innerHTML = `
            <input type="text" class="form-control gameBananaLink" placeholder="Paste GameBanana mod link here">
            <button type="button" class="btn btn-outline-danger remove-download-field">
                <i class="bi bi-x"></i>
            </button>
        `;
        downloadFieldsContainer.appendChild(newField);
    }

    async handleGameBananaDownload() {
        const linkInputs = document.querySelectorAll('.gameBananaLink');
        this.downloadQueue = Array.from(linkInputs).map(input => input.value.trim()).filter(link => link);
        
        if (this.downloadQueue.length === 0) {
            this.showToast('Please enter at least one GameBanana mod link', 'danger');
            return;
        }

        this.isDownloading = true;
        this.totalDownloads = this.downloadQueue.length;
        await this.processDownloadQueue();
    }

    async processDownloadQueue() {
        if (this.downloadQueue.length === 0) {
            this.isDownloading = false;
            this.hideLoading();
            this.showToast('All mods downloaded successfully', 'success');
            if (this.downloadModal) {
                this.downloadModal.hide();
            }
            return;
        }

        const currentIndex = this.totalDownloads - this.downloadQueue.length + 1;
        const downloadLink = this.downloadQueue.shift();
        this.showLoading(`Downloading mod ${currentIndex}/${this.totalDownloads}...`);

        try {
            const filePath = await window.electron.downloadMod(downloadLink);
            this.showToast(`Mod downloaded successfully to ${filePath}`, 'success');
            await this.loadMods();
            // The sound will be played automatically by the hidden window when download finishes
        } catch (error) {
            this.showToast(`Failed to download mod: ${error.message}`, 'danger');
        } finally {
            this.processDownloadQueue();
        }
    }

    showDownloadConfirmation(downloadLink) {
        const confirmDownload = confirm(`Do you want to download this mod?\n\n${downloadLink}`);
        if (confirmDownload) {
            window.electron.downloadMod(downloadLink)
                .then((filePath) => {
                    // Close the modal
                    const downloadModal = bootstrap.Modal.getInstance(document.getElementById('gameBananaDownloadModal'));
                    if (downloadModal) {
                        downloadModal.hide();
                    }
                    
                    // The sound will be played automatically by the hidden window
                    this.showToast(`Mod downloaded successfully to ${filePath}`, 'success');
                    this.loadMods();
                })
                .catch((error) => {
                    this.showToast(`Failed to download mod: ${error.message}`, 'danger');
                });
        }
    }

showConflictsWarning(conflicts) {
    const descriptions = this.conflictDetector.getConflictDescriptions();
    
    if (descriptions.length === 0) {
        this.showToast('No conflicts detected', 'info');
        return;
    }
    
    // Create modal for conflicts
    const isDark = document.body.classList.contains('dark-mode');
const modalHtml = `
    <div class="modal fade" id="conflictsModal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content border-warning shadow ${isDark ? 'bg-dark text-black' : ''}">
                <div class="modal-header bg-warning bg-gradient">
                    <h5 class="modal-title d-flex align-items-center">
                        <i class="bi bi-exclamation-triangle-fill me-2 text-danger fs-3"></i>
                        Mod Conflicts Detected
                        <span class="badge bg-danger ms-3">${descriptions.length} files in conflict${descriptions.length > 1 ? 's' : ''}</span>
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-3">
                        <strong>The following conflicts were found between mods:</strong>
                    </p>
                    <div class="table-responsive">
                        <table class="table table-bordered align-middle table-hover ${isDark ? 'table-dark' : ''}">
                            <thead class="table-warning">
                                <tr>
                                    <th scope="col"><i class="bi bi-file-earmark"></i> File</th>
                                    <th scope="col"><i class="bi bi-people"></i> Conflicting Mods</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${descriptions.map(conflict => `
                                    <tr>
                                        <td class="fw-bold text-break" style="min-width:180px">${conflict.file}</td>
                                        <td>
                                            <ul class="list-unstyled mb-0">
                                                ${conflict.mods.map(mod => `
                                                    <li class="d-flex align-items-center mb-1">
                                                        <i class="bi bi-exclamation-circle-fill text-warning me-2"></i>
                                                        <span>${mod}</span>
                                                    </li>
                                                `).join('')}
                                            </ul>
                                        </td>
                                    </tr>
                                `).join('')}
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
                    <button class="btn btn-outline-primary" id="autoChangeSlotsButton">
                        <i class="bi bi-magic me-1"></i> Automatic Change Slots
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
    const existingModal = document.getElementById('conflictsModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to document
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('conflictsModal'));
    modal.show();

    // Add event listener for change slot button
    document.getElementById('changeSlotButton').addEventListener('click', () => {
        modal.hide();
        this.showSelectModsModal(descriptions);
    });

    // Add event listener for automatic change slots
    const autoBtn = document.getElementById('autoChangeSlotsButton');
    if (autoBtn) {
        autoBtn.addEventListener('click', () => {
            modal.hide();
            this.showAutoChangeSlotsModal(descriptions);
        });
    }
}

    showSelectModsModal(conflicts) {
        // Create a set to store unique mods
        const uniqueMods = new Set(conflicts.flatMap(conflict => conflict.mods));

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
                                ${Array.from(uniqueMods).map(mod => `
                                    <button type="button" class="list-group-item list-group-item-action mod-button" data-mod-id="${mod}">
                                        ${mod}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-primary" id="autoChangeFromSelect">
                                <i class="bi bi-magic me-1"></i> Automatic Change Slots
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existingSelectModsModal = document.getElementById('selectModsModal');
        if (existingSelectModsModal) {
            existingSelectModsModal.remove();
        }

        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', selectModsModalHtml);

        // Show the modal
        const selectModsModal = new bootstrap.Modal(document.getElementById('selectModsModal'));
        selectModsModal.show();

        // Add event listener for mod buttons
        document.querySelectorAll('.mod-button').forEach(button => {
            button.addEventListener('click', () => {
                const selectedMod = button.dataset.modId;
                this.showChangeSlotsDialog([selectedMod]);
                selectModsModal.hide();
            });
        });

        // Auto change action from this modal
        const autoBtn = document.getElementById('autoChangeFromSelect');
        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                selectModsModal.hide();
                this.showAutoChangeSlotsModal(conflicts);
            });
        }
    }

    // Show modal to choose mods to exclude from automatic slot changes
    showAutoChangeSlotsModal(conflicts) {
        const uniqueMods = new Set(conflicts.flatMap(c => c.mods));

        const modalId = 'autoChangeSlotsModal';
        document.getElementById(modalId)?.remove();

        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Automatic Change Slots</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>Select the mods you DO NOT want to modify. We'll try to change the other mods' slots to avoid conflicts for fighter mods. Only standard slots c00–c07 are used automatically.</p>
                            <div class="list-group">
                                ${Array.from(uniqueMods).map(name => `
                                    <label class="list-group-item d-flex align-items-center">
                                        <input type="checkbox" class="form-check-input me-2 exclude-mod" data-mod="${this.escapeHtml(name)}">
                                        <span>${this.escapeHtml(name)}</span>
                                    </label>
                                `).join('')}
                            </div>
                            <div class="alert alert-info mt-3" style="font-size:0.9em">
                                <i class="bi bi-info-circle me-1"></i>
                                If all c00–c07 slots are already taken for a fighter (e.g. one mod uses all slots), the remaining mods will be skipped and listed.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="runAutoChangeSlotsBtn">
                                <i class="bi bi-magic me-1"></i> Run Automatic
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const bsModal = new bootstrap.Modal(document.getElementById(modalId));
        bsModal.show();

        document.getElementById('runAutoChangeSlotsBtn').addEventListener('click', async () => {
            const excluded = Array.from(document.querySelectorAll('.exclude-mod:checked')).map(i => i.dataset.mod);
            bsModal.hide();
            await this.runAutomaticSlotResolution(Array.from(uniqueMods), new Set(excluded));
        });
    }

    // Helper to extract fighter name from slot-affected files
    extractFighterNameFromFiles(files) {
        const patterns = [
            /\bfighter\/([a-z0-9_]+)\b/i,                                  // fighter/<name>/...
            /\bcamera\/fighter\/([a-z0-9_]+)\b/i,                         // camera/fighter/<name>/...
            /\bsound\/bank\/fighter\/se_([a-z0-9_]+)_c\d{2,3}/i,          // sound/bank/fighter/se_<name>_cXX
            /\bsound\/bank\/fighter_voice\/vc_([a-z0-9_]+)_(?:cheer_)?c\d{2,3}/i, // fighter_voice patterns
            /\bfighter\/kirby\/model\/copy_([a-z0-9_]+)_cap\b/i,          // fighter/kirby/model/copy_<name>_cap
            /\beffect\/fighter\/([a-z0-9_]+)\b/i                           // effect/fighter/<name>/...
        ];
        for (const f of files) {
            const path = f.replace(/\\/g, '/');
            for (const re of patterns) {
                const m = path.match(re);
                if (m && m[1]) return m[1];
            }
        }
        return null;
    }

    // Prefer reading fighter/<name> directly from the mod folder structure
    async getFighterNameFromMod(modPath) {
        try {
            const fighterRoot = `${modPath}/fighter`;
            const exists = await window.api.modOperations.fileExists(fighterRoot);
            if (!exists) return null;
            const entries = await window.api.modOperations.getModFiles(fighterRoot);
            const name = entries.find(e => !e.includes('/') && !e.includes('\\'));
            return name || null;
        } catch (e) {
            return null;
        }
    }

    // Read cXX folders present under fighter/<fighter>/model/body for a given mod
    async getBodySlotsForMod(modPath, fighter) {
        try {
            const files = await window.api.modOperations.getModFiles(modPath);
            const slots = new Set();
            const re = new RegExp(`^fighter/${fighter}/model/body/(c\\d{2,3})(?:/|$)`, 'i');
            for (const f of files) {
                const p = f.replace(/\\/g, '/');
                const m = p.match(re);
                if (m && m[1]) slots.add(m[1].toLowerCase());
            }
            return Array.from(slots);
        } catch {
            return [];
        }
    }

    // Build usage map of standard slots c00..c07 for a fighter across all mods
    async getFighterBodySlotUsage(fighter) {
        const std = new Set(['c00','c01','c02','c03','c04','c05','c06','c07']);
        const used = new Set();
        const byMod = new Map(); // modName -> Set(cxx)
        for (const m of this.mods) {
            try {
                const slots = await this.getBodySlotsForMod(m.path, fighter);
                const stdSlots = slots.filter(s => std.has(s));
                if (stdSlots.length > 0) {
                    byMod.set(m.name, new Set(stdSlots));
                    stdSlots.forEach(s => used.add(s));
                }
            } catch {}
        }
        return { used, byMod };
    }

    // Run the automatic slot resolution limited to c00..c07 and only for fighter mods
    async runAutomaticSlotResolution(modNames, excludedMods) {
        const results = { changed: [], skipped: [] };
        const plannedChangesPerMod = new Map(); // modName -> { slotChanges, files, modPath }

        try {
            await this.showLoading('Analyzing conflicts...');

            // Build per-fighter usage maps considering excluded mods fixed
            const perFighter = new Map(); // fighter -> { used:Set(cXX), byMod: Map(modName, Set(cXX)) }

            // First pass: scan mods and collect current slots and files
            const scanned = [];
            for (const name of modNames) {
                // Resolve mod object by name first (conflict list uses names), fallback to id
                let mod = this.mods.find(m => m.name === name);
                if (!mod) {
                    try { mod = await this.modManager.getMod(name); } catch {}
                }
                if (!mod || !mod.enabled) continue;
                const { currentSlots, affectedFiles } = await ChangeSlots.scanForSlots(mod.path);
                let fighter = await this.getFighterNameFromMod(mod.path);
                if (!fighter) fighter = this.extractFighterNameFromFiles(affectedFiles) || null;
                if (!fighter || currentSlots.length === 0) continue; // not a fighter mod
                scanned.push({ name, mod, fighter, currentSlots, files: affectedFiles });
                if (!perFighter.has(fighter)) perFighter.set(fighter, { used: new Set(), byMod: new Map() });
                const ctx = perFighter.get(fighter);
                ctx.byMod.set(name, new Set(currentSlots));
                for (const s of currentSlots) ctx.used.add(s);
            }

            // For each fighter, attempt to assign unique slots for non-excluded mods that collide
            const stdSlots = ['c00','c01','c02','c03','c04','c05','c06','c07'];
            for (const [fighter, ctx] of perFighter) {
                // Determine mods to adjust (involved and not excluded)
        const modsForFighter = scanned.filter(s => s.fighter === fighter);
                // Identify collisions: any slot used by more than one mod
                const usersPerSlot = new Map(); // slot -> Set(modName)
                for (const s of modsForFighter) {
                    for (const slot of s.currentSlots) {
            const key = slot.toLowerCase();
            if (!usersPerSlot.has(key)) usersPerSlot.set(key, new Set());
            usersPerSlot.get(key).add(s.name);
                    }
                }

                // Fixed mods set (excluded)
                const fixed = new Set(Array.from(excludedMods));

                // Compute used standard body slots across all mods for this fighter
                const { used: usedBody, byMod } = await this.getFighterBodySlotUsage(fighter);

                // Order mods to change: those participating in collisions, excluding fixed
                const toChange = modsForFighter.filter(s => s.currentSlots.some(sl => (usersPerSlot.get(sl.toLowerCase())?.size || 0) > 1) && !fixed.has(s.name));

                // If one mod uses all std slots, mark others as skipped
                const modUsingAll = modsForFighter.find(m => stdSlots.every(ss => (byMod.get(m.name)?.has(ss)) ));
                if (modUsingAll) {
                    for (const s of toChange) {
                        results.skipped.push({ mod: s.name, reason: `${fighter}: all slots c00–c07 taken by ${modUsingAll.name}` });
                    }
                    continue; // cannot adjust any for this fighter
                }

                for (const s of toChange) {
                    const slotChanges = {};
                    // Determine this mod's current standard body slots
                    const modStdSlots = Array.from(byMod.get(s.name) || []);
                    // If not found under body, fallback to any standard slot from scanForSlots
                    const fallbackStd = s.currentSlots.filter(x => stdSlots.includes(x));
                    const currentStd = modStdSlots.length ? modStdSlots : fallbackStd;
                    // Only proceed if this mod overlaps with others (duplicate in usersPerSlot)
                    const hasOverlap = currentStd.some(sl => (usersPerSlot.get(sl.toLowerCase())?.size || 0) > 1);
                    if (!hasOverlap) continue;
                    // Find one free standard slot across fighter body usage
                    const candidate = stdSlots.find(c => !usedBody.has(c));
                    if (!candidate) {
                        results.skipped.push({ mod: s.name, reason: `${fighter}: no free standard slot available` });
                        continue;
                    }
                    // Map all of the mod's current standard slots to the one free candidate
                    for (const from of currentStd) {
                        slotChanges[from] = candidate;
                    }
                    usedBody.add(candidate);

                    if (Object.keys(slotChanges).length > 0) {
                        plannedChangesPerMod.set(s.name, { slotChanges, files: s.files, modPath: s.mod.path });
                    }
                }
            }

            // Apply planned changes
            if (plannedChangesPerMod.size === 0) {
                this.showToast('No automatic changes necessary or possible.', 'info');
                return;
            }

            let idx = 0;
            for (const [modName, plan] of plannedChangesPerMod) {
                idx++;
                this.updateLoadingMessage(`Applying ${idx}/${plannedChangesPerMod.size}: ${modName}`);
                try {
                    await ChangeSlots.changeSlots(plan.modPath, plan.slotChanges, plan.files);
                    results.changed.push({ mod: modName, changes: plan.slotChanges });
                } catch (e) {
                    results.skipped.push({ mod: modName, reason: e.message });
                }
            }

            // Reload mods (this also recomputes conflicts if enabled)
            await this.loadMods();

            // Show summary
            if (results.changed.length > 0) {
                const lines = results.changed.map(r => `${r.mod}: ${Object.entries(r.changes).map(([from,to]) => `${from}→${to}`).join(', ')}`);
                this.showToast(`Automatic slots updated:\n${lines.join('\n')}`, 'success');
            }
            if (results.skipped.length > 0) {
                const lines = results.skipped.map(r => `• ${r.mod}: ${r.reason}`);
                this.showError(`Some mods were skipped:\n${lines.join('\n')}`);
            }

            // Offer user to verify and retry if conflicts remain
            const originalSet = new Set(modNames);
            this.showAutoRetryModal(originalSet, excludedMods);
        } catch (err) {
            this.showError(`Automatic change failed: ${err.message}`);
        } finally {
            this.hideLoading();
        }
    }

    // Post-run modal that waits for user's verification, then re-checks and optionally retries
    showAutoRetryModal(originalSet, excludedMods) {
        const modalId = 'autoRetryModal';
        document.getElementById(modalId)?.remove();

        const html = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Verify Conflicts</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>Please review the conflicts panel. When you're ready, click "Check again" and we'll re-run automatic changes for the mods that were originally in conflict if conflicts still exist.</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" id="autoRetryCheckBtn">
                                <i class="bi bi-search me-1"></i> Check again
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        const bsModal = new bootstrap.Modal(document.getElementById(modalId));
        bsModal.show();

        const onCheck = async () => {
            try {
                // Recompute conflicts on current mods
                const spinnerEl = document.getElementById('conflictLoadingSpinner');
                const tipEl = spinnerEl ? spinnerEl.querySelector('#conflictSpinnerTip') : null;
                const conflicts = await this.conflictDetector.detectConflicts(this.mods, (modName) => {
                    if (tipEl) tipEl.textContent = `Checking conflicts: ${modName}`;
                });
                const stillConflicted = new Set();
                for (const mods of conflicts.values()) {
                    mods.forEach(m => { if (originalSet.has(m)) stillConflicted.add(m); });
                }

                if (stillConflicted.size === 0) {
                    this.showToast('No remaining conflicts for the originally conflicted mods.', 'success');
                    bsModal.hide();
                    return;
                }

                // Re-run automatic on the remaining conflicted original mods
                bsModal.hide();
                await this.runAutomaticSlotResolution(Array.from(stillConflicted), new Set(excludedMods));
            } catch (e) {
                this.showError(`Failed to re-check conflicts: ${e.message}`);
            }
        };

        document.getElementById('autoRetryCheckBtn').addEventListener('click', onCheck, { once: true });
    }

async showChangeSlotsDialog(selectedMods, file) {
    this.hideContextMenu();
    if (!selectedMods || selectedMods.length === 0) {
        this.showError('Please select at least one mod');
        return;
    }

    try {
        this.showLoading('Scanning mod files...');
        
        const modDetails = await Promise.all(selectedMods.map(async modId => {
            const mod = await this.modManager.getMod(modId);
            const { currentSlots, affectedFiles } = await ChangeSlots.scanForSlots(mod.path);
            return { mod, currentSlots, affectedFiles };
        }));

        // Génération du HTML avec tous les slots détectés (y compris > c07)
        const slotsInfo = document.getElementById('currentSlotsInfo');
    slotsInfo.innerHTML = modDetails.map(({ mod, currentSlots, affectedFiles }, idx) => {
            // Liste unique des slots à proposer dans le select (standards + tous détectés, sauf le slot courant)
            const standardSlots = Array.from({ length: 8 }, (_, i) => `c0${i}`);
            const extraSlots = currentSlots.filter(s => !standardSlots.includes(s));
            const allSlots = Array.from(new Set([...standardSlots, ...extraSlots]));

            return `
            <div class="mb-3 mod-slot-section" data-mod-index="${idx}">
                <strong>${mod.name} - Current slots found:</strong> 
                ${currentSlots.map(slot => `
                    <div class="input-group mb-2 slot-group" data-slot="${slot}">
                        <span class="input-group-text">${slot}</span>
                        <div style="flex:1;">
                            <select class="form-select target-slot" data-current-slot="${slot}">
                                <option value="">Select new slot</option>
                                ${allSlots.filter(s => s !== slot).map(newSlot => `
                                    <option value="${newSlot}">${newSlot}</option>
                                `).join('')}
                                <option value="custom">Custom... (EXPERIMENTAL)</option>
                            </select>
                            <div class="custom-fields d-none mt-2">
                                <input type="text" class="form-control mb-1 custom-current-slot" placeholder="Current slot (e.g. c04)" value="${slot}">
                                <input type="text" class="form-control mb-1 custom-target-slot" placeholder="Target slot (e.g. c12)">
                                <input type="text" class="form-control mb-1 custom-share-slot" placeholder="Share slot (e.g. c00)" value="c00">
                            </div>
                        </div>
                        <button class="btn btn-danger remove-slot" data-slot="${slot}">Remove Slot</button>
                        <div class="overlay"></div>
                    </div>
                `).join('')}
            </div>
            <div class="mb-3">
                <strong>Files to be changed (${affectedFiles.length}):</strong>
                <div class="small textmuted" style="max-height: 100px; overflow-y: auto;">
                    ${affectedFiles.map(file => `<div>${file}</div>`).join('')}
                </div>
            </div>
        `}).join('');

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('changeSlotsModal'));
        modal.show();

        // Affiche les champs custom si "Custom..." est choisi
        document.querySelectorAll('.target-slot').forEach(select => {
            select.addEventListener('change', function () {
                const customFields = this.parentElement.querySelector('.custom-fields');
                if (this.value === 'custom') {
                    customFields.classList.remove('d-none');
                    // Prefill current slot and share slot
                    const currentSlotInput = customFields.querySelector('.custom-current-slot');
                    const shareSlotInput = customFields.querySelector('.custom-share-slot');
                    if (currentSlotInput) currentSlotInput.value = this.getAttribute('data-current-slot') || '';
                    if (shareSlotInput) shareSlotInput.value = 'c00';

                    // Affiche un modal d'avertissement
                    if (!document.getElementById('customSlotWarningModal')) {
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
                        document.body.insertAdjacentHTML('beforeend', warningModalHtml);
                    }
                    const warningModal = new bootstrap.Modal(document.getElementById('customSlotWarningModal'));
                    warningModal.show();
                } else {
                    customFields.classList.add('d-none');
                }
            });
        });

        // Handle slot change confirmation
        const confirmBtn = document.getElementById('confirmChangeSlots');
        confirmBtn.onclick = async () => {
            try {
                // Detect if any selection is custom; if so, run reslotter per mod & per selected current slot
                const anyCustom = Array.from(document.querySelectorAll('.target-slot')).some(sel => sel.value === 'custom');
                if (anyCustom) {
                    // Check Python availability first
                    const pyCheck = await window.api.reslotter.checkPython();
                    if (!pyCheck?.available) {
                        const modalId = 'pythonMissingModal';
                        document.getElementById(modalId)?.remove();
                        const html = `
                            <div class="modal fade" id="${modalId}" tabindex="-1">
                                <div class="modal-dialog">
                                    <div class="modal-content">
                                        <div class="modal-header bg-danger text-white">
                                            <h5 class="modal-title"><i class="bi bi-exclamation-triangle me-2"></i> Python Not Found</h5>
                                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                        </div>
                                        <div class="modal-body">
                                            <p>We could not find Python on your system (python --version failed). Please install Python 3 and ensure the 'python' command is available in your PATH.</p>
                                            <ul>
                                                <li>Download: <a href="https://www.python.org/downloads/" target="_blank">python.org/downloads</a></li>
                                                <li>During installation, check "Add python.exe to PATH".</li>
                                                <li>If you still got issue, restart your computer or tell the the Discord Server about your problem.</li>
                                            </ul>
                                            ${pyCheck?.error ? `<div class="small textmuted">Details: ${this.escapeHtml(pyCheck.error)}</div>` : ''}
                                        </div>
                                        <div class="modal-footer">
                                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                        document.body.insertAdjacentHTML('beforeend', html);
                        const bsModal = new bootstrap.Modal(document.getElementById(modalId));
                        bsModal.show();
                        return;
                    }
                    // For each mod, collect custom fields and run reslotter
                    const container = document.getElementById('currentSlotsInfo');
                    for (let mi = 0; mi < modDetails.length; mi++) {
                        const { mod } = modDetails[mi];
                        // Find groups only within this mod's section
                        const section = container.querySelector(`.mod-slot-section[data-mod-index="${mi}"]`);
                        if (!section) continue;
                        const groups = section.querySelectorAll('.slot-group');
                        for (const group of groups) {
                            const select = group.querySelector('.target-slot');
                            if (!select || select.value !== 'custom') continue;
                            const currentSlotEl = group.querySelector('.custom-current-slot');
                            const targetSlotEl = group.querySelector('.custom-target-slot');
                            const shareSlotEl = group.querySelector('.custom-share-slot');
                            const currentAlt = (currentSlotEl?.value || '').trim();
                            const targetAlt = (targetSlotEl?.value || '').trim();
                            const shareSlot = (shareSlotEl?.value || 'c00').trim();
                            if (!currentAlt || !targetAlt) {
                                this.showError('Please fill both Current slot and Target slot in custom fields.');
                                return;
                            }

                            // Try to infer fighter name from the mod
                            let fighter = await this.getFighterNameFromMod(mod.path);
                            if (!fighter) {
                                // Fallback: try to extract from files we already scanned earlier in this flow
                                const files = await window.api.modOperations.getModFiles(mod.path);
                                fighter = this.extractFighterNameFromFiles(files);
                            }
                            if (!fighter) {
                                this.showError('Could not determine fighter name for this mod.');
                                return;
                            }

                            // Build payload and run
                            const payload = {
                                modDirectory: mod.path,
                                fighterName: fighter,
                                currentAlt,
                                targetAlt,
                                shareSlot,
                                outDirectory: mod.path,
                            };
                            this.showLoading(`Running reslotter for ${mod.name} (${fighter} ${currentAlt} -> ${targetAlt}, share ${shareSlot})...`);
                            const result = await window.api.reslotter.run(payload);
                            if (result.exitCode !== 0) {
                                this.showError(`Reslotter failed (exit ${result.exitCode}).\n${result.stderr || ''}`);
                                return;
                            }
                        }
                    }
                    // After running reslotter, reload mods and close
                    await this.loadMods();
                    modal.hide();
                    this.showSuccess('Reslotting completed successfully.');
                    return;
                }

                // Non-custom flow: original behavior
                const slotChanges = {};
                const slotsToRemove = [];
                document.querySelectorAll('.target-slot').forEach(select => {
                    const currentSlot = select.getAttribute('data-current-slot');
                    let targetSlot = select.value.trim();
                    if (targetSlot && targetSlot !== 'custom') {
                        slotChanges[currentSlot] = targetSlot;
                    }
                });
                document.querySelectorAll('.slot-group.removed').forEach(group => {
                    const slot = group.getAttribute('data-slot');
                    slotsToRemove.push(slot);
                });
                await Promise.all(modDetails.map(({ mod, affectedFiles }) => this.handleChangeSlots(mod.path, slotChanges, slotsToRemove, affectedFiles)));
                modal.hide();
            } catch (error) {
                this.showError(`Failed to change slots: ${error.message}`);
            } finally {
                this.hideLoading();
            }
        };

        // Handle slot removal
        document.querySelectorAll('.remove-slot').forEach(button => {
            button.onclick = () => {
                const slotGroup = button.closest('.slot-group');
                slotGroup.classList.toggle('removed');
            };
        });

    } catch (error) {
        this.showError(`Failed to scan mod: ${error.message}`);
    } finally {
        this.hideLoading();
    }
}

async handleChangeSlots(modPath, slotChanges, slotsToRemove, files) {
    try {
        this.showLoading('Changing character slots...');
        
        // Only create Max Slots mod if there are custom slots (> c07)
        const hasCustomSlots = Object.values(slotChanges).some(slot => {
            const slotNum = parseInt(slot.replace('c', ''));
            return slotNum > 7;
        });
        
        if (hasCustomSlots) {
            await ChangeSlots.ensureMaxSlots(modPath, 'resources/src/resources', slotChanges);
        }

        const changedFiles = await ChangeSlots.changeSlots(modPath, slotChanges, files);

        let deletedFiles = 0;
        for (const slot of slotsToRemove) {
            deletedFiles += await ChangeSlots.removeSlot(modPath, slot, files);
        }

        this.showSuccess(`Character slots changed successfully (${changedFiles} files/folders updated, ${deletedFiles} files/folders deleted)`);
        await this.loadMods();
    } catch (error) {
        this.showError(`Failed to change slots: ${error.message}`);
    } finally {
        this.hideLoading();
    }
}

    initializeEmulatorSettings() {
        // Get elements
        const emulatorSelect = document.getElementById('emulatorSelect');
        const emulatorPath = document.getElementById('emulatorPath');
        const gamePath = document.getElementById('gamePath');
        const yuzuFullscreen = document.getElementById('yuzuFullscreen');
        const yuzuOptions = document.getElementById('yuzuOptions');
        const selectEmulatorPath = document.getElementById('selectEmulatorPath');
        const selectGamePath = document.getElementById('selectGamePath');
        const launchGame = document.getElementById('launchGame');

        // Load saved settings
        window.api.emulator.getSelectedEmulator().then(emulator => {
            emulatorSelect.value = emulator;
            yuzuOptions.style.display = emulator === 'yuzu' ? 'block' : 'none';
        });
        window.api.emulator.getEmulatorPath().then(path => emulatorPath.value = path);
        window.api.emulator.getGamePath().then(path => gamePath.value = path);
        window.api.emulator.getYuzuFullscreen().then(enabled => yuzuFullscreen.checked = enabled);

        // Add event listeners
        emulatorSelect.addEventListener('change', async (e) => {
            const emulator = e.target.value;
            await window.api.emulator.setSelectedEmulator(emulator);
            yuzuOptions.style.display = emulator === 'yuzu' ? 'block' : 'none';
        });

        selectEmulatorPath.addEventListener('click', async () => {
            const result = await window.api.dialog.showOpenDialog({
                properties: ['openFile']
            });
            if (!result.canceled) {
                const path = result.filePaths[0];
                emulatorPath.value = path;
                await window.api.emulator.setEmulatorPath(path);
            }
        });

        selectGamePath.addEventListener('click', async () => {
            const result = await window.api.dialog.showOpenDialog({
                properties: ['openFile']
            });
            if (!result.canceled) {
                const path = result.filePaths[0];
                gamePath.value = path;
                await window.api.emulator.setGamePath(path);
            }
        });

        yuzuFullscreen.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            await window.api.emulator.setYuzuFullscreen(enabled);
        });

        launchGame.addEventListener('click', async () => {
            try {
                await window.api.emulator.launchGame();
            } catch (error) {
                this.showError(`Failed to launch game: ${error.message}`);
            }
        });
    }

    initializeProtocolConfirmToggle() {
        const protocolConfirmToggle = document.getElementById('protocolConfirmToggle');
        window.api.settings.getProtocolConfirmEnabled().then(enabled => {
            protocolConfirmToggle.checked = enabled;
        });

        protocolConfirmToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            window.api.settings.setProtocolConfirmEnabled(enabled);
        });
    }

    initializeDownloadsPanel() {
        // ...existing code...
        const panel = document.getElementById('downloadsPanel');
        const header = panel.querySelector('.downloads-header');
        const downloadsList = document.getElementById('downloadsList');
        const downloadCount = document.getElementById('downloadCount');
    
        // Start with the "no downloads" message
        downloadsList.innerHTML = `<div class="text-center p-3 text-muted nodownloadsmessage">
            No downloads ongoing
        </div>`;
    
        header.addEventListener('click', () => {
            panel.classList.toggle('expanded');
        });
    
        window.electron.onDownloadStatus((status) => {
            // For a start event, remove the nodownloads message if present
            if (status.type === 'start') {
                const msg = downloadsList.querySelector('.nodownloadsmessage');
                if (msg) {
                    msg.remove();
                }
                this.addDownloadItem(status.id, status.message, status.modName);
            } else if (status.type === 'progress') {
                this.updateDownloadProgress(status.id, status.message, status.progress, status.modName);
            } else if (['finish', 'error', 'cancelled'].includes(status.type)) {
                this.completeDownload(status.id, status.type, status.message, status.modName);
            }
    
            // Update download count
            const activeCount = downloadsList.querySelectorAll('.download-item').length;
            downloadCount.textContent = activeCount;
    
            // If there are no active downloads, restore the message (only once)
            if (activeCount === 0 && !downloadsList.querySelector('.nodownloadsmessage')) {
                downloadsList.innerHTML = `<div class="text-center p-3 text-muted nodownloadsmessage">
                    No downloads ongoing
                </div>`;
            }
        });
        // ...existing code...
    }

    addDownloadItem(id, message, modName = 'Unknown Mod') {
        try {
            const downloadsList = document.getElementById('downloadsList');
            if (!downloadsList) return;
    
            // Check if an entry for this mod already exists
            const existing = downloadsList.querySelector(`.download-item[data-mod-name="${modName}"]`);
            if (existing) {
                // Optionally update its message instead of creating a duplicate
                const msgEl = existing.querySelector('.message');
                if (msgEl) msgEl.textContent = message;
                return;
            }
    
            const item = document.createElement('div');
            item.className = 'download-item';
            item.id = `download-${id}`;
            // Set data-mod-name so we can check duplicates
            item.setAttribute('data-mod-name', modName);
            item.innerHTML = `
                <div class="download-info">
                    <strong class="mod-name">${this.escapeHtml(modName)}</strong>
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
            document.getElementById('downloadsPanel').classList.add('expanded');
        } catch (error) {
            console.error('Error adding download item:', error);
        }
    }

    async pauseDownload(id) {
        try {
            const item = document.getElementById(`download-${id}`);
            if (!item) return;

            const pauseBtn = item.querySelector('.pause-download');
            const messageEl = item.querySelector('.message');
            const downloader = window.electron.getActiveDownload(id);

            if (!downloader) {
                console.error('No active downloader found for ID:', id);
                return;
            }

            const isPaused = await window.electron.togglePauseDownload(id);
            
            // Update UI based on pause state
            if (isPaused) {
                pauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                messageEl.textContent = 'Paused';
                item.classList.add('paused');
            } else {
                pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                messageEl.textContent = 'Downloading...';
                item.classList.remove('paused');
            }
        } catch (error) {
            console.error('Failed to pause/resume download:', error);
            this.showError('Failed to pause/resume download: ' + error.message);
        }
    }

    updateDownloadProgress(id, message, progress, modName) {
        try {
            const item = document.getElementById(`download-${id}`);
            if (!item) return;

            const messageEl = item.querySelector('.message');
            const progressBar = item.querySelector('.progress-bar');
            if (messageEl) messageEl.textContent = message;
            if (progressBar) progressBar.style.width = `${progress}%`;
            
            const modNameEl = item.querySelector('.mod-name');
            if (modNameEl && modName) modNameEl.textContent = modName;
        } catch (error) {
            console.error('Error updating download progress:', error);
        }
    }

    completeDownload(id, type, message, modName) {
        try {
            const item = document.getElementById(`download-${id}`);
            if (!item) return;

            const messageEl = item.querySelector('.message');
            const progressBar = item.querySelector('.progress-bar');
            const modNameEl = item.querySelector('.mod-name');
            const downloadCount = document.getElementById('downloadCount');

            if (messageEl) messageEl.textContent = message;
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.className = `progress-bar ${
                    type === 'error' ? 'bg-danger' :
                    type === 'cancelled' ? 'bg-warning' :
                    'bg-success'
                }`;
            }
            if (modNameEl && modName) modNameEl.textContent = modName;

            // Don't show any toasts here - they will be handled by the specific handlers

            setTimeout(() => {
                if (item && item.parentNode) {
                    item.remove();
                    
                    const activeCount = document.querySelectorAll('.download-item').length;
                    if (downloadCount) downloadCount.textContent = activeCount;
                    
                    if (activeCount === 0) {
                        const downloadsList = document.getElementById('downloadsList');
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
            console.error('Error completing download:', error);
        }
    }

    async cancelDownload(id) {
        try {
            const item = document.getElementById(`download-${id}`);
            const downloadCount = document.getElementById('downloadCount');
            
            if (item) {
                const progressBar = item.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.className = 'progress-bar bg-warning';
                }
                const info = item.querySelector('.download-info');
                if (info) {
                    info.textContent = 'Cancelling download...';
                }
            }

            await window.electron.cancelDownload(id);
            this.hideLoading();
            
            if (item) {
                const info = item.querySelector('.download-info');
                if (info) {
                    info.textContent = 'Download cancelled';
                }
                const progressBar = item.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.className = 'progress-bar bg-warning';
                    progressBar.style.width = '100%';
                }

                // Show cancellation toast only here
                this.showToast('Download cancelled', 'warning');
                
                setTimeout(() => {
                    item.remove();
                    
                    // Update download count after removing item
                    const activeCount = document.querySelectorAll('.download-item').length;
                    if (downloadCount) downloadCount.textContent = activeCount;
                    
                    // Check if there are any remaining downloads
                    if (!document.querySelector('.download-item')) {
                        const downloadsList = document.getElementById('downloadsList');
                        if (downloadsList) {
                            downloadsList.innerHTML = `
                                <div class="text-center p-3 text-muted nodownloadsmessage">
                                    No downloads ongoing
                                </div>
                            `;
                        }
                        document.getElementById('downloadsPanel').classList.remove('expanded');
                    }
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to cancel download:', error);
            this.showError('Failed to cancel download: ' + error.message);
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
        document.title = 'FeetPlanner';
        
        // Change main app name in the interface
        const appTitles = document.querySelectorAll('h5.mb-0');
        appTitles.forEach(title => {
            if (title.textContent.includes('FightPlanner')) {
                title.textContent = title.textContent.replace('FightPlanner', 'FeetPlanner');
            }
        });
        
        // Change logo
        const appLogo = document.getElementById('appLogo');
        if (appLogo) {
            // Create a new image
            const newLogo = new Image();
            newLogo.onload = () => {
                appLogo.src = newLogo.src;
            };
            newLogo.src = 'https://files.gamebanana.com/bitpit/feetplanner.png';
            appLogo.alt = 'FeetPlanner Logo';
        }

        // Update credits modal
        const creditsModal = document.getElementById('creditsModal');
        if (creditsModal) {
            // Update modal title
            const modalTitle = creditsModal.querySelector('#creditsModalLabel');
            if (modalTitle) {
                modalTitle.textContent = 'About FeetPlanner';
            }

            // Update modal content
            const modalBody = creditsModal.querySelector('.modal-body');
            if (modalBody) {
                // Change logo in modal
                const modalLogo = modalBody.querySelector('img');
                if (modalLogo) {
                    modalLogo.src = 'https://files.gamebanana.com/bitpit/feetplanner.png';
                    modalLogo.alt = 'FeetPlanner Logo';
                }

                // Change heading
                const modalHeading = modalBody.querySelector('h4');
                if (modalHeading) {
                    modalHeading.textContent = 'FeetPlanner';
                }

                // Change description
                const modalDesc = modalBody.querySelector('p:not(.small)');
                if (modalDesc) {
                    modalDesc.textContent = 'A foot manager for Smash Ultimate';
                }
            }
        }

        // Change any other mentions of FightPlanner in the interface
        document.querySelectorAll('*').forEach(element => {
            if (element.childNodes && element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
                if (element.textContent.includes('FightPlanner')) {
                    element.textContent = element.textContent.replace(/FightPlanner/g, 'FeetPlanner');
                }
            }
        });
    }

    static updateDownloadStatus(status) {
        const downloadsList = document.getElementById('downloadsList');
        let downloadItem = document.getElementById(`download-${status.id}`);

        if (!downloadItem) {
            downloadItem = document.createElement('div');
            downloadItem.id = `download-${status.id}`;
            downloadItem.className = 'download-item';
            downloadsList.appendChild(downloadItem);
        }

        downloadItem.innerHTML = `
            <div class="download-info">
                <strong class="download-title">${status.modName || 'Downloading...'}</strong>
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

        if (status.type === 'finish' || status.type === 'error' || status.type === 'cancelled') {
            setTimeout(() => {
                downloadItem.remove();
            }, 5000);
        }
    }

    initializeCharactersTab() {
        // Initialize refresh button
        const refreshBtn = document.getElementById('refreshCharacters');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (this.characterScanner) {
                    this.characterScanner.refresh();
                }
            });
        }

        // Only scan when tab is first shown
        document.getElementById('characters-tab').addEventListener('shown.bs.tab', () => {
            if (this.characterScanner) {
                this.characterScanner.scanMods();
            }
        });
    }

    initializeModSelection() {
        // Listen for the custom event
        window.addEventListener('select-mod-from-character', async (event) => {
            const modName = event.detail.modName;
            
            // Switch to mods tab
            document.getElementById('mods-tab').click();
            
            // Wait a brief moment for tab switch animation
            setTimeout(() => {
                // Find and select the mod
                const modItem = document.querySelector(`[data-mod-id="${modName}"]`);
                if (modItem) {
                    modItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    this.selectMod(modName);
                }
            }, 150);
        });
    }

    initializeAnnouncementSystem() {
        try {
            console.log('[UIController] Initialisation du système d\'annonces');
            const githubJsonUrl = 'https://raw.githubusercontent.com/FightPlanner/.github/refs/heads/main/v3.json';
            this.announcementModal = new AnnouncementModal(githubJsonUrl);
            this.announcementModal.initialize();
            console.log('[UIController] Système d\'annonces prêt');
        } catch (error) {
            console.error('[UIController] Erreur initialisation annonces:', error);
        }
    }

    async showCreateFppDialog() {
        try {
            // Load mods and plugins
            const mods = await window.api.modOperations.loadMods();
            const plugins = await window.api.pluginOperations.loadPlugins();
            
            const renderModsList = (filteredMods) => {
                const modsListHtml = filteredMods.map(mod => `
                    <label class="list-group-item">
                        <input class="form-check-input me-2 fpp-mod" type="checkbox" value="${mod.id}">
                        ${this.escapeHtml(mod.name)}
                    </label>
                `).join('');
                document.getElementById('fppModsList').innerHTML = modsListHtml;
            };

            const renderPluginsList = (filteredPlugins) => {
                const pluginsListHtml = filteredPlugins.map(plugin => `
                    <label class="list-group-item">
                        <input class="form-check-input me-2 fpp-plugin" type="checkbox" value="${plugin.id}">
                        ${this.escapeHtml(plugin.name)}
                    </label>
                `).join('');
                document.getElementById('fppPluginsList').innerHTML = pluginsListHtml;
            };
            
            // Initial render
            renderModsList(mods);
            renderPluginsList(plugins);
            
            // Add search functionality
            document.getElementById('fppModSearch')?.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredMods = mods.filter(mod => 
                    mod.name.toLowerCase().includes(searchTerm)
                );
                renderModsList(filteredMods);
            });

            document.getElementById('fppPluginSearch')?.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredPlugins = plugins.filter(plugin => 
                    plugin.name.toLowerCase().includes(searchTerm)
                );
                renderPluginsList(filteredPlugins);
            });
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('createFppModal'));
            modal.show();
        } catch (error) {
            this.showError('Failed to load mods/plugins: ' + error.message);
        }
    }

    async createFpp() {
        try {
            const name = document.getElementById('fppName').value.trim();
            if (!name) {
                this.showError('Please enter a package name');
                return;
            }

            // Ouvrir la boîte de dialogue pour choisir l'emplacement de sauvegarde
            const saveResult = await window.api.dialog.showOpenDialog({
                title: 'Choose where to save the FPP package',
                properties: ['openDirectory'],
                buttonLabel: 'Save Here'
            });

            if (saveResult.canceled) {
                return;
            }

            await this.showLoading('Creating FPP package...');

            const selectedMods = Array.from(document.querySelectorAll('.fpp-mod:checked')).map(cb => cb.value);
            const selectedPlugins = Array.from(document.querySelectorAll('.fpp-plugin:checked')).map(cb => cb.value);

            // Passer le répertoire choisi au créateur de FPP
            const result = await window.api.fppOperations.createFpp({
                name,
                mods: selectedMods,
                plugins: selectedPlugins,
                outputDir: saveResult.filePaths[0]
            });

            if (result.success) {
                this.showSuccess(`Package created successfully at: ${result.path}`);
                const modal = bootstrap.Modal.getInstance(document.getElementById('createFppModal'));
                modal.hide();
            } else {
                this.showError('Failed to create package: ' + result.error);
            }
        } catch (error) {
            this.showError('Failed to create package: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }
    
    // Ajouter un gestionnaire pour l'import FPP
    async handleImportFpp(filePath) {
        try {
            await this.showLoading('Importing FPP package...');
            const result = await window.api.fppOperations.importFpp(filePath);
            
            if (result.success) {
                this.showSuccess('Package imported successfully');
                await this.loadMods();
                await this.loadPlugins();
            } else {
                this.showError('Failed to import package: ' + result.error);
            }
        } catch (error) {
            this.showError('Failed to import package: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    initializeFppHandlers() {

        // Handler pour le drag & drop de FPP
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const files = Array.from(e.dataTransfer.files);
            const fppFiles = files.filter(file => file.name.toLowerCase().endsWith('.fpp'));

            if (fppFiles.length > 0) {
                await this.handleFppFiles(fppFiles);
            }
        });

        // Add select all handlers
        document.getElementById('selectAllMods')?.addEventListener('change', (e) => {
            const modCheckboxes = document.querySelectorAll('.fpp-mod');
            modCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });

        document.getElementById('selectAllPlugins')?.addEventListener('change', (e) => {
            const pluginCheckboxes = document.querySelectorAll('.fpp-plugin');
            pluginCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });

        // Update "Select All" checkboxes when individual items are clicked
        document.getElementById('fppModsList')?.addEventListener('change', () => {
            const modCheckboxes = document.querySelectorAll('.fpp-mod');
            const selectAllMods = document.getElementById('selectAllMods');
            if (selectAllMods) {
                selectAllMods.checked = Array.from(modCheckboxes).every(cb => cb.checked);
                selectAllMods.indeterminate = !selectAllMods.checked && Array.from(modCheckboxes).some(cb => cb.checked);
            }
        });

        document.getElementById('fppPluginsList')?.addEventListener('change', () => {
            const pluginCheckboxes = document.querySelectorAll('.fpp-plugin');
            const selectAllPlugins = document.getElementById('selectAllPlugins');
            if (selectAllPlugins) {
                selectAllPlugins.checked = Array.from(pluginCheckboxes).every(cb => cb.checked);
                selectAllPlugins.indeterminate = !selectAllPlugins.checked && Array.from(pluginCheckboxes).some(cb => cb.checked);
            }
        });

        // Rest of your existing FPP handlers...
        // ...existing code...
    }

    async handleImportFppClick() {
        try {
            const result = await window.api.dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [
                    { name: 'FightPlanner Packages', extensions: ['fpp'] }
                ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
                await this.handleFppFiles([{ path: result.filePaths[0] }]);
            }
        } catch (error) {
            this.showError('Failed to import FPP: ' + error.message);
        }
    }

    async handleFppFiles(files) {
        try {
            await this.showLoading('Importing FPP package...');

            for (const file of files) {
                const result = await window.api.fppOperations.importFpp(file.path);
                
                if (result.success) {
                    this.showToast('Package imported successfully', 'success');
                    await this.loadMods(); // Recharger la liste des mods
                    await this.loadPlugins(); // Recharger la liste des plugins
                } else {
                    this.showError('Failed to import package: ' + result.error);
                }
            }
        } catch (error) {
            this.showError('Import error: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    initializeCategoryFilters() {
        const categoryDropdown = document.getElementById('categoryFilters');
        const dropdownToggle = document.getElementById('toggleCategories');
        
        // Initialize the Bootstrap dropdown with options
        const dropdown = new bootstrap.Dropdown(dropdownToggle, {
            autoClose: true // Enable auto-closing when clicking outside
        });

        const categoryItems = document.querySelectorAll('#categoryFilters .dropdown-item[data-category]');
        categoryItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the dropdown from closing when clicking items
                const category = item.dataset.category;
                
                item.classList.toggle('active');
                
                if (item.classList.contains('active')) {
                    this.selectedCategories.add(category);
                } else {
                    this.selectedCategories.delete(category);
                }
                
                // Update button appearance
                if (this.selectedCategories.size > 0) {
                    dropdownToggle.classList.add('btn-primary');
                    dropdownToggle.classList.remove('btn-outline-secondary');
                } else {
                    dropdownToggle.classList.remove('btn-primary');
                    dropdownToggle.classList.add('btn-outline-secondary');
                }
                
                this.performSearch();
            });
        });

        // Clear filters handler
        const clearButton = document.getElementById('clearCategoryFilters');
        if (clearButton) {
            clearButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectedCategories.clear();
                categoryItems.forEach(item => item.classList.remove('active'));
                dropdownToggle.classList.remove('btn-primary');
                dropdownToggle.classList.add('btn-outline-secondary');
                this.performSearch();
                dropdown.hide(); // Explicitly hide the dropdown after clearing
            });
        }
    }

    // Legacy mod discovery toggle
    initializeLegacyModDiscoveryToggle() {
        const legacyModDiscoveryToggle = document.getElementById('legacyModDiscoveryToggle');
        if (legacyModDiscoveryToggle) {
            // Load current setting without showing notification
            window.api.settings.getLegacyModDiscovery().then(enabled => {
                // Set the checkbox without triggering the change event
                legacyModDiscoveryToggle.checked = enabled;
            }).catch(error => {
                console.error('Failed to get legacy mod discovery setting:', error);
            });

            // Add change event listener
            legacyModDiscoveryToggle.addEventListener('change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    await window.api.settings.setLegacyModDiscovery(enabled);
                    console.log('Legacy mod discovery set to:', enabled);
                } catch (error) {
                    console.error('Failed to set legacy mod discovery:', error);
                    this.showError('Failed to update legacy mod discovery setting: ' + error.message);
                }
            });
        } else {
            console.error('Legacy mod discovery toggle element not found');
        }
    }

    initializeSmartRenameHandlers() {
        const bulkBtnHeader = document.getElementById('bulkSmartRenameBtnHeader');
        if (bulkBtnHeader) {
            bulkBtnHeader.addEventListener('click', () => this.openSmartRenameSelectModal());
        }

        const selectAllCheckbox = document.getElementById('smartRenameSelectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('#smartRenameTableBody input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                    const index = parseInt(cb.dataset.index);
                    if (this.smartRenamePreviews[index]) {
                        this.smartRenamePreviews[index].selected = e.target.checked;
                    }
                });
                this.updateApplyButtonState();
            });
        }

        const applyBtn = document.getElementById('applySmartRenameBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applySmartRenames());
        }

        this.initializeModSelectionModal();
        this.initializePatternDragDrop('patternSortable', 'patternSeparator', 'patternPreview');
        this.initializePatternDragDrop('settingsPatternSortable', 'settingsPatternSeparator', 'settingsPatternPreview');
        this.initializeSaveDefaultPattern();

        this.selectedModsForRename = new Set();
        this.currentPatternOrder = ['character', 'slot', 'modname'];
        this.currentSeparator = '_';

        this.loadDefaultPattern();
    }

    async loadDefaultPattern() {
        try {
            const stored = localStorage.getItem('smartRenamePattern');
            if (stored) {
                const pattern = JSON.parse(stored);
                this.currentPatternOrder = pattern.order || ['character', 'slot', 'modname'];
                this.currentSeparator = pattern.separator || '_';
                this.applyPatternToUI('settingsPatternSortable', 'settingsPatternSeparator', 'settingsPatternPreview');
            }
        } catch (e) {
            console.error('Error loading default pattern:', e);
        }
    }

    applyPatternToUI(sortableId, separatorId, previewId) {
        const container = document.getElementById(sortableId);
        const separatorInput = document.getElementById(separatorId);
        const previewEl = document.getElementById(previewId);

        if (!container) return;

        const items = Array.from(container.querySelectorAll('[data-pattern]'));
        const orderedItems = [];

        this.currentPatternOrder.forEach(key => {
            const item = items.find(el => el.dataset.pattern === key);
            if (item) orderedItems.push(item);
        });

        orderedItems.forEach(item => container.appendChild(item));

        if (separatorInput) separatorInput.value = this.currentSeparator;
        if (previewEl) this.updatePatternPreview(sortableId, separatorId, previewId);
    }

    initializePatternDragDrop(sortableId, separatorId, previewId) {
        const container = document.getElementById(sortableId);
        const separatorInput = document.getElementById(separatorId);

        if (!container) return;

        let draggedItem = null;

        container.addEventListener('dragenter', (e) => {
            e.stopPropagation();
        });

        container.addEventListener('dragleave', (e) => {
            e.stopPropagation();
        });

        container.querySelectorAll('[data-pattern]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                draggedItem = item;
                item.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.pattern);
            });

            item.addEventListener('dragend', (e) => {
                e.stopPropagation();
                draggedItem.style.opacity = '1';
                draggedItem = null;
                this.updatePatternPreview(sortableId, separatorId, previewId);
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggedItem && draggedItem !== item) {
                    const rect = item.getBoundingClientRect();
                    const midX = rect.left + rect.width / 2;
                    if (e.clientX < midX) {
                        container.insertBefore(draggedItem, item);
                    } else {
                        container.insertBefore(draggedItem, item.nextSibling);
                    }
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        if (separatorInput) {
            separatorInput.addEventListener('input', () => {
                this.updatePatternPreview(sortableId, separatorId, previewId);
            });
        }

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.updatePatternPreview(sortableId, separatorId, previewId);
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    updatePatternPreview(sortableId, separatorId, previewId) {
        const container = document.getElementById(sortableId);
        const separatorInput = document.getElementById(separatorId);
        const previewEl = document.getElementById(previewId);

        if (!container || !previewEl) return;

        const order = this.getPatternOrder(sortableId);
        const separator = separatorInput ? separatorInput.value : '_';

        const displayNames = {
            character: 'Character',
            slot: 'Slot',
            modname: 'ModName'
        };

        const preview = order.map(key => displayNames[key]).join(separator);
        previewEl.textContent = preview;
    }

    getPatternOrder(sortableId) {
        const container = document.getElementById(sortableId);
        if (!container) return ['character', 'slot', 'modname'];

        return Array.from(container.querySelectorAll('[data-pattern]'))
            .map(el => el.dataset.pattern);
    }

    initializeSaveDefaultPattern() {
        const saveBtn = document.getElementById('saveDefaultPatternBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const order = this.getPatternOrder('settingsPatternSortable');
                const separator = document.getElementById('settingsPatternSeparator').value || '_';

                localStorage.setItem('smartRenamePattern', JSON.stringify({
                    order: order,
                    separator: separator
                }));

                this.currentPatternOrder = order;
                this.currentSeparator = separator;

                this.showSuccess('Default pattern saved!');
            });
        }
    }

    initializeModSelectionModal() {
        const selectAllBtn = document.getElementById('selectAllModsBtn');
        const selectEnabledBtn = document.getElementById('selectEnabledModsBtn');
        const selectDisabledBtn = document.getElementById('selectDisabledModsBtn');
        const deselectAllBtn = document.getElementById('deselectAllModsBtn');
        const proceedBtn = document.getElementById('proceedSmartRenameBtn');

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectModsForRename('all'));
        }
        if (selectEnabledBtn) {
            selectEnabledBtn.addEventListener('click', () => this.selectModsForRename('enabled'));
        }
        if (selectDisabledBtn) {
            selectDisabledBtn.addEventListener('click', () => this.selectModsForRename('disabled'));
        }
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => this.selectModsForRename('none'));
        }
        if (proceedBtn) {
            proceedBtn.addEventListener('click', () => this.proceedToSmartRenamePreview());
        }
    }

    openSmartRenameSelectModal() {
        const modal = document.getElementById('smartRenameSelectModal');
        const modList = document.getElementById('modSelectionList');

        modList.innerHTML = '';
        this.selectedModsForRename = new Set();

        this.applyPatternToUI('patternSortable', 'patternSeparator', 'patternPreview');

        this.mods.forEach((mod, index) => {
            const modName = mod.name || mod.id || mod;
            const isEnabled = mod.enabled !== false;

            const item = document.createElement('label');
            item.className = 'list-group-item d-flex align-items-center';
            item.innerHTML = `
                <input class="form-check-input me-2" type="checkbox" data-mod-index="${index}">
                <span class="flex-grow-1">${this.escapeHtml(modName)}</span>
                <span class="badge ${isEnabled ? 'bg-success' : 'bg-secondary'}">${isEnabled ? 'Enabled' : 'Disabled'}</span>
            `;

            const checkbox = item.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selectedModsForRename.add(index);
                } else {
                    this.selectedModsForRename.delete(index);
                }
                this.updateSelectedModCount();
            });

            modList.appendChild(item);
        });

        this.updateSelectedModCount();

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    selectModsForRename(filter) {
        const checkboxes = document.querySelectorAll('#modSelectionList input[type="checkbox"]');

        checkboxes.forEach(cb => {
            const index = parseInt(cb.dataset.modIndex);
            const mod = this.mods[index];
            const isEnabled = mod && mod.enabled !== false;

            if (filter === 'all') {
                cb.checked = true;
                this.selectedModsForRename.add(index);
            } else if (filter === 'none') {
                cb.checked = false;
                this.selectedModsForRename.delete(index);
            } else if (filter === 'enabled' && isEnabled) {
                cb.checked = true;
                this.selectedModsForRename.add(index);
            } else if (filter === 'disabled' && !isEnabled) {
                cb.checked = true;
                this.selectedModsForRename.add(index);
            } else if (filter !== 'all' && filter !== 'none') {
                cb.checked = false;
                this.selectedModsForRename.delete(index);
            }
        });

        this.updateSelectedModCount();
    }

    updateSelectedModCount() {
        const countEl = document.getElementById('selectedModCount');
        const proceedBtn = document.getElementById('proceedSmartRenameBtn');

        countEl.textContent = `${this.selectedModsForRename.size} mods selected`;
        proceedBtn.disabled = this.selectedModsForRename.size === 0;
    }

    async proceedToSmartRenamePreview() {
        const selectModal = bootstrap.Modal.getInstance(document.getElementById('smartRenameSelectModal'));
        selectModal.hide();

        const patternOrder = this.getPatternOrder('patternSortable');
        const separator = document.getElementById('patternSeparator').value || '_';

        this.smartRename.setPattern(patternOrder, separator);

        const selectedMods = Array.from(this.selectedModsForRename).map(index => {
            const mod = this.mods[index];
            return {
                name: mod.name || mod.id || mod,
                path: mod.path
            };
        });

        await this.showSmartRenamePreview(selectedMods);
    }

    async handleSmartRenameSingleMod() {
        if (!this.selectedMod) {
            this.showError('No mod selected');
            return;
        }

        const modPath = await window.api.modOperations.getModPath(this.selectedMod);
        const mod = {
            name: this.selectedMod,
            path: modPath
        };

        await this.showSmartRenamePreview([mod]);
    }

    async handleBulkSmartRename() {
        this.openSmartRenameSelectModal();
    }

    async showSmartRenamePreview(mods) {
        const modal = document.getElementById('smartRenamePreviewModal');
        const loading = document.getElementById('smartRenameLoading');
        const noChanges = document.getElementById('smartRenameNoChanges');
        const tableContainer = document.getElementById('smartRenameTableContainer');
        const tableBody = document.getElementById('smartRenameTableBody');
        const applyBtn = document.getElementById('applySmartRenameBtn');
        const selectAllCheckbox = document.getElementById('smartRenameSelectAll');

        loading.style.display = 'block';
        noChanges.style.display = 'none';
        tableContainer.style.display = 'none';
        applyBtn.disabled = true;
        tableBody.innerHTML = '';

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        try {
            this.smartRenamePreviews = await this.smartRename.previewRenames(mods);

            loading.style.display = 'none';

            if (this.smartRenamePreviews.length === 0) {
                noChanges.style.display = 'block';
                return;
            }

            tableContainer.style.display = 'block';
            selectAllCheckbox.checked = true;

            this.smartRenamePreviews.forEach((preview, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <input class="form-check-input" type="checkbox" checked data-index="${index}">
                    </td>
                    <td><code>${this.escapeHtml(preview.originalName)}</code></td>
                    <td class="text-center"><i class="bi bi-arrow-right"></i></td>
                    <td><code class="text-success">${this.escapeHtml(preview.newName)}</code></td>
                `;
                tableBody.appendChild(row);

                const checkbox = row.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', (e) => {
                    this.smartRenamePreviews[index].selected = e.target.checked;
                    this.updateApplyButtonState();
                    this.updateSelectAllState();
                });
            });

            this.updateApplyButtonState();
        } catch (error) {
            console.error('Error generating smart rename previews:', error);
            loading.style.display = 'none';
            noChanges.textContent = 'Error analyzing mods: ' + error.message;
            noChanges.style.display = 'block';
        }
    }

    updateApplyButtonState() {
        const applyBtn = document.getElementById('applySmartRenameBtn');
        const hasSelected = this.smartRenamePreviews.some(p => p.selected);
        applyBtn.disabled = !hasSelected;
    }

    updateSelectAllState() {
        const selectAllCheckbox = document.getElementById('smartRenameSelectAll');
        const allSelected = this.smartRenamePreviews.every(p => p.selected);
        const someSelected = this.smartRenamePreviews.some(p => p.selected);
        selectAllCheckbox.checked = allSelected;
        selectAllCheckbox.indeterminate = someSelected && !allSelected;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async applySmartRenames() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('smartRenamePreviewModal'));
        const selectedRenames = this.smartRenamePreviews.filter(p => p.selected);

        if (selectedRenames.length === 0) {
            this.showError('No mods selected for renaming');
            return;
        }

        modal.hide();
        await this.showLoading(`Renaming ${selectedRenames.length} mod(s)...`);

        try {
            const results = await this.smartRename.applyRenames(selectedRenames);

            this.hideLoading();

            if (results.failed.length > 0) {
                this.showError(`Failed to rename ${results.failed.length} mod(s). Successfully renamed ${results.success.length} mod(s).`);
            } else {
                this.showSuccess(`Successfully renamed ${results.success.length} mod(s)!`);
            }

            await this.loadMods();
        } catch (error) {
            console.error('Error applying smart renames:', error);
            this.hideLoading();
            this.showError('Failed to apply renames: ' + error.message);
        }
    }
}

// Add drag and drop handling
document.body.addEventListener('dragenter', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
});

document.body.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only remove class if we're leaving the body element itself
    const rect = document.body.getBoundingClientRect();
    if (
        e.clientX <= rect.left ||
        e.clientX >= rect.right ||
        e.clientY <= rect.top ||
        e.clientY >= rect.bottom
    ) {
        document.body.classList.remove('dragging');
    }
});

document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
});

// Add a dragend event listener as a fallback
document.body.addEventListener('dragend', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
});

// Export the handler function for the HTML
window.uiController = {
    
    handleFileDrop: async (event) => {
        event.preventDefault();
        document.body.classList.remove('dragging');

        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;

        // Process each dropped file
        for (const file of files) {
            // Add your file processing logic here
            // For example:
            if (file.path.endswith('.zip')) {
                try {
                    // Handle mod installation
                    await installMod(file.path);
                } catch (error) {
                    console.error('Error installing mod:', error);
                    // Show error toast or notification
                }
            }
        }
    }
};

async function selectCustomCssFile() {
    const filePath = await window.electronAPI.selectCustomCssFile();
    if (filePath) {
        document.getElementById('customCssPath').value = filePath;
        await window.electronAPI.setCustomCssPath(filePath);
    }
}

window.uiController = {
    selectCustomCssFile,
};

async function initializeUI() {
    await languageService.init();
    
    // Add language change handler
    const languageSelect = document.getElementById('languageSelect');
    languageSelect.value = languageService.currentLanguage;
    
    languageSelect.addEventListener('change', async (e) => {
        await languageService.loadTranslations(e.target.value);
    });
}

// Add this to your DOMContentLoaded event listener or initialization code
async function updateAppVersion() {
    try {
        const version = await window.api.getAppVersion();
        const versionBadge = document.getElementById('appVersionBadge');
        if (versionBadge) {
            versionBadge.textContent = `Version ${version}`;
        }
    } catch (error) {
        console.error('Failed to get app version:', error);
    }
}

// Call this when the credits modal is shown
document.getElementById('creditsModal').addEventListener('show.bs.modal', updateAppVersion);

// Initialize the UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    const ui = new UIController();
    const openPluginsFolderButton = document.getElementById('openPluginsFolderButton');
    if (openPluginsFolderButton) {
        openPluginsFolderButton.addEventListener('click', () => {
            uiController.handleOpenPluginsFolder();
        });
    }

    // Add event listeners for tab changes
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.textContent.trim();
        });
    });

    initializeUI();
});