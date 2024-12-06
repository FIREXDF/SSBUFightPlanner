const DiscordRPC = require('discord-rpc');

class DiscordRichPresence {
    constructor() {
        this.client = null;
        this.clientId = '1304806839115972628'; // Replace with your Discord application Client ID
        this.startTimestamp = new Date();
    }

    async connect() {
        if (this.client) return;

        try {
            this.client = new DiscordRPC.Client({ transport: 'ipc' });
            
            await this.client.login({ clientId: this.clientId });
            
            // Set initial activity
            this.setActivity({
                details: 'Browsing Mods',
                state: 'Getting Started',
                largeImageKey: 'app_logo',
                largeImageText: 'FightPlanner',
                startTimestamp: this.startTimestamp
            });

            console.log('Discord RPC connected successfully');
        } catch (error) {
            console.error('Discord RPC connection failed:', error);
            // Ensure client is null if connection fails
            this.client = null;
        }
    }

    setActivity(activity) {
        if (!this.client) return;

        try {
            this.client.setActivity({
                ...activity,
                instance: false
            });
        } catch (error) {
            console.error('Failed to set Discord RPC activity:', error);
        }
    }

    // Methods for different app states
    updateModBrowsing(modCount = 0) {
        this.setActivity({
            details: 'Managing Mods',
            state: `${modCount} Mods Installed`,
            largeImageKey: 'app_logo',
            largeImageText: 'FightPlanner'
        });
    }

    updateModInstalling() {
        this.setActivity({
            details: 'Modding',
            state: 'Installing Mod',
            largeImageKey: 'app_logo',
            largeImageText: 'FightPlanner',
            smallImageKey: 'install_icon',
            smallImageText: 'Installing'
        });
    }

    updateModDetails(modName = 'No Mod Selected') {
        this.setActivity({
            details: 'Viewing Mod Details',
            state: modName,
            largeImageKey: 'app_logo',
            largeImageText: 'FightPlanner'
        });
    }

    disconnect() {
        if (this.client) {
            try {
                this.client.clearActivity();
                this.client.destroy();
                this.client = null;
                console.log('Discord RPC disconnected');
            } catch (error) {
                console.error('Error disconnecting Discord RPC:', error);
            }
        }
    }
}

module.exports = new DiscordRichPresence();