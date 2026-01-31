export class SmartRename {
    constructor() {
        this.characterNames = new Map([
            ['mario', 'Mario'],
            ['donkey', 'Donkey'],
            ['link', 'Link'],
            ['samus', 'Samus'],
            ['samusd', 'SamusD'],
            ['yoshi', 'Yoshi'],
            ['kirby', 'Kirby'],
            ['fox', 'Fox'],
            ['pikachu', 'Pikachu'],
            ['luigi', 'Luigi'],
            ['ness', 'Ness'],
            ['captain', 'Captain'],
            ['purin', 'Purin'],
            ['peach', 'Peach'],
            ['daisy', 'Daisy'],
            ['koopa', 'Koopa'],
            ['sheik', 'Sheik'],
            ['zelda', 'Zelda'],
            ['mariod', 'MarioD'],
            ['pichu', 'Pichu'],
            ['falco', 'Falco'],
            ['marth', 'Marth'],
            ['lucina', 'Lucina'],
            ['younglink', 'YoungLink'],
            ['ganon', 'Ganon'],
            ['mewtwo', 'Mewtwo'],
            ['roy', 'Roy'],
            ['chrom', 'Chrom'],
            ['gamewatch', 'GameWatch'],
            ['metaknight', 'MetaKnight'],
            ['pit', 'Pit'],
            ['pitb', 'PitB'],
            ['szerosuit', 'SZerosuit'],
            ['wario', 'Wario'],
            ['snake', 'Snake'],
            ['ike', 'Ike'],
            ['pzenigame', 'PZenigame'],
            ['pfushigisou', 'PFushigisou'],
            ['plizardon', 'PLizardon'],
            ['diddy', 'Diddy'],
            ['lucas', 'Lucas'],
            ['sonic', 'Sonic'],
            ['dedede', 'Dedede'],
            ['pikmin', 'Pikmin'],
            ['lucario', 'Lucario'],
            ['robot', 'Robot'],
            ['toonlink', 'ToonLink'],
            ['wolf', 'Wolf'],
            ['murabito', 'Murabito'],
            ['rockman', 'Rockman'],
            ['wiifit', 'WiiFit'],
            ['rosetta', 'Rosetta'],
            ['littlemac', 'LittleMac'],
            ['gekkouga', 'Gekkouga'],
            ['miifighter', 'MiiFighter'],
            ['miiswordsman', 'MiiSwordsman'],
            ['miigunner', 'MiiGunner'],
            ['palutena', 'Palutena'],
            ['pacman', 'Pacman'],
            ['reflet', 'Reflet'],
            ['shulk', 'Shulk'],
            ['koopajr', 'KoopaJr'],
            ['duckhunt', 'DuckHunt'],
            ['ryu', 'Ryu'],
            ['ken', 'Ken'],
            ['cloud', 'Cloud'],
            ['kamui', 'Kamui'],
            ['bayonetta', 'Bayonetta'],
            ['inkling', 'Inkling'],
            ['ridley', 'Ridley'],
            ['simon', 'Simon'],
            ['richter', 'Richter'],
            ['krool', 'KRool'],
            ['shizue', 'Shizue'],
            ['gaogaen', 'Gaogaen'],
            ['packun', 'Packun'],
            ['jack', 'Jack'],
            ['brave', 'Brave'],
            ['buddy', 'Buddy'],
            ['dolly', 'Dolly'],
            ['master', 'Master'],
            ['tantan', 'TanTan'],
            ['pickel', 'Pickel'],
            ['edge', 'Edge'],
            ['eflame', 'EFlame'],
            ['elight', 'ELight'],
            ['demon', 'Demon'],
            ['trail', 'Trail'],
            ['popo', 'Popo'],
            ['nana', 'Nana'],
            ['element', 'Element'],
            ['brave', 'Brave'],
            ['koopag', 'KoopaG'],
        ]);

        this.slotToHex = new Map([
            ['c00', '0'], ['c01', '1'], ['c02', '2'], ['c03', '3'],
            ['c04', '4'], ['c05', '5'], ['c06', '6'], ['c07', '7'],
            ['c08', '8'], ['c09', '9'], ['c10', 'A'], ['c11', 'B'],
            ['c12', 'C'], ['c13', 'D'], ['c14', 'E'], ['c15', 'F'],
        ]);

        this.patternOrder = ['character', 'slot', 'modname'];
        this.separator = '_';
    }

    setPattern(patternOrder, separator) {
        this.patternOrder = patternOrder || ['character', 'slot', 'modname'];
        this.separator = separator || '_';
    }

    getCharacterDisplayName(internalName) {
        const lower = internalName.toLowerCase();
        return this.characterNames.get(lower) || this.titleCase(internalName);
    }

    titleCase(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    async extractCharacters(modPath) {
        try {
            const files = await window.api.modOperations.getModFiles(modPath);
            if (!files || !Array.isArray(files)) return [];

            const fighterFolders = files.filter(file => {
                const parts = file.split(/[/\\]/);
                const fileName = parts[parts.length - 1];
                if (fileName === '.DS_Store' || fileName.startsWith('._') || 
                    fileName === 'Thumbs.db' || fileName === 'desktop.ini') {
                    return false;
                }
                return parts.length >= 2 && parts[0] === 'fighter';
            });

            const characters = new Set(
                fighterFolders.map(file => file.split(/[/\\]/)[1])
                    .filter(char => {
                        if (!char) return false;
                        if (char === '.DS_Store' || char.startsWith('._') || 
                            char === 'Thumbs.db' || char === 'desktop.ini') {
                            return false;
                        }
                        return !['common', 'effect', 'sound'].includes(char.toLowerCase());
                    })
            );

            return Array.from(characters);
        } catch (error) {
            console.error('Error extracting characters:', error);
            return [];
        }
    }

    async extractSlots(modPath, character) {
        try {
            const characterPath = `${modPath}/fighter/${character}`;
            const files = await window.api.modOperations.getModFiles(characterPath);
            if (!files || !Array.isArray(files)) return [];

            const slotFiles = files.filter(file => {
                const pathParts = file.split(/[/\\]/);
                const fileName = pathParts[pathParts.length - 1];

                if (fileName === '.DS_Store' || fileName.startsWith('._') || 
                    fileName === 'Thumbs.db' || fileName === 'desktop.ini') {
                    return false;
                }

                const isc0XFolder = /^c\d{2}$/.test(fileName);
                if (isc0XFolder) return true;

                const isInC0XFolder = pathParts.slice(0, -1).some(part => /^c\d{2}$/.test(part));
                if (isInC0XFolder) return false;

                return /\d{2}/.test(fileName);
            });

            const slots = new Set();
            slotFiles.forEach(file => {
                const pathParts = file.split(/[/\\]/);
                const part = pathParts[pathParts.length - 1];

                if (/^c\d{2}$/.test(part)) {
                    slots.add(part);
                } else {
                    const match = part.match(/(\d{2})/);
                    if (match) {
                        slots.add('c' + match[0]);
                    }
                }
            });

            return Array.from(slots).sort((a, b) => {
                const numA = parseInt(a.replace('c', ''));
                const numB = parseInt(b.replace('c', ''));
                return numA - numB;
            });
        } catch (error) {
            console.error('Error extracting slots:', error);
            return [];
        }
    }

    slotsToString(slots) {
        if (!slots || slots.length === 0) return 'Z';

        const hexSlots = slots.map(slot => {
            const hex = this.slotToHex.get(slot.toLowerCase());
            if (hex) return hex;
            const num = parseInt(slot.replace('c', ''));
            if (num >= 0 && num <= 15) {
                return num.toString(16).toUpperCase();
            }
            return null;
        }).filter(s => s !== null);

        if (hexSlots.length === 0) return 'Z';

        return hexSlots.join('');
    }

    async extractModName(modPath, originalName) {
        try {
            const modInfo = await window.api.modDetails.getInfo(modPath);
            if (modInfo && modInfo.display_name && modInfo.display_name.trim()) {
                return modInfo.display_name.trim();
            }
            if (modInfo && modInfo.name && modInfo.name.trim()) {
                return modInfo.name.trim();
            }
        } catch (error) {
            console.error('Error reading mod info:', error);
        }
        return originalName;
    }

    sanitizeName(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').trim();
    }

    async generateSmartName(mod) {
        const characters = await this.extractCharacters(mod.path);

        if (characters.length === 0) {
            return null;
        }

        const primaryCharacter = characters[0];
        const slots = await this.extractSlots(mod.path, primaryCharacter);
        const modName = await this.extractModName(mod.path, mod.name);

        const characterDisplay = this.getCharacterDisplayName(primaryCharacter);
        const slotString = this.slotsToString(slots);
        const sanitizedModName = this.sanitizeName(modName);

        const parts = {
            character: characterDisplay,
            slot: slotString,
            modname: sanitizedModName
        };

        const nameParts = this.patternOrder.map(key => parts[key]);
        const newName = nameParts.join(this.separator);

        if (newName === mod.name) {
            return null;
        }

        return newName;
    }

    async previewRenames(mods) {
        const previews = [];

        for (const mod of mods) {
            try {
                const newName = await this.generateSmartName(mod);
                if (newName) {
                    previews.push({
                        mod: mod,
                        originalName: mod.name,
                        newName: newName,
                        selected: true
                    });
                }
            } catch (error) {
                console.error(`Error generating smart name for ${mod.name}:`, error);
            }
        }

        return previews;
    }

    async applyRenames(renames) {
        const results = {
            success: [],
            failed: []
        };

        for (const rename of renames) {
            if (!rename.selected) continue;

            try {
                await window.api.modOperations.renameMod(rename.originalName, rename.newName);
                results.success.push(rename);
            } catch (error) {
                console.error(`Failed to rename ${rename.originalName}:`, error);
                results.failed.push({
                    ...rename,
                    error: error.message
                });
            }
        }

        return results;
    }
}
