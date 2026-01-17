import { promises as fs } from 'fs';
import path from 'path';

import { getHash } from './hash';

export class PresetManager {
  workspacePath: string;
  presetFile: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.presetFile = path.join(workspacePath, 'presets');
  }

  async init() {
    try {
      await fs.access(this.presetFile);
    } catch {
      await fs.writeFile(this.presetFile, '[]');
    }
  }

  async getDisabledMods() {
    try {
      const content = await fs.readFile(this.presetFile, 'utf8');
      const matches = content.match(/\[(.*?)\]/);
      return matches && matches[1] ? matches[1].split(',').filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async toggleMod(modName) {
    const modHash = getHash(modName);
    const disabledHashes = await this.getDisabledMods();

    const isCurrentlyDisabled = disabledHashes.includes(modHash);

    // Si le mod est désactivé, on le retire des hash
    // Sinon on l'ajoute
    const newHashes = isCurrentlyDisabled
      ? disabledHashes.filter((hash) => hash !== modHash)
      : [...disabledHashes, modHash];

    await fs.writeFile(this.presetFile, `[${newHashes.join(',')}]`);

    // Return true if the mod is now enabled
    return isCurrentlyDisabled;
  }
}
