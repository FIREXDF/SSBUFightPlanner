class ModConflictDetector {
  conflicts: Map<string, string[]>;
  ignoredFiles: Set<string>;
  ignoredPatterns: RegExp[];

  constructor() {
    this.conflicts = new Map();
    this.ignoredFiles = new Set();
    this.ignoredPatterns = [];

    this.initializeDefaultIgnoreList();
  }

  /**
   * Initialize default files and patterns to ignore
   */
  initializeDefaultIgnoreList() {
    // Common files that shouldn't be considered conflicts
    const defaultIgnoredFiles = ['desktop.ini'];

    // Patterns to ignore (regex patterns)
    const defaultIgnoredPatterns = [/^readme\./i];

    this.addIgnoredFiles(defaultIgnoredFiles);
    this.addIgnoredPatterns(defaultIgnoredPatterns);
  }

  /**
   * Add files to ignore list
   * @param {string|Array<string>} files
   */
  addIgnoredFiles(files) {
    if (Array.isArray(files)) {
      files.forEach((file) => this.ignoredFiles.add(file.toLowerCase()));
    } else {
      this.ignoredFiles.add(files.toLowerCase());
    }
  }

  /**
   * Add patterns to ignore list
   * @param {RegExp|Array<RegExp>} patterns
   */
  addIgnoredPatterns(patterns) {
    if (Array.isArray(patterns)) {
      this.ignoredPatterns.push(...patterns);
    } else {
      this.ignoredPatterns.push(patterns);
    }
  }

  /**
   * Remove files from ignore list
   * @param {string|Array<string>} files
   */
  removeIgnoredFiles(files) {
    if (Array.isArray(files)) {
      files.forEach((file) => this.ignoredFiles.delete(file.toLowerCase()));
    } else {
      this.ignoredFiles.delete(files.toLowerCase());
    }
  }

  /**
   * Clear all ignored files and patterns
   */
  clearIgnoreList() {
    this.ignoredFiles.clear();
    this.ignoredPatterns = [];
  }

  /**
   * Check if a file should be ignored
   * @param {string} filePath
   * @returns {boolean}
   */
  isFileIgnored(filePath) {
    const fileName = filePath.split(/[/\\]/).pop().toLowerCase();
    const normalizedPath = filePath.toLowerCase();

    // Check if file is in ignored files list
    if (this.ignoredFiles.has(fileName)) {
      return true;
    }

    // Check if file matches any ignored pattern
    return this.ignoredPatterns.some(
      (pattern) => pattern.test(fileName) || pattern.test(normalizedPath),
    );
  }

  async detectConflicts(mods, onProgress: (...args: any) => void = undefined) {
    this.conflicts.clear();
    const fileMap = new Map(); // Maps file paths to mod names

    await Promise.all(
      mods.map(async (mod) => {
        // Skip disabled mods
        if (!mod.enabled) return;

        try {
          // Notify progress caller which mod is being analyzed
          if (typeof onProgress === 'function') {
            try {
              onProgress(mod.name, mod);
            } catch (_e) {
              // Ignore errors from progress callback
            }
          }

          const files = await this.getModFiles(mod.path);

          for (const file of files) {
            // Skip if the path has no extension (likely a directory)
            if (!file.includes('.')) continue;

            // Skip ignored files
            if (this.isFileIgnored(file)) continue;

            // Normalize the file path for comparison
            const normalizedPath = file.toLowerCase();

            // Check for specific file patterns (like c00, c01, etc.)
            if (this.isConflictSensitiveFile(normalizedPath)) {
              if (!fileMap.has(normalizedPath)) {
                fileMap.set(normalizedPath, [mod.name]);
              } else {
                fileMap.get(normalizedPath).push(mod.name);

                // If we found multiple mods with the same file, record the conflict
                if (fileMap.get(normalizedPath).length > 1) {
                  this.conflicts.set(
                    normalizedPath,
                    fileMap.get(normalizedPath),
                  );
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error analyzing mod ${mod.name}:`, error);
        }
      }),
    );

    return this.conflicts;
  }

  /**
   * Check if file is sensitive to conflicts
   * @param {string} filePath
   * @returns {boolean}
   */
  isConflictSensitiveFile(filePath) {
    // Check for common SSBU mod file patterns
    const sensitivePatterns = [
      /[/\\]c00/i,
      /[/\\]c01/i,
      /[/\\]c02/i,
      /[/\\]c03/i,
      /[/\\]c05/i,
      /[/\\]c06/i,
      /[/\\]c07/i,
      /\.nutexb$/i,
      /\.bntx$/i,
      /\.prc$/i,
      /\.eff$/i,
      /\.numatb$/i,
      /\.numshb$/i,
      /\.nuanmb$/i,
      /\.nus3audio$/i,
      /\.webm$/i,
      /\.lua$/i,
      /\.arc$/i,
      /\.bfotf$/i,
      /\.msbt$/i,
      /\.ini$/i,
      /\.shpcanim$/i,
    ];

    return sensitivePatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Get all files in a mod directory
   * @param {string} modPath
   * @returns {Promise<string[]>}
   */
  async getModFiles(modPath) {
    // Use the window.api to get mod files from the main process
    return await window.api.modOperations.getModFiles(modPath);
  }

  /**
   * Get human-readable conflict description
   * @param {Map} conflicts
   * @returns {Array} Array of conflict descriptions
   */
  getConflictDescriptions() {
    const descriptions = [];

    this.conflicts.forEach((mods, file) => {
      const fileName = file.split(/[/\\]/).pop(); // Get just the filename
      descriptions.push({
        file: fileName,
        mods: mods,
        description: `File "${fileName}" is present in multiple mods: ${mods.join(', ')}`,
      });
    });

    return descriptions;
  }

  /**
   * Get current ignore list for display/editing
   * @returns {Object} Object containing ignored files and patterns
   */
  getIgnoreList() {
    return {
      files: Array.from(this.ignoredFiles),
      patterns: this.ignoredPatterns.map((pattern) => pattern.source),
    };
  }

  /**
   * Load ignore list from settings
   * @param {Object} settings Settings object containing ignore list
   */
  loadIgnoreListFromSettings(settings) {
    if (settings.ignoredFiles) {
      this.addIgnoredFiles(settings.ignoredFiles);
    }
    if (settings.ignoredPatterns) {
      const patterns = settings.ignoredPatterns.map(
        (pattern) => new RegExp(pattern, 'i'),
      );
      this.addIgnoredPatterns(patterns);
    }
  }
}

export default ModConflictDetector;
