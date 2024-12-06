export class ModManager {
    async loadMods() {
        try {
            return await window.api.modOperations.loadMods();
        } catch (error) {
            console.error('Failed to load mods:', error);
            throw error;
        }
    }

    async installMod(filePath) {
        try {
            // Validate file path
            if (!filePath) {
                throw new Error('Invalid file path');
            }
    
            // Call the API method to install the mod
            const result = await window.api.modOperations.installMod(filePath);
    
            // Additional validation or processing if needed
            if (!result.success) {
                throw new Error(result.message || 'Mod installation failed');
            }
    
            return result;
        } catch (error) {
            console.error('Mod installation error:', error);
            throw error;
        }
    }

    async uninstallMod(modId) {
        try {
            return await window.api.modOperations.uninstall(modId);
        } catch (error) {
            console.error('Failed to uninstall mod:', error);
            throw error;
        }
    }

    async openModFolder(modId) {
        try {
            return await window.api.modOperations.openModFolder(modId);
        } catch (error) {
            console.error('Failed to open mod folder:', error);
            throw error;
        }
    }

    async toggleMod(modId) {
        try {
            return await window.api.modOperations.toggle(modId);
        } catch (error) {
            console.error('Failed to toggle mod:', error);
            throw error;
        }
    }

    async renameMod(modId, newName) {
        try {
            return await window.api.modOperations.rename(modId, newName);
        } catch (error) {
            console.error('Failed to rename mod:', error);
            throw error;
        }
    }
    async getMod(modId) {
        console.log('Getting mod with ID:', modId);
        try {
            const mods = await this.loadMods();
            console.log('All mods:', mods);
            const mod = mods.find(m => m.id === modId);
            console.log('Found mod:', mod);
            return mod;
        } catch (error) {
            console.error('Error getting mod:', error);
            throw error;
        }
    }
}