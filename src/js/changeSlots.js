export class ChangeSlots {
    static async scanForSlots(modPath) {
        try {
            const files = await window.api.modOperations.getModFiles(modPath);
            
            const slotFiles = files.filter(file => {
                const pathParts = file.split(/[/\\]/);
                const fileName = pathParts[pathParts.length - 1];
                
                // Check if this is a c0X folder itself
                const isc0XFolder = /^c0\d$/.test(fileName);
                if (isc0XFolder) return true;

                // Check if file is inside a c0X folder
                const isInC0XFolder = pathParts.slice(0, -1).some(part => /^c0\d$/.test(part));
                if (isInC0XFolder) return false;

                // Check for 0X pattern in filename
                return /0\d/.test(fileName);
            });

            // Extract slots from filenames
            const slots = new Set();
            slotFiles.forEach(file => {
                const pathParts = file.split(/[/\\]/);
                const part = pathParts[pathParts.length - 1];
                
                if (/^c0\d$/.test(part)) {
                    slots.add(part); // Add full c0X for folders
                } else {
                    const match = part.match(/0\d/);
                    if (match) {
                        slots.add('c' + match[0]); // Store as c0X internally
                    }
                }
            });

            // Sort slots numerically (c00, c01, c02, etc.)
            const sortedSlots = Array.from(slots).sort((a, b) => {
                const numA = parseInt(a.replace('c0', ''));
                const numB = parseInt(b.replace('c0', ''));
                return numA - numB;
            });

            return {
                currentSlots: sortedSlots,
                affectedFiles: slotFiles
            };
        } catch (error) {
            console.error('Error scanning for slots:', error);
            throw error;
        }
    }

    static async changeSlots(modPath, slotChanges, files) {
        const changedFiles = [];
        
        // First, handle config.json if it exists
        try {
            const configPath = `${modPath}/config.json`;
            const configContent = await window.api.modOperations.getModFiles(configPath);
            
            if (configContent) {
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
                await window.api.modOperations.writeModFile(
                    configPath,
                    updatedConfigContent
                );
            }
        } catch (error) {
            console.error('Error updating config.json:', error);
        }

        // Then handle regular files
        for (const file of files) {
            const currentSlot = this.extractSlot(file);
            if (slotChanges[currentSlot]) {
                const newSlot = slotChanges[currentSlot];
                const newFilePath = file.replace(
                    /0\d|c0\d/g, 
                    match => match.startsWith('c') ? newSlot : newSlot.replace('c', '')
                );
                console.log(`Renaming file from ${file} to ${newFilePath}`);
                await window.api.modOperations.renameModFile(modPath, file, newFilePath);
                changedFiles.push(newFilePath);
            }
        }
        
        return changedFiles.length;
    }

    static async removeSlot(modPath, slot, files) {
        let deletedFiles = 0;
        for (const file of files) {
            if (file.includes(slot)) {
                await window.api.modOperations.deleteModFile(modPath, file);
                deletedFiles++;
            }
        }
        return deletedFiles;
    }

    static extractSlot(filePath) {
        const c0XMatch = filePath.match(/^c0\d$/);
        if (c0XMatch) {
            return c0XMatch[0]; // Return full c0X for folders
        }

        const zeroXMatch = filePath.match(/0\d/);
        if (zeroXMatch) {
            return 'c' + zeroXMatch[0]; // Store as c0X internally
        }

        return null;
    }
}
