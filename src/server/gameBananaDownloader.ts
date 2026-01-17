import axios from 'axios';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as child_process from 'child_process';
import Seven from 'node-7z';

import { app } from 'electron';

export interface LoadingCallbacks {
  onStart?: (status: string, modName?: string) => void;
  onProgress?: (status: string, progress?: number, modName?: string) => void;
  onFinish?: (status: string, modName?: string) => void;
  onError?: (error: string) => void;
}

export class GameBananaDownloader {
  modsPath: string;
  loadingCallbacks: LoadingCallbacks;
  isCancelled: boolean;
  tempFolder: string | null;
  currentWriter: fs.WriteStream | null;
  isCleaningUp: boolean;
  isPaused: boolean;
  lastDownloadedBytes: number;
  downloadedChunks: Map<number, Buffer>;

  constructor(modsPath: string, loadingCallbacks: LoadingCallbacks = {}) {
    this.modsPath = modsPath;

    // Add loading callback handlers
    this.loadingCallbacks = {
      onStart: loadingCallbacks.onStart || (() => {}),
      onProgress: loadingCallbacks.onProgress || (() => {}),
      onFinish: loadingCallbacks.onFinish || (() => {}),
      onError: loadingCallbacks.onError || (() => {}),
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
      /https:\/\/gamebanana\.com\/mods\/(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = downloadLink.match(pattern);
      if (match) {
        return [match[1], match[2] || ''];
      }
    }

    throw new Error('Invalid download link');
  }

  async _downloadAndExtract(modId: string, fileId: string) {
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
    const archiveFiles = fs.readdirSync(this.tempFolder).filter((f) => {
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
    const extractedFolders = fs
      .readdirSync(this.tempFolder)
      .filter(
        (f) =>
          f !== filename &&
          fs.statSync(path.join(this.tempFolder, f)).isDirectory(),
      );

    console.log('Extracted folders:', extractedFolders);

    if (extractedFolders.length === 0) {
      console.error(
        'Extraction error: No folder found after extraction. Try to install it manually.',
      );

      console.error(
        'Contents of temp folder:',
        fs.readdirSync(this.tempFolder),
      );

      throw new Error('No folder found after extraction');
    }

    return extractedFolders;
  }

  async _findFptFile(dir: string) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);

      if (fs.statSync(fullPath).isDirectory()) {
        const fptInSubdir = this._findFptFile(fullPath);
        if (fptInSubdir) return fptInSubdir;
      } else if (item === '.fpt') {
        return fullPath;
      }
    }

    return null;
  }

  async downloadMod(downloadLink: string) {
    let modName: string | undefined;

    try {
      this.tempFolder = path.join(this.modsPath, `temp_${Date.now()}`);

      this.isCancelled = false;

      const [modId, fileId] =
        GameBananaDownloader.extractModAndFileId(downloadLink);

      modName = await this.getModNameFromApi(modId); // Assign to outer variable

      this.loadingCallbacks.onStart('Starting download...', modName);

      // If canceled early, handle it
      if (this.isCancelled) {
        this.loadingCallbacks.onFinish('Download cancelled', modName);
        return { cancelled: true, modName };
      }

      const extractedFolders = await this._downloadAndExtract(modId, fileId);
      const fptFile = await this._findFptFile(this.tempFolder);

      if (fptFile) {
        console.log('Found .fpt file at:', fptFile);
        await this.organizeFptStructure(this.tempFolder, fptFile);
      } else {
        await this.organizeDefaultStructure(extractedFolders);
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
        // Supprime toutes les lignes qui commencent par la clé (avec ou sans espaces)
        const removeKey = (content, key) =>
          content
            .split('\n')
            .filter(
              (line) =>
                !line
                  .trim()
                  .toLowerCase()
                  .startsWith(key + '=') &&
                !line
                  .trim()
                  .toLowerCase()
                  .startsWith(key + ' ='),
            )
            .join('\n');

        existingContent = removeKey(existingContent, 'url');
        existingContent = removeKey(existingContent, 'authors');
        existingContent = removeKey(existingContent, 'category');
        existingContent = removeKey(existingContent, 'version');

        // Ajoute les nouvelles valeurs à la fin
        existingContent += `\nurl = "${modProfileUrl}"\n`;
        existingContent += `authors = "${modAuthor}"\n`;
        existingContent += `category = "${modCategory}"\n`;
        existingContent += `version = "${modVersion}"\n`;

        fs.writeFileSync(tempInfoPath, existingContent.trim() + '\n');
        console.log(
          'Updated existing info.toml with URL, author, category and version',
        );
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
      for (const folder of extractedFolders) {
        const extractedPath = path.join(this.tempFolder, folder);
        const finalFolderName = folder.replace(/\.+$/, ''); // Enlève les points finaux
        const finalPath = path.join(finalArchivePath, finalFolderName);

        if (fs.existsSync(finalPath)) {
          fs.rmSync(finalPath, { recursive: true });
        }

        fs.renameSync(extractedPath, finalPath);
      }

      // Move remaining files
      const remainingFiles = fs
        .readdirSync(this.tempFolder)
        .filter(
          (f) => !fs.statSync(path.join(this.tempFolder, f)).isDirectory(),
        );

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
        throw new Error(
          'Installation failed: Mod folder was empty after processing',
        );
      }

      // Clean up temp folder - Add timeout and proper status updates
      this.loadingCallbacks.onProgress('Cleaning temporary files...', 95);
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          await fse.remove(this.tempFolder);
          this.loadingCallbacks.onProgress('Finalizing...', 100);

          resolve();
        }, 500);
      });

      // Notify completion properly
      this.loadingCallbacks.onFinish(
        'Download completed successfully',
        modName,
      );

      return { success: true, path: finalArchivePath, modName };
    } catch (error) {
      if (this.isCancelled && !this.isCleaningUp) {
        await this.cleanup();
        // Now modName is available here
        this.loadingCallbacks.onFinish(
          'Download cancelled',
          modName || 'Unknown Mod',
        );
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
          maxBodyLength: Infinity,
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
        console.error(
          `Download error (attempt ${attempt}/${retries}): ${error.message}`,
        );
        if (attempt <= retries) {
          console.log(`Retrying in ${retryDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw error;
        }
      }
    }
  }

  async downloadFileWithProgress(
    url,
    destPath,
    retries = 3,
    retryDelay = 1000,
  ) {
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await axios({
          method: 'get',
          url: url,
          responseType: 'stream',
          headers:
            this.downloadedChunks.size > 0
              ? { Range: `bytes=${this.lastDownloadedBytes}-` }
              : {},
        });

        const totalLength = response.headers['content-length'];
        let downloadedLength = this.lastDownloadedBytes;

        return await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(destPath, {
            flags: this.downloadedChunks.size > 0 ? 'a' : 'w',
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
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          throw error;
        }
        console.error(
          `Download failed (attempt ${attempt}/${retries}), retrying in ${retryDelay}ms...`,
          error.message,
        );
        await new Promise((res) => setTimeout(res, retryDelay));
      }
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
            responseType: 'stream',
          });

          const writer = fs.createWriteStream(tempImageDestPath);
          imgResponse.data.pipe(writer);

          return new Promise<void>((resolve, reject) => {
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
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (['.rar', '.7z', '.zip'].includes(ext)) {
        return this.extractWith7Zip(filePath, extractTo);
      } else {
        return this.extractWithTar(filePath, extractTo);
      }
    } catch (error) {
      console.error(`Primary extraction failed, trying fallback:`, error);
      return this.extractWith7Zip(filePath, extractTo);
    }
  }

  async extractWithTar(filePath, extractTo) {
    return new Promise<void>((resolve, reject) => {
      child_process.exec(
        `tar -xf "${filePath}" -C "${extractTo}"`,
        async (error) => {
          if (error) {
            console.error('Tar extraction error:', error);
            reject(error);
            return;
          }

          if (!this.verifyExtraction(extractTo)) {
            reject(new Error('No files found after extraction'));
            return;
          }

          const fptFile = await this._findFptFile(extractTo);

          if (fptFile) {
            await this.organizeFptStructure(extractTo, fptFile);
          }

          resolve();
        },
      );
    });
  }

  async extractWith7Zip(filePath, extractTo) {
    return new Promise<void>((resolve, reject) => {
      const sevenZipPath = path.join(
        app.getAppPath(),
        'assets',
        'bin',
        process.platform === 'win32' ? '7z.exe' : '7z',
      );

      console.log('Using 7-Zip from:', sevenZipPath);

      const seven = Seven.extractFull(filePath, extractTo, {
        $progress: false,
        $bin: sevenZipPath,
      });

      seven.on('end', () => {
        if (!this.verifyExtraction(extractTo)) {
          reject(new Error('No files found after extraction'));
          return;
        }

        resolve();
      });

      seven.on('error', (err) => {
        console.error(`7-Zip extraction failed: ${err}`);
        reject(err);
      });
    });
  }

  async organizeDefaultStructure(extractedFolders: string[]) {
    console.log('No .fpt file found, using standard folder structure');

    // Check if required folders and files are in the root
    const requiredFolders = [
      'append',
      'assist',
      'boss',
      'camera',
      'campaign',
      'common',
      'effect',
      'enemy',
      'fighter',
      'finalsmash',
      'item',
      'miihat',
      'pokemon',
      'prebuilt;',
      'render',
      'snapshot',
      'sound',
      'spirits',
      'stage',
      'standard',
      'stream;',
      'ui',
    ];

    const requiredFiles = [
      'preview.webp',
      'config.json',
      'info.toml',
      'victory.toml',
      'Preview.webp',
    ];

    const missingFolders = requiredFolders.filter(
      (folder) => !extractedFolders.includes(folder),
    );

    const existingFiles = fs
      .readdirSync(this.tempFolder)
      .filter((f) => !fs.statSync(path.join(this.tempFolder, f)).isDirectory());

    const missingFiles = requiredFiles.filter(
      (file) => !existingFiles.includes(file),
    );

    if (missingFolders.length > 0 || missingFiles.length > 0) {
      console.log('Missing folders in root:', missingFolders);
      console.log('Missing files in root:', missingFiles);

      // Track which folders we've already found and moved
      const movedFolders = new Set<string>();

      // Recursively scan subfolders
      const findAndMoveItems = (currentPath: string) => {
        // Check if the path still exists (it may have been moved)
        if (!fs.existsSync(currentPath)) {
          return;
        }

        const items = fs.readdirSync(currentPath);

        for (const item of items) {
          const fullPath = path.join(currentPath, item);

          // Skip if path no longer exists
          if (!fs.existsSync(fullPath)) {
            continue;
          }

          const isDirectory = fs.statSync(fullPath).isDirectory();

          if (isDirectory) {
            // Handle folders
            if (missingFolders.includes(item) && !movedFolders.has(item)) {
              const destinationPath = path.join(this.tempFolder, item);

              if (!fs.existsSync(destinationPath)) {
                fs.renameSync(fullPath, destinationPath);
                extractedFolders.push(item);
                movedFolders.add(item);
                console.log(`Moved folder ${item} to root`);
                // Don't scan into this folder since we just moved it
                // and it's now a required folder at the root level
                continue;
              }
            }

            // Only scan into folders that are NOT required folders
            // This prevents nested required folders from being moved out
            if (!requiredFolders.includes(item)) {
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
      for (const folder of extractedFolders) {
        const subFolderPath = path.join(this.tempFolder, folder);

        console.log('folder :: ', folder);
        console.log('requiredFolders :: ', requiredFolders);

        // Don't scan into folders that are already required folders
        if (!requiredFolders.includes(folder)) {
          findAndMoveItems(subFolderPath);
        }
      }
    }
  }

  async organizeFptStructure(extractTo: string, fptFile: string) {
    try {
      console.log('Found FPT file at:', fptFile);
      const fptContent = fs.readFileSync(fptFile, 'utf-8');

      const parseIndentedStructure = (content) => {
        const lines = content.split('\n');
        const structure = new Map();
        let currentPath = [];
        let lastIndentLevel = 0;

        lines.forEach((line) => {
          if (!line.trim()) return;

          const indentLevel = line.match(/^\s*/)[0].length / 4;
          const item = line.trim();

          if (indentLevel < lastIndentLevel) {
            currentPath = currentPath.slice(0, indentLevel);
          } else if (indentLevel === lastIndentLevel) {
            currentPath = currentPath.slice(0, -1);
          }

          if (item.endsWith('/')) {
            currentPath.push(item);
          } else {
            const fullPath = [...currentPath, item].join('');
            structure.set(path.basename(item), fullPath);
          }

          lastIndentLevel = indentLevel;
        });

        return structure;
      };

      const fileStructure = parseIndentedStructure(fptContent);

      console.log('Creating directory structure...');
      const allPaths = Array.from(fileStructure.values());
      const directories = new Set<string>();

      allPaths.forEach((filePath) => {
        const dir = path.dirname(filePath);
        const parts = dir.split('/');
        let currentPath = '';

        for (const part of parts) {
          if (part) {
            currentPath += part + '/';
            directories.add(path.join(extractTo, currentPath));
          }
        }
      });

      for (const dir of directories) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        }
      }

      console.log('Moving files to their destinations...');
      const currentFiles = new Map();
      this.mapFiles(extractTo, '', currentFiles);

      for (const [fileName, targetRelativePath] of fileStructure) {
        const sourcePath = currentFiles.get(fileName);
        if (sourcePath) {
          const targetPath = path.join(extractTo, targetRelativePath);
          if (sourcePath !== targetPath && fs.existsSync(sourcePath)) {
            try {
              fs.renameSync(sourcePath, targetPath);
              console.log(`Moved ${fileName} to ${targetPath}`);
            } catch (moveError) {
              console.error(`Error moving ${fileName}:`, moveError);
            }
          }
        } else {
          console.warn(`File not found: ${fileName}`);
        }
      }

      fs.unlinkSync(fptFile);
      console.log('File organization completed according to .fpt structure');
    } catch (error) {
      console.error('Error organizing files according to .fpt:', error);
      throw error;
    }
  }

  mapFiles(dir, baseDir, fileMap) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.mapFiles(fullPath, path.join(baseDir, entry.name), fileMap);
      } else {
        fileMap.set(entry.name, fullPath);
      }
    }
  }

  verifyExtraction(extractTo) {
    try {
      const contents = fs.readdirSync(extractTo).filter((f) => {
        const fullPath = path.join(extractTo, f);
        return (
          fs.existsSync(fullPath) &&
          (fs.statSync(fullPath).isDirectory() || !f.match(/\.(rar|zip|7z)$/i))
        );
      });

      console.log('Extracted contents:', contents);
      return contents.length > 0;
    } catch (error) {
      console.error('Verification error:', error);
      return false;
    }
  }

  async getFilenameFromApi(modId, fileId) {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}/DownloadPage`;
      const response = await axios.get(apiUrl);

      const files = response.data._aFiles;
      const fileInfo = fileId
        ? files.find((file) => String(file._idRow) === String(fileId))
        : files[0];

      if (!fileInfo) {
        throw new Error('Filename not found');
      }

      // Sanitize filename and ensure correct extension
      let filename = this.sanitizeFilename(
        fileInfo._sFile || `mod_${modId}.zip`,
      );

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
    console.log('Sanitizing filename:', filename);
    return filename
      .replace(/[/\\?%*:|"<>]/g, ' ') // Replace special chars with dash
      .replace(/\s+/g, ' ') // Replace spaces with underscore
      .replace(/\|/g, ' ') // Replace pipe with dash
      .replace(/--+/g, ' ') // Replace multiple dashes with single dash
      .replace(/^-+|-+$/g, ' ') // Remove dashes from start and end
      .trim();
  }

  sanitizePath(pathName) {
    console.log('Sanitizing path:', pathName);
    return pathName
      .replace(/[/\\?%*:|"<>]/g, ' ') // Replace special chars with dash
      .replace(/\s*\|\s*/g, ' ') // Replace pipe with dash, including surrounding spaces
      .replace(/\s+/g, ' ') // Replace spaces with underscore
      .replace(/--+/g, ' ') // Replace multiple dashes with single dash
      .replace(/^-+|-+$/g, ' ') // Remove dashes from start and end
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
  async removeEmptyFolders(folderPath: string) {
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
      let modName = response.data._sName || `mod_${modId}`;
      // Supprime le point final si présent (ex: "PS5 R.O.B." -> "PS5 R.O.B")
      modName = modName.replace(/\.$/, '');
      return this.sanitizePath(modName);
    } catch (error) {
      console.error('Mod name retrieval error:', error);
      return `mod_${modId}`;
    }
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
      const category =
        response.data._aSuperCategory?._sName || 'Unknown Category';

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
        return '1.0';
      }

      return version;
    } catch (error) {
      console.error('Version retrieval error:', error);
      return '1.0';
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
      for (const [, chunk] of this.downloadedChunks) {
        this.currentWriter.write(chunk);
      }
      this.downloadedChunks.clear();
    }
  }
}
