import * as DiscordRPC from 'discord-rpc';

interface PresenceActivity {
  details?: string;
  state?: string;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  startTimestamp?: Date;
  instance?: boolean;
}

class DiscordRichPresence {
  private client: any;
  private clientId: string;
  private startTimestamp: Date;
  private reconnectTries: number;
  private maxReconnectTries: number;
  private states: any;

  constructor() {
    this.client = null;
    this.clientId = '1304806839115972628'; // Replace with your Discord application Client ID
    this.startTimestamp = new Date();
    this.reconnectTries = 0;
    this.maxReconnectTries = 5;

    this.states = {
      BROWSING: {
        details: '🔍 Browsing Mods',
        state: 'Ready to discover new content!',
      },
      MANAGING: (modCount) => ({
        details: '🗂️ Managing Mods',
        state:
          modCount === 1 ? '1 Mod Installed' : `${modCount} Mods Installed`,
      }),
      INSTALLING: (modName) => ({
        details: '⬇️ Installing Mod',
        state: modName ? `Installing "${modName}"` : 'Installing a new mod...',
        smallImageKey: 'install_icon',
        smallImageText: modName ? `Installing ${modName}` : 'Installing',
      }),
      VIEWING: (modName, author) => ({
        details: '📄 Mod Details',
        state: modName ? `Viewing "${modName}"` : 'No Mod Selected',
        smallImageKey: modName ? 'mod_icon' : undefined,
        smallImageText: author ? `By ${author}` : undefined,
      }),
      IDLE: { details: '💤 Idle', state: 'Taking a break' },
    };
  }

  async connect() {
    if (this.client) return;

    try {
      this.client = new DiscordRPC.Client({ transport: 'ipc' });

      this.client.on('disconnected', () => {
        console.warn('Discord RPC disconnected, attempting reconnect...');
        this.client = null;
        if (this.reconnectTries < this.maxReconnectTries) {
          setTimeout(() => this.connect(), 3000);
          this.reconnectTries++;
        }
      });

      await this.client.login({ clientId: this.clientId });
      this.reconnectTries = 0;

      // Set initial activity
      this.setActivity({
        details: 'Browsing Mods',
        state: 'Getting Started',
        largeImageKey: 'app_logo',
        largeImageText: 'FightPlanner',
        startTimestamp: this.startTimestamp,
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
        startTimestamp: this.startTimestamp,
        instance: false,
      });
    } catch (error) {
      console.error('Failed to set Discord RPC activity:', error);
    }
  }

  // Nouvelle méthode générique pour changer d'état par identifiant
  setState(stateKey, ...params) {
    let activity;
    if (typeof this.states[stateKey] === 'function') {
      activity = this.states[stateKey](...params);
    } else {
      activity = { ...this.states[stateKey] };
    }
    activity.largeImageKey = 'app_logo';
    activity.largeImageText = 'FightPlanner';
    activity.startTimestamp = this.startTimestamp;
    this.setActivity(activity);
  }

  // Methods for different app states
  updateModBrowsing(modCount = 0) {
    this.setState('MANAGING', modCount);
  }

  updateModInstalling(modName = null) {
    this.setState('INSTALLING', modName);
  }

  updateModDetails(modName = 'No Mod Selected', author = null) {
    // Correction : vérifie que modName et author sont bien transmis depuis l'appelant
    // et que la méthode est bien appelée avec les bons arguments lors du clic sur un mod.
    // Si tu utilises cette méthode dans ton code, assure-toi de faire :
    // discordRPC.updateModDetails(nomDuMod, auteurDuMod);
    this.setState('VIEWING', modName, author);
  }

  updateIdle() {
    this.setState('IDLE');
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

export default new DiscordRichPresence();
