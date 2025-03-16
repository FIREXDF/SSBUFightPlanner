const axios = require('axios');
const fs = require('fs');
const fse = require('fs-extra');  // Add this import
const path = require('path');
const child_process = require('child_process');
const Store = require('electron-store');
const store = new Store();

class GameBananaDownloader {
  constructor(modsPath, loadingCallbacks = {}) {
    this.modsPath = modsPath;
    // Add loading callback handlers
    this.loadingCallbacks = {
      onStart: loadingCallbacks.onStart || (() => {}),
      onProgress: loadingCallbacks.onProgress || (() => {}),
      onFinish: loadingCallbacks.onFinish || (() => {}),
      onError: loadingCallbacks.onError || (() => {})
    };
    this.isCancelled = false;
    this.tempFolder = null;
    this.currentWriter = null;
    this.isCleaningUp = false;
    this.isPaused = false;
    this.lastDownloadedBytes = 0;
    this.downloadedChunks = new Map(); // Store downloaded chunks
  }

  async cancel() {
    try {
      this.isCancelled = true;
      
      // Close current write stream if exists
      if (this.currentWriter) {
        this.currentWriter.end();
      }
      
      this.isCleaningUp = true;
      if (this.tempFolder && fs.existsSync(this.tempFolder)) {
        await fse.remove(this.tempFolder);
        console.log('Cleaned up temporary files after cancellation');
      }
      this.isCleaningUp = false;

    } catch (error) {
      console.error('Error during download cancellation:', error);
      throw error;
    }
  }

  static extractModAndFileId(downloadLink) {
    const patterns = [
      /https:\/\/gamebanana\.com\/dl\/(\d+)(?:#FileInfo_(\d+))?/,
      /https:\/\/gamebanana\.com\/mods\/download\/(\d+)(?:#FileInfo_(\d+))?/,
      /https:\/\/gamebanana\.com\/sounds\/download\/(\d+)(?:#FileInfo_(\d+))?/,
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
    let modName; // Declare modName at the top so it's available in catch block
    this.tempFolder = path.join(this.modsPath, `temp_${Date.now()}`);
    
    try {
      this.isCancelled = false;

      const [modId, fileId] = GameBananaDownloader.extractModAndFileId(downloadLink);
      modName = await this.getModNameFromApi(modId); // Assign to outer variable
      
      this.loadingCallbacks.onStart('Starting download...', modName);

      // If cancelled early, handle it
      if (this.isCancelled) {
        this.loadingCallbacks.onFinish('Download cancelled', modName);
        return { cancelled: true, modName };
      }

      this.loadingCallbacks.onProgress('Getting mod information...');
      
      const filename = await this.getFilenameFromApi(modId, fileId);
      this.loadingCallbacks.onProgress('Downloading mod files...');

      const downloadUrl = `https://gamebanana.com/dl/${fileId || modId}`;
      
      // Create a temporary folder for extraction
      fs.mkdirSync(this.tempFolder, { recursive: true });
      
      // Download to temp folder
      const tempArchivePath = path.join(this.tempFolder, filename);
      await this.downloadFileWithProgress(downloadUrl, tempArchivePath);
  
      this.loadingCallbacks.onProgress('Extracting files...');
      // Extract to temp folder
      await this.extractFile(tempArchivePath, this.tempFolder);
  
      // Clean up archive files right after extraction
      const archiveFiles = fs.readdirSync(this.tempFolder)
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ['.7z', '.rar', '.zip'].includes(ext);
        });
        this.loadingCallbacks.onProgress('Cleaning temporary files...');
      // Remove all archive files
      for (const file of archiveFiles) {
        fs.unlinkSync(path.join(this.tempFolder, file));
        console.log(`Removed archive file: ${file}`);
      }

      // Find the extracted content
      let extractedContents = fs.readdirSync(this.tempFolder)
        .filter(f => f !== filename && fs.statSync(path.join(this.tempFolder, f)).isDirectory());
  
      console.log('Extracted folders:', extractedContents);
  
      if (extractedContents.length === 0) {
        console.error('Extraction error: No folder found after extraction. Try to install it manually.');
        console.error('Contents of temp folder:', fs.readdirSync(this.tempFolder));
        throw new Error('No folder found after extraction');
      }
  
      // Check if required folders and files are in the root
      const requiredFolders = [
        "append", "assist", "boss", "camera", "campaign", "common", "effect", "enemy", 
        "fighter", "finalsmash", "item", "miihat", "param", "pokemon", "prebuilt;", 
        "render", "snapshot", "sound", "spirits", "stage", "standard", "stream;", "ui"
      ];
      const requiredFiles = [
        "preview.webp",
        "config.json",
        "info.toml",
        "victory.toml",
        "Preview.webp"
      ];
      const missingFolders = requiredFolders.filter(folder => !extractedContents.includes(folder));
      const existingFiles = fs.readdirSync(this.tempFolder).filter(f => !fs.statSync(path.join(this.tempFolder, f)).isDirectory());
      const missingFiles = requiredFiles.filter(file => !existingFiles.includes(file));
      
      if (missingFolders.length > 0 || missingFiles.length > 0) {
        console.log('Missing folders in root:', missingFolders);
        console.log('Missing files in root:', missingFiles);
        
        // Recursively scan subfolders
        const findAndMoveItems = (currentPath) => {
          const items = fs.readdirSync(currentPath);
          
          for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const isDirectory = fs.statSync(fullPath).isDirectory();
            
            if (isDirectory) {
              // Handle folders
              if (missingFolders.includes(item)) {
                const destinationPath = path.join(this.tempFolder, item);
                if (!fs.existsSync(destinationPath)) {
                  fs.renameSync(fullPath, destinationPath);
                  extractedContents.push(item);
                  console.log(`Moved folder ${item} to root`);
                }
              } else {
                // If not a required folder, scan its contents
                findAndMoveItems(fullPath);
              }
            } else {
              // Handle files
              if (missingFiles.includes(item)) {
                const destinationPath = path.join(this.tempFolder, item);
                if (!fs.existsSync(destinationPath)) {
                  fs.renameSync(fullPath, destinationPath);
                  console.log(`Moved file ${item} to root`);
                }
              } else if (item.toLowerCase().endsWith('.nro')) {
                // Move .nro files to temp root
                const destinationPath = path.join(this.tempFolder, item);
                if (!fs.existsSync(destinationPath)) {
                  fs.renameSync(fullPath, destinationPath);
                  console.log(`Moved .nro file ${item} to root`);
                }
              }
            }
          }
        };

        // Start recursive scan from each root folder
        for (const folder of extractedContents) {
          const subFolderPath = path.join(this.tempFolder, folder);
          findAndMoveItems(subFolderPath);
        }
      }
  
      // Get mod info, author, category and version before any file operations
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;
      const response = await axios.get(apiUrl);
      const modProfileUrl = response.data._sProfileUrl;
      const modAuthor = await this.getModAuthorFromApi(modId);
      const modCategory = await this.getModCategoryFromApi(modId);
      const modVersion = await this.getModVersionFromApi(modId);

      // Handle info.toml and preview.webp while in temp folder
      const tempInfoPath = path.join(this.tempFolder, 'info.toml');
      const tempPreviewPath = path.join(this.tempFolder, 'preview.webp');

      // Handle preview.webp download if needed
      if (!fs.existsSync(tempPreviewPath)) {
        await this.downloadImage(modId, this.tempFolder);
      }

      // Handle info.toml url, author, category and version addition
      if (fs.existsSync(tempInfoPath)) {
        let existingContent = fs.readFileSync(tempInfoPath, 'utf-8');
        if (!existingContent.includes('url =')) {
          existingContent += `\nurl = "${modProfileUrl}"\n`;
        }
        if (!existingContent.includes('authors =')) {
          existingContent += `authors = "${modAuthor}"\n`;
        }
        if (!existingContent.includes('category =')) {
          existingContent += `category = "${modCategory}"\n`;
        }
        if (!existingContent.includes('version =')) {
          existingContent += `version = "${modVersion}"\n`;
        }
        fs.writeFileSync(tempInfoPath, existingContent);
        console.log('Updated existing info.toml with URL, author, category and version');
      } else {
        const content = `url = "${modProfileUrl}"\nauthors = "${modAuthor}"\ncategory = "${modCategory}"\nversion = "${modVersion}"\n`;
        fs.writeFileSync(tempInfoPath, content);
        console.log('Created new info.toml with URL, author, category and version');
      }

      // Check for cancellation before finalizing
      if (this.isCancelled) {
        await this.cleanup();
        this.loadingCallbacks.onFinish('Download cancelled', modName);
        return { cancelled: true, modName };
      }

      // Success case - move files to final destination
      const finalArchivePath = path.join(this.modsPath, modName);
      fs.mkdirSync(finalArchivePath, { recursive: true });
  
      // Move all extracted folders to final destination
      for (const folder of extractedContents) {
        const extractedPath = path.join(this.tempFolder, folder);
        const finalPath = path.join(finalArchivePath, folder);
  
        if (fs.existsSync(finalPath)) {
          fs.rmSync(finalPath, { recursive: true });
        }
        fs.renameSync(extractedPath, finalPath);
      }

      // Move remaining files
      const remainingFiles = fs.readdirSync(this.tempFolder)
        .filter(f => !fs.statSync(path.join(this.tempFolder, f)).isDirectory());
      
      for (const file of remainingFiles) {
        const sourcePath = path.join(this.tempFolder, file);
        const destPath = path.join(finalArchivePath, file);
        fs.renameSync(sourcePath, destPath);
      }

      // Check and remove empty folders
      await this.removeEmptyFolders(finalArchivePath);
      
      // Verify the final folder isn't empty
      const finalContents = fs.readdirSync(finalArchivePath);
      if (finalContents.length === 0) {
        fs.rmSync(finalArchivePath, { recursive: true });
        throw new Error('Installation failed: Mod folder was empty after processing');
      }
  
      // Clean up temp folder - Add timeout and proper status updates
      this.loadingCallbacks.onProgress('Cleaning temporary files...', 95);
      await new Promise((resolve) => {
          setTimeout(async () => {
              await fse.remove(this.tempFolder);
              this.loadingCallbacks.onProgress('Finalizing...', 100);
              resolve();
          }, 500);
      });

      // Notify completion properly
      this.loadingCallbacks.onFinish('Download completed successfully', modName);
      
      return { success: true, path: finalArchivePath, modName };
    } catch (error) {
      if (this.isCancelled && !this.isCleaningUp) {
        await this.cleanup();
        // Now modName is available here
        this.loadingCallbacks.onFinish('Download cancelled', modName || 'Unknown Mod');
        return { cancelled: true, modName: modName || 'Unknown Mod' };
      }
      this.loadingCallbacks.onError(`Download failed: ${error.message}`);
      console.error('Mod download error:', error);
      throw error;
    } finally {
      if (this.tempFolder) {
        try {
          if (fs.existsSync(this.tempFolder)) {
            await fse.remove(this.tempFolder);
            console.log('Cleaned up temporary folder in finally block');
          }
        } catch (cleanupError) {
          console.error('Error during cleanup:', cleanupError);
        }
      }
    }
  }

async downloadFile(url, destPath, retries = 3, retryDelay = 500) {
  console.log(`Downloading from: ${url}`);
  console.log(`Saving to: ${destPath}`);

  let attempt = 0;
  while (attempt <= retries) {
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
      });
    } catch (error) {
      attempt++;
      console.error(`Download error (attempt ${attempt}/${retries}): ${error.message}`);
      if (attempt <= retries) {
        console.log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw error;
      }
    }
  }
}

async downloadFileWithProgress(url, destPath) {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    headers: this.downloadedChunks.size > 0 ? {
      Range: `bytes=${this.lastDownloadedBytes}-`
    } : {}
  });

  const totalLength = response.headers['content-length'];
  let downloadedLength = this.lastDownloadedBytes;

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath, {
      flags: this.downloadedChunks.size > 0 ? 'a' : 'w'
    });
    this.currentWriter = writer;

    response.data.on('data', (chunk) => {
      if (this.isCancelled) {
        response.data.destroy();
        writer.end();
        reject(new Error('Download cancelled'));
        return;
      }

      if (this.isPaused) {
        response.data.pause();
        this.lastDownloadedBytes = downloadedLength;
        this.downloadedChunks.set(downloadedLength, chunk);
        return;
      }

      downloadedLength += chunk.length;
      const progress = Math.round((downloadedLength / totalLength) * 100);
      this.loadingCallbacks.onProgress('Downloading...', progress);
    });

    response.data.pipe(writer);

    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

  async downloadImage(modId, modFolder) {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;
      const response = await axios.get(apiUrl);

      const imageData = response.data._aPreviewMedia?._aImages || [];
      if (imageData.length > 0) {
        const imageFile = imageData[0]._sFile;
        if (imageFile) {
          const imageUrl = `https://images.gamebanana.com/img/ss/mods/${imageFile}`;
          const tempImageDestPath = path.join(modFolder, imageFile);
          
          console.log(`Downloading image from: ${imageUrl}`);
          const imgResponse = await axios({
            method: 'get',
            url: imageUrl,
            responseType: 'stream'
          });

          const writer = fs.createWriteStream(tempImageDestPath);
          imgResponse.data.pipe(writer);

          return new Promise((resolve, reject) => {
            writer.on('finish', () => {
              writer.close();
              
              // Move and rename the image to preview.webp in the mod folder
              const finalImageDestPath = path.join(modFolder, 'preview.webp');
              fs.renameSync(tempImageDestPath, finalImageDestPath);
              
              console.log(`Image downloaded and moved as preview.webp`);
              resolve();
            });

            writer.on('error', reject);
          });
        } else {
          console.log('No image found for the mod.');
        }
      }
    } catch (error) {
      console.error('Image download error:', error);
    }
  }

  async extractFile(filePath, extractTo) {
    // Determine file type
    const fileExt = path.extname(filePath).toLowerCase();

    try {
      switch (fileExt) {
        case '.zip':
          await this.extractZip(filePath, extractTo);
          break;
        case '.rar':
          await this.extractRar(filePath, extractTo);
          break;
        default:
          await this.extractGeneric(filePath, extractTo);
          break;
      }

      // Verify extraction
      const extractedContents = fs.readdirSync(extractTo)
        .filter(f => fs.statSync(path.join(extractTo, f)).isDirectory());

      if (extractedContents.length === 0) {
        throw new Error('Extraction error: No folder found after extraction');
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

  async extractRar(filePath, extractTo) {
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

  async cleanup() {
    if (this.tempFolder && fs.existsSync(this.tempFolder)) {
      try {
        await fse.remove(this.tempFolder);
        console.log('Cleaned up temporary folder');
      } catch (error) {
        console.error('Error cleaning up:', error);
      }
    }
  }
  // Add this new method to check and remove empty folders
  async removeEmptyFolders(folderPath) {
    const items = fs.readdirSync(folderPath);
    
    for (const item of items) {
      const fullPath = path.join(folderPath, item);
      if (fs.statSync(fullPath).isDirectory()) {
        // Recursively check subfolders
        await this.removeEmptyFolders(fullPath);
        
        // After checking subfolders, see if this folder is now empty
        const remaining = fs.readdirSync(fullPath);
        if (remaining.length === 0) {
          fs.rmdirSync(fullPath);
          console.log(`Removed empty folder: ${fullPath}`);
        }
      }
    }
  }

  // Add this new method to fetch the mod name from GameBanana
  async getModNameFromApi(modId) {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=_sName`;
      const response = await axios.get(apiUrl);
      return response.data._sName || `mod_${modId}`;
    } catch (error) {
      }
      console.error('Mod name retrieval error:', error);
      return `mod_${modId}`;
    }
    
  // Add this new method to fetch the mod author from GameBanana
  async getModAuthorFromApi(modId) {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;
      const response = await axios.get(apiUrl);
      return response.data._aSubmitter?._sName || 'Unknown Author';
    } catch (error) {
      console.error('Author retrieval error:', error);
      return 'Unknown Author';
    }
  }

  // Add this new method to fetch the mod category from GameBanana
  async getModCategoryFromApi(modId) {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;
      const response = await axios.get(apiUrl);
      const category = response.data._aSuperCategory?._sName || 'Unknown Category';
      
      // Convert "Skins" to "Fighter"
      return category === 'Skins' ? 'Fighter' : category;
    } catch (error) {
      console.error('Category retrieval error:', error);
      return 'Unknown Category';
    }
  }

  // Add this new method to fetch the mod version from GameBanana
  async getModVersionFromApi(modId) {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;
      const response = await axios.get(apiUrl);
      const version = response.data._aAdditionalInfo?._sVersion || '';
      
      // Si la version est vide ou ne contient pas de chiffres, retourner "1.0"
      if (!version || !/\d/.test(version)) {
        return "1.0";
      }
      
      return version;
    } catch (error) {
      console.error('Version retrieval error:', error);
      return "1.0";
    }
  }

  async pause() {
    this.isPaused = true;
    if (this.currentWriter) {
      this.currentWriter.cork();
    }
  }
  async resume() {
    this.isPaused = false;
    if (this.currentWriter) {
      this.currentWriter.uncork();
      // Resume from last downloaded chunk
      for (const [offset, chunk] of this.downloadedChunks) {
        this.currentWriter.write(chunk);
      }
      this.downloadedChunks.clear();
    }
  }
}
module.exports = GameBananaDownloader;