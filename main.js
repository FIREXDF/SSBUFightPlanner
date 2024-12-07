const { app, protocol, BrowserWindow } = require('electron');
const GameBananaDownloader = require('./gameBananaDownloader'); // Import your downloader class

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    mainWindow.loadFile('index.html'); // Load your HTML file
}

app.whenReady().then(() => {
    createWindow();

    // Register the custom 'fightplanner:' protocol
    protocol.registerBufferProtocol('fightplanner', async (request, callback) => {
        const url = request.url;
        try {
            // Extract the URL from the 'fightplanner' protocol
            const regex = /^fightplanner:(https:\/\/gamebanana\.com\/mmdl\/\d+,\w+,\d+,\w+)/;
            const match = url.match(regex);
            if (match) {
                const gameBananaUrl = match[1];

                // Create a new instance of GameBananaDownloader
                const downloader = new GameBananaDownloader('path/to/mods'); // Specify your mods directory here
                await downloader.downloadMod(gameBananaUrl);
                
                console.log(`Mod downloaded successfully!`);
                callback({ status: 'success' }); // Return success status
            } else {
                throw new Error('Invalid URL format');
            }
        } catch (error) {
            console.error('Download failed:', error);
            callback({ status: 'failed', error: error.message }); // Return error status
        }
    });

    // Set up the application quit behavior
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
});
