import { getInternalFighterName, getNonCopyFighterNames } from "./fighterNames.js";

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

    static async addMissingFilesToConfig(modPath, fighterName, targetAlt, allFiles) {
        const configPath = `${modPath}\\config.json`;

        let config = {
            "new-dir-infos": [],
            "new-dir-infos-base": {},
            "share-to-vanilla": {},
            "new-dir-files": {},
            "share-to-added": {}
        };

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

    static async changeSlots(modPath, slotChanges, allSlots, files, slotCustomNames = null) {
        const changedFiles = [];

        // Filter out config.json from files to rename
        const filesToRename = files.filter(file => !file.endsWith('config.json'));

        // Step 1: Move all files to temporary paths first
        const tempMappings = []; // { originalPath, tempPath, finalPath }

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
                if (!slotChanges[currentSlot]) {
                    // Slot not in slotChanges, skip
                    continue;
                }
                console.log('[changeSlots] Fichier:', file);
                console.log('[changeSlots] Slot extrait:', currentSlot);

                const newSlot = slotChanges[currentSlot];

                let newFilePath;

                if (isFighterSlotFolder) {
                    // Renommer le dossier slot (remplace tout le slot, ex: c01, c11, c123)
                    newFilePath = file.replace(new RegExp(`\\b${currentSlot}\\b`), newSlot);
                    console.log('[changeSlots] Dossier slot:', file, '->', newFilePath, '| Regex utilisée: /c\\d{1,3}/i | newSlot:', newSlot);
                } else {
                    // Renommer le fichier slot (hors fighter)
                    let oldNum = currentSlot.replace('c', '');
                    let newNum = newSlot.replace('c', '');

                    if (oldNum.length === 1) oldNum = '0' + oldNum;
                    if (newNum.length === 1) newNum = '0' + newNum;

                    let tempFilePath = file;
                    let regex = new RegExp(`_${oldNum}(?=\\.[^.]+$)`);

                    if (regex.test(tempFilePath)) {
                        tempFilePath = tempFilePath.replace(regex, `_${newNum}`);
                    }

                    if (tempFilePath === file) {
                        regex = new RegExp(`${oldNum}(?=\\.[^.]+$)`);
                        if (regex.test(tempFilePath)) {
                            tempFilePath = tempFilePath.replace(regex, newNum);
                        }
                    }

                    if (tempFilePath === file) {
                        regex = new RegExp(`c${oldNum}(?=\\.[^.]+$)`, 'i');
                        if (regex.test(tempFilePath)) {
                            tempFilePath = tempFilePath.replace(regex, `c${newNum}`);
                        }
                    }

                    newFilePath = tempFilePath;

                    // Sécurité : si newFilePath est undefined ou vide, skip
                    if (!newFilePath) {
                        console.warn(`[changeSlots] newFilePath is undefined for file: ${file}, skip.`);
                        continue;
                    }
                }

                // Create temporary path by adding .temp_ prefix to the last path component
                const tempPathParts = file.split(/[/\\]/);
                tempPathParts[tempPathParts.length - 1] = '.temp_' + tempPathParts[tempPathParts.length - 1];
                const tempPath = tempPathParts.join('/');

                tempMappings.push({
                    originalPath: file,
                    tempPath: tempPath,
                    finalPath: newFilePath
                });
            }
        }

        // Step 2: Move all files to temp paths
        console.log('[changeSlots] Moving files to temporary paths...');
        for (const mapping of tempMappings) {
            try {
                await window.api.modOperations.renameModFile(
                    modPath,
                    mapping.originalPath.replace(/\\/g, '/'),
                    mapping.tempPath.replace(/\\/g, '/')
                );
                console.log(`[changeSlots] Moved to temp: ${mapping.originalPath} -> ${mapping.tempPath}`);
            } catch (error) {
                console.error(`Error moving file to temp ${mapping.originalPath}:`, error);
                throw new Error(`Failed to move file to temp ${mapping.originalPath}: ${error.message}`);
            }
        }

        // Step 3: Move all files from temp paths to final paths
        console.log('[changeSlots] Moving files from temporary to final paths...');
        for (const mapping of tempMappings) {
            try {
                await window.api.modOperations.renameModFile(
                    modPath,
                    mapping.tempPath.replace(/\\/g, '/'),
                    mapping.finalPath.replace(/\\/g, '/')
                );
                console.log(`[changeSlots] Moved to final: ${mapping.tempPath} -> ${mapping.finalPath}`);
                changedFiles.push(mapping.finalPath);
            } catch (error) {
                console.error(`Error moving file from temp ${mapping.tempPath}:`, error);
                throw new Error(`Failed to move file from temp ${mapping.tempPath}: ${error.message}`);
            }
        }

        // Handle Max Slots configuration if needed
        const finalSlots = Object.values(allSlots);
        const hasAnySlotAboveC07 = finalSlots.find(slot => parseInt(slot.replace('c', '')) > 7);

        if (hasAnySlotAboveC07 || (slotCustomNames && Object.keys(slotCustomNames).length > 0)) {
            try {
                // 1. Get the fighter folder name
                const fighterNameInternal = await getInternalFighterName(modPath);

                if (!fighterNameInternal) {
                    console.log('[changeSlots] Dossier fighter non trouvé, skip la partie Max Slots.');
                    // On skip, pas d'erreur bloquante
                } else {
                    // 2. Read ui_chara_db.txt
                    const uiCharaDbTxtPath = 'src/resources/reslot/ui_chara_db.txt';
                    const uiCharaDbTxt = await window.api.modOperations.readModFile(uiCharaDbTxtPath);

                    // 3. Find the line with the fighter name and get the number at the start of the line
                    const lines = uiCharaDbTxt.split(/\r?\n/);
                    const fighterIndex = lines.findIndex(line => line.trim().toLowerCase() === fighterNameInternal.trim().toLowerCase());
                    if (fighterIndex === -1) throw new Error(`Fighter name "${fighterNameInternal}" not found in ui_chara_db.txt`);

                    // 4. Edit ui_chara_db.prcxml
                    const pathParts = modPath.replace(/\\/g, '/').split('/');
                    pathParts.pop();

                    const prcxmlTemplatePath = `src/resources/reslot/ui_chara_db.prcxml`;
                    let prcxmlContent = await window.api.modOperations.readModFile(prcxmlTemplatePath);

                    for (const slot of finalSlots) {
                        const slotNum = parseInt(slot.replace('c', ''));

                        if (slotNum > 7 || slotCustomNames && slotCustomNames[slot] && slotCustomNames[slot].announcer) {
                            const colorNum = slotNum + 1;
                            const nxyIndex = slotNum + 8;
                            const hashLine = new RegExp(`<hash40 index="${fighterIndex}">dummy<\\/hash40>`, 'g');

                            // Build the struct with color_num, nXY_index, and optional characall_label
                            let structContent = `<struct index="${fighterIndex}">` +
                                (slotNum > 7 ? `<byte hash="color_num">${colorNum}</byte>` : '') +
                                `<byte hash="n${String(slotNum).padStart(2, '0')}_index">${nxyIndex}</byte>`;

                            // Add custom announcer call if provided
                            if (slotCustomNames && slotCustomNames[slot] && slotCustomNames[slot].announcer) {
                                structContent += `<hash40 hash="characall_label_c${String(nxyIndex).padStart(2, '0')}">${slotCustomNames[slot].announcer}</hash40>`;
                            }

                            structContent += `</struct>`;

                            prcxmlContent = prcxmlContent.replace(hashLine, structContent);
                        }
                    }

                    // Ensure the directory exists before writing the file
                    const outputDir = `${modPath}/ui/param/database`;
                    if (!(await window.api.modOperations.fileExists(outputDir))) {
                        await window.api.modOperations.createDirectory(outputDir);
                    }

                    // Write the modified file to the mod folder
                    await window.api.modOperations.writeModFile(`${modPath}/ui/param/database/ui_chara_db.prcxml`, prcxmlContent);
                }
            } catch (error) {
                console.error('Error editing ui_chara_db.prcxml:', error);
                throw new Error(`Error editing ui_chara_db.prcxml: ${error.message}`);
            }
        }

        // Update msg_name.xmsbt with custom names if provided (for all slots)
        const fighterNameForMsg = await getInternalFighterName(modPath);
        if (fighterNameForMsg && slotCustomNames && Object.keys(slotCustomNames).length > 0) {
            await ChangeSlots.updateMsgName(modPath, fighterNameForMsg, finalSlots, slotCustomNames);
        }

        // Update config.json after renaming
        const fighterName = await getInternalFighterName(modPath);

        if (fighterName) {
            for (const newSlot of Object.values(finalSlots)) {
                await ChangeSlots.addMissingFilesToConfig(modPath, fighterName, newSlot, files);
            }
        } else {
            console.log('[changeSlots] Dossier fighter non trouvé, skip addMissingFilesToConfig.');
        }

        // Après tous les renommages, mettre à jour share-to-vanilla et new-dir-infos dans config.json
        if (changedFiles.length > 0) {
            await ChangeSlots.updateShareToVanilla(modPath, finalSlots);
            await ChangeSlots.updateNewDirInfos(modPath, finalSlots);
            await ChangeSlots.updateNewDirFiles(modPath, finalSlots);
            await ChangeSlots.updateNewDirInfosBase(modPath, finalSlots);
            // Appel de updateShareToAdded ici
            await ChangeSlots.updateShareToAdded(modPath, finalSlots);
        }

        return changedFiles.length;
    }

    /**
     * Met à jour la section "share-to-vanilla" du config.json à la racine du mod.
     * @param {string} modPath
     * @param {Object} finalSlots - ex: { c34: c255 }
     */
    static async updateShareToVanilla(modPath, finalSlots) {
        try {
            console.log('[updateShareToVanilla] called');

            const fighterRoot = `${modPath}/fighter`;
            if (!(await window.api.modOperations.fileExists(fighterRoot))) {
                console.warn('[updateShareToVanilla] fighter folder not found:', fighterRoot);
                return;
            }

            const fighterNames = await getNonCopyFighterNames(modPath);

            // Charger vanilla.json
            const vanillaJsonPath = 'src/resources/reslot/vanilla.json';
            const vanillaExists = await window.api.modOperations.fileExists(vanillaJsonPath);
            if (!vanillaExists) {
                console.warn('[updateShareToVanilla] vanilla.json not found:', vanillaJsonPath);
                return;
            }
            const vanillaJsonRaw = await window.api.modOperations.readModFile(vanillaJsonPath);
            let vanillaJson;
            try {
                vanillaJson = JSON.parse(vanillaJsonRaw);
            } catch (e) {
                console.error('[updateShareToVanilla] Failed to parse vanilla.json:', e);
                return;
            }

            let vanillaFiles = [];
            if (Array.isArray(vanillaJson.file_array)) {
                vanillaFiles = vanillaJson.file_array;
            } else {
                for (const key in vanillaJson) {
                    if (Array.isArray(vanillaJson[key])) {
                        vanillaFiles.push(...vanillaJson[key]);
                    }
                }
            }

            const configPath = `${modPath}/config.json`;
            let config = {};
            if (await window.api.modOperations.fileExists(configPath)) {
                try {
                    config = JSON.parse(await window.api.modOperations.readModFile(configPath));
                } catch {
                    config = {};
                }
            }
            if (!config["share-to-vanilla"]) config["share-to-vanilla"] = {};

            let keyOrder = [];
            let vanillaSet = new Set();

            for (const [oldSlot, newSlot] of Object.entries(finalSlots)) {
                const newSlotNum = parseInt(newSlot.replace('c', ''));
                if (newSlotNum < 7) continue; // Ignore slots below c07

                for (const vanillaPath of vanillaFiles) {
                    let matchFighter = false;
                    for (const fighterName of fighterNames) {
                        // model/xxx/c00/...
                        if (
                            vanillaPath.startsWith(`fighter/${fighterName}/model/`)
                        ) {
                            // Récupère le sous-dossier (ex: bow, bowarrow, navy, parasail)
                            const match = vanillaPath.match(new RegExp(`^fighter/${fighterName}/model/([^/]+)/c00/`));
                            if (match) {
                                matchFighter = true;
                                break;
                            }
                        }
                        // camera
                        if (
                            vanillaPath.startsWith(`camera/fighter/${fighterName}/c00/`) ||
                            vanillaPath.startsWith(`camera/fighter/${fighterName}/c00.`)
                        ) {
                            matchFighter = true;
                            break;
                        }
                        // sound
                        if (
                            vanillaPath.startsWith(`sound/bank/fighter/se_${fighterName}_c00`) ||
                            vanillaPath.startsWith(`sound/bank/fighter_voice/vc_${fighterName}_c00`) ||
                            vanillaPath.startsWith(`sound/bank/fighter_voice/vc_${fighterName}_cheer_c00`)
                        ) {
                            matchFighter = true;
                            break;
                        }
                        // kirbycopy
                        if (
                            vanillaPath.startsWith(`fighter/kirby/model/copy_${fighterName}_cap/c00/`) ||
                            vanillaPath.startsWith(`fighter/kirby/model/copy_${fighterName}_cap/c00.`)
                        ) {
                            matchFighter = true;
                            break;
                        }
                    }
                    if (!matchFighter) continue;
                    // On ne mappe que les fichiers (présence d'une extension)
                    if (!/\.[a-z0-9]+$/i.test(vanillaPath)) continue;
                    // Remplacement strict de /c00/ ou _c00 ou /c00 (fin de chemin) par le slot custom
                    let customPath = vanillaPath
                        .replace(/\/c00\//g, `/${newSlot}/`)
                        .replace(/\/c00$/g, `/${newSlot}`)
                        .replace(/_c00/g, `_${newSlot}`);

                    if (customPath !== vanillaPath) {
                        if (!vanillaSet.has(vanillaPath)) {
                            keyOrder.push(vanillaPath);
                            vanillaSet.add(vanillaPath);
                        }

                        if (!config["share-to-vanilla"][vanillaPath]) {
                            config["share-to-vanilla"][vanillaPath] = [];
                        }

                        config["share-to-vanilla"][vanillaPath].push(customPath);
                    }
                }
            }
            // On retire toute clé qui n'est pas dans keyOrder (pour éviter les clés parasites)
            const filteredShareToVanilla = {};
            for (const k of keyOrder) {
                if (config["share-to-vanilla"][k]) filteredShareToVanilla[k] = config["share-to-vanilla"][k];
            }
            config["share-to-vanilla"] = filteredShareToVanilla;

            await ChangeSlots.writeOrderedConfig(configPath, config);
        } catch (e) {
            console.error('[updateShareToVanilla] Error:', e);
        }
    }

    /**
     * Met à jour la section "new-dir-infos" du config.json à la racine du mod.
     * Pour chaque fighter et chaque slot custom, ajoute les chemins de dossier vanilla correspondants.
     * @param {string} modPath
     * @param {Object} slotChanges - ex: { c34: c255 }
     */
    static async updateNewDirInfos(modPath, slotChanges) {
        try {
            // Cherche le(s) nom(s) du fighter
            const fighterNames = await getNonCopyFighterNames(modPath);

            // Si pas trouvé, tente de déduire le nom du fighter depuis le chemin ou fallback "link"
            if (fighterNames.length === 0) {
                const match = modPath.replace(/\\/g, '/').match(/fighter\/([^/]+)/i);

                if (match) {
                    fighterNames = [match[1]];
                } else {
                    fighterNames = ["link"];
                }
            }

            const configPath = `${modPath}/config.json`;

            let config = {};

            if (await window.api.modOperations.fileExists(configPath)) {
                try {
                    config = JSON.parse(await window.api.modOperations.readModFile(configPath));
                } catch {
                    config = {};
                }
            }

            // Ordre vanilla strict
            const vanillaTemplates = [
                "fighter/{fighter}/{slot}",
                "fighter/{fighter}/camera/{slot}",
                "fighter/{fighter}/kirbycopy/{slot}",
                "fighter/{fighter}/movie/{slot}",
                "fighter/{fighter}/result/{slot}"
            ];

            let keyOrder = [];

            for (const fighterName of fighterNames) {
                for (const [oldSlot, newSlot] of Object.entries(slotChanges)) {
                    const newSlotNum = parseInt(newSlot.replace('c', ''));
                    if (newSlotNum < 7) continue; // Ignore slots below c07

                    for (const template of vanillaTemplates) {
                        const newDir = template.replace('{fighter}', fighterName).replace('{slot}', newSlot);
                        keyOrder.push(newDir);
                    }
                }
            }

            config["new-dir-infos"] = keyOrder;

            await ChangeSlots.writeOrderedConfig(configPath, config);
        } catch (e) {
            console.error('[updateNewDirInfos] Error:', e);
        }
    }

    /**
     * Met à jour la section "new-dir-files" du config.json à la racine du mod.
     * Pour chaque fighter et chaque slot custom, ajoute tous les chemins vanilla (depuis vanilla.json) pour :
     *   - fighter/{fighter}/.../c00
     *   - camera/fighter/{fighter}/.../c00
     *   - fighter/{fighter}/motion/.../c00
     * puis remplace c00 par le slot custom.
     * @param {string} modPath
     * @param {Object} slotChanges - ex: { c00: c08 }
     */
    static async updateNewDirFiles(modPath, slotChanges) {
        try {
            console.log('[updateNewDirFiles] called');
            const fighterRoot = `${modPath}/fighter`;
            if (!(await window.api.modOperations.fileExists(fighterRoot))) {
                console.warn('[updateNewDirFiles] fighter folder not found:', fighterRoot);
                return;
            }

            const fighterNames = await getNonCopyFighterNames(modPath);
            if (fighterNames.length === 0) return;

            // Charger vanilla.json
            const vanillaJsonPath = 'src/resources/reslot/vanilla.json';
            const vanillaExists = await window.api.modOperations.fileExists(vanillaJsonPath);
            if (!vanillaExists) {
                console.warn('[updateNewDirFiles] vanilla.json not found:', vanillaJsonPath);
                return;
            }
            const vanillaJsonRaw = await window.api.modOperations.readModFile(vanillaJsonPath);
            let vanillaJson;
            try {
                vanillaJson = JSON.parse(vanillaJsonRaw);
            } catch (e) {
                console.error('[updateNewDirFiles] Failed to parse vanilla.json:', e);
                return;
            }

            const configPath = `${modPath}/config.json`;
            let config = {};
            if (await window.api.modOperations.fileExists(configPath)) {
                try {
                    config = JSON.parse(await window.api.modOperations.readModFile(configPath));
                } catch {
                    config = {};
                }
            }
            if (!config["new-dir-files"]) config["new-dir-files"] = {};

            let vanillaFiles = [];
            if (Array.isArray(vanillaJson.file_array)) {
                vanillaFiles = vanillaJson.file_array;
            } else {
                for (const key in vanillaJson) {
                    if (Array.isArray(vanillaJson[key])) {
                        vanillaFiles.push(...vanillaJson[key]);
                    }
                }
            }

            // Correction : n'inclure que les fichiers c08 pour chaque section, dans l'ordre de l'exemple
            const vanillaTemplates = [
                "fighter/{fighter}/{slot}",
                "fighter/{fighter}/camera/{slot}",
                "fighter/{fighter}/kirbycopy/{slot}",
                "fighter/{fighter}/movie/{slot}",
                "fighter/{fighter}/result/{slot}"
            ];
            let keyOrder = [];
            for (const fighterName of fighterNames) {
                for (const [oldSlot, newSlot] of Object.entries(slotChanges)) {
                    const newSlotNum = parseInt(newSlot.replace('c', ''));
                    if (newSlotNum < 7) continue; // Ignore slots below c07

                    // fighter/{fighter}/{slot}
                    let filesForSlot = [];
                    let filesKirby = [];
                    let filesCamera = [];
                    for (const f of vanillaFiles) {
                        // fighter/{fighter}/{slot}
                        if (
                            f.startsWith(`fighter/${fighterName}/model/`) &&
                            f.includes(`/c00/`)
                        ) {
                            filesForSlot.push(f.replace(`/c00/`, `/${newSlot}/`));
                        }
                        // fighter/{fighter}/motion/...
                        if (
                            f.startsWith(`fighter/${fighterName}/motion/`) &&
                            f.includes(`/c00/`)
                        ) {
                            filesForSlot.push(f.replace(`/c00/`, `/${newSlot}/`));
                        }
                        // sound
                        if (
                            f.startsWith(`sound/bank/fighter/se_${fighterName}_c00`) ||
                            f.startsWith(`sound/bank/fighter_voice/vc_${fighterName}_c00`) ||
                            f.startsWith(`sound/bank/fighter_voice/vc_${fighterName}_cheer_c00`)
                        ) {
                            filesForSlot.push(f.replace(/_c00/g, `_${newSlot}`));
                        }
                        // camera
                        if (
                            f.startsWith(`camera/fighter/${fighterName}/`) &&
                            f.includes(`/c00/`)
                        ) {
                            filesCamera.push(f.replace(`/c00/`, `/${newSlot}/`));
                        }
                        // kirbycopy
                        if (
                            f.startsWith(`fighter/kirby/model/copy_${fighterName}_cap/`) &&
                            f.includes(`/c00/`)
                        ) {
                            filesKirby.push(f.replace(`/c00/`, `/${newSlot}/`));
                        }
                    }
                    // Remove duplicates and sort
                    filesForSlot = [...new Set(filesForSlot)].sort();
                    filesCamera = [...new Set(filesCamera)].sort();
                    filesKirby = [...new Set(filesKirby)].sort();

                    // fighter/{fighter}/{slot}
                    const dirKey = `fighter/${fighterName}/${newSlot}`;
                    keyOrder.push(dirKey);
                    config["new-dir-files"][dirKey] = filesForSlot;

                    // fighter/{fighter}/camera/{slot}
                    const cameraKey = `fighter/${fighterName}/camera/${newSlot}`;
                    keyOrder.push(cameraKey);
                    config["new-dir-files"][cameraKey] = filesCamera;

                    // fighter/{fighter}/kirbycopy/{slot}
                    const kirbyKey = `fighter/${fighterName}/kirbycopy/${newSlot}`;
                    keyOrder.push(kirbyKey);
                    config["new-dir-files"][kirbyKey] = filesKirby;

                    // movie/result (empty arrays)
                    const movieKey = `fighter/${fighterName}/movie/${newSlot}`;
                    keyOrder.push(movieKey);
                    config["new-dir-files"][movieKey] = [];

                    const resultKey = `fighter/${fighterName}/result/${newSlot}`;
                    keyOrder.push(resultKey);
                    config["new-dir-files"][resultKey] = [];
                }
            }
            config["new-dir-files"] = ChangeSlots.orderObject(config["new-dir-files"], keyOrder);

            await ChangeSlots.writeOrderedConfig(configPath, config);
        } catch (e) {
            console.error('[updateNewDirFiles] Error:', e);
        }
    }

    /**
     * Met à jour la section "new-dir-infos-base" du config.json à la racine du mod.
     * Pour chaque fighter et chaque slot custom, ajoute les chemins vanilla (c00) et custom (nouveau slot)
     * pour les dossiers principaux (camera, cmn, sound, bodymotion) et le slot racine.
     * @param {string} modPath
     * @param {Object} slotChanges - ex: { c08: c34 }
     */
    static async updateNewDirInfosBase(modPath, slotChanges) {
        try {
            console.log('[updateNewDirInfosBase] called');
            const fighterRoot = `${modPath}/fighter`;
            if (!(await window.api.modOperations.fileExists(fighterRoot))) {
                console.warn('[updateNewDirInfosBase] fighter folder not found:', fighterRoot);
                return;
            }

            const fighterNames = await getNonCopyFighterNames(modPath);
            if (fighterNames.length === 0) return;

            const configPath = `${modPath}/config.json`;
            let config = {};
            if (await window.api.modOperations.fileExists(configPath)) {
                try {
                    config = JSON.parse(await window.api.modOperations.readModFile(configPath));
                } catch {
                    config = {};
                }
            }
            if (!config["new-dir-infos-base"]) config["new-dir-infos-base"] = {};

            // Ordre attendu pour new-dir-infos-base
            // Pour coller à l'exemple fourni
            let keyOrder = [];
            for (const fighterName of fighterNames) {
                for (const [oldSlot, newSlot] of Object.entries(slotChanges)) {
                    const newSlotNum = parseInt(newSlot.replace('c', ''));
                    if (newSlotNum < 7) continue; // Ignore slots below c07

                    // camera pour slot principal
                    const customCamera = `fighter/${fighterName}/${newSlot}/camera`;
                    const vanillaCamera = `fighter/${fighterName}/c00/camera`;
                    config["new-dir-infos-base"][customCamera] = vanillaCamera;
                    keyOrder.push(customCamera);

                    // bodymotion/cmn/sound/cmn pour kirbycopy
                    const customKirbyBodymotion = `fighter/${fighterName}/kirbycopy/${newSlot}/bodymotion`;
                    const vanillaKirbyBodymotion = `fighter/${fighterName}/kirbycopy/c00/bodymotion`;
                    config["new-dir-infos-base"][customKirbyBodymotion] = vanillaKirbyBodymotion;
                    keyOrder.push(customKirbyBodymotion);

                    const customKirbyCmn = `fighter/${fighterName}/kirbycopy/${newSlot}/cmn`;
                    const vanillaKirbyCmn = `fighter/${fighterName}/kirbycopy/c00/cmn`;
                    config["new-dir-infos-base"][customKirbyCmn] = vanillaKirbyCmn;
                    keyOrder.push(customKirbyCmn);

                    const customKirbySound = `fighter/${fighterName}/kirbycopy/${newSlot}/sound`;
                    const vanillaKirbySound = `fighter/${fighterName}/kirbycopy/c00/sound`;
                    config["new-dir-infos-base"][customKirbySound] = vanillaKirbySound;
                    keyOrder.push(customKirbySound);

                    // cmn pour slot principal
                    const customCmn = `fighter/${fighterName}/${newSlot}/cmn`;
                    const vanillaCmn = `fighter/${fighterName}/c00/cmn`;
                    config["new-dir-infos-base"][customCmn] = vanillaCmn;
                    keyOrder.push(customCmn);
                }
            }
            config["new-dir-infos-base"] = ChangeSlots.orderObject(config["new-dir-infos-base"], keyOrder);

            await ChangeSlots.writeOrderedConfig(configPath, config);
        } catch (e) {
            console.error('[updateNewDirInfosBase] Error:', e);
        }
    }

    static async removeSlot(modPath, slot, files) {
        let deletedFiles = 0;

        for (const file of files) {
            if (file.includes(slot) || ((file.endsWith('.bntx') || file.endsWith('.dds')) && file.includes(slot.replace('c', '')))) {
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
     * Met à jour la section "share-to-added" du config.json à la racine du mod.
     * Pour chaque fighter et chaque slot custom, mappe tous les fichiers vanilla (c00) vers leur équivalent custom (nouveau slot).
     * @param {string} modPath
     * @param {Object} slotChanges - ex: { c00: c08 }
     */
    static async updateShareToAdded(modPath, slotChanges) {
        try {
            console.log('[updateShareToAdded] called');
            const fighterRoot = `${modPath}/fighter`;

            if (!(await window.api.modOperations.fileExists(fighterRoot))) {
                console.warn('[updateShareToAdded] fighter folder not found:', fighterRoot);
                return;
            }

            const fighterNames = await getNonCopyFighterNames(modPath);
            if (fighterNames.length === 0) return;

            // Charger vanilla.json
            const vanillaJsonPath = 'src/resources/reslot/vanilla.json';
            const vanillaExists = await window.api.modOperations.fileExists(vanillaJsonPath);
            if (!vanillaExists) {
                console.warn('[updateShareToAdded] vanilla.json not found:', vanillaJsonPath);
                return;
            }
            const vanillaJsonRaw = await window.api.modOperations.readModFile(vanillaJsonPath);
            let vanillaJson;
            try {
                vanillaJson = JSON.parse(vanillaJsonRaw);
            } catch (e) {
                console.error('[updateShareToAdded] Failed to parse vanilla.json:', e);
                return;
            }

            const configPath = `${modPath}/config.json`;
            let config = {};
            if (await window.api.modOperations.fileExists(configPath)) {
                try {
                    config = JSON.parse(await window.api.modOperations.readModFile(configPath));
                } catch {
                    config = {};
                }
            }
            if (!config["share-to-added"]) config["share-to-added"] = {};

            let vanillaFiles = [];
            if (Array.isArray(vanillaJson.file_array)) {
                vanillaFiles = vanillaJson.file_array;
            } else {
                for (const key in vanillaJson) {
                    if (Array.isArray(vanillaJson[key])) {
                        vanillaFiles.push(...vanillaJson[key]);
                    }
                }
            }

            let mappingCount = 0;
            for (const fighterName of fighterNames) {
                for (const [oldSlot, newSlot] of Object.entries(slotChanges)) {
                    const newSlotNum = parseInt(newSlot.replace('c', ''));
                    if (newSlotNum < 7) continue; // Ignore slots below c07

                    // 1. Motion, camera, sound
                    for (const vanillaPath of vanillaFiles) {
                        if (
                            (
                                vanillaPath.startsWith(`camera/fighter/${fighterName}/`) ||
                                vanillaPath.startsWith(`fighter/${fighterName}/motion/`) ||
                                vanillaPath.startsWith(`sound/bank/fighter/se_${fighterName}_c00`) ||
                                vanillaPath.startsWith(`sound/bank/fighter_voice/vc_${fighterName}_c00`) ||
                                vanillaPath.startsWith(`sound/bank/fighter_voice/vc_${fighterName}_cheer_c00`)
                            ) &&
                            /\/c00(\/|$)/.test(vanillaPath)
                        ) {
                            const addedPath = vanillaPath.replace(/\/c00(\/|$)/g, `/${newSlot}$1`);
                            if (!config["share-to-added"][vanillaPath]) {
                                config["share-to-added"][vanillaPath] = [];
                            }
                            if (!config["share-to-added"][vanillaPath].includes(addedPath)) {
                                config["share-to-added"][vanillaPath].push(addedPath);
                            }
                        }
                    }
                    // 2. Uniquement le dossier racine kirbycopy (PAS tous les fichiers du slot Kirby)
                    const kirbyRoot = `fighter/kirby/model/copy_${fighterName}_cap/c00`;
                    const kirbyRootNew = `fighter/kirby/model/copy_${fighterName}_cap/${newSlot}`;
                    // Remplace toute valeur existante par [kirbyRootNew] UNIQUEMENT si le slot custom existe réellement dans le mod
                    // (sinon, ne mappe pas du tout)
                    let kirbyRootExists = false;
                    for (const f of vanillaFiles) {
                        if (f === kirbyRootNew) {
                            kirbyRootExists = true;
                            break;
                        }
                    }
                    if (kirbyRootExists) {
                        config["share-to-added"][kirbyRoot] = [kirbyRootNew];
                    } else {
                        // Supprime la clé si elle existe et le slot custom n'existe pas
                        if (config["share-to-added"].hasOwnProperty(kirbyRoot)) {
                            delete config["share-to-added"][kirbyRoot];
                        }
                    }
                }
            }

            // Trie les clés
            config["share-to-added"] = ChangeSlots.orderObject(
                config["share-to-added"],
                Object.keys(config["share-to-added"]).sort()
            );
            await ChangeSlots.writeOrderedConfig(configPath, config);
        } catch (e) {
            console.error('[updateShareToAdded] Error:', e);
        }
    }

    // Ajoute cette fonction utilitaire pour ordonner les propriétés d'un objet selon un ordre donné
    static orderObject(obj, keyOrder) {
        const ordered = {};
        for (const key of keyOrder) {
            if (obj.hasOwnProperty(key)) ordered[key] = obj[key];
        }
        for (const key of Object.keys(obj).sort()) {
            if (!ordered.hasOwnProperty(key)) ordered[key] = obj[key];
        }
        return ordered;
    }

    // Modifie toutes les méthodes qui écrivent config.json pour respecter l'ordre des sections et des clés
    static async writeOrderedConfig(configPath, config) {
        // Ordre strict des sections
        const sectionOrder = [
            "new-dir-infos",
            "new-dir-infos-base",
            "share-to-vanilla",
            "share-to-added",
            "new-dir-files"
        ];
        const orderedConfig = {};
        for (const section of sectionOrder) {
            if (config[section] !== undefined) {
                // Pour les objets, ne garder que les clés non vides et dans l'ordre d'origine
                if (typeof config[section] === "object" && !Array.isArray(config[section])) {
                    const cleanObj = {};
                    for (const key of Object.keys(config[section])) {
                        // Ne pas inclure les clés vides ou non attendues
                        if (
                            config[section][key] !== undefined &&
                            config[section][key] !== null &&
                            (
                                (Array.isArray(config[section][key]) && config[section][key].length > 0) ||
                                (!Array.isArray(config[section][key]) && typeof config[section][key] === "string")
                            )
                        ) {
                            cleanObj[key] = config[section][key];
                        }
                    }
                    orderedConfig[section] = cleanObj;
                } else if (Array.isArray(config[section])) {
                    // Pour les tableaux, ne garder que les valeurs non vides
                    orderedConfig[section] = config[section].filter(x => x && x.length > 0);
                } else {
                    orderedConfig[section] = config[section];
                }
            }
        }
        // Ajoute les autres sections éventuelles à la fin
        for (const key of Object.keys(config)) {
            if (!orderedConfig.hasOwnProperty(key)) {
                orderedConfig[key] = config[key];
            }
        }
        // Écriture finale : JSON bien indenté, sans clés vides, sections dans l'ordre strict
        await window.api.modOperations.writeModFile(configPath, JSON.stringify(orderedConfig, null, 4));
    }

    static async updateMsgName(modPath, fighterName, slots, slotCustomNames) {
        try {
            console.log('[updateMsgName] called');

            // Prepare XML content
            let xmlEntries = [];

            for (const slot of slots) {
                const slotNum = parseInt(slot.replace('c', ''));

                const names = slotCustomNames[slot];
                if (!names) continue;

                // Calculate the label index to match ui_chara_db.prcxml nXY_index value
                // This should always be slot number + 8 (same as nxyIndex in ui_chara_db.prcxml)
                const labelIndex = slotNum + 8;

                const cspName = names.cspName || '';
                const vsName = names.vsName || (cspName ? cspName.toUpperCase() : '');
                const boxingRingName = names.boxingRing || '';

                // Create entries for this slot
                xmlEntries.push(`\t<entry label="nam_chr1_${labelIndex}_${fighterName}">`);
                xmlEntries.push(`\t\t<text>${this.escapeXml(cspName)}</text>`);
                xmlEntries.push(`\t</entry>`);

                xmlEntries.push(`\t<entry label="nam_chr2_${labelIndex}_${fighterName}">`);
                xmlEntries.push(`\t\t<text>${this.escapeXml(vsName)}</text>`);
                xmlEntries.push(`\t</entry>`);

                xmlEntries.push(`\t<entry label="nam_stage_name_${labelIndex}_${fighterName}">`);
                xmlEntries.push(`\t\t<text>${this.escapeXml(boxingRingName)}</text>`);
                xmlEntries.push(`\t</entry>`);
            }

            if (xmlEntries.length === 0) {
                console.log('[updateMsgName] No custom names to write');
                return;
            }

            // Build complete XML file
            const xmlContent = [
                '<?xml version="1.0" encoding="utf-16"?>',
                '<xmsbt>',
                ...xmlEntries,
                '</xmsbt>'
            ].join('\n');

            // Ensure the directory exists
            const outputDir = `${modPath}/ui/message`;
            if (!(await window.api.modOperations.fileExists(outputDir))) {
                await window.api.modOperations.createDirectory(outputDir);
            }

            // Write the file
            await window.api.modOperations.writeModFile(`${modPath}/ui/message/msg_name.xmsbt`, xmlContent);
            console.log('[updateMsgName] Successfully wrote msg_name.xmsbt');
        } catch (error) {
            console.error('[updateMsgName] Error:', error);
            throw error;
        }
    }

    static escapeXml(str) {
        if (!str) return '';
        return str
            .replace(/\\n/g, '\n')  // Convert \n escape sequences to actual newlines
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    static async readExistingCustomNames(modPath, fighterName, slots) {
        const customNames = {};
        const parser = new DOMParser();

        try {
            // First, read ui_chara_db.prcxml to get the actual labelIndex for each slot
            const slotToLabelIndex = {};
            const prcxmlPath = `${modPath}/ui/param/database/ui_chara_db.prcxml`;

            if (await window.api.modOperations.fileExists(prcxmlPath)) {
                const prcxmlContent = await window.api.modOperations.readModFile(prcxmlPath);
                const prcxmlDoc = parser.parseFromString(prcxmlContent, 'text/xml');

                // Check for parsing errors
                const parserError = prcxmlDoc.querySelector('parsererror');

                if (!parserError) {
                    for (const slot of slots) {
                        const slotNum = parseInt(slot.replace('c', ''));

                        // Look for the nXY_index byte element
                        const nxyIndexElement = prcxmlDoc.querySelector(`byte[hash="n${String(slotNum).padStart(2, '0')}_index"]`);

                        if (nxyIndexElement && nxyIndexElement.textContent) {
                            slotToLabelIndex[slot] = parseInt(nxyIndexElement.textContent);
                        } else {
                            // Fallback to default calculation
                            slotToLabelIndex[slot] = slotNum + 8;
                        }
                    }
                }
            } else {
                // If prcxml doesn't exist, use default calculation for all slots
                for (const slot of slots) {
                    const slotNum = parseInt(slot.replace('c', ''));
                    slotToLabelIndex[slot] = slotNum + 8;
                }
            }

            // Read msg_name.xmsbt if it exists
            const msgNamePath = `${modPath}/ui/message/msg_name.xmsbt`;

            if (await window.api.modOperations.fileExists(msgNamePath)) {
                const msgContent = await window.api.modOperations.readModFile(msgNamePath);
                const msgDoc = parser.parseFromString(msgContent, 'text/xml');

                // Check for parsing errors
                const parserError = msgDoc.querySelector('parsererror');

                if (!parserError) {
                    for (const slot of slots) {
                        const labelIndex = slotToLabelIndex[slot];

                        console.log(`[readExistingCustomNames] Reading names for slot ${slot} (label index ${labelIndex})`);

                        // Query for entry elements with specific labels
                        const cspEntry = msgDoc.querySelector(`entry[label="nam_chr1_${labelIndex}_${fighterName}"]`);
                        const vsEntry = msgDoc.querySelector(`entry[label="nam_chr2_${labelIndex}_${fighterName}"]`);
                        const boxingEntry = msgDoc.querySelector(`entry[label="nam_stage_name_${labelIndex}_${fighterName}"]`);

                        // Convert actual newlines to \n escape sequences for editing
                        const cspText = (cspEntry?.querySelector('text')?.textContent || '').replace(/\n/g, '\\n');
                        const vsText = (vsEntry?.querySelector('text')?.textContent || '').replace(/\n/g, '\\n');
                        const boxingText = (boxingEntry?.querySelector('text')?.textContent || '').replace(/\n/g, '\\n');

                        if (cspText || vsText || boxingText) {
                            customNames[slot] = {
                                cspName: cspText,
                                vsName: vsText,
                                boxingRing: boxingText,
                                announcer: ''
                            };
                        }
                    }
                }
            }

            // Read announcer info from ui_chara_db.prcxml
            if (await window.api.modOperations.fileExists(prcxmlPath)) {
                const prcxmlContent = await window.api.modOperations.readModFile(prcxmlPath);
                const prcxmlDoc = parser.parseFromString(prcxmlContent, 'text/xml');

                // Check for parsing errors
                const parserError = prcxmlDoc.querySelector('parsererror');
                if (!parserError) {
                    for (const slot of slots) {
                        const labelIndex = slotToLabelIndex[slot];

                        // Query for hash40 element with specific hash attribute
                        const announcerElement = prcxmlDoc.querySelector(`hash40[hash="characall_label_c${String(labelIndex).padStart(2, '0')}"]`);
                        const announcerText = announcerElement?.textContent || '';

                        if (announcerText) {
                            if (!customNames[slot]) {
                                customNames[slot] = {
                                    cspName: '',
                                    vsName: '',
                                    boxingRing: '',
                                    announcer: ''
                                };
                            }
                            customNames[slot].announcer = announcerText;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[readExistingCustomNames] Error:', error);
            // Return empty customNames on error
        }

        return customNames;
    }

    /**
     * Gets default custom names from messages.data file
     * @param {string} fighterNameInternal - Internal fighter name (e.g., 'mario', 'link')
     * @param {string} slot - Slot number (e.g., '00', '01')
     * @returns {Object} - Object with cspName, vsName, and boxingRing properties
     */
    static async getDefaultCustomNames(fighterNameInternal, slot) {
        try {
            // Get the path to messages.data
            const messagesPath = 'Files/messages.data';

            if (!(await window.api.modOperations.fileExists(messagesPath))) {
                console.warn('messages.data file not found');
                return { cspName: '', vsName: '', boxingRing: '' };
            }

            // Read and parse the XML file
            const xmlContent = await window.api.modOperations.readModFile(messagesPath);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

            // Check for parsing errors
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                console.log('parserError :: ', parserError)
                console.error('Error parsing messages.data XML');
                return { cspName: '', vsName: '', boxingRing: '' };
            }

            // Format slot number (remove 'c' prefix if present)
            const slotNum = slot.replace('c', '');

            // Build label patterns
            const cspLabel = `nam_chr1_08_${fighterNameInternal}`;
            const vsLabel = `nam_chr2_08_${fighterNameInternal}`;
            const boxingRingLabel = `nam_stage_name_08_${fighterNameInternal}`;

            // Find matching entries
            const cspEntry = xmlDoc.querySelector(`entry[label="${cspLabel}"]`);
            const vsEntry = xmlDoc.querySelector(`entry[label="${vsLabel}"]`);
            const boxingRingEntry = xmlDoc.querySelector(`entry[label="${boxingRingLabel}"]`);

            return {
                cspName: cspEntry?.querySelector('text')?.textContent || '',
                vsName: vsEntry?.querySelector('text')?.textContent || '',
                boxingRing: boxingRingEntry?.querySelector('text')?.textContent?.replace(/\n/g, ' ') || ''
            };
        } catch (error) {
            console.error('Error reading messages.data:', error);
            return { cspName: '', vsName: '', boxingRing: '' };
        }
    }
}