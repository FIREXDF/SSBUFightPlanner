const axios = require('axios');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

class GameBananaDownloader {
    constructor(modsPath) {
        this.modsPath = modsPath;
    }

    static extractModAndFileId(downloadLink) {
        const patterns = [
            /https:\/\/gamebanana\.com\/dl\/(\d+)(?:#FileInfo_(\d+))?/,
            /https:\/\/gamebanana\.com\/mods\/download\/(\d+)(?:#FileInfo_(\d+))?/,
            /https:\/\/gamebanana\.com\/mods\/(\d+)/
        ];

        for (const pattern of patterns) {
            const match = downloadLink.match(pattern);
            if (match) {
                return [match[1], match[2] || ''];
            }
        }
        
        throw new Error('Invalid download link');
    }

    async downloadMod(downloadLink) {
        try {
            // Extract mod and file IDs
            const [modId, fileId] = GameBananaDownloader.extractModAndFileId(downloadLink);
            
            // Get filename from API
            const filename = await this.getFilenameFromApi(modId, fileId);
            
            // Construct download URL
            const downloadUrl = `https://gamebanana.com/dl/${fileId || modId}`;
            
            // Download file path
            const destPath = path.join(this.modsPath, filename);
            
            // Download the file
            await this.downloadFile(downloadUrl, destPath);
            
            // Extract the file
            await this.extractFile(destPath, this.modsPath);
            
            // Remove the original archive
            fs.unlinkSync(destPath);
            
            return this.modsPath;
        } catch (error) {
            console.error('Mod download error:', error);
            throw error;
        }
    }

    async downloadFile(url, destPath) {
        console.log(`Downloading from: ${url}`);
        console.log(`Saving to: ${destPath}`);

        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            const writer = fs.createWriteStream(destPath);
            
            return new Promise((resolve, reject) => {
                response.data.pipe(writer);
                
                writer.on('finish', () => {
                    writer.close();
                    
                    // Verify file size
                    const stats = fs.statSync(destPath);
                    if (stats.size === 0) {
                        reject(new Error('Downloaded file is empty'));
                    }
                    
                    resolve(destPath);
                });
                
                writer.on('error', reject);
                response.data.on('error', reject);
            });
        } catch (error) {
            console.error('Download failed:', error);
            throw error;
        }
    }

    async extractFile(filePath, extractTo) {
        // Determine file type
        const fileExt = path.extname(filePath).toLowerCase();

        try {
            switch (fileExt) {
                case '.zip':
                    return this.extractZip(filePath, extractTo);
                case '.rar':
                    return this.extractRar(filePath, extractTo);
                default:
                    return this.extractGeneric(filePath, extractTo);
            }
        } catch (error) {
            console.error(`Extraction failed for ${filePath}:`, error);
            throw error;
        }
    }

    async extractZip(filePath, extractTo) {
        return new Promise((resolve, reject) => {
            try {
                child_process.exec(
                    `powershell Expand-Archive -Path "${filePath}" -DestinationPath "${extractTo}" -Force`,
                    (error, stdout, stderr) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async extractRar(filePath, extractTo) {
        return new Promise((resolve, reject) => {
            try {
                // Attempt to use WinRAR if installed
                child_process.exec(
                    `"C:\\Program Files\\WinRAR\\WinRAR.exe" x -y "${filePath}" "${extractTo}"`,
                    (error, stdout, stderr) => {
                        if (error) {
                            // Fallback to system extraction
                            this.extractGeneric(filePath, extractTo)
                                .then(resolve)
                                .catch(reject);
                        } else {
                            resolve();
                        }
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async extractGeneric(filePath, extractTo) {
        return new Promise((resolve, reject) => {
            try {
                child_process.exec(
                    `tar -xf "${filePath}" -C "${extractTo}"`,
                    (error, stdout, stderr) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async getFilenameFromApi(modId, fileId) {
        try {
            const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}/DownloadPage`;
            const response = await axios.get(apiUrl);
            
            const files = response.data._aFiles;
            const fileInfo = fileId 
                ? files.find(file => String(file._idRow) === String(fileId))
                : files[0];
            
            if (!fileInfo) {
                throw new Error('Filename not found');
            }
            
            // Sanitize filename and ensure correct extension
            let filename = this.sanitizeFilename(fileInfo._sFile || `mod_${modId}.zip`);
            
            // Ensure correct extension
            const ext = path.extname(filename);
            if (!ext) {
                filename += '.zip';
            }
            
            return filename;
        } catch (error) {
            console.error('Filename retrieval error:', error);
            // Fallback filename
            return `mod_${modId}.zip`;
        }
    }

    sanitizeFilename(filename) {
        return filename
            .replace(/[/\\?%*:|"<>]/g, '_')
            .trim();
    }
}

module.exports = GameBananaDownloader;