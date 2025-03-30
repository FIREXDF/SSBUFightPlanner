class ModUpdateChecker {
    constructor() {
        this.API_BASE = 'https://gamebanana.com/apiv11/Mod/';
        this.PROPERTIES = '?_csvProperties=@gbprofile';
    }

    async checkUpdate(mod) {
        try {
            // Extract mod ID from URL in info.toml
            const modId = this.extractModId(mod.url);
            if (!modId) return null;

            // Fetch mod data from GameBanana API
            const response = await fetch(`${this.API_BASE}${modId}${this.PROPERTIES}`);
            const data = await response.json();

            // Compare versions
            const currentVersion = mod.version;
            const latestVersion = data._aLatestUpdates[0]._sVersion;

            if (this.isNewerVersion(currentVersion, latestVersion)) {
                // Get available files
                const files = data.aFiles || [];
                return {
                    hasUpdate: true,
                    currentVersion,
                    latestVersion,
                    files: files.map(file => ({
                        name: file._sFile,
                        id: file._idRow,
                        description: file._sDescription
                    }))
                };
            }

            return { hasUpdate: false };
        } catch (error) {
            console.error('Error checking for updates:', error);
            return { hasUpdate: false, error: error.message };
        }
    }

    extractModId(url) {
        if (!url) return null;
        const match = url.match(/gamebanana\.com\/mods\/(\d+)/);
        return match ? match[1] : null;
    }

    isNewerVersion(current, latest) {
        if (!current || !latest) return false;
        
        const currentParts = current.split('.').map(Number);
        const latestParts = latest.split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
            const currentPart = currentParts[i] || 0;
            const latestPart = latestParts[i] || 0;
            
            if (latestPart > currentPart) return true;
            if (currentPart > latestPart) return false;
        }
        
        return false;
    }
}

export { ModUpdateChecker };
