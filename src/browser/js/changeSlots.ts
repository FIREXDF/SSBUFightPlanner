import { PathData } from './slotScanner.js';
import { ConfigGenerator } from './configGenerator.js';

export class ChangeSlots {
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
            console.log('[changeSlots] Original path:', original);
            console.log('[changeSlots] Slot extracted:', currentSlot);

            const newSlot = slotChanges[currentSlot];
            let newNum = newSlot.replace('c', '');
            if (newNum.length === 1) newNum = '0' + newNum;

            const newPath = normalized.replace('###', newNum);

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

            const tempPath = tempPathParts.join('/');

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
          mapping.originalPath.replace(/\\/g, '/'),
          mapping.tempPath.replace(/\\/g, '/'),
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
    console.log('[changeSlots] Moving files from temporary to final paths...');

    for (const mapping of tempMappings) {
      try {
        await window.api.modOperations.renameModFile(
          modPath,
          mapping.tempPath.replace(/\\/g, '/'),
          mapping.finalPath.replace(/\\/g, '/'),
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
      (slot) => parseInt(slot.replace('c', '')) > 7,
    );

    if (
      hasAnySlotAboveC07 ||
      (slotCustomNames && Object.keys(slotCustomNames).length > 0)
    ) {
      try {
        // 1. Get the fighter folder name
        if (!fighterName) {
          console.log(
            '[changeSlots] Dossier fighter non trouvé, skip la partie Max Slots.',
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
            const parts = line.split(',').map((p) => p.trim());
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
          const pathParts = modPath.replace(/\\/g, '/').split('/');
          pathParts.pop();

          const prcxmlTemplatePath = `${appPath}/src/resources/reslot/ui_chara_db.prcxml`;

          let prcxmlContent =
            await window.api.modOperations.readModFile(prcxmlTemplatePath);

          // Build all parameters for this fighter's struct
          const structParams = [];

          // Calculate the highest slot number for color_num
          const maxSlotNum = Math.max(
            ...finalSlots.map((slot) => parseInt(slot.replace('c', ''))),
          );
          const colorNum = maxSlotNum + 1;

          // Add color_num if the highest slot is > 7
          if (maxSlotNum > 7) {
            structParams.push(`<byte hash="color_num">${colorNum}</byte>`);
          }

          for (const slot of finalSlots) {
            const slotNum = parseInt(slot.replace('c', ''));

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
                `<byte hash="n${String(slotNum).padStart(2, '0')}_index">${nxyIndex}</byte>`,
              );

              // Add custom announcer call if provided
              if (customAnnouncer) {
                structParams.push(
                  `<hash40 hash="characall_label_c${String(nxyIndex).padStart(2, '0')}">${announcer}</hash40>`,
                );
              }
            }
          }

          // Build a single struct with all parameters
          if (structParams.length > 0) {
            const structContent = `<struct index="${fighterIndex}">${structParams.join('')}</struct>`;
            const hashLine = new RegExp(
              `<hash40 index="${fighterIndex}">dummy<\\/hash40>`,
              'g',
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
        console.error('Error editing ui_chara_db.prcxml:', error);
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
      await ConfigGenerator.init();
      const jsonCreator = new ConfigGenerator(modPath, fighterName);

      await jsonCreator.generateConfig(finalSlots);
    }

    return changedPaths.length;
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

  static async updateMsgName(
    modPath,
    fighterName,
    slots,
    slotCustomNames,
    defaultCustomNames,
  ) {
    try {
      console.log('[updateMsgName] called');

      // Prepare XML content
      const xmlEntries = [];

      for (const slot of slots) {
        const slotNum = parseInt(slot.replace('c', ''));

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
        const labelIndex = String(slotNum + 8).padStart(2, '0');

        const cspName = names.cspName || '';
        const vsName = names.vsName || (cspName ? cspName.toUpperCase() : '');
        const boxingRingName = names.boxingRing || '';

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
        console.log('[updateMsgName] No custom names to write');
        return;
      }

      // Build complete XML file
      const xmlContent = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<xmsbt>',
        ...xmlEntries,
        '</xmsbt>',
      ].join('\n');

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
      console.log('[updateMsgName] Successfully wrote msg_name.xmsbt');
    } catch (error) {
      console.error('[updateMsgName] Error:', error);
      throw error;
    }
  }

  static escapeXml(str) {
    if (!str) return '';

    return str
      .replace(/\\n/g, '\n') // Convert \n escape sequences to actual newlines
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
        const prcxmlContent =
          await window.api.modOperations.readModFile(prcxmlPath);
        const prcxmlDoc = parser.parseFromString(prcxmlContent, 'text/xml');

        // Check for parsing errors
        const parserError = prcxmlDoc.querySelector('parsererror');

        if (!parserError) {
          for (const slot of slots) {
            const slotNum = parseInt(slot.replace('c', ''));

            // Look for the nXY_index byte element (try without leading zeros first)
            let nxyIndexElement = prcxmlDoc.querySelector(
              `byte[hash="n${slotNum}_index"]`,
            );

            // If not found, try with leading zeros
            if (!nxyIndexElement) {
              nxyIndexElement = prcxmlDoc.querySelector(
                `byte[hash="n${String(slotNum).padStart(2, '0')}_index"]`,
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
            const slotNum = parseInt(slot.replace('c', ''));
            slotToLabelIndex[slot] = slotNum + 8;
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
        const msgContent =
          await window.api.modOperations.readModFile(msgNamePath);

        const msgDoc = parser.parseFromString(msgContent, 'text/xml');

        // Check for parsing errors
        const parserError = msgDoc.querySelector('parsererror');

        if (!parserError) {
          for (const slot of slots) {
            const labelIndexRaw = slotToLabelIndex[slot];
            const labelIndexPadded = String(labelIndexRaw).padStart(2, '0');
            const labelIndexUnpadded = String(labelIndexRaw);

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
              cspEntry?.querySelector('text')?.textContent || ''
            ).replace(/\n/g, '\\n');
            const vsText = (
              vsEntry?.querySelector('text')?.textContent || ''
            ).replace(/\n/g, '\\n');
            const boxingText = (
              boxingEntry?.querySelector('text')?.textContent || ''
            ).replace(/\n/g, '\\n');

            if (cspText || vsText || boxingText) {
              customNames[slot] = {
                cspName: cspText,
                vsName: vsText,
                boxingRing: boxingText,
                announcer: '',
              };
            }
          }
        }
      }

      // Read announcer info from ui_chara_db.prcxml
      if (await window.api.modOperations.fileExists(prcxmlPath)) {
        const prcxmlContent =
          await window.api.modOperations.readModFile(prcxmlPath);
        const prcxmlDoc = parser.parseFromString(prcxmlContent, 'text/xml');

        // Check for parsing errors
        const parserError = prcxmlDoc.querySelector('parsererror');
        if (!parserError) {
          for (const slot of slots) {
            const labelIndex = slotToLabelIndex[slot];

            // Query for hash40 element with specific hash attribute
            const announcerElement = prcxmlDoc.querySelector(
              `hash40[hash="characall_label_c${String(labelIndex).padStart(2, '0')}"]`,
            );
            const announcerText = announcerElement?.textContent || '';

            if (announcerText) {
              if (!customNames[slot]) {
                customNames[slot] = {
                  cspName: '',
                  vsName: '',
                  boxingRing: '',
                  announcer: '',
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
   * @returns {Object} - Object with cspName, vsName, and boxingRing properties
   */
  static async getDefaultCustomNames(fighterNameInternal) {
    try {
      const appPath = await window.api.getAppPath();

      // Get the path to messages.data
      const messagesPath = `${appPath}/Files/messages.data`;

      if (!(await window.api.modOperations.fileExists(messagesPath))) {
        console.warn('messages.data file not found');
        return { cspName: '', vsName: '', boxingRing: '' };
      }

      // Read and parse the XML file
      const xmlContent =
        await window.api.modOperations.readModFile(messagesPath);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      // Check for parsing errors
      const parserError = xmlDoc.querySelector('parsererror');

      if (parserError) {
        console.error('Error parsing messages.data XML');
        return { cspName: '', vsName: '', boxingRing: '' };
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
        cspName: cspEntry?.querySelector('text')?.textContent || '',
        vsName: vsEntry?.querySelector('text')?.textContent || '',
        boxingRing:
          boxingRingEntry
            ?.querySelector('text')
            ?.textContent?.replace(/\n/g, ' ') || '',
        announcer: 'vc_narration_characall',
      };
    } catch (error) {
      console.error('Error reading messages.data:', error);
      return { cspName: '', vsName: '', boxingRing: '' };
    }
  }
}
