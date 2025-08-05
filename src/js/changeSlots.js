export class ChangeSlots {
static async scanForSlots(modPath) {
    try {
        const files = await window.api.modOperations.getModFiles(modPath);
        console.log('[scanForSlots] Tous les fichiers trouvés:', files);
const slotFiles = files.filter(file => {
    const pathParts = file.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1];

    // Si on est dans fighter, on ne garde que les dossiers slot
    if (pathParts.includes('fighter')) {
        const isFighterSlotFolder =
            pathParts.length >= 2 &&
            /^c\d/i.test(fileName) &&
            !fileName.includes('.'); // évite les fichiers
        if (isFighterSlotFolder) return true;
        // Sinon, on ignore tout le reste dans fighter
        return false;
    }

    // Sinon (hors fighter), on garde les fichiers qui matchent 0X, 0XX, 0XXX
    return /0\d{1,3}/.test(fileName) || /\d{2,3}(?=\.[^.]+$)/.test(fileName);
});

console.log('[scanForSlots] Fichiers slots détectés:', slotFiles);

            const slots = new Set();
slotFiles.forEach(file => {
    const pathParts = file.split(/[/\\]/);
    const part = pathParts[pathParts.length - 1];

    // Dossier slot : cXX, cXXX, etc.
    const cMatch = part.match(/^c\d{2,3}$/i);
    if (cMatch) {
        slots.add(cMatch[0].toLowerCase());
    } else {
        // Fichier slot : 0XX, 0XXX, etc.
        const zeroMatch = part.match(/0\d{2,3}/);
        if (zeroMatch) {
            slots.add('c' + zeroMatch[0].slice(1)); // <-- toujours stocker en cXX
        }
        // Fichier slot : XX, XXX (sans 0 devant, ni c)
        const numMatch = part.match(/(?<!\d)\d{2,3}(?=\.[^.]+$)/);
        if (numMatch) {
            let num = numMatch[0];
            if (num.length === 1) num = '0' + num;
            slots.add('c' + num);
        }
    }
});

const sortedSlots = Array.from(slots).sort((a, b) => {
    const numA = parseInt(a.replace('c', ''));
    const numB = parseInt(b.replace('c', ''));
    return numA - numB;
});

console.log('[scanForSlots] Slots détectés:', sortedSlots);

        return {
            currentSlots: sortedSlots,
            affectedFiles: slotFiles
        };
    } catch (error) {
        console.error('Error scanning for slots:', error);
        throw error;
    }
}

    static async processSlots(modPath, slotChanges, slotsToRemove, files) {
        let deletedFilesCount = 0;
        let changedFilesCount = 0;

        // First, handle slot removal if requested
        if (slotsToRemove && slotsToRemove.length > 0) {
            for (const slot of slotsToRemove) {
                deletedFilesCount += await this.removeSlot(modPath, slot, files);
            }
        }

        // Then handle slot changes if requested
        if (slotChanges && Object.keys(slotChanges).length > 0) {
            changedFilesCount = await this.changeSlots(modPath, slotChanges, files);
        }

        return {
            deletedFilesCount,
            changedFilesCount
        };
    }

static async addMissingFilesToConfig(modPath, fighterName, targetAlt, allFiles) {
    const configPath = `${modPath}\\config.json`;
    let configContent = '{}';
    let config = {
        "new-dir-infos": [],
        "new-dir-infos-base": {},
        "share-to-vanilla": {},
        "new-dir-files": {},
        "share-to-added": {}
    };

    // Lire le config existant si présent
    try {
        if (await window.api.modOperations.fileExists(configPath)) {
            configContent = await window.api.modOperations.readModFile(configPath);
            config = JSON.parse(configContent);
        }
    } catch (e) {
        console.warn('Could not read config.json, using empty config.');
    }

    // Préparer les chemins
    const newDirInfo = `fighter/${fighterName}/${targetAlt}`;
    const cameraDirInfo = `fighter/${fighterName}/${targetAlt}/camera`;
    const transplantDirInfo = `fighter/${fighterName}/cmn`;
    const oldCameraDir = `fighter/${fighterName}/camera/${targetAlt}`;

    // Initialiser les sections si besoin
    if (!config["new-dir-files"][newDirInfo]) config["new-dir-files"][newDirInfo] = [];
    if (!config["new-dir-files"][cameraDirInfo]) config["new-dir-files"][cameraDirInfo] = [];
    if (!config["new-dir-files"][transplantDirInfo]) config["new-dir-files"][transplantDirInfo] = [];
    if (config["new-dir-files"][oldCameraDir]) delete config["new-dir-files"][oldCameraDir];

    // Extensions custom
    const customExtensions = [
        '.nuanmb', '.marker', '.bin', '.tonelabel', '.numatb', '.numdlb', '.nutexb',
        '.numshb', '.numshexb', '.nus3audio', '.nus3bank', '.nuhlpb', '.numdlb', '.xmb', '.kime', '.eff'
    ];

    // Parcours des fichiers
    for (const file of allFiles) {
        // Effets transplantés
        if (file.includes(`effect/fighter/${fighterName}/transplant/`)) {
            if (!config["new-dir-files"][transplantDirInfo].includes(file))
                config["new-dir-files"][transplantDirInfo].push(file);
            continue;
        }
        // Effets spécifiques au slot
        if (file.includes(`effect/fighter/${fighterName}/ef_${fighterName}_${targetAlt}`)) {
            if (!config["new-dir-files"][newDirInfo].includes(file))
                config["new-dir-files"][newDirInfo].push(file);
            continue;
        }
        // Caméra
        if (file.startsWith(`camera/fighter/${fighterName}/${targetAlt}/`) && file.endsWith('.nuanmb')) {
            if (!config["new-dir-files"][cameraDirInfo].includes(file))
                config["new-dir-files"][cameraDirInfo].push(file);
            continue;
        }
        // Fichiers custom dans le slot cible
        if (file.includes(`/${targetAlt}/`) || file.endsWith(`/${targetAlt}`)) {
            const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
            const isCustom = customExtensions.includes(ext) ||
                ['body', 'face', 'hair', 'eye', 'brs_', 'bust_', 'hand_'].some(marker => file.toLowerCase().includes(marker));
            if (isCustom && !config["new-dir-files"][newDirInfo].includes(file)) {
                config["new-dir-files"][newDirInfo].push(file);
            }
        }
    }

    // Réécrire le config.json
    await window.api.modOperations.writeModFile(configPath, JSON.stringify(config, null, 4));
}

    static async changeSlots(modPath, slotChanges, files) {
        const changedFiles = [];
        
        // First, handle config.json if it exists
        try {
            const configPath = `${modPath}\\config.json`;
            console.log('Checking for config.json at:', configPath);
            
            let configExists = false;
            try {
                configExists = await window.api.modOperations.fileExists(configPath);
            } catch (error) {
                console.error('Error checking config.json existence:', error);
                configExists = false;
            }
            
            if (configExists) {
                try {
                    const configContent = await window.api.modOperations.readModFile(configPath);
                    console.log('Original config.json content:', configContent);
                    let updatedConfigContent = configContent;
                    
                    // Perform find and replace for each slot change
                    for (const [oldSlot, newSlot] of Object.entries(slotChanges)) {
                        const oldSlotPattern = new RegExp(oldSlot, 'g');
                        console.log(`Replacing ${oldSlot} with ${newSlot}`);
                        updatedConfigContent = updatedConfigContent.replace(oldSlotPattern, newSlot);
                    }
                    
                    console.log('Updated config.json content:', updatedConfigContent);
                    
                    // Write updated config back to file
                    await window.api.modOperations.writeModFile(configPath, updatedConfigContent);
                } catch (error) {
                    console.error('Error processing config.json:', error);
                    throw new Error(`Failed to process config.json: ${error.message}`);
                }
            }
        } catch (error) {
            console.error('Error handling config.json:', error);
        }

        // Filter out config.json from files to rename
        const filesToRename = files.filter(file => !file.endsWith('config.json'));

        // Then handle regular files with two-pass renaming
        // First pass: rename to temporary names with dots (but not for folders)
for (const file of filesToRename) {
    // Découpe le chemin
    const pathParts = file.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1];

    // Cas 1 : dossier slot dans fighter (ex: fighter/ryu/c34)
    const isFighterSlotFolder =
        pathParts.length >= 2 &&
        pathParts.includes('fighter') &&
        /^c\d{2,3}$/i.test(fileName) &&
        !fileName.includes('.');

    // Cas 2 : fichier slot ailleurs (ex: ui/replace_patch/chara/chara_0_eflame_only_04.bntx)
    const isSlotFile =
        !pathParts.includes('fighter') &&
        /0\d/.test(fileName);

    // On ne renomme que si l'un des deux cas est vrai
if (isFighterSlotFolder || isSlotFile) {
    const currentSlot = this.extractSlot(file);
    if (!currentSlot) {
        console.warn(`[changeSlots] Slot non détecté pour le fichier : ${file}, skip.`);
        continue;
    }
    console.log('[changeSlots] Fichier:', file);
    console.log('[changeSlots] Slot extrait:', currentSlot);
    if (slotChanges[currentSlot]) {
        try {
            const newSlot = slotChanges[currentSlot];
            let newFilePath;
            if (isFighterSlotFolder) {
                // Renommer le dossier slot (remplace tout le slot, ex: c01, c11, c123)
                const folderRegex = new RegExp(`\\b${currentSlot}\\b`);
                newFilePath = file.replace(folderRegex, newSlot);
                console.log('[changeSlots] Dossier slot:', file, '->', newFilePath, '| Regex utilisée: /c\\d{1,3}/i | newSlot:', newSlot);
            } else {
                // Renommer le fichier slot (hors fighter)
let oldNum = currentSlot.replace('c', '');
let newNum = newSlot.replace('c', '');
// Toujours pad à 2 chiffres
if (oldNum.length === 1) oldNum = '0' + oldNum;
if (newNum.length === 1) newNum = '0' + newNum;

// Toujours partir du nom original
let newFilePath = file;

// 1. Remplace _oldNum juste avant l'extension (ex: _34.nus3audio)
let regex = new RegExp(`_${oldNum}(?=\\.[^.]+$)`);
if (regex.test(newFilePath)) {
    newFilePath = newFilePath.replace(regex, `_${newNum}`);
}

// 2. Si pas trouvé, tente aussi sans underscore (ex: 34.nus3audio)
if (newFilePath === file) {
    regex = new RegExp(`${oldNum}(?=\\.[^.]+$)`);
    if (regex.test(newFilePath)) {
        newFilePath = newFilePath.replace(regex, newNum);
    }
}

// 3. Si encore pas trouvé, tente avec cXX/cXXX juste avant l'extension
if (newFilePath === file) {
    regex = new RegExp(`c${oldNum}(?=\\.[^.]+$)`, 'i');
    if (regex.test(newFilePath)) {
        newFilePath = newFilePath.replace(regex, `c${newNum}`);
    }
}

console.log('[changeSlots] Fichier slot:', file, '->', newFilePath, '| Regex:', regex, '| oldNum:', oldNum, '| newNum:', newNum);
            }
            await window.api.modOperations.renameModFile(
                modPath,
                file.replace(/\\/g, '/'),
                newFilePath.replace(/\\/g, '/')
            );
            changedFiles.push(newFilePath);
        } catch (error) {
            console.error(`Error renaming file ${file}:`, error);
            throw new Error(`Failed to rename file ${file}: ${error.message}`);
        }
    }
}
}
        const requestedSlots = Object.values(slotChanges);
        const slotAboveC07 = requestedSlots.find(slot => parseInt(slot.replace('c', '')) > 7);
        if (slotAboveC07) {
            try {
                // Vérifie si le dossier fighter existe avant de continuer
                const fighterPath = modPath + '/fighter';
                let fighterExists = false;
                try {
                    fighterExists = await window.api.modOperations.fileExists(fighterPath);
                } catch (e) {
                    fighterExists = false;
                }
                if (!fighterExists) {
                    console.log('[changeSlots] Dossier fighter non trouvé, skip la partie Max Slots.');
                    // On skip, pas d'erreur bloquante
                } else {
                    // 1. Get the fighter folder name
                    const fighterDirList = await window.api.modOperations.getModFiles(fighterPath);
                    const fighterDir = fighterDirList.find(f => !f.includes('/') && !f.includes('\\'));
                    const fighterName = fighterDir;

                    // 2. Read ui_chara_db.txt
                    const uiCharaDbTxtPath = 'resources/src/resources/reslot/ui_chara_db.txt';
                    const uiCharaDbTxt = await window.api.modOperations.readModFile(uiCharaDbTxtPath);

                    // 3. Find the line with the fighter name and get the number at the start of the line
                    const lines = uiCharaDbTxt.split(/\r?\n/);
                    const fighterIndex = lines.findIndex(line => line.trim().toLowerCase() === fighterName.trim().toLowerCase());
                    if (fighterIndex === -1) throw new Error(`Fighter name "${fighterName}" not found in ui_chara_db.txt`);

                    // 4. Edit ui_chara_db.prcxml
                    const pathParts = modPath.replace(/\\/g, '/').split('/');
                    pathParts.pop();
                    const modsFolder = pathParts.join('/');
                    const prcxmlPath = `${modsFolder}/Max Slots/ui/param/database/ui_chara_db.prcxml`;
                    let prcxmlContent = await window.api.modOperations.readModFile(prcxmlPath);

                    for (const slot of requestedSlots) {
                        const slotNum = parseInt(slot.replace('c', ''));
                        if (slotNum > 7) {
                            const colorNum = slotNum + 1;
                            const hashLine = new RegExp(`<hash40 index="${fighterIndex}">dummy<\\/hash40>`, 'g');
                            prcxmlContent = prcxmlContent.replace(
                                hashLine,
                                `<struct index="${fighterIndex}"><byte hash="color_num">${colorNum}</byte></struct>`
                            );
                        }
                    }

                    // Write the modified file back
                    await window.api.modOperations.writeModFile(prcxmlPath, prcxmlContent);
                }
            } catch (error) {
                console.error('Error editing ui_chara_db.prcxml:', error);
                throw new Error(`Error editing ui_chara_db.prcxml: ${error.message}`);
            }
        }
for (const tempFile of changedFiles) {
    try {
        const finalPath = tempFile.replace(/_\.?(\d+)\.bntx/g, '_$1.bntx');
        console.log(`Finalizing rename: ${tempFile} -> ${finalPath}`);
        await window.api.modOperations.renameModFile(
            modPath,
            tempFile.replace(/\\/g, '/'),
            finalPath.replace(/\\/g, '/')
        );
    } catch (error) {
        console.error(`Error in final rename of ${tempFile}:`, error);
        throw new Error(`Failed to complete rename of ${tempFile}: ${error.message}`);
    }
    if (changedFiles.length > 0) {
        // Vérifie l'existence du dossier fighter AVANT d'appeler getModFiles
        const fighterPath = modPath + '/fighter';
        let fighterExists = false;
        try {
            fighterExists = await window.api.modOperations.fileExists(fighterPath);
        } catch (e) {
            fighterExists = false;
        }
        if (fighterExists) {
            const fighterDirList = await window.api.modOperations.getModFiles(fighterPath);
            const fighterDir = fighterDirList.find(f => !f.includes('/') && !f.includes('\\'));
            const fighterName = fighterDir;
            for (const newSlot of Object.values(slotChanges)) {
                await ChangeSlots.addMissingFilesToConfig(modPath, fighterName, newSlot, files);
            }
        } else {
            console.log('[changeSlots] Dossier fighter non trouvé, skip addMissingFilesToConfig.');
        }
    }
}
        
        return changedFiles.length;
    }

    static async removeSlot(modPath, slot, files) {
        let deletedFiles = 0;
        for (const file of files) {
            if (file.includes(slot) || (file.endsWith('.bntx') && file.includes(slot.replace('c', '')))) {
                await window.api.modOperations.deleteModFile(modPath, file);
                deletedFiles++;
            }
        }
        return deletedFiles;
    }

    static extractSlot(filePath) {
        // Cherche cXX, cXXX
        const cMatch = filePath.match(/c\d{2,3}/i);
        if (cMatch) {
            return cMatch[0].toLowerCase();
        }
        // Cherche cX (un seul chiffre, à la fin d'un nom de dossier/fichier)
        const c1Match = filePath.match(/c\d(?!\d)/i);
        if (c1Match) {
            return ('c0' + c1Match[0].slice(1)).toLowerCase();
        }
        // Cherche 0XX, 0XXX
        const zeroMatch = filePath.match(/0\d{2,3}/);
        if (zeroMatch) {
            return 'c' + zeroMatch[0].slice(1);
        }
        // Cherche 0X (un seul chiffre)
        const zero1Match = filePath.match(/0\d(?!\d)/);
        if (zero1Match) {
            return 'c0' + zero1Match[0].slice(1);
        }
        return null;
    }

    /**
     * @param {string} modPath
     * @param {string} resourceBasePath
     */
    static async ensureMaxSlots(modPath, resourceBasePath = 'resources/src/resources') {
        // Get the parent folder of the mod (the mods folder)
        const pathParts = modPath.replace(/\\/g, '/').split('/');
        pathParts.pop(); // Remove the mod folder name
        const modsFolder = pathParts.join('/');

        const maxSlotsPath = `${modsFolder}/Max Slots`;
        const targetFile = `${maxSlotsPath}/ui/param/database/ui_chara_db.prcxml`;
        const sourceFile = `${resourceBasePath}/reslot/ui_chara_db.prcxml`;

        const maxSlotsExists = await window.api.modOperations.fileExists(maxSlotsPath);
        if (!maxSlotsExists) {
            await window.api.modOperations.createDirectory(maxSlotsPath);
        }

        const databaseDir = `${maxSlotsPath}/ui/param/database`;
        const databaseDirExists = await window.api.modOperations.fileExists(databaseDir);
        if (!databaseDirExists) {
            await window.api.modOperations.createDirectory(databaseDir);
        }

        const fileExists = await window.api.modOperations.fileExists(targetFile);
        if (!fileExists) {
            const content = await window.api.modOperations.readModFile(sourceFile);
            await window.api.modOperations.writeModFile(targetFile, content);
        }
    }
}
