import { SlotScanner } from './slotScanner.js';

function fixWindowsPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

interface FilesDir {
  files: number[];
}

interface C00Dir {
  directories: { c00: FilesDir };
}

interface FighterDirectory {
  directories: C00Dir['directories'] & {
    camera: C00Dir;
    kirbycopy: C00Dir;
    movie: C00Dir;
    result: C00Dir;
  };
}

const slotDetectionRegex = /([/_])(c\d{2,3})([/.])/;

export class ConfigGenerator {
  private static isInitialized = false;

  private static vanillaData?: {
    // Note: this is not the full structure of vanilla.json, only the parts we need
    dirs: {
      directories: {
        fighter: { directories: Record<string, FighterDirectory> };
      };
    };
    file_array: string[];
  };

  modDirectory: string;
  fighterName: string;

  fighterData = {
    fighterFiles: [] as string[],
    cameraFiles: [] as string[],
    movieFiles: [] as string[],
    resultFiles: [] as string[],
    kirbyCopyFiles: [] as string[],
    allFiles: [] as string[],
  };

  resultingConfig: {
    'new-dir-infos': string[];
    'new-dir-infos-base': Record<string, string>;
    'share-to-vanilla': Record<string, string[]>;
    'share-to-added': Record<string, string[]>;
    'new-dir-files': Record<string, string[]>;
  };

  constructor(modDirectory: string, fighterName: string) {
    this.fighterName = fighterName;
    this.modDirectory = modDirectory;

    this.initializeFighterData();
    this.initializeResultingConfig();
  }

  static async init() {
    if (this.isInitialized) {
      return;
    }

    const appPath = await window.api.getAppPath();

    const filesDirectory = `${appPath}/files`;
    const vanillaJsonPath = `${filesDirectory}/vanilla.json`;

    if (await window.api.modOperations.fileExists(vanillaJsonPath)) {
      this.vanillaData = JSON.parse(
        await window.api.modOperations.readModFile(vanillaJsonPath),
      );
    } else {
      throw new Error(`vanilla.json not found in ${filesDirectory}`);
    }

    this.isInitialized = true;
  }

  /**
   * Generates the configuration based on the chosen parameters.
   *
   * @param finalSlots - An array of final slot identifiers (e.g., ['c48', 'c49', ...]).
   */
  async generateConfig(finalSlots: string[]) {
    const newDirInfos = [];
    const newDirInfosBase = {};
    const shareToVanilla = {};
    const shareToAdded = {};
    const newDirFiles = {};

    const baseEchoSlot = '00';

    const extraSlots = finalSlots.reduce<number[]>((acc, curr) => {
      const slotNum = parseInt(curr.replace('c', ''), 10);

      if (slotNum > 7) {
        acc.push(slotNum);
      }

      return acc;
    }, []);

    // Step 1: Generate `new-dir-infos` and `new-dir-infos-base`
    for (const slotNumber of extraSlots) {
      const slot = `c${slotNumber.toString().padStart(2, '0')}`;

      newDirInfos.push(`fighter/${this.fighterName}/${slot}`);
      newDirInfos.push(`fighter/${this.fighterName}/camera/${slot}`);
      newDirInfos.push(`fighter/${this.fighterName}/kirbycopy/${slot}`);
      newDirInfos.push(`fighter/${this.fighterName}/movie/${slot}`);
      newDirInfos.push(`fighter/${this.fighterName}/result/${slot}`);

      newDirInfosBase[`fighter/${this.fighterName}/${slot}/camera`] =
        `fighter/${this.fighterName}/c${baseEchoSlot}/camera`;

      newDirInfosBase[
        `fighter/${this.fighterName}/kirbycopy/${slot}/bodymotion`
      ] = `fighter/${this.fighterName}/kirbycopy/c${baseEchoSlot}/bodymotion`;

      newDirInfosBase[`fighter/${this.fighterName}/kirbycopy/${slot}/cmn`] =
        `fighter/${this.fighterName}/kirbycopy/c${baseEchoSlot}/cmn`;

      newDirInfosBase[`fighter/${this.fighterName}/kirbycopy/${slot}/sound`] =
        `fighter/${this.fighterName}/kirbycopy/c${baseEchoSlot}/sound`;

      newDirInfosBase[`fighter/${this.fighterName}/${slot}/cmn`] =
        `fighter/${this.fighterName}/c${baseEchoSlot}/cmn`;
    }

    // Step 2: Generate `new-dir-files` by duplicating vanilla c00 files for each extra slot
    for (const slotNumber of extraSlots) {
      const cValue = `c${slotNumber.toString().padStart(2, '0')}`;

      const requiredDirs = [
        `fighter/${this.fighterName}/camera/${cValue}`,
        `fighter/${this.fighterName}/kirbycopy/${cValue}`,
        `fighter/${this.fighterName}/movie/${cValue}`,
        `fighter/${this.fighterName}/result/${cValue}`,
        `fighter/${this.fighterName}/${cValue}`,
      ];

      requiredDirs.forEach((dir) => {
        if (!newDirFiles[dir]) {
          newDirFiles[dir] = []; // Initialize empty array for the directory
        }
      });
    }

    function _addToNewDirFiles(
      targetCValue: string,
      dirPath: string,
      filePath: string,
    ) {
      const targetFile = filePath.replace(
        slotDetectionRegex,
        `$1${targetCValue}$3`,
      );

      if (!newDirFiles[dirPath].includes(targetFile)) {
        newDirFiles[dirPath].push(targetFile);
      }
    }

    for (const slotNumber of extraSlots) {
      const targetCValue = `c${slotNumber.toString().padStart(2, '0')}`;

      for (const fighterFile of this.fighterData.fighterFiles) {
        _addToNewDirFiles(
          targetCValue,
          `fighter/${this.fighterName}/${targetCValue}`,
          fighterFile,
        );
      }

      for (const cameraFile of this.fighterData.cameraFiles) {
        _addToNewDirFiles(
          targetCValue,
          `fighter/${this.fighterName}/camera/${targetCValue}`,
          cameraFile,
        );
      }

      for (const movieFile of this.fighterData.movieFiles) {
        _addToNewDirFiles(
          targetCValue,
          `fighter/${this.fighterName}/movie/${targetCValue}`,
          movieFile,
        );
      }

      for (const resultFile of this.fighterData.resultFiles) {
        _addToNewDirFiles(
          targetCValue,
          `fighter/${this.fighterName}/result/${targetCValue}`,
          resultFile,
        );
      }

      for (const kirbyCopyFile of this.fighterData.kirbyCopyFiles) {
        _addToNewDirFiles(
          targetCValue,
          `fighter/${this.fighterName}/kirbycopy/${targetCValue}`,
          kirbyCopyFile,
        );
      }
    }

    // Step 3: Add custom mod files to `new-dir-files` by scanning the mod directory
    // Also keep track of which custom files exist to avoid duplication in sharing

    const customModFilesSet = new Set<string>();

    if (await window.api.modOperations.fileExists(this.modDirectory)) {
      const modFiles = await window.api.modOperations.getModFiles(
        this.modDirectory,
      );

      modFiles.forEach((file: string) => {
        const fixedFile = fixWindowsPath(file);
        const fileInfo = SlotScanner.extractFighterAndSlotInfo(fixedFile);

        if (fileInfo.slot && /\.[^/\\]+$/.test(fileInfo.normalizedPath)) {
          customModFilesSet.add(fixedFile);

          const cValue = fileInfo.slot;
          let dirPath = '';

          // Determine the directory based on the fixedFile type
          if (fixedFile.startsWith(`camera/fighter/${this.fighterName}/`)) {
            dirPath = `fighter/${this.fighterName}/camera/${cValue}`;
          } else if (
            fixedFile.startsWith(
              `fighter/kirby/model/copy_${this.fighterName}_`,
            )
          ) {
            dirPath = `fighter/${this.fighterName}/kirbycopy/${cValue}`;
          } else if (
            fixedFile.startsWith(`fighter/${this.fighterName}/movie/`)
          ) {
            dirPath = `fighter/${this.fighterName}/movie/${cValue}`;
          } else if (
            fixedFile.startsWith(`fighter/${this.fighterName}/result/`)
          ) {
            dirPath = `fighter/${this.fighterName}/result/${cValue}`;
          } else if (
            fixedFile.startsWith(`fighter/${this.fighterName}/model/`) ||
            fixedFile.startsWith(`fighter/${this.fighterName}/motion/`) ||
            fixedFile.startsWith(`fighter/${this.fighterName}/sound/`) ||
            fixedFile.startsWith(`fighter/${this.fighterName}/effect/`) ||
            fixedFile.startsWith(`effect/fighter/${this.fighterName}/`)
          ) {
            dirPath = `fighter/${this.fighterName}/${cValue}`;
          }

          if (
            this.fighterData.allFiles.includes(
              fixedFile.replace(slotDetectionRegex, `$1c00$3`),
            )
          ) {
            return;
          }

          // Add the fixedFile to the appropriate directory in `newDirFiles`
          if (dirPath) {
            if (!newDirFiles[dirPath]) {
              newDirFiles[dirPath] = [];
            }

            if (!newDirFiles[dirPath].includes(fixedFile)) {
              newDirFiles[dirPath].push(fixedFile);
            }
          }
        }
      });
    }

    // Step 4: Process `share-to-vanilla` by adding all vanilla "model" and "sound" files
    // that are not already present in custom mod files
    this.fighterData.allFiles.forEach((file) => {
      if (file.includes('dummy_fighter')) {
        return;
      }

      if (
        extraSlots.length > 0 &&
        (file.startsWith(`fighter/kirby/model/`) ||
          file.startsWith(`fighter/${this.fighterName}/model/`) ||
          file.startsWith(`sound/bank/`))
      ) {
        const sharedFiles = [];

        for (const slotNumber of extraSlots) {
          const cValue = `c${slotNumber.toString().padStart(2, '0')}`;
          const targetFile = file.replace(slotDetectionRegex, `$1${cValue}$3`);

          if (!customModFilesSet.has(targetFile)) {
            sharedFiles.push(targetFile);
          }
        }

        if (sharedFiles.length === 0) {
          return;
        }

        if (!shareToVanilla[file]) {
          shareToVanilla[file] = [];
        }

        shareToVanilla[file] = [
          ...new Set([...shareToVanilla[file], ...sharedFiles]),
        ];
      }

      // Step 5: Process `share-to-added` by adding all motion and camera files
      // that are not already present in custom mod files
      if (
        extraSlots.length > 0 &&
        (file.startsWith(`camera/fighter/${this.fighterName}/`) ||
          file.startsWith(`fighter/${this.fighterName}/motion/`) ||
          file.startsWith(`fighter/kirby/motion/copy_${this.fighterName}_`))
      ) {
        const baseFile = file.replace(slotDetectionRegex, `$1c00$3`);
        const sharedFiles = [];

        for (const slotNumber of extraSlots) {
          const cValue = `c${slotNumber.toString().padStart(2, '0')}`;
          const targetFile = file.replace(slotDetectionRegex, `$1${cValue}$3`);

          if (!customModFilesSet.has(targetFile)) {
            sharedFiles.push(targetFile);
          }
        }

        if (sharedFiles.length === 0) {
          return;
        }

        if (!shareToAdded[baseFile]) {
          shareToAdded[baseFile] = [];
        }

        shareToAdded[baseFile] = [
          ...new Set([...shareToAdded[baseFile], ...sharedFiles]),
        ];
      }
    });

    // Step 5: Sort `new-dir-files` by directory keys and file names
    const sortedNewDirFiles = {};
    Object.keys(newDirFiles)
      .sort() // Sort directory keys alphabetically
      .forEach((dir) => {
        sortedNewDirFiles[dir] = newDirFiles[dir].sort(); // Sort file names within each directory
      });

    // Update the global resulting configuration
    this.resultingConfig['new-dir-files'] = sortedNewDirFiles;

    // Step 4: Sort `share-to-vanilla` and `share-to-added`
    const sortedShareToVanilla = {};
    Object.keys(shareToVanilla)
      .sort() // Sort keys alphabetically
      .forEach((key) => {
        sortedShareToVanilla[key] = shareToVanilla[key].sort(); // Sort file paths within each key
      });

    const sortedShareToAdded = {};
    Object.keys(shareToAdded)
      .sort() // Sort keys alphabetically
      .forEach((key) => {
        sortedShareToAdded[key] = shareToAdded[key].sort(); // Sort file paths within each key
      });

    // Step 6: Update the global resulting configuration
    this.resultingConfig['new-dir-infos'] = newDirInfos;
    this.resultingConfig['new-dir-infos-base'] = newDirInfosBase;
    this.resultingConfig['share-to-vanilla'] = sortedShareToVanilla;
    this.resultingConfig['share-to-added'] = sortedShareToAdded;
    this.resultingConfig['new-dir-files'] = sortedNewDirFiles;

    console.log('Generated new-dir-infos:', newDirInfos);
    console.log('Generated new-dir-infos-base:', newDirInfosBase);
    console.log('Generated share-to-vanilla (sorted):', sortedShareToVanilla);
    console.log('Generated share-to-added (sorted):', sortedShareToAdded);
    console.log('Generated new-dir-files (sorted):', sortedNewDirFiles);

    // Step 7: Save the resulting configuration to a JSON file
    const configPath = `${this.modDirectory}/config.json`;

    await window.api.modOperations.writeModFile(
      configPath,
      JSON.stringify(this.resultingConfig, null, 2),
    );

    console.log(`Configuration saved to ${configPath}`);
  }

  private initializeFighterData() {
    const fighterDir =
      ConfigGenerator.vanillaData?.dirs?.directories?.fighter?.directories?.[
        this.fighterName
      ]?.directories;

    function _getFileNameFromFilesArray(
      acc: string[],
      fileIndex: number,
    ): string[] {
      if (
        ConfigGenerator.vanillaData &&
        Array.isArray(ConfigGenerator.vanillaData.file_array) &&
        fileIndex >= 0 &&
        fileIndex < ConfigGenerator.vanillaData.file_array.length
      ) {
        const fileName = ConfigGenerator.vanillaData.file_array[fileIndex];

        if (!fileName.includes('/c00/') && !fileName.includes('_c00.')) {
          return acc;
        }

        acc.push(fileName);
      }

      return acc;
    }

    // Check within 'dirs' for entries related to the fighter
    if (fighterDir) {
      this.fighterData.fighterFiles = (fighterDir.c00.files || []).reduce(
        _getFileNameFromFilesArray,
        [],
      );

      this.fighterData.cameraFiles = (
        fighterDir.camera.directories.c00.files || []
      ).reduce(_getFileNameFromFilesArray, []);

      this.fighterData.movieFiles = (
        fighterDir.movie.directories.c00.files || []
      ).reduce(_getFileNameFromFilesArray, []);

      this.fighterData.resultFiles = (
        fighterDir.result.directories.c00.files || []
      ).reduce(_getFileNameFromFilesArray, []);

      this.fighterData.kirbyCopyFiles = (
        fighterDir.kirbycopy?.directories.c00.files || []
      ).reduce(_getFileNameFromFilesArray, []);

      this.fighterData.allFiles = [
        ...this.fighterData.fighterFiles,
        ...this.fighterData.cameraFiles,
        ...this.fighterData.movieFiles,
        ...this.fighterData.resultFiles,
        ...this.fighterData.kirbyCopyFiles,
      ];
    }

    if (!this.fighterData.allFiles || this.fighterData.allFiles.length === 0) {
      throw new Error(
        `No data found for fighter '${this.fighterName}' in vanilla.json`,
      );
    }
  }

  private initializeResultingConfig() {
    // Initialize the resulting configuration
    this.resultingConfig = {
      'new-dir-infos': [],
      'new-dir-infos-base': {},
      'share-to-vanilla': {},
      'share-to-added': {},
      'new-dir-files': {},
    };

    console.log('Initialized resultingConfig:', this.resultingConfig);
  }
}
