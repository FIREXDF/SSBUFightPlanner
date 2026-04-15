const fs = require('fs');
const path = require('path');

/**
 * afterPack hook for electron-builder
 * Sets execution permissions for 7zz binary on macOS and Linux
 */
exports.default = async function(context) {
    const platform = context.electronPlatformName;
    
    // Only process on macOS and Linux
    if (platform !== 'darwin' && platform !== 'linux') {
        console.log(`[afterPack] Skipping 7zz permissions for platform: ${platform}`);
        return;
    }
    
    // Find the 7zz binary in the packaged app
    const appOutDir = context.appOutDir;
    let binaryPath;
    
    if (platform === 'darwin') {
        // macOS app structure: FightPlanner.app/Contents/Resources/...
        binaryPath = path.join(appOutDir, 'FightPlanner.app', 'Contents', 'Resources', 'src', 'resources', 'bin', '7zz');
    } else {
        // Linux app structure
        binaryPath = path.join(appOutDir, 'resources', 'src', 'resources', 'bin', '7zz');
    }
    
    // Check if file exists and set execute permissions
    if (fs.existsSync(binaryPath)) {
        try {
            fs.chmodSync(binaryPath, 0o755); // rwxr-xr-x
            console.log(`[afterPack] Set execute permissions for 7zz at: ${binaryPath}`);
        } catch (error) {
            console.error(`[afterPack] Failed to set permissions for 7zz:`, error);
        }
    } else {
        console.warn(`[afterPack] 7zz binary not found at: ${binaryPath}`);
    }
};


