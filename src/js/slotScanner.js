export const SlotScanner = {
    async scanForSlots(modPath) {
        try {
            const files = await window.api.modOperations.getModFiles(modPath);

            const pathData = {};
            const slots = new Set();

            files.forEach(fileOrDirectory => {
                function _createPathDataEntry(fighterName, slot) {
                    if (!pathData[fighterName]) {
                        pathData[fighterName] = {};
                    }

                    if (!pathData[fighterName][slot]) {
                        pathData[fighterName][slot] = {
                            pathsToBeModified: [],
                            filesToBeModified: [],
                        };
                    }
                }

                const {
                    slot,
                    fighterName,
                    normalizedPath,
                    isFighterSlotFolder,
                    includesFighterSlotFolder,
                } = this.extractFighterAndSlotInfo(fileOrDirectory);

                if (fighterName && slot) {
                    slots.add(slot);

                    _createPathDataEntry(fighterName, slot);

                    if (fileOrDirectory.includes('.')) {
                        pathData[fighterName][slot].filesToBeModified.push({
                            original: fileOrDirectory,
                            normalized: normalizedPath,
                        });
                    }

                    // Do not add any subfolders or files within a fighter slot folder to pathsToBeModified, only
                    // the fighter slot folder itself
                    if (includesFighterSlotFolder && !isFighterSlotFolder) {
                        return;
                    }

                    pathData[fighterName][slot].pathsToBeModified.push({
                        original: fileOrDirectory,
                        normalized: normalizedPath,
                    });
                }
            });

            const currentSlots = Array.from(slots).sort((a, b) => {
                const numA = parseInt(a.replace('c', ''));
                const numB = parseInt(b.replace('c', ''));

                return numA - numB;
            });

            return {
                pathData,
                currentSlots,
            };
        } catch (error) {
            console.error('Error scanning for slots:', error);
            throw error;
        }
    },

    /**
     * FILL_ME_IN
     *
     * @param filePath {string}
     * @returns {{slot: string | null, fighterName: string | null, normalizedPath: string | null, isFighterSlotFolder: boolean, includesFighterSlotFolder: boolean}}
     */
    extractFighterAndSlotInfo(filePath) {
        let fighterName = null;
        let isFighterSlotFolder = false;
        let includesFighterSlotFolder = false;

        const pathParts = filePath.split(/[/\\]/);
        const fighterIndex = pathParts.indexOf('fighter');
        const includesFighterFolder = fighterIndex !== -1;

        if (includesFighterFolder && pathParts.length > fighterIndex + 1) {
            const slotFolderPart = pathParts[fighterIndex + 1];

            includesFighterSlotFolder = /^c\d{2,3}$/i.test(slotFolderPart);
            isFighterSlotFolder = includesFighterSlotFolder && pathParts.length === fighterIndex + 2;

            if (isFighterSlotFolder && pathParts.length > fighterIndex + 1) {
                fighterName = pathParts[fighterIndex + 1];
            }
        }

        // Match cXX or cXXX in filename
        const cXXMatchRegex = /(c)(\d{2,3})/i;
        // Match XX or XXX before file extension
        const dotXXMatchRegex = /_([^_]+)_(c)?(\d{2,3})(\.[^.]+)$/i;

        const cMatch = filePath.match(cXXMatchRegex);
        const dotMatch = filePath.match(dotXXMatchRegex);

        if (!fighterName && dotMatch) {
            fighterName = dotMatch[1];
        }

        const slot = cMatch
            ? cMatch[0].toLowerCase()
            : (dotMatch ? 'c' + dotMatch[3] : null);

        const normalizedPath = cMatch
            ? filePath.replace(cXXMatchRegex, '$1###')
            : (dotMatch
                ? filePath.replace(dotXXMatchRegex, `_$1_${dotMatch[2] || ''}###$4`)
                : null);
        
        return {
            slot,
            fighterName,
            normalizedPath,
            isFighterSlotFolder,
            includesFighterSlotFolder,
        };
    }

}