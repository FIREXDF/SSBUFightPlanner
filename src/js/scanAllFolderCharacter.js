export class CharacterScanner {
    constructor() {
        this.characters = new Map(); // Map to store character -> mods relationships
    }

    async scanMods(modsPath) {
        try {
            const mods = await window.api.modOperations.loadMods();
            
            // Clear previous scan results
            this.characters.clear();

            for (const mod of mods) {
                try {
                    const files = await window.api.modOperations.getModFiles(mod.path);
                    const characters = this.detectCharactersFromFiles(files);
                    
                    // Add mod to each character's list
                    for (const char of characters) {
                        if (!this.characters.has(char)) {
                            this.characters.set(char, []);
                        }
                        this.characters.get(char).push({
                            name: mod.name,
                            enabled: mod.enabled,
                            path: mod.path
                        });
                    }
                } catch (error) {
                    console.error(`Error scanning mod ${mod.name}:`, error);
                }
            }

            return this.characters;
        } catch (error) {
            console.error('Error scanning mods for characters:', error);
            throw error;
        }
    }

    detectCharactersFromFiles(files) {
        const characters = new Set();
        const fighterPattern = /fighter\/([^\/]+)/i;

        for (const file of files) {
            const match = file.match(fighterPattern);
            if (match) {
                const charId = match[1];
                characters.add(charId);
            }
        }

        return characters;
    }

    // Method to get formatted character name (to be implemented when you provide character names)
    getCharacterName(charId) {
        // This will be populated with the character name mapping you provide
        return charId; // For now, just return the ID
    }

    async getModsForCharacter(charId) {
        return this.characters.get(charId) || [];
    }
}
