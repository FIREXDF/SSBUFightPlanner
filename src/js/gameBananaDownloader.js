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
  
      // Construct the download URL
      const downloadUrl = `https://gamebanana.com/dl/${fileId || modId}`;
  
      // Download the file path in the main mods directory
      const destPath = path.join(this.modsPath, filename);
  
      // Download the file
      await this.downloadFile(downloadUrl, destPath);
  
      // Extract the file and get the extracted folder name
      const extractedFolderName = await this.extractFile(destPath, this.modsPath);
      const extractedFolderPath = path.join(this.modsPath, extractedFolderName);
  
      // Remove the original archive
      fs.unlinkSync(destPath);
  
      // Fetch the mod's profile URL from the API
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;
      const response = await axios.get(apiUrl);
      const modProfileUrl = response.data._sProfileUrl; // Get the profile URL from the API response
  
      // Create and write the info.toml file with just the URL
      const infoPath = path.join(extractedFolderPath, 'info.toml');
      const tomlData = `url = "${modProfileUrl}"\n`;
      fs.writeFileSync(infoPath, tomlData);
      console.log(`info.toml created at: ${infoPath}`);
  
      // Check if preview.webp exists, if not download image
      const previewPath = path.join(extractedFolderPath, 'preview.webp');
      if (!fs.existsSync(previewPath)) {
        await this.downloadImage(modId, extractedFolderPath);
      }
  
      return extractedFolderPath;
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
          const tempImageDestPath = path.join(this.modsPath, imageFile);
          
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
}

module.exports = GameBananaDownloader;