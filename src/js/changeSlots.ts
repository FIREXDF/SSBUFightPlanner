import { PathData, SlotScanner } from "./slotScanner.js";
import { CreateNewConfigJSON } from "./createNewConfigJSON.js";

export class ChangeSlots {
  static async resetConfig(modPath, fighterName) {
    const { pathData } = await SlotScanner.scanForSlots(modPath);

    const configPath = `${modPath}/config.json`;

    const config = {
      "new-dir-infos": [],
      "new-dir-infos-base": {},
      "share-to-vanilla": {},
      "new-dir-files": {},
      "share-to-added": {},
    };

    const slots = Object.keys(pathData[fighterName] || {});

    for (const slot of slots) {
      // Préparer les chemins
      const newDirInfo = `fighter/${fighterName}/${slot}`;
      const cameraDirInfo = `fighter/${fighterName}/${slot}/camera`;
      const transplantDirInfo = `fighter/${fighterName}/cmn`;
      const oldCameraDir = `fighter/${fighterName}/camera/${slot}`;

      // Initialiser les sections si besoin
      if (!config["new-dir-files"][newDirInfo])
        config["new-dir-files"][newDirInfo] = [];
      if (!config["new-dir-files"][cameraDirInfo])
        config["new-dir-files"][cameraDirInfo] = [];
      if (!config["new-dir-files"][transplantDirInfo])
        config["new-dir-files"][transplantDirInfo] = [];
      if (config["new-dir-files"][oldCameraDir])
        delete config["new-dir-files"][oldCameraDir];

      // Extensions custom
      const customExtensions = [
        ".nuanmb",
        ".marker",
        ".bin",
        ".tonelabel",
        ".numatb",
        ".numdlb",
        ".nutexb",
        ".numshb",
        ".numshexb",
        ".nus3audio",
        ".nus3bank",
        ".nuhlpb",
        ".numdlb",
        ".xmb",
        ".kime",
        ".eff",
      ];

      const slotFiles = pathData[fighterName][slot].filesToBeModified.flatMap(
        (f) => f.original.replace(/\\/g, "/"),
      );

      // Parcours des fichiers
      for (const file of slotFiles) {
        // Effets transplantés
        if (file.includes(`effect/fighter/${fighterName}/transplant/`)) {
          if (!config["new-dir-files"][transplantDirInfo].includes(file))
            config["new-dir-files"][transplantDirInfo].push(file);

          continue;
        }

        // Effets spécifiques au slot
        if (
          file.includes(
            `effect/fighter/${fighterName}/ef_${fighterName}_${slot}`,
          )
        ) {
          if (!config["new-dir-files"][newDirInfo].includes(file))
            config["new-dir-files"][newDirInfo].push(file);

          continue;
        }

        // Caméra
        if (
          file.startsWith(`camera/fighter/${fighterName}/${slot}/`) &&
          file.endsWith(".nuanmb")
        ) {
          if (!config["new-dir-files"][cameraDirInfo].includes(file))
            config["new-dir-files"][cameraDirInfo].push(file);

          continue;
        }

        // Fichiers custom dans le slot cible
        if (file.includes(`/${slot}/`) || file.endsWith(`/${slot}`)) {
          const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
          const isCustom =
            customExtensions.includes(ext) ||
            ["body", "face", "hair", "eye", "brs_", "bust_", "hand_"].some(
              (marker) => file.toLowerCase().includes(marker),
            );

          if (isCustom && !config["new-dir-files"][newDirInfo].includes(file)) {
            config["new-dir-files"][newDirInfo].push(file);
          }
        }
      }
    }

    // Réécrire le config.json
    await window.api.modOperations.writeModFile(
      configPath,
      JSON.stringify(config, null, 4),
    );
  }

  static async changeSlots(
    modPath,
    slotChanges,
    finalSlots: string[],
    pathData: PathData,
    fighterName,
    slotCustomNames,
    defaultCustomNames,
  ) {
    const changedPaths = [];

    // Step 1: Move all files to temporary paths first
    const tempMappings = []; // { originalPath, tempPath, finalPath, slot }

    Object.keys(pathData).forEach((fighter) => {
      Object.keys(pathData[fighter]).forEach((currentSlot) => {
        if (!slotChanges[currentSlot]) {
          return;
        }

        Object.values(pathData[fighter][currentSlot].pathsToBeModified).forEach(
          ({ original, normalized }) => {
            console.log("[changeSlots] Original path:", original);
            console.log("[changeSlots] Slot extracted:", currentSlot);

            const newSlot = slotChanges[currentSlot];
            let newNum = newSlot.replace("c", "");
            if (newNum.length === 1) newNum = "0" + newNum;

            const newPath = normalized.replace("###", newNum);

            // Sécurité : si newFilePath est undefined ou vide, skip
            if (!newPath) {
              console.warn(
                `[changeSlots] newFilePath is undefined for path: ${original}, skip.`,
              );
              return;
            }

            // Create temporary path in a slot-specific temp directory
            // This isolates temp files for each slot to prevent conflicts
            const tempPathParts = normalized.split(/[/\\]/);
            const lastPart = tempPathParts[tempPathParts.length - 1];

            tempPathParts[tempPathParts.length - 1] =
              `.temp_${currentSlot}_${lastPart}`;

            const tempPath = tempPathParts.join("/");

            tempMappings.push({
              originalPath: original,
              tempPath: tempPath,
              finalPath: newPath,
            });
          },
        );
      });
    });

    for (const mapping of tempMappings) {
      try {
        await window.api.modOperations.renameModFile(
          modPath,
          mapping.originalPath.replace(/\\/g, "/"),
          mapping.tempPath.replace(/\\/g, "/"),
        );

        console.log(
          `[changeSlots] Moved to temp: ${mapping.originalPath} -> ${mapping.tempPath}`,
        );
      } catch (error) {
        console.error(
          `Error moving file to temp ${mapping.originalPath}:`,
          error,
        );
        throw new Error(
          `Failed to move file to temp ${mapping.originalPath}: ${error.message}`,
        );
      }
    }

    // Step 3: Move all files from temp paths to final paths
    console.log("[changeSlots] Moving files from temporary to final paths...");

    for (const mapping of tempMappings) {
      try {
        await window.api.modOperations.renameModFile(
          modPath,
          mapping.tempPath.replace(/\\/g, "/"),
          mapping.finalPath.replace(/\\/g, "/"),
        );

        console.log(
          `[changeSlots] Moved to final: ${mapping.tempPath} -> ${mapping.finalPath}`,
        );

        changedPaths.push(mapping.finalPath);
      } catch (error) {
        console.error(
          `Error moving file from temp ${mapping.tempPath}:`,
          error,
        );
        throw new Error(
          `Failed to move file from temp ${mapping.tempPath}: ${error.message}`,
        );
      }
    }

    const hasAnySlotAboveC07 = finalSlots.find(
      (slot) => parseInt(slot.replace("c", "")) > 7,
    );

    if (
      hasAnySlotAboveC07 ||
      (slotCustomNames && Object.keys(slotCustomNames).length > 0)
    ) {
      try {
        // 1. Get the fighter folder name
        if (!fighterName) {
          console.log(
            "[changeSlots] Dossier fighter non trouvé, skip la partie Max Slots.",
          );
          // On skip, pas d'erreur bloquante
        } else {
          // 2. Read names.data to get fighter index
          const appPath = await window.api.getAppPath();
          const namesDataPath = `${appPath}/Files/names.data`;
          const namesData =
            await window.api.modOperations.readModFile(namesDataPath);

          // 3. Find the fighter by internal name and get the index from the third column
          const lines = namesData.split(/\r?\n/);
          let fighterIndex = -1;

          for (const line of lines) {
            const parts = line.split(",").map((p) => p.trim());
            if (
              parts.length >= 3 &&
              parts[0].toLowerCase() === fighterName.trim().toLowerCase()
            ) {
              fighterIndex = parseInt(parts[2]);
              break;
            }
          }

          if (fighterIndex === -1)
            throw new Error(
              `Fighter name "${fighterName}" not found in names.data`,
            );

          // 4. Edit ui_chara_db.prcxml
          const pathParts = modPath.replace(/\\/g, "/").split("/");
          pathParts.pop();

          const prcxmlTemplatePath = `${appPath}/src/resources/reslot/ui_chara_db.prcxml`;

          let prcxmlContent =
            await window.api.modOperations.readModFile(prcxmlTemplatePath);

          // Build all parameters for this fighter's struct
          const structParams = [];

          // Calculate the highest slot number for color_num
          const maxSlotNum = Math.max(
            ...finalSlots.map((slot) => parseInt(slot.replace("c", ""))),
          );
          const colorNum = maxSlotNum + 1;

          // Add color_num if the highest slot is > 7
          if (maxSlotNum > 7) {
            structParams.push(`<byte hash="color_num">${colorNum}</byte>`);
          }

          for (const slot of finalSlots) {
            const slotNum = parseInt(slot.replace("c", ""));

            let announcer;
            let customAnnouncer;

            if (
              slotCustomNames &&
              slotCustomNames[slot] &&
              slotCustomNames[slot].announcer
            ) {
              customAnnouncer = announcer = slotCustomNames[slot].announcer;
            } else if (
              defaultCustomNames[slot] &&
              defaultCustomNames[slot].announcer
            ) {
              announcer = defaultCustomNames[slot].announcer;
            }

            if (slotNum > 7 || customAnnouncer) {
              const nxyIndex = slotNum + 8;

              // Add nXY_index parameter
              structParams.push(
                `<byte hash="n${String(slotNum).padStart(2, "0")}_index">${nxyIndex}</byte>`,
              );

              // Add custom announcer call if provided
              if (customAnnouncer) {
                structParams.push(
                  `<hash40 hash="characall_label_c${String(nxyIndex).padStart(2, "0")}">${announcer}</hash40>`,
                );
              }
            }
          }

          // Build a single struct with all parameters
          if (structParams.length > 0) {
            const structContent = `<struct index="${fighterIndex}">${structParams.join("")}</struct>`;
            const hashLine = new RegExp(
              `<hash40 index="${fighterIndex}">dummy<\\/hash40>`,
              "g",
            );
            prcxmlContent = prcxmlContent.replace(hashLine, structContent);
          }

          // Ensure the directory exists before writing the file
          const outputDir = `${modPath}/ui/param/database`;
          if (!(await window.api.modOperations.fileExists(outputDir))) {
            await window.api.modOperations.createDirectory(outputDir);
          }

          // Write the modified file to the mod folder
          await window.api.modOperations.writeModFile(
            `${modPath}/ui/param/database/ui_chara_db.prcxml`,
            prcxmlContent,
          );
        }
      } catch (error) {
        console.error("Error editing ui_chara_db.prcxml:", error);
        throw new Error(`Error editing ui_chara_db.prcxml: ${error.message}`);
      }
    }

    // Update msg_name.xmsbt with custom names if provided (for all slots)
    if (
      (fighterName && hasAnySlotAboveC07) ||
      (slotCustomNames && Object.keys(slotCustomNames).length > 0)
    ) {
      await ChangeSlots.updateMsgName(
        modPath,
        fighterName,
        finalSlots,
        slotCustomNames,
        defaultCustomNames,
      );
    }

    if (fighterName) {
      await CreateNewConfigJSON.init();
      const jsonCreator = new CreateNewConfigJSON(modPath, fighterName);

      // await ChangeSlots.resetConfig(modPath, fighterName);
      //
      // await ChangeSlots.updateShareToVanilla(modPath, fighterName, finalSlots);
      // await ChangeSlots.updateNewDirInfos(modPath, fighterName, finalSlots);
      // await ChangeSlots.updateNewDirFiles(modPath, fighterName, finalSlots);
      // await ChangeSlots.updateNewDirInfosBase(modPath, fighterName, finalSlots);
      // await ChangeSlots.updateShareToAdded(modPath, fighterName, finalSlots);
    }

    return changedPaths.length;
  }

  /**
   * Met à jour la section "share-to-vanilla" du config.json à la racine du mod.
   * @param {string} modPath
   * @param {Object} finalSlots - ex: { c34: c255 }
   */
  static async updateShareToVanilla(
    modPath,
    fighterName,
    finalSlots: string[],
  ) {
    try {
      console.log("[updateShareToVanilla] called");

      if (!fighterName) {
        console.log("[updateShareToVanilla] Fighter name not found, skipping.");
        return;
      }

      const fighterRoot = `${modPath}/fighter`;
      if (!(await window.api.modOperations.fileExists(fighterRoot))) {
        console.warn(
          "[updateShareToVanilla] fighter folder not found:",
          fighterRoot,
        );
        return;
      }

      // Charger vanilla.json
      const appPath = await window.api.getAppPath();
      const vanillaJsonPath = `${appPath}/Files/vanilla.json`;
      const vanillaExists =
        await window.api.modOperations.fileExists(vanillaJsonPath);

      if (!vanillaExists) {
        console.warn(
          "[updateShareToVanilla] vanilla.json not found:",
          vanillaJsonPath,
        );
        return;
      }

      const vanillaJsonRaw =
        await window.api.modOperations.readModFile(vanillaJsonPath);

      let vanillaJson;

      try {
        vanillaJson = JSON.parse(vanillaJsonRaw);
      } catch (e) {
        console.error(
          "[updateShareToVanilla] Failed to parse vanilla.json:",
          e,
        );
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
          config = JSON.parse(
            await window.api.modOperations.readModFile(configPath),
          );
        } catch {
          config = {};
        }
      }

      if (!config["share-to-vanilla"]) config["share-to-vanilla"] = {};

      const keyOrder = [];
      const vanillaSet = new Set();

      for (const [, newSlot] of Object.entries(finalSlots)) {
        const newSlotNum = parseInt(newSlot.replace("c", ""));
        if (newSlotNum < 8) continue; // Ignore slots below c07

        for (const vanillaPath of vanillaFiles) {
          let matchFighter = false;

          // model/xxx/c00/...
          if (vanillaPath.startsWith(`fighter/${fighterName}/model/`)) {
            // Récupère le sous-dossier (ex: bow, bowarrow, navy, parasail)
            const match = vanillaPath.match(
              new RegExp(`^fighter/${fighterName}/model/([^/]+)/c00/`),
            );

            if (match) {
              matchFighter = true;
            }
          } else if (
            vanillaPath.startsWith(`camera/fighter/${fighterName}/c00/`) ||
            vanillaPath.startsWith(`camera/fighter/${fighterName}/c00.`)
          ) {
            matchFighter = true;
          } else if (
            vanillaPath.startsWith(
              `sound/bank/fighter/se_${fighterName}_c00`,
            ) ||
            vanillaPath.startsWith(
              `sound/bank/fighter_voice/vc_${fighterName}_c00`,
            ) ||
            vanillaPath.startsWith(
              `sound/bank/fighter_voice/vc_${fighterName}_cheer_c00`,
            )
          ) {
            matchFighter = true;
          } else if (
            vanillaPath.startsWith(
              `fighter/kirby/model/copy_${fighterName}_cap/c00/`,
            ) ||
            vanillaPath.startsWith(
              `fighter/kirby/model/copy_${fighterName}_cap/c00.`,
            )
          ) {
            matchFighter = true;
          }

          if (!matchFighter) continue;

          // On ne mappe que les fichiers (présence d'une extension)
          if (!/\.[a-z0-9]+$/i.test(vanillaPath)) continue;

          // Remplacement strict de /c00/ ou _c00 ou /c00 (fin de chemin) par le slot custom
          const customPath = vanillaPath
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

      console.log("keyOrder :: ", keyOrder);
      config["share-to-vanilla"] = ChangeSlots.orderObject(
        config["share-to-vanilla"],
        keyOrder,
      );

      await ChangeSlots.writeOrderedConfig(configPath, config);
    } catch (e) {
      console.error("[updateShareToVanilla] Error:", e);
    }
  }

  /**
   * Met à jour la section "new-dir-infos" du config.json à la racine du mod.
   * Pour chaque fighter et chaque slot custom, ajoute les chemins de dossier vanilla correspondants.
   * @param {string} modPath
   * @param {Object} slotChanges - ex: { c34: c255 }
   */
  static async updateNewDirInfos(
    modPath,
    fighterName,
    slotChanges: string[],
  ) {
    try {
      // Si pas trouvé, tente de déduire le nom du fighter depuis le chemin ou fallback "link"
      if (!fighterName) {
        console.log("[updateNewDirInfos] Fighter name not found, skipping.");
        return;
      }

      const configPath = `${modPath}/config.json`;

      let config = {};

      if (await window.api.modOperations.fileExists(configPath)) {
        try {
          config = JSON.parse(
            await window.api.modOperations.readModFile(configPath),
          );
        } catch {
          config = {};
        }
      }

      // Ordre vanilla strict
      const vanillaTemplates = [
        "fighter/{fighter}/{slot}",
        "fighter/{fighter}/camera/{slot}",
        ...(fighterName === "kirby"
          ? []
          : ["fighter/{fighter}/kirbycopy/{slot}"]),
        "fighter/{fighter}/movie/{slot}",
        "fighter/{fighter}/result/{slot}",
      ];

      for (const [, newSlot] of Object.entries(slotChanges)) {
        const newSlotNum = parseInt(newSlot.replace("c", ""));
        if (newSlotNum < 8) continue; // Ignore slots below c08

        for (const template of vanillaTemplates) {
          const newDir = template
            .replace("{fighter}", fighterName)
            .replace("{slot}", newSlot);
          config["new-dir-infos"].push(newDir);
        }
      }

      await ChangeSlots.writeOrderedConfig(configPath, config);
    } catch (e) {
      console.error("[updateNewDirInfos] Error:", e);
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
  static async updateNewDirFiles(
    modPath,
    fighterName,
    slotChanges: string[],
  ) {
    try {
      console.log("[updateNewDirFiles] called");

      if (!fighterName) {
        console.log("[updateNewDirFiles] Fighter name not found, skipping.");
        return;
      }

      // Charger vanilla.json
      const appPath = await window.api.getAppPath();
      const vanillaJsonPath = `${appPath}/src/resources/reslot/vanilla.json`;
      const vanillaExists =
        await window.api.modOperations.fileExists(vanillaJsonPath);

      if (!vanillaExists) {
        console.warn(
          "[updateNewDirFiles] vanilla.json not found:",
          vanillaJsonPath,
        );
        return;
      }

      const vanillaJsonRaw =
        await window.api.modOperations.readModFile(vanillaJsonPath);

      let vanillaJson;

      try {
        vanillaJson = JSON.parse(vanillaJsonRaw);
      } catch (e) {
        console.error("[updateNewDirFiles] Failed to parse vanilla.json:", e);
        return;
      }

      const configPath = `${modPath}/config.json`;

      let config = {};

      if (await window.api.modOperations.fileExists(configPath)) {
        try {
          config = JSON.parse(
            await window.api.modOperations.readModFile(configPath),
          );
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

      const keyOrder = [];

      for (const [, newSlot] of Object.entries(slotChanges)) {
        const newSlotNum = parseInt(newSlot.replace("c", ""));
        if (newSlotNum < 8) continue; // Ignore slots below c08

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
            (f.startsWith(`fighter/kirby/model/copy_${fighterName}_cap/`) ||
              f.startsWith(`fighter/kirby/model/copy_${fighterName}_sword/`)) &&
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
        const existingDirFiles = config["new-dir-files"][dirKey] || [];
        config["new-dir-files"][dirKey] = [
          ...new Set([...existingDirFiles, ...filesForSlot]),
        ].sort();

        // fighter/{fighter}/camera/{slot}
        const cameraKey = `fighter/${fighterName}/camera/${newSlot}`;
        keyOrder.push(cameraKey);
        const existingCameraFiles = config["new-dir-files"][cameraKey] || [];
        config["new-dir-files"][cameraKey] = [
          ...new Set([...existingCameraFiles, ...filesCamera]),
        ].sort();

        if (fighterName !== "kirby") {
          // fighter/{fighter}/kirbycopy/{slot}
          const kirbyKey = `fighter/${fighterName}/kirbycopy/${newSlot}`;
          keyOrder.push(kirbyKey);
          const existingKirbyFiles = config["new-dir-files"][kirbyKey] || [];
          config["new-dir-files"][kirbyKey] = [
            ...new Set([...existingKirbyFiles, ...filesKirby]),
          ].sort();
        }

        // movie/result (merge with empty arrays if not existing)
        const movieKey = `fighter/${fighterName}/movie/${newSlot}`;
        keyOrder.push(movieKey);
        if (!config["new-dir-files"][movieKey])
          config["new-dir-files"][movieKey] = [];

        const resultKey = `fighter/${fighterName}/result/${newSlot}`;
        keyOrder.push(resultKey);
        if (!config["new-dir-files"][resultKey])
          config["new-dir-files"][resultKey] = [];
      }

      config["new-dir-files"] = ChangeSlots.orderObject(
        config["new-dir-files"],
        keyOrder,
      );

      await ChangeSlots.writeOrderedConfig(configPath, config);
    } catch (e) {
      console.error("[updateNewDirFiles] Error:", e);
    }
  }

  /**
   * Met à jour la section "new-dir-infos-base" du config.json à la racine du mod.
   * Pour chaque fighter et chaque slot custom, ajoute les chemins vanilla (c00) et custom (nouveau slot)
   * pour les dossiers principaux (camera, cmn, sound, bodymotion) et le slot racine.
   * @param {string} modPath
   * @param {Object} slotChanges - ex: { c08: c34 }
   */
  static async updateNewDirInfosBase(
    modPath,
    fighterName,
    slotChanges: string[],
  ) {
    try {
      console.log("[updateNewDirInfosBase] called");

      if (!fighterName) {
        console.log(
          "[updateNewDirInfosBase] Fighter name not found, skipping.",
        );
        return;
      }

      const configPath = `${modPath}/config.json`;
      let config = {};
      if (await window.api.modOperations.fileExists(configPath)) {
        try {
          config = JSON.parse(
            await window.api.modOperations.readModFile(configPath),
          );
        } catch {
          config = {};
        }
      }
      if (!config["new-dir-infos-base"]) config["new-dir-infos-base"] = {};

      // Ordre attendu pour new-dir-infos-base
      // Pour coller à l'exemple fourni
      const keyOrder = [];

      for (const [, newSlot] of Object.entries(slotChanges)) {
        const newSlotNum = parseInt(newSlot.replace("c", ""));
        if (newSlotNum < 8) continue; // Ignore slots below c08

        // camera pour slot principal
        const customCamera = `fighter/${fighterName}/${newSlot}/camera`;
        const vanillaCamera = `fighter/${fighterName}/c00/camera`;

        if (!config["new-dir-infos-base"][customCamera]) {
          config["new-dir-infos-base"][customCamera] = vanillaCamera;
        }

        keyOrder.push(customCamera);

        if (fighterName !== "kirby") {
          // bodymotion/cmn/sound/cmn pour kirbycopy
          const customKirbyBodymotion = `fighter/${fighterName}/kirbycopy/${newSlot}/bodymotion`;
          const vanillaKirbyBodymotion = `fighter/${fighterName}/kirbycopy/c00/bodymotion`;

          if (!config["new-dir-infos-base"][customKirbyBodymotion]) {
            config["new-dir-infos-base"][customKirbyBodymotion] =
              vanillaKirbyBodymotion;
          }

          keyOrder.push(customKirbyBodymotion);

          const customKirbyCmn = `fighter/${fighterName}/kirbycopy/${newSlot}/cmn`;
          const vanillaKirbyCmn = `fighter/${fighterName}/kirbycopy/c00/cmn`;

          if (!config["new-dir-infos-base"][customKirbyCmn]) {
            config["new-dir-infos-base"][customKirbyCmn] = vanillaKirbyCmn;
          }

          keyOrder.push(customKirbyCmn);

          const customKirbySound = `fighter/${fighterName}/kirbycopy/${newSlot}/sound`;
          const vanillaKirbySound = `fighter/${fighterName}/kirbycopy/c00/sound`;

          if (!config["new-dir-infos-base"][customKirbySound]) {
            config["new-dir-infos-base"][customKirbySound] = vanillaKirbySound;
          }

          keyOrder.push(customKirbySound);
        }

        // cmn pour slot principal
        const customCmn = `fighter/${fighterName}/${newSlot}/cmn`;
        const vanillaCmn = `fighter/${fighterName}/c00/cmn`;

        if (!config["new-dir-infos-base"][customCmn]) {
          config["new-dir-infos-base"][customCmn] = vanillaCmn;
        }

        keyOrder.push(customCmn);
      }

      config["new-dir-infos-base"] = ChangeSlots.orderObject(
        config["new-dir-infos-base"],
        keyOrder,
      );

      await ChangeSlots.writeOrderedConfig(configPath, config);
    } catch (e) {
      console.error("[updateNewDirInfosBase] Error:", e);
    }
  }

  static async removeSlot(modPath, slot, pathData: PathData) {
    let deletedPaths = 0;

    for (const fighter in pathData) {
      for (const currentSlot in pathData[fighter]) {
        if (currentSlot !== slot) continue;

        for (const { original } of Object.values(
          pathData[fighter][currentSlot].pathsToBeModified,
        )) {
          await window.api.modOperations.deleteModFile(modPath, original);
          deletedPaths++;
        }
      }
    }

    return deletedPaths;
  }

  /**
   * Met à jour la section "share-to-added" du config.json à la racine du mod.
   * Pour chaque fighter et chaque slot custom, mappe tous les fichiers vanilla (c00) vers leur équivalent custom (nouveau slot).
   * @param {string} modPath
   * @param {Object} slotChanges - ex: { c00: c08 }
   */
  static async updateShareToAdded(
    modPath,
    fighterName,
    slotChanges: string[],
  ) {
    try {
      console.log("[updateShareToAdded] called");

      if (!fighterName) {
        console.log("[updateShareToAdded] Fighter name not found, skipping.");
        return;
      }

      // Charger vanilla.json
      const appPath = await window.api.getAppPath();
      const vanillaJsonPath = `${appPath}/src/resources/reslot/vanilla.json`;
      const vanillaExists =
        await window.api.modOperations.fileExists(vanillaJsonPath);

      if (!vanillaExists) {
        console.warn(
          "[updateShareToAdded] vanilla.json not found:",
          vanillaJsonPath,
        );
        return;
      }

      const vanillaJsonRaw =
        await window.api.modOperations.readModFile(vanillaJsonPath);
      let vanillaJson;

      try {
        vanillaJson = JSON.parse(vanillaJsonRaw);
      } catch (e) {
        console.error("[updateShareToAdded] Failed to parse vanilla.json:", e);
        return;
      }

      const configPath = `${modPath}/config.json`;

      let config = {};

      if (await window.api.modOperations.fileExists(configPath)) {
        try {
          config = JSON.parse(
            await window.api.modOperations.readModFile(configPath),
          );
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

      for (const [, newSlot] of Object.entries(slotChanges)) {
        const newSlotNum = parseInt(newSlot.replace("c", ""));
        if (newSlotNum < 8) continue; // Ignore slots below c08

        // 1. Motion, camera, sound
        for (const vanillaPath of vanillaFiles) {
          if (
            (vanillaPath.startsWith(`camera/fighter/${fighterName}/`) ||
              vanillaPath.startsWith(`fighter/${fighterName}/motion/`) ||
              vanillaPath.startsWith(
                `sound/bank/fighter/se_${fighterName}_c00`,
              ) ||
              vanillaPath.startsWith(
                `sound/bank/fighter_voice/vc_${fighterName}_c00`,
              ) ||
              vanillaPath.startsWith(
                `sound/bank/fighter_voice/vc_${fighterName}_cheer_c00`,
              )) &&
            /\/c00(\/|$)/.test(vanillaPath)
          ) {
            const addedPath = vanillaPath.replace(
              /\/c00(\/|$)/g,
              `/${newSlot}$1`,
            );

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
          // Merge with existing values instead of replacing
          if (!config["share-to-added"][kirbyRoot]) {
            config["share-to-added"][kirbyRoot] = [];
          }

          if (!config["share-to-added"][kirbyRoot].includes(kirbyRootNew)) {
            config["share-to-added"][kirbyRoot].push(kirbyRootNew);
          }
        } else {
          // Supprime la clé si elle existe et le slot custom n'existe pas
          if (config["share-to-added"].hasOwnProperty(kirbyRoot)) {
            delete config["share-to-added"][kirbyRoot];
          }
        }
      }

      // Trie les clés
      config["share-to-added"] = ChangeSlots.orderObject(
        config["share-to-added"],
        Object.keys(config["share-to-added"]).sort(),
      );

      await ChangeSlots.writeOrderedConfig(configPath, config);
    } catch (e) {
      console.error("[updateShareToAdded] Error:", e);
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
      "new-dir-files",
    ];
    const orderedConfig = {};
    for (const section of sectionOrder) {
      if (config[section] !== undefined) {
        // Pour les objets, ne garder que les clés non vides et dans l'ordre d'origine
        if (
          typeof config[section] === "object" &&
          !Array.isArray(config[section])
        ) {
          const cleanObj = {};
          for (const key of Object.keys(config[section])) {
            // Ne pas inclure les clés vides ou non attendues
            if (
              config[section][key] !== undefined &&
              config[section][key] !== null &&
              ((Array.isArray(config[section][key]) &&
                config[section][key].length > 0) ||
                (!Array.isArray(config[section][key]) &&
                  typeof config[section][key] === "string"))
            ) {
              cleanObj[key] = config[section][key];
            }
          }
          orderedConfig[section] = cleanObj;
        } else if (Array.isArray(config[section])) {
          // Pour les tableaux, ne garder que les valeurs non vides
          orderedConfig[section] = config[section].filter(
            (x) => x && x.length > 0,
          );
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
    await window.api.modOperations.writeModFile(
      configPath,
      JSON.stringify(orderedConfig, null, 4),
    );
  }

  static async updateMsgName(
    modPath,
    fighterName,
    slots,
    slotCustomNames,
    defaultCustomNames,
  ) {
    try {
      console.log("[updateMsgName] called");

      // Prepare XML content
      const xmlEntries = [];

      for (const slot of slots) {
        const slotNum = parseInt(slot.replace("c", ""));

        if (
          !slotCustomNames[slot] ||
          (!slotCustomNames[slot].cspName &&
            !slotCustomNames[slot].vsName &&
            !slotCustomNames[slot].boxingRing)
        ) {
          continue;
        }

        const names = {
          cspName:
            (slotCustomNames &&
              slotCustomNames[slot] &&
              slotCustomNames[slot].cspName) ||
            (defaultCustomNames &&
              defaultCustomNames[slot] &&
              defaultCustomNames[slot].cspName),
          vsName:
            (slotCustomNames &&
              slotCustomNames[slot] &&
              slotCustomNames[slot].vsName) ||
            (defaultCustomNames &&
              defaultCustomNames[slot] &&
              defaultCustomNames[slot].vsName),
          boxingRing:
            (slotCustomNames &&
              slotCustomNames[slot] &&
              slotCustomNames[slot].boxingRing) ||
            (defaultCustomNames &&
              defaultCustomNames[slot] &&
              defaultCustomNames[slot].boxingRing),
        };

        // Calculate the label index to match ui_chara_db.prcxml nXY_index value
        // This should always be slot number + 8 (same as nxyIndex in ui_chara_db.prcxml)
        const labelIndex = String(slotNum + 8).padStart(2, "0");

        const cspName = names.cspName || "";
        const vsName = names.vsName || (cspName ? cspName.toUpperCase() : "");
        const boxingRingName = names.boxingRing || "";

        xmlEntries.push(
          `\t<entry label="nam_chr0_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(cspName)}</text>`);
        xmlEntries.push(`\t</entry>`);

        xmlEntries.push(
          `\t<entry label="nam_chr1_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(cspName)}</text>`);
        xmlEntries.push(`\t</entry>`);

        xmlEntries.push(
          `\t<entry label="nam_chr2_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(vsName)}</text>`);
        xmlEntries.push(`\t</entry>`);

        xmlEntries.push(
          `\t<entry label="nam_stage_name_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(boxingRingName)}</text>`);
        xmlEntries.push(`\t</entry>`);
      }

      if (xmlEntries.length === 0) {
        console.log("[updateMsgName] No custom names to write");
        return;
      }

      // Build complete XML file
      const xmlContent = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<xmsbt>",
        ...xmlEntries,
        "</xmsbt>",
      ].join("\n");

      // Ensure the directory exists
      const outputDir = `${modPath}/ui/message`;
      if (!(await window.api.modOperations.fileExists(outputDir))) {
        await window.api.modOperations.createDirectory(outputDir);
      }

      // Write the file
      await window.api.modOperations.writeModFile(
        `${modPath}/ui/message/msg_name.xmsbt`,
        xmlContent,
      );
      console.log("[updateMsgName] Successfully wrote msg_name.xmsbt");
    } catch (error) {
      console.error("[updateMsgName] Error:", error);
      throw error;
    }
  }

  static escapeXml(str) {
    if (!str) return "";

    return str
      .replace(/\\n/g, "\n") // Convert \n escape sequences to actual newlines
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  static async readExistingCustomNames(modPath, fighterName, slots) {
    const customNames = {};
    const parser = new DOMParser();

    try {
      // First, read ui_chara_db.prcxml to get the actual labelIndex for each slot
      const slotToLabelIndex = {};
      const prcxmlPath = `${modPath}/ui/param/database/ui_chara_db.prcxml`;

      if (await window.api.modOperations.fileExists(prcxmlPath)) {
        const prcxmlContent =
          await window.api.modOperations.readModFile(prcxmlPath);
        const prcxmlDoc = parser.parseFromString(prcxmlContent, "text/xml");

        // Check for parsing errors
        const parserError = prcxmlDoc.querySelector("parsererror");

        if (!parserError) {
          for (const slot of slots) {
            const slotNum = parseInt(slot.replace("c", ""));

            // Look for the nXY_index byte element (try without leading zeros first)
            let nxyIndexElement = prcxmlDoc.querySelector(
              `byte[hash="n${slotNum}_index"]`,
            );

            // If not found, try with leading zeros
            if (!nxyIndexElement) {
              nxyIndexElement = prcxmlDoc.querySelector(
                `byte[hash="n${String(slotNum).padStart(2, "0")}_index"]`,
              );
            }

            if (nxyIndexElement && nxyIndexElement.textContent) {
              slotToLabelIndex[slot] = parseInt(nxyIndexElement.textContent);
            } else {
              // Fallback to default calculation
              slotToLabelIndex[slot] = slotNum + 8;
            }
          }
        } else {
          // If there's a parser error, use default calculation for all slots
          for (const slot of slots) {
            const slotNum = parseInt(slot.replace("c", ""));
            slotToLabelIndex[slot] = slotNum + 8;
          }
        }
      } else {
        // If prcxml doesn't exist, use default calculation for all slots
        for (const slot of slots) {
          const slotNum = parseInt(slot.replace("c", ""));
          slotToLabelIndex[slot] = slotNum + 8;
        }
      }

      // Read msg_name.xmsbt if it exists
      const msgNamePath = `${modPath}/ui/message/msg_name.xmsbt`;

      if (await window.api.modOperations.fileExists(msgNamePath)) {
        const msgContent =
          await window.api.modOperations.readModFile(msgNamePath);
        const msgDoc = parser.parseFromString(msgContent, "text/xml");

        // Check for parsing errors
        const parserError = msgDoc.querySelector("parsererror");

        if (!parserError) {
          for (const slot of slots) {
            const labelIndexRaw = slotToLabelIndex[slot];
            const labelIndexPadded = String(labelIndexRaw).padStart(2, "0");
            const labelIndexUnpadded = String(labelIndexRaw);

            console.log(
              `[readExistingCustomNames] Reading names for slot ${slot} (label index ${labelIndexRaw})`,
            );

            // Query for entry elements with specific labels - try both with and without leading zeros
            let cspEntry = msgDoc.querySelector(
              `entry[label="nam_chr1_${labelIndexPadded}_${fighterName}"]`,
            );
            let vsEntry = msgDoc.querySelector(
              `entry[label="nam_chr2_${labelIndexPadded}_${fighterName}"]`,
            );
            let boxingEntry = msgDoc.querySelector(
              `entry[label="nam_stage_name_${labelIndexPadded}_${fighterName}"]`,
            );

            // If not found with padded version, try without padding
            if (!cspEntry) {
              cspEntry = msgDoc.querySelector(
                `entry[label="nam_chr1_${labelIndexUnpadded}_${fighterName}"]`,
              );
            }

            if (!vsEntry) {
              vsEntry = msgDoc.querySelector(
                `entry[label="nam_chr2_${labelIndexUnpadded}_${fighterName}"]`,
              );
            }

            if (!boxingEntry) {
              boxingEntry = msgDoc.querySelector(
                `entry[label="nam_stage_name_${labelIndexUnpadded}_${fighterName}"]`,
              );
            }

            // Convert actual newlines to \n escape sequences for editing
            const cspText = (
              cspEntry?.querySelector("text")?.textContent || ""
            ).replace(/\n/g, "\\n");
            const vsText = (
              vsEntry?.querySelector("text")?.textContent || ""
            ).replace(/\n/g, "\\n");
            const boxingText = (
              boxingEntry?.querySelector("text")?.textContent || ""
            ).replace(/\n/g, "\\n");

            if (cspText || vsText || boxingText) {
              customNames[slot] = {
                cspName: cspText,
                vsName: vsText,
                boxingRing: boxingText,
                announcer: "",
              };
            }
          }
        }
      }

      // Read announcer info from ui_chara_db.prcxml
      if (await window.api.modOperations.fileExists(prcxmlPath)) {
        const prcxmlContent =
          await window.api.modOperations.readModFile(prcxmlPath);
        const prcxmlDoc = parser.parseFromString(prcxmlContent, "text/xml");

        // Check for parsing errors
        const parserError = prcxmlDoc.querySelector("parsererror");
        if (!parserError) {
          for (const slot of slots) {
            const labelIndex = slotToLabelIndex[slot];

            // Query for hash40 element with specific hash attribute
            const announcerElement = prcxmlDoc.querySelector(
              `hash40[hash="characall_label_c${String(labelIndex).padStart(2, "0")}"]`,
            );
            const announcerText = announcerElement?.textContent || "";

            if (announcerText) {
              if (!customNames[slot]) {
                customNames[slot] = {
                  cspName: "",
                  vsName: "",
                  boxingRing: "",
                  announcer: "",
                };
              }

              customNames[slot].announcer = announcerText;
            }
          }
        }
      }
    } catch (error) {
      console.error("[readExistingCustomNames] Error:", error);
      // Return empty customNames on error
    }

    return customNames;
  }

  /**
   * Gets default custom names from messages.data file
   * @param {string} fighterNameInternal - Internal fighter name (e.g., 'mario', 'link')
   * @returns {Object} - Object with cspName, vsName, and boxingRing properties
   */
  static async getDefaultCustomNames(fighterNameInternal) {
    try {
      const appPath = await window.api.getAppPath();

      // Get the path to messages.data
      const messagesPath = `${appPath}/Files/messages.data`;

      if (!(await window.api.modOperations.fileExists(messagesPath))) {
        console.warn("messages.data file not found");
        return { cspName: "", vsName: "", boxingRing: "" };
      }

      // Read and parse the XML file
      const xmlContent =
        await window.api.modOperations.readModFile(messagesPath);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

      // Check for parsing errors
      const parserError = xmlDoc.querySelector("parsererror");

      if (parserError) {
        console.error("Error parsing messages.data XML");
        return { cspName: "", vsName: "", boxingRing: "" };
      }

      // Build label patterns
      const cspLabel = `nam_chr1_08_${fighterNameInternal}`;
      const vsLabel = `nam_chr2_08_${fighterNameInternal}`;
      const boxingRingLabel = `nam_stage_name_08_${fighterNameInternal}`;

      // Find matching entries
      const cspEntry = xmlDoc.querySelector(`entry[label="${cspLabel}"]`);
      const vsEntry = xmlDoc.querySelector(`entry[label="${vsLabel}"]`);
      const boxingRingEntry = xmlDoc.querySelector(
        `entry[label="${boxingRingLabel}"]`,
      );

      return {
        cspName: cspEntry?.querySelector("text")?.textContent || "",
        vsName: vsEntry?.querySelector("text")?.textContent || "",
        boxingRing:
          boxingRingEntry
            ?.querySelector("text")
            ?.textContent?.replace(/\n/g, " ") || "",
        announcer: "vc_narration_characall",
      };
    } catch (error) {
      console.error("Error reading messages.data:", error);
      return { cspName: "", vsName: "", boxingRing: "" };
    }
  }
}
