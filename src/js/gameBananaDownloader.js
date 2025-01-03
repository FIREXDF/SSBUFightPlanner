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
      const [modId, fileId] = GameBananaDownloader.extractModAndFileId(downloadLink);
      const filename = await this.getFilenameFromApi(modId, fileId);
      const downloadUrl = `https://gamebanana.com/dl/${fileId || modId}`;
      
      // Create a temporary folder for extraction
      const tempFolder = path.join(this.modsPath, `temp_${Date.now()}`);
      fs.mkdirSync(tempFolder, { recursive: true });
      
      // Download to temp folder
      const tempArchivePath = path.join(tempFolder, filename);
      await this.downloadFile(downloadUrl, tempArchivePath);
  
      // Extract to temp folder
      await this.extractFile(tempArchivePath, tempFolder);
  
      // Find the extracted content
      const extractedContents = fs.readdirSync(tempFolder)
        .filter(f => f !== filename && fs.statSync(path.join(tempFolder, f)).isDirectory())
        [0];
  
      if (!extractedContents) {
        throw new Error('No content found after extraction');
      }
  
      const extractedPath = path.join(tempFolder, extractedContents);
      const finalPath = path.join(this.modsPath, extractedContents);
  
      // Move to final location
      if (fs.existsSync(finalPath)) {
        fs.rmSync(finalPath, { recursive: true });
      }
      fs.renameSync(extractedPath, finalPath);
  
      // Clean up temp folder
      fs.rmSync(tempFolder, { recursive: true });
  
      // Get mod info and update toml
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;
      const response = await axios.get(apiUrl);
      const modProfileUrl = response.data._sProfileUrl;
  
      // Update info.toml in the final location
      const infoPath = path.join(finalPath, 'info.toml');
      if (fs.existsSync(infoPath)) {
        const existingContent = fs.readFileSync(infoPath, 'utf-8');
        const updatedContent = `${existingContent}\nurl = "${modProfileUrl}"\n`;
        fs.writeFileSync(infoPath, updatedContent);
      } else {
        fs.writeFileSync(infoPath, `url = "${modProfileUrl}"\n`);
      }
  
      // Handle preview image
      const previewPath = path.join(finalPath, 'preview.webp');
      if (!fs.existsSync(previewPath)) {
        await this.downloadImage(modId, finalPath);
      }
  
      return finalPath;
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
              // Get the first folder in the extracted directory
              const extractedFolders = fs.readdirSync(extractTo)
                .filter(f => fs.statSync(path.join(extractTo, f)).isDirectory())
                .sort((a, b) => fs.statSync(path.join(extractTo, b)).mtimeMs - fs.statSync(path.join(extractTo, a)).mtimeMs);
              
              if (extractedFolders.length > 0) {
                resolve(extractedFolders[0]);
              } else {
                reject(new Error('No folder found after extraction'));
              }
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
              // Get the first folder in the extracted directory
              const extractedFolders = fs.readdirSync(extractTo)
                .filter(f => fs.statSync(path.join(extractTo, f)).isDirectory())
                .sort((a, b) => fs.statSync(path.join(extractTo, b)).mtimeMs - fs.statSync(path.join(extractTo, a)).mtimeMs);
              
              if (extractedFolders.length > 0) {
                resolve(extractedFolders[0]);
              } else {
                reject(new Error('No folder found after extraction'));
              }
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
              // Get the first folder in the extracted directory
              const extractedFolders = fs.readdirSync(extractTo)
                .filter(f => fs.statSync(path.join(extractTo, f)).isDirectory());
              
              if (extractedFolders.length > 0) {
                resolve(extractedFolders[0]);
              } else {
                reject(new Error('No folder found after extraction'));
              }
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

  findMostRecentFolder(parentDir, timestamp) {
    try {
      const items = fs.readdirSync(parentDir);
      let mostRecent = null;
      let mostRecentTime = timestamp;
  
      console.log(`Searching for folders newer than ${new Date(timestamp)} in ${parentDir}`);
      
      for (const item of items) {
        const fullPath = path.join(parentDir, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            console.log(`Found directory ${item} created at ${new Date(stats.birthtimeMs)}`);
            if (stats.birthtimeMs > timestamp && stats.birthtimeMs > mostRecentTime) {
              mostRecent = fullPath;
              mostRecentTime = stats.birthtimeMs;
            }
          }
        } catch (err) {
          console.error(`Error checking directory ${item}:`, err);
        }
      }
  
      console.log(`Most recent folder found: ${mostRecent}`);
      return mostRecent;
    } catch (error) {
      console.error('Error in findMostRecentFolder:', error);
      return null;
    }
  }
}

module.exports = GameBananaDownloader;