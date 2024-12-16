console.log('UIController loading...');
import { ModManager } from './modManager.js';
import { Tutorial } from './tutorial.js';

class UIController {
    constructor() {
        
        this.modManager = new ModManager();
        this.tutorial = new Tutorial();
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
        window.uiController = this;
        this.mods = [];
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
    
    

    
    showLoading(message = 'Loading...') {
        // Create a loading element if it doesn't exist
        let loadingElement = document.getElementById('loading-overlay');
        
        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.id = 'loading-overlay';
            loadingElement.innerHTML = `
                <div class="loading-content">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p>${message}</p>
                </div>
            `;
            loadingElement.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            `;
            document.body.appendChild(loadingElement);
        } else {
            // Update message if loading element exists
            const messageElement = loadingElement.querySelector('p');
            if (messageElement) {
                messageElement.textContent = message;
            }
            loadingElement.style.display = 'flex';
        }
    }

    // Placeholder method for hiding loading state
    hideLoading() {
        const loadingElement = document.getElementById('loading-overlay');
        if (loadingElement) {
            loadingElement.style.display = 'none';
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

    handleGameBananaDownload() {
        // Get link from input
        const linkInput = document.getElementById('gameBananaLink');
        const downloadLink = linkInput.value.trim();

        // Validate link
        if (!downloadLink) {
            alert('Please enter a GameBanana mod link');
            return;
        }

        // Disable download button
        const confirmDownloadBtn = document.getElementById('confirmDownloadBtn');
        confirmDownloadBtn.disabled = true;
        confirmDownloadBtn.textContent = 'Downloading...';

        // Check if electron API is available
        if (!window.electron || !window.electron.downloadMod) {
            console.error('Electron download API not available');
            alert('Download service is not available');
            confirmDownloadBtn.disabled = false;
            confirmDownloadBtn.textContent = 'Download';
            return;
        }

        // Perform download via exposed API
        window.electron.downloadMod(downloadLink)
            .then((filePath) => {
                // Close the modal
                const downloadModal = bootstrap.Modal.getInstance(document.getElementById('gameBananaDownloadModal'));
                if (downloadModal) {
                    downloadModal.hide();
                }

                // Show success message
                alert(`Mod downloaded successfully to ${filePath}`);

                // Reload mods if possible
                if (this.loadMods && typeof this.loadMods === 'function') {
                    this.loadMods();
                }
            })
            .catch((error) => {
                console.error('Download error:', error);
                alert(`Failed to download mod: ${error.message}`);
            })
            .finally(() => {
                // Re-enable download button
                confirmDownloadBtn.disabled = false;
                confirmDownloadBtn.textContent = 'Download';
            });
    }


    showGameBananaDownloadDialog() {
        // Create a modal dialog
        const dialog = `
            <div class="modal fade" id="gameBananaDownloadModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Download Mod</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label for="gameBananaLink" class="form-label">GameBanana Mod Link</label>
                                <input 
                                    type="text" 
                                    class="form-control" 
                                    id="gameBananaLink" 
                                    placeholder="Paste GameBanana mod link here"
                                >
                            </div>
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
        const downloadModal = new bootstrap.Modal(document.getElementById('gameBananaDownloadModal'));
        downloadModal.show();

        // Add event listener for download confirmation
        const confirmDownloadBtn = document.getElementById('confirmDownloadBtn');
        confirmDownloadBtn.addEventListener('click', this.handleGameBananaDownload);
    }

    async downloadMod(url) {
        try {
            // Show loading
            await this.showLoading('Downloading mod...');

            // Download mod
            const filePath = await this.modDownloader.downloadMod(url);

            // Reload mods
            await this.loadMods();

            // Show success
            this.showSuccess('Mod downloaded successfully');

            return filePath;
        } catch (error) {
            console.error('Mod download error:', error);
            this.showError('Failed to download mod');
        } finally {
            this.hideLoading();
        }
    }

    // Optional: Download with progress
    downloadModWithProgress(url) {
        this.modDownloader.downloadWithProgress(url, (progress) => {
            // Update progress UI
            console.log(`Download progress: ${progress.percent * 100}%`);
        });
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
    
    performSearch() {
        console.log('Performing search');
    
        // Get search input and filter elements
        const searchInput = document.getElementById('modSearchInput');
        const enabledFilter = document.getElementById('enabledFilter');
        const disabledFilter = document.getElementById('disabledFilter');
    
        // Validate elements
        if (!searchInput || !enabledFilter || !disabledFilter) {
            console.error('Search elements not found');
            return;
        }
    
        // Get search parameters
        const searchTerm = searchInput.value.toLowerCase().trim();
        const showEnabled = enabledFilter.checked;
        const showDisabled = disabledFilter.checked;
    
        console.log('Search parameters:', {
            searchTerm,
            showEnabled,
            showDisabled,
            totalMods: this.mods.length
        });
    
        // Filter mods based on search and filter criteria
        const filteredMods = this.mods.filter(mod => {
            const matchesSearch = searchTerm === '' || 
                mod.name.toLowerCase().includes(searchTerm);
            
            const matchesEnabledFilter = 
                (showEnabled && mod.enabled) || 
                (showDisabled && !mod.enabled) || 
                (!showEnabled && !showDisabled);
    
            return matchesSearch && matchesEnabledFilter;
        });
    
        console.log('Filtered mods:', filteredMods.length);
    
        // Re-render the filtered list
        this.renderModList(filteredMods);
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
            const darkModeToggle = document.getElementById('darkModeToggle');
            darkModeToggle.checked = enabled;
            this.applyDarkMode(enabled);
        });

        // Dark mode toggle event listener
        document.getElementById('darkModeToggle').addEventListener('change', (e) => {
            const enabled = e.target.checked;
            window.api.settings.setDarkMode(enabled);
            this.applyDarkMode(enabled);
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
        } catch (error) {
            this.showError('Failed to load settings');
        }
    }

async loadMods() {
    try {
        // Load mods and store them for searching
        this.mods = await this.modManager.loadMods();
        
        // Render initial list
        this.renderModList(this.mods);
        // Setup search after mods are loaded
        this.initializeSearchBar();
    } catch (error) {
        this.showError('Failed to load mods');
    }
}

// Ensure renderModList handles the filtering
renderModList(mods) {
    const modList = document.getElementById('modList');
    
    // Clear existing list
    modList.innerHTML = '';

    // Check if mods is empty
    if (!mods || mods.length === 0) {
        modList.innerHTML = `
            <div class="text-center p-4 textmuted">
                <i class="bi bi-inbox-fill fs-1"></i>
                <p class="mt-2">No mods found</p>
            </div>
        `;
        return;
    }

    // Include both enabled and disabled mods
    modList.innerHTML = mods.map(mod => `
        <div class="mod-item ${mod.enabled ? 'enabled' : 'disabled'}" data-mod-id="${mod.id}">
            <div class="mod-status ${mod.enabled ? 'mod-status-enabled' : 'mod-status-disabled'} me-3">
                <i class="bi ${mod.enabled ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
            </div>
            <div>
                <div class="fw-medium">${this.escapeHtml(mod.name)}</div>
            </div>
        </div>
    `).join('');

    // Log rendered mods
    console.log(`Rendered ${mods.length} mods`);
}

    renderModList(mods) {
        const modList = document.getElementById('modList');
        
        // Clear existing list
        modList.innerHTML = '';

        // Check if mods is empty
        if (!mods || mods.length === 0) {
            modList.innerHTML = `
                <div class="text-center text-muted py-3">
                    No mods found
                </div>
            `;
            return;
        }

        // Render each mod
        mods.forEach(mod => {
            const modElement = document.createElement('div');
            modElement.classList.add(
                'mod-item', 
                'd-flex', 
                'justify-content-between', 
                'align-items-center', 
                'p-2', 
                'border-bottom',
                mod.enabled ? 'bg-success-subtle' : 'bg-danger-subtle'
            );
            
            modElement.innerHTML = `
                <div class="mod-info">
                    <strong>${this.escapeHtml(mod.name)}</strong>
                    <small class="d-block text-muted">
                        ${mod.enabled ? 'Enabled' : 'Disabled'}
                    </small>
                </div>
                <div class="mod-actions">
                    <button class="btn btn-sm btn-outline-secondary me-1 toggle-mod">
                        <i class="bi bi-${mod.enabled ? 'toggle-on' : 'toggle-off'}"></i>
                    </button>
                </div>
            `;

            // Add click event to select mod
            modElement.addEventListener('click', () => this.selectMod(mod.name));

            // Add toggle mod event
            const toggleButton = modElement.querySelector('.toggle-mod');
            toggleButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMod(mod.name);
            });

            modList.appendChild(modElement);
        });
    }

    // Utility method to escape HTML
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
        
        if (!mods.length) {
            modList.innerHTML = `
                <div class="text-center p-4 text-muted">
                    <i class="bi bi-inbox-fill fs-1"></i>
                    <p class="mt-2">No mods found</p>
                </div>
            `;
            return;
        }
    
        // Include both enabled and disabled mods
        modList.innerHTML = mods.map(mod => `
            <div class="mod-item ${mod.enabled ? 'enabled' : 'disabled'}" data-mod-id="${mod.id}">
                <div class="mod-status ${mod.enabled ? 'mod-status-enabled' : 'mod-status-disabled'} me-3">
                    <i class="bi ${mod.enabled ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
                </div>
                <div>
                    <div class="fw-medium">${this.escapeHtml(mod.name)}</div>
                </div>
            </div>
        `).join('');
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
                this.showContextMenu(e, modItem.dataset.modId);
            }
        });

        // Context menu items
        document.getElementById('toggleMod').addEventListener('click', () => this.handleToggleMod());
        document.getElementById('openModFolder').addEventListener('click', () => this.handleOpenModFolder());
        document.getElementById('renameMod').addEventListener('click', () => this.handleRenameMod());

        // Hide context menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#contextMenu')) {
                this.hideContextMenu();
            }
        });
            document.getElementById('modList').addEventListener('click', async (e) => {
        const modItem = e.target.closest('.mod-item');
        if (modItem) {
            console.log('Mod item clicked:', modItem.dataset.modId); // Debug log
            await this.selectMod(modItem.dataset.modId);
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
    
    // Highlight drop zone
    function highlight() {
        dropZone.classList.add('drag-over');
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
        const archiveFiles = Array.from(files).filter(file => {
            const validExtensions = ['.zip', '.rar', '.7z'];
            return validExtensions.some(ext => 
                file.name.toLowerCase().endsWith(ext.toLowerCase())
            );
        });

        // If no valid archives, show error
        if (archiveFiles.length === 0) {
            this.showError('No valid mod archives found. Please drop .zip, .rar, or .7z files.');
            return;
        }

        try {
            // Show loading
            await this.showLoading('Installing mods...');

            // Track installation results
            const installResults = [];

            // Install each dropped archive
            for (const file of archiveFiles) {
                try {
                    const result = await window.api.modOperations.installMod(file.path);
                    installResults.push({
                        fileName: file.name,
                        success: true,
                        mod: result
                    });
                } catch (installError) {
                    console.error(`Installation error for ${file.name}:`, installError);
                    installResults.push({
                        fileName: file.name,
                        success: false,
                        error: installError.message
                    });
                }
            }

            // Reload mods list
            await this.loadMods();

            // Provide detailed feedback
            this.provideInstallationFeedback(installResults);
        } catch (error) {
            console.error('Drag and drop installation error:', error);
            this.showError('Failed to install mods');
        } finally {
            this.hideLoading();
        }
    };
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
                        extensions: ['zip', '7z', 'rar'] 
                    }
                ],
                properties: ['openFile']
            });
    
            if (!result.canceled) {
                // Verify the API method exists
                if (typeof window.api.modOperations.installMod !== 'function') {
                    throw new Error('Install mod method is not available');
                }
    
                await this.showLoading('Installing mod...');
                
                // Log the file path for debugging
                console.log('Installing mod from path:', result.filePaths[0]);
                
                const installResult = await this.modManager.installMod(result.filePaths[0]);
                
                await this.loadMods();
                this.showSuccess('Mod installed successfully');
                
                return installResult;
            }
        } catch (error) {
            console.error('Full installation error:', error);
            
            // More detailed error logging
            if (error.message) {
                this.showError(`Installation failed: ${error.message}`);
            } else {
                this.showError('Failed to install mod');
            }
            
            throw error;
        } finally {
            this.hideLoading();
        }
    }

    // Ensure these methods are bound or use arrow functions
    showError(message) {
        // Your error showing logic
        console.error(message);
    }

    showLoading(message) {
        // Your loading logic
        console.log(message);
    }

    hideLoading() {
        // Your hide loading logic
        console.log('Loading complete');
    }

    async handleUninstallMod() {
        if (!this.selectedMod) {
            this.showError('Please select a mod to uninstall');
            return;
        }

        if (await this.showConfirmation('Are you sure you want to uninstall this mod?')) {
            try {
                await this.showLoading('Uninstalling mod...');
                await this.modManager.uninstallMod(this.selectedMod);
                await this.loadMods();
                this.selectedMod = null;
                this.updateModPreview();
                this.showSuccess('Mod uninstalled successfully');
            } catch (error) {
                this.showError('Failed to uninstall mod');
            } finally {
                this.hideLoading();
            }
        }
    }


    
    async handleOpenFolder() {
        try {
            await window.api.modOperations.openModsFolder();
        } catch (error) {
            this.showError('Failed to open mods folder');
        }
    }

    async handleReloadList() {
        try {
            await this.showLoading('Reloading mods...');
            await this.loadMods();
            this.showSuccess('Mods reloaded successfully');
        } catch (error) {
            this.showError('Failed to reload mods');
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
            }
        } catch (error) {
            this.showError('Failed to update mods folder');
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
        } catch (error) {
            this.showError('Failed to toggle mod');
        } finally {
            this.hideLoading();
            this.hideContextMenu();
        }
    }



    async handleOpenModFolder() {
        if (!this.selectedMod) return;

        try {
            await this.modManager.openModFolder(this.selectedMod);
        } catch (error) {
            this.showError('Failed to open mod folder');
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
    
    async promptDialog(title, message, defaultValue = '') {
        return new Promise((resolve, reject) => {
            // Remove any existing modals first
            const existingModals = document.querySelectorAll('.modal');
            existingModals.forEach(modal => modal.remove());
    
            const promptModal = document.createElement('div');
            promptModal.classList.add('modal');
            promptModal.setAttribute('tabindex', '-1');
            promptModal.style.display = 'block';
            promptModal.style.background = 'rgba(0,0,0,0.5)';
    
            promptModal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${this.escapeHtml(title)}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>${this.escapeHtml(message)}</p>
                            <input type="text" class="form-control" id="renameInput" value="${this.escapeHtml(defaultValue)}">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="cancelBtn">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmBtn">Rename</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(promptModal);
    
            const input = promptModal.querySelector('#renameInput');
            const cancelBtn = promptModal.querySelector('#cancelBtn');
            const confirmBtn = promptModal.querySelector('#confirmBtn');
            const closeBtn = promptModal.querySelector('.btn-close');
    
            const cleanup = () => {
                document.body.removeChild(promptModal);
                this.isDialogOpen = false;
            };
    
            const resolveWithValue = (value) => {
                cleanup();
                resolve(value);
            };
    
            cancelBtn.addEventListener('click', () => resolveWithValue(null));
            confirmBtn.addEventListener('click', () => resolveWithValue(input.value));
            closeBtn.addEventListener('click', () => resolveWithValue(null));
    
            // Prevent multiple submissions
            confirmBtn.addEventListener('click', (e) => e.stopPropagation());
            cancelBtn.addEventListener('click', (e) => e.stopPropagation());
    
            // Focus input and select all text
            input.focus();
            input.select();
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
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${event.pageX}px`;
        contextMenu.style.top = `${event.pageY}px`;
        this.selectedMod = modId;
    }

    hideContextMenu() {
        document.getElementById('contextMenu').style.display = 'none';
    }

    // Utility methods
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async showLoading(message) {
        // Implement loading indicator
    }

    hideLoading() {
        // Hide loading indicator
    }

    showError(message) {
        // Implement error toast/notification
        console.error(message);
    }

    showSuccess(message) {
        // Implement success toast/notification
        console.log(message);
    }

    async showConfirmation(message) {
        return confirm(message); // Replace with a better confirmation dialog
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
    console.log('updateModPreview called with modId:', modId);
    
    const metadataContent = document.querySelector('.metadata-content');
    const modImage = document.getElementById('modImage');

    if (!modId) {
        console.log('No modId provided');
        metadataContent.innerHTML = 'Select a mod to view details';
        modImage.src = '';
        return;
    }

    try {
        console.log('Attempting to get mod info');
        const modInfo = await window.api.modDetails.getInfo(
            path.join(this.modsPath, modId)
        );
        console.log('Mod info retrieved:', modInfo);

        // Get preview image
        const previewPath = await window.api.modDetails.getPreview(
            path.join(this.modsPath, modId)
        );
        console.log('Preview path:', previewPath);
        modImage.src = previewPath || ''; 

        if (modInfo) {
            // Generate the HTML content with dynamic values
            let urlHtml = '';
            if (modInfo.url) {
                urlHtml = `<p><strong>URL:</strong> <a href="${this.escapeHtml(modInfo.url)}" id="urlLink">${this.escapeHtml(modInfo.url)}</a></p>`;
            }
        
            metadataContent.innerHTML = `
                <h5>${this.escapeHtml(modInfo.display_name || modInfo.mod_name || mod.name)}</h5>
                <p><strong>Version:</strong> ${this.escapeHtml(modInfo.version || 'N/A')}</p>
                <p><strong>Author:</strong> ${this.escapeHtml(modInfo.authors || 'N/A')}</p>
                <p><strong>Category:</strong> ${this.escapeHtml(modInfo.category || 'N/A')}</p>
                <p><strong>Wi-Fi Safe:</strong> ${this.escapeHtml(modInfo.wifi_safe || 'Unknown')}</p>
                <p><strong>Description:</strong> ${this.escapeHtml(modInfo.description || 'No description available')}</p>
                ${urlHtml}
            `;
        
            // If URL is present, attach click event to the link
            if (modInfo.url) {
                const urlLink = document.getElementById('urlLink');
                urlLink.addEventListener('click', (event) => {
                    // Prevent the default behavior (which would open in Electron)
                    event.preventDefault();
        
                    // Send the URL to the main process to open in the external browser
                    window.electron.openExternal(modInfo.url);
                });
            }   
        } else {
            metadataContent.innerHTML = `
                <h5>${this.escapeHtml(modId)}</h5>
                <p>No additional information available</p>
            `;
        }
    } catch (error) {
        console.error('Detailed error in updateModPreview:', error);
        this.showError('Failed to load mod details');
    }
    function openExternal(url) {
        window.location.href = url;
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
    async updateModPreview(modId) {
        console.log('Updating mod preview for:', modId);
    
        const metadataContent = document.querySelector('.metadata-content');
        const modImage = document.getElementById('modImage');
    
        if (!modId) {
            metadataContent.innerHTML = 'Select a mod to view details';
            modImage.src = '';
            return;
        }
    
        try {
            const mod = await this.modManager.getMod(modId);
            console.log('Mod details:', mod);
            
            if (!mod) {
                metadataContent.innerHTML = 'Mod not found';
                modImage.src = '';
                return;
            }
    
            // Get preview image
            const previewPath = await window.api.modDetails.getPreview(mod.path);
            console.log('Preview path:', previewPath);
            modImage.src = previewPath || ''; 
    
            // Get mod info from TOML
            const modInfo = await window.api.modDetails.getInfo(mod.path);
            console.log('Mod info:', modInfo);
            
            // Render metadata
            if (modInfo) {
                let urlHtml = '';
                if (modInfo.url) {
                    urlHtml = `<p><strong>URL:</strong> <a href="${this.escapeHtml(modInfo.url)}" onclick="openUrl('${modInfo.url}'); return false;">${this.escapeHtml(modInfo.url)}</a></p>`;
                }
                metadataContent.innerHTML = `
                <h5>${this.escapeHtml(modInfo.display_name || modInfo.mod_name || mod.name)}</h5>
                <p><strong>Version:</strong> ${this.escapeHtml(modInfo.version || 'N/A')}</p>
                <p><strong>Author:</strong> ${this.escapeHtml(modInfo.authors || 'N/A')}</p>
                <p><strong>Category:</strong> ${this.escapeHtml(modInfo.category || 'N/A')}</p>
                <p><strong>Wi-Fi Safe:</strong> ${this.escapeHtml(modInfo.wifi_safe || 'Unknown')}</p>
                <p><strong>Description:</strong> ${this.escapeHtml(modInfo.description || 'No description available')}</p>
                ${urlHtml}
            `;
            } else {
                metadataContent.innerHTML = `
                    <h5>${this.escapeHtml(mod.name)}</h5>
                    <p>No additional information available</p>
                `;
            }
        } catch (error) {
            console.error('Detailed error in updateModPreview:', error);
            this.showError('Failed to load mod details');
        }
    }

    
    async handleFileDrop(event) {
        try {
            // Prevent default behavior
            event.preventDefault();
    
            // Get dropped files
            const files = event.dataTransfer.files;
    
            // Check if files were dropped
            if (files.length === 0) return;
    
            // Filter for archive files
            const archiveFiles = Array.from(files).filter(file => {
                const validExtensions = ['.zip', '.rar', '.7z'];
                return validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
            });
    
            // If no valid archive files, show error
            if (archiveFiles.length === 0) {
                this.showError('No valid mod archives found. Please drop .zip, .rar, or .7z files.');
                return;
            }
    
            // Show loading
            await this.showLoading('Installing mods...');
    
            // Install each dropped archive
            for (const file of archiveFiles) {
                try {
                    await this.modManager.installMod(file.path);
                } catch (installError) {
                    this.showError(`Failed to install ${file.name}: ${installError.message}`);
                }
            }
    
            // Reload mods list
            await this.loadMods();
    
            // Show success message
            this.showSuccess(`Installed ${archiveFiles.length} mod(s) successfully`);
        } catch (error) {
            console.error('Drag and drop installation error:', error);
            this.showError('Failed to install mods');
        } finally {
            this.hideLoading();
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
            this.showError('Failed to initialize application');
        } finally {
            this.hideLoading();
        }
    }

    async showLoading(message) {
        // Create loading overlay
        let loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>${message}</p>
                </div>
            `;
            document.body.appendChild(loadingOverlay);
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            document.body.removeChild(loadingOverlay);
        }
    }
}


// Initialize the UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    const ui = new UIController();
});
