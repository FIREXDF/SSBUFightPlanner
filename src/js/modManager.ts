export class ModManager {
  async loadMods() {
    try {
      return await window.api.modOperations.loadMods();
    } catch (error) {
      console.error("Failed to load mods:", error);
      throw error;
    }
  }

  async installMod(filePath: string) {
    try {
      // Validate file path
      if (!filePath) {
        throw new Error("Invalid file path");
      }

      // Call the API method to install the mod
      const result = await window.api.modOperations.installMod(filePath);

      // Additional validation or processing if needed
      if (!result.success) {
      }

      return result;
    } catch (error) {
      console.error("Mod installation error:", error);
      throw error;
    }
  }

  async uninstallMod(modId: string) {
    try {
      return await window.api.modOperations.uninstall(modId);
    } catch (error) {
      console.error("Failed to uninstall mod:", error);
      throw error;
    }
  }

  async openModFolder(modId: string) {
    try {
      return await window.api.modOperations.openModFolder(modId);
    } catch (error) {
      console.error("Failed to open mod folder:", error);
      throw error;
    }
  }

  async openModsFolder() {
    try {
      return await window.api.modOperations.openModsFolder();
    } catch (error) {
      console.error("Failed to open mods folder:", error);
      throw error;
    }
  }

  async toggleMod(modId) {
    try {
      return await window.api.modOperations.toggle(modId);
    } catch (error) {
      console.error("Failed to toggle mod:", error);
      throw error;
    }
  }

  async enableAllMods() {
    try {
      return await window.api.modOperations.enableAllMods();
    } catch (error) {
      console.error("Failed to enable all mods:", error);
      throw error;
    }
  }

  async disableAllMods() {
    try {
      return await window.api.modOperations.disableAllMods();
    } catch (error) {
      console.error("Failed to disable all mods:", error);
      throw error;
    }
  }

  async renameMod(modId: string, newName: string) {
    try {
      return await window.api.modOperations.renameMod(modId, newName);
    } catch (error) {
      console.error("Failed to rename mod:", error);
      throw error;
    }
  }

  async getMod(modId: string) {
    console.log("Getting mod with ID:", modId);
    try {
      const mods = await this.loadMods();
      console.log("All mods:", mods);
      const mod = mods.find((m) => m.id === modId);
      console.log("Found mod:", mod);
      return mod;
    } catch (error) {
      console.error("Error getting mod:", error);
      throw error;
    }
  }
}
