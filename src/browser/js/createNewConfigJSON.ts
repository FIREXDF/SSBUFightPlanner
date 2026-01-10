function fixWindowsPath(filePath: string, toLinux: boolean): string {
  return toLinux ? filePath.replace(/\\/g, "/") : filePath.replace(/\//g, "\\");
}

async function findFighterFiles(pathPrefix: string, filesDirectory: string) {
  const allFiles: string[] = [];
  const stack = [filesDirectory]; // Start with the root directory

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const entries = await window.api.modOperations.getModFiles(current);

    for (const entry of entries) {
      const entryPath = `${current}/${entry}`;

      // Directories typically don't have file extensions
      // Check if the entry has no extension (no dot after the last slash)
      const isDir = !/\.[^/\\]+$/.test(entry);

      if (isDir) {
        stack.push(entryPath); // Add subdirectory to the stack
      } else {
        const relativePath = fixWindowsPath(entryPath, true).replace(
          fixWindowsPath(filesDirectory, true) + "/",
          "",
        );

        allFiles.push(`${pathPrefix}/${relativePath}`); // Add file to the list
      }
    }
  }

  return allFiles;
}

export class CreateNewConfigJSON {
  private static isInitialized = false;
  private static knownFiles = new Set<string>();

  private static vanillaData?: {
    dirs: string[];
    file_array: string[];
  };

  modDirectory: string;
  fighterName: string;

  fighterData: {
    dirs?: string[];
    file_array?: string[];
  };

  resultingConfig: {
    "new-dir-infos": string[];
    "new-dir-infos-base": Record<string, string>;
    "share-to-vanilla": Record<string, string[]>;
    "share-to-added": Record<string, string[]>;
    "new-dir-files": Record<string, string[]>;
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
    const hashesFile = `${filesDirectory}/Hashes_all.txt`;
    const vanillaJsonPath = `${filesDirectory}/vanilla.json`;

    if (await window.api.modOperations.fileExists(vanillaJsonPath)) {
      this.vanillaData = JSON.parse(
        await window.api.modOperations.readModFile(vanillaJsonPath),
      );

      console.log("Loaded vanilla.json. Keys:", Object.keys(this.vanillaData));
    } else {
      throw new Error(`vanilla.json not found in ${filesDirectory}`);
    }

    // Load known files from Hashes_all.txt
    this.knownFiles = new Set(
      (await window.api.modOperations.readModFile(hashesFile))
        .split("\n")
        .map((x) => x.trim()),
    );

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

    const baseEchoSlot = "00";

    const extraSlots = finalSlots.reduce<number[]>((acc, curr) => {
      const slotNum = parseInt(curr.replace("c", ""), 10);

      if (slotNum > 7) {
        acc.push(slotNum);
      }

      return acc;
    }, []);

    console.log("extraSlots :: ", extraSlots);

    // Step 1: Generate `new-dir-infos` and `new-dir-infos-base`
    for (const slotNumber of extraSlots) {
      const slot = `c${slotNumber.toString().padStart(2, "0")}`;
      console.log(`Generating slot: ${slot}`);

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

    // Step 2: Process `share-to-vanilla` and `share-to-added`
    const fighterFiles = this.fighterData.file_array || [];

    if (!fighterFiles.length) {
      console.error(
        `No data found for fighter '${this.fighterName}' in fighterData.`,
      );

      return;
    }

    fighterFiles.forEach((file) => {
      if (file.includes("dummy_fighter")) {
        return;
      }

      // Add to `share-to-vanilla`
      if (
        extraSlots.length > 0 &&
        (file.startsWith(`fighter/kirby/model/copy_${this.fighterName}_`) ||
          file.startsWith(`fighter/${this.fighterName}/model/`) ||
          file.startsWith(`sound/bank/fighter/se_${this.fighterName}_`) ||
          file.startsWith(`sound/bank/fighter_voice/vc_${this.fighterName}_`) ||
          (this.fighterName === "koopa" &&
            file.startsWith(`fighter/koopag/model/`))) // Include 'koopag' model files for 'koopa'
      ) {
        const baseFile = file.replace(/c\d{2,3}/, "c00");
        const sharedFiles = [];

        for (const slotNumber of extraSlots) {
          const slot = `c${slotNumber.toString().padStart(2, "0")}`;
          const targetFile = file.replace(/c\d{2,3}/, slot);
          sharedFiles.push(targetFile);
        }

        if (!shareToVanilla[baseFile]) {
          shareToVanilla[baseFile] = [];
        }

        shareToVanilla[baseFile] = [
          ...new Set([...shareToVanilla[baseFile], ...sharedFiles]),
        ];
      }

      // Add to `share-to-added`
      if (
        extraSlots.length > 0 &&
        (file.startsWith(`camera/fighter/${this.fighterName}/`) ||
          file.startsWith(`fighter/${this.fighterName}/motion/`))
      ) {
        const baseFile = file.replace(/c\d{2,3}/, "c00");
        const sharedFiles = [];

        for (const slotNumber of extraSlots) {
          const slot = `c${slotNumber.toString().padStart(2, "0")}`;
          const targetFile = file.replace(/c\d{2,3}/, slot);
          sharedFiles.push(targetFile);
        }

        if (!shareToAdded[baseFile]) {
          shareToAdded[baseFile] = [];
        }
        shareToAdded[baseFile] = [
          ...new Set([...shareToAdded[baseFile], ...sharedFiles]),
        ];
      }
    });

    // Step 3: Populate `new-dir-files` using `share-to-vanilla`, `share-to-added`, and custom mod files
    const combinedShares = { ...shareToVanilla, ...shareToAdded };

    // Ensure all required directories exist in `newDirFiles` even if they are empty
    for (const slotNumber of extraSlots) {
      const cValue = `c${slotNumber.toString().padStart(2, "0")}`;

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

    // Process files from combined shares and add them to the appropriate directories
    for (const [, sharedFiles] of Object.entries(combinedShares)) {
      for (const file of sharedFiles as any) {
        const match = file.match(/c\d{2,3}/); // Extract the 'c' value (e.g., 'c48')
        if (!match) return; // Skip files without a 'c' value

        const cValue = match[0]; // e.g., 'c48'
        let dirPath = "";

        // Determine the directory based on the file type
        if (file.startsWith(`camera/fighter/${this.fighterName}/`)) {
          dirPath = `fighter/${this.fighterName}/camera/${cValue}`;
        } else if (
          file.startsWith(`fighter/kirby/model/copy_${this.fighterName}_`) ||
          file.startsWith(`fighter/kirby/motion/copy_${this.fighterName}_`)
        ) {
          dirPath = `fighter/${this.fighterName}/kirbycopy/${cValue}`;
        } else if (file.startsWith(`fighter/${this.fighterName}/movie/`)) {
          dirPath = `fighter/${this.fighterName}/movie/${cValue}`;
        } else if (file.startsWith(`fighter/${this.fighterName}/result/`)) {
          dirPath = `fighter/${this.fighterName}/result/${cValue}`;
        } else if (
          file.startsWith(`fighter/${this.fighterName}/model/`) ||
          file.startsWith(`fighter/${this.fighterName}/motion/`) ||
          file.startsWith(`fighter/${this.fighterName}/sound/`) ||
          file.startsWith(`fighter/${this.fighterName}/effect/`) ||
          file.startsWith(`sound/bank/fighter_voice/vc_${this.fighterName}`) ||
          file.startsWith(`sound/bank/fighter/se_${this.fighterName}`) ||
          file.startsWith(`sound/bank/narration/`)
        ) {
          dirPath = `fighter/${this.fighterName}/${cValue}`;
        }

        // Add the file to the appropriate directory in `newDirFiles`
        if (dirPath) {
          if (!newDirFiles[dirPath]) {
            newDirFiles[dirPath] = [];
          }

          if (!newDirFiles[dirPath].includes(file)) {
            newDirFiles[dirPath].push(file);
          }
        }
      }
    }

    // Process custom mod files and add them to `new-dir-files`
    const customDirs = [
      "camera",
      "kirbycopy",
      "movie",
      "result",
      "model",
      "motion",
      "sound",
      "effect",
    ];

    for (const dir of customDirs) {
      const customPath = `${this.modDirectory}/fighter/${this.fighterName}/${dir}`;

      if (await window.api.modOperations.fileExists(customPath)) {
        const customFiles = await findFighterFiles(
          `fighter/${this.fighterName}/${dir}`,
          customPath,
        ); // Use the helper function to collect all files

        customFiles.forEach((file) => {
          const relativePath = file
            .replace(this.modDirectory, "")
            .replace(/\\/g, "/");

          const match = relativePath.match(/c\d{2,3}/); // Extract the 'c' value

          if (match) {
            const cValue = match[0];
            let dirPath = "";

            // Determine the directory based on the file type
            if (
              relativePath.startsWith(`camera/fighter/${this.fighterName}/`)
            ) {
              dirPath = `fighter/${this.fighterName}/camera/${cValue}`;
            } else if (
              relativePath.startsWith(
                `fighter/kirby/model/copy_${this.fighterName}_`,
              )
            ) {
              dirPath = `fighter/${this.fighterName}/kirbycopy/${cValue}`;
            } else if (
              relativePath.startsWith(`fighter/${this.fighterName}/movie/`)
            ) {
              dirPath = `fighter/${this.fighterName}/movie/${cValue}`;
            } else if (
              relativePath.startsWith(`fighter/${this.fighterName}/result/`)
            ) {
              dirPath = `fighter/${this.fighterName}/result/${cValue}`;
            } else if (
              relativePath.startsWith(`fighter/${this.fighterName}/model/`) ||
              relativePath.startsWith(`fighter/${this.fighterName}/motion/`) ||
              relativePath.startsWith(`fighter/${this.fighterName}/sound/`) ||
              relativePath.startsWith(`fighter/${this.fighterName}/effect/`)
            ) {
              dirPath = `fighter/${this.fighterName}/${cValue}`;
            }

            // Add the file to the appropriate directory in `newDirFiles`
            if (dirPath) {
              if (!newDirFiles[dirPath]) {
                newDirFiles[dirPath] = [];
              }

              if (!newDirFiles[dirPath].includes(relativePath)) {
                newDirFiles[dirPath].push(relativePath);
              }
            }
          }
        });
      }
    }

    // Step 4: Sort `new-dir-files` by directory keys and file names
    const sortedNewDirFiles = {};
    Object.keys(newDirFiles)
      .sort() // Sort directory keys alphabetically
      .forEach((dir) => {
        sortedNewDirFiles[dir] = newDirFiles[dir].sort(); // Sort file names within each directory
      });

    // Update the global resulting configuration
    this.resultingConfig["new-dir-files"] = sortedNewDirFiles;

    console.log("Generated new-dir-files (sorted):", sortedNewDirFiles);

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
    this.resultingConfig["new-dir-infos"] = newDirInfos;
    this.resultingConfig["new-dir-infos-base"] = newDirInfosBase;
    this.resultingConfig["share-to-vanilla"] = sortedShareToVanilla;
    this.resultingConfig["share-to-added"] = sortedShareToAdded;
    this.resultingConfig["new-dir-files"] = sortedNewDirFiles;

    console.log("Generated new-dir-infos:", newDirInfos);
    console.log("Generated new-dir-infos-base:", newDirInfosBase);
    console.log("Generated share-to-vanilla (sorted):", sortedShareToVanilla);
    console.log("Generated share-to-added (sorted):", sortedShareToAdded);
    console.log("Generated new-dir-files (sorted):", sortedNewDirFiles);

    // Step 7: Save the resulting configuration to a JSON file
    const configPath = `${this.modDirectory}/config.json`;

    await window.api.modOperations.writeModFile(
      configPath,
      JSON.stringify(this.resultingConfig, null, 2),
    );

    console.log(`Configuration saved to ${configPath}`);
  }

  private initializeFighterData() {
    // Search for any portion with the original fighter name
    this.fighterData = {};

    // Check within 'file_array' for entries related to the fighter
    if (Array.isArray(CreateNewConfigJSON.vanillaData.file_array)) {
      this.fighterData.file_array =
        CreateNewConfigJSON.vanillaData.file_array.filter((file) =>
          file.toLowerCase().includes(this.fighterName.toLowerCase()),
        );
    }

    // Check within 'dirs' for entries related to the fighter
    if (Array.isArray(CreateNewConfigJSON.vanillaData.dirs)) {
      this.fighterData.dirs = CreateNewConfigJSON.vanillaData.dirs.filter(
        (dir) => dir.toLowerCase().includes(this.fighterName.toLowerCase()),
      );
    }

    if (
      (!this.fighterData.file_array ||
        this.fighterData.file_array.length === 0) &&
      (!this.fighterData.dirs || this.fighterData.dirs.length === 0)
    ) {
      console.warn(
        `No data found for fighter '${this.fighterName}' in vanilla.json. Available keys:`,
        Object.keys(CreateNewConfigJSON.vanillaData),
      );
      throw new Error(
        `No data found for fighter '${this.fighterName}' in vanilla.json`,
      );
    }

    console.log(
      `Filtered data for fighter '${this.fighterName}':`,
      this.fighterData,
    );
  }

  private initializeResultingConfig() {
    // Initialize the resulting configuration
    this.resultingConfig = {
      "new-dir-infos": [],
      "new-dir-infos-base": {},
      "share-to-vanilla": {},
      "share-to-added": {},
      "new-dir-files": {},
    };

    console.log("Initialized resultingConfig:", this.resultingConfig);
  }
}
