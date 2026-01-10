// import * as fs from "fs";
// import * as path from "path";
// import * as fse from "fs-extra";
// import * as readline from "readline";

// function usage() {
//   console.log(
//     "usage: node reslotter.js <mod_directory> <hashes_file> <fighter_name> <current_alt> <target_alt> <share_slot> <out_directory>",
//   );
//   process.exit(2);
// }
//
// function makeDirsFromFile(filePath) {
//   const dirName = path.dirname(filePath);
//   fse.ensureDirSync(dirName);
// }
//
// function fixWindowsPath(filePath, toLinux) {
//   return toLinux
//     ? filePath.replace(/\\/g, "/")
//     : filePath.replace(/\//g, path.sep);
// }
//
// function findFighterFiles(filesDirectory) {
//   const allFiles = [];
//   const stack = [filesDirectory]; // Start with the root directory
//
//   while (stack.length > 0) {
//     const current = stack.pop();
//     const entries = fs.readdirSync(current);
//
//     for (const entry of entries) {
//       const entryPath = path.join(current, entry);
//       if (fs.lstatSync(entryPath).isDirectory()) {
//         stack.push(entryPath); // Add subdirectory to the stack
//       } else {
//         const relativePath = fixWindowsPath(entryPath, true).replace(
//           fixWindowsPath(filesDirectory, true) + "/",
//           "",
//         );
//         allFiles.push(relativePath); // Add file to the list
//       }
//     }
//   }
//
//   return allFiles;
// }

export class CreateNewConfigJSON {
  private static isInitialized = false;
  private static knownFiles = new Set<string>();
  private static dirsData: string[] = [];
  private static fileArray: string[] = [];

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
    const dirInfoPath = `${filesDirectory}/dir_info_with_files_trimmed.json`;

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

    if (!(await window.api.modOperations.fileExists(dirInfoPath))) {
      throw new Error(`File not found: ${dirInfoPath}`);
    }

    const dirInfoContent =
      await window.api.modOperations.readModFile(dirInfoPath);

    const dirInfo = JSON.parse(dirInfoContent);

    this.dirsData = dirInfo.dirs;
    this.fileArray = dirInfo.file_array;

    this.isInitialized = true;
  }

  reslotFighterFiles(
    modDir,
    currentAlt,
    targetAlt,
    shareSlot,
    outDir,
    fighterName,
    echoColorStart,
    numColorSlots,
    baseEchoSlot,
  ) {
    const newDirInfos = [];
    const newDirInfosBase = {};
    const shareToVanilla = {};
    const shareToAdded = {};
    const newDirFiles = {};

    // Step 1: Generate `new-dir-infos` and `new-dir-infos-base`
    for (let i = 0; i < numColorSlots; i++) {
      const slot = `c${(echoColorStart + i).toString().padStart(2, "0")}`;
      console.log(`Generating slot: ${slot}`);

      newDirInfos.push(`fighter/${fighterName}/${slot}`);
      newDirInfos.push(`fighter/${fighterName}/camera/${slot}`);
      newDirInfos.push(`fighter/${fighterName}/kirbycopy/${slot}`);
      newDirInfos.push(`fighter/${fighterName}/movie/${slot}`);
      newDirInfos.push(`fighter/${fighterName}/result/${slot}`);

      newDirInfosBase[`fighter/${fighterName}/${slot}/camera`] =
        `fighter/${fighterName}/c${baseEchoSlot}/camera`;
      newDirInfosBase[`fighter/${fighterName}/kirbycopy/${slot}/bodymotion`] =
        `fighter/${fighterName}/kirbycopy/c${baseEchoSlot}/bodymotion`;
      newDirInfosBase[`fighter/${fighterName}/kirbycopy/${slot}/cmn`] =
        `fighter/${fighterName}/kirbycopy/c${baseEchoSlot}/cmn`;
      newDirInfosBase[`fighter/${fighterName}/kirbycopy/${slot}/sound`] =
        `fighter/${fighterName}/kirbycopy/c${baseEchoSlot}/sound`;
      newDirInfosBase[`fighter/${fighterName}/${slot}/cmn`] =
        `fighter/${fighterName}/c${baseEchoSlot}/cmn`;
    }

    // Step 2: Process `share-to-vanilla` and `share-to-added`
    const fighterDirectories = this.fighterData.file_array || [];
    if (!fighterDirectories.length) {
      console.error(
        `No data found for fighter '${fighterName}' in fighterData.`,
      );
      return;
    }

    fighterDirectories.forEach((file) => {
      console.log(`Processing file: ${file}`);

      if (file.includes("dummy_fighter")) {
        return;
      }

      // Add to `share-to-vanilla`
      if (
        file.startsWith(`fighter/kirby/model/copy_${fighterName}_`) ||
        file.startsWith(`fighter/${fighterName}/model/`) ||
        file.startsWith(`sound/bank/fighter/se_${fighterName}_`) ||
        file.startsWith(`sound/bank/fighter_voice/vc_${fighterName}_`) ||
        (fighterName === "koopa" && file.startsWith(`fighter/koopag/model/`)) // Include 'koopag' model files for 'koopa'
      ) {
        const baseFile = file.replace(/c\d{2,3}/, "c00");
        const sharedFiles = [];

        for (let i = 0; i < numColorSlots; i++) {
          const slot = `c${(echoColorStart + i).toString().padStart(2, "0")}`;
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
        file.startsWith(`camera/fighter/${fighterName}/`) ||
        file.startsWith(`fighter/${fighterName}/motion/`)
      ) {
        const baseFile = file.replace(/c\d{2,3}/, "c00");
        const sharedFiles = [];

        for (let i = 0; i < numColorSlots; i++) {
          const slot = `c${(echoColorStart + i).toString().padStart(2, "0")}`;
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

    // Step 3: Populate `new-dir-files` using `share-to-vanilla` and `share-to-added`
    // Step 3: Populate `new-dir-files` using `share-to-vanilla`, `share-to-added`, and echo mod files
    const combinedShares = { ...shareToVanilla, ...shareToAdded };

    // Ensure all required directories exist in `newDirFiles` even if they are empty
    for (let i = 0; i < numColorSlots; i++) {
      const cValue = `c${(echoColorStart + i).toString().padStart(2, "0")}`;
      const requiredDirs = [
        `fighter/${fighterName}/camera/${cValue}`,
        `fighter/${fighterName}/kirbycopy/${cValue}`,
        `fighter/${fighterName}/movie/${cValue}`,
        `fighter/${fighterName}/result/${cValue}`,
        `fighter/${fighterName}/${cValue}`,
      ];

      requiredDirs.forEach((dir) => {
        if (!newDirFiles[dir]) {
          newDirFiles[dir] = []; // Initialize empty array for the directory
        }
      });
    }

    // Process files from combined shares and add them to the appropriate directories
    Object.entries(combinedShares).forEach(([, sharedFiles]) => {
      (sharedFiles as any).forEach((file) => {
        const match = file.match(/c\d{2,3}/); // Extract the 'c' value (e.g., 'c48')
        if (!match) return; // Skip files without a 'c' value

        const cValue = match[0]; // e.g., 'c48'
        let dirPath = "";

        // Determine the directory based on the file type
        if (file.startsWith(`camera/fighter/${fighterName}/`)) {
          dirPath = `fighter/${fighterName}/camera/${cValue}`;
        } else if (
          file.startsWith(`fighter/kirby/model/copy_${fighterName}_`) ||
          file.startsWith(`fighter/kirby/motion/copy_${fighterName}_`)
        ) {
          dirPath = `fighter/${fighterName}/kirbycopy/${cValue}`;
        } else if (file.startsWith(`fighter/${fighterName}/movie/`)) {
          dirPath = `fighter/${fighterName}/movie/${cValue}`;
        } else if (file.startsWith(`fighter/${fighterName}/result/`)) {
          dirPath = `fighter/${fighterName}/result/${cValue}`;
        } else if (
          file.startsWith(`fighter/${fighterName}/model/`) ||
          file.startsWith(`fighter/${fighterName}/motion/`) ||
          file.startsWith(`fighter/${fighterName}/sound/`) ||
          file.startsWith(`fighter/${fighterName}/effect/`) ||
          file.startsWith(`sound/bank/fighter_voice/vc_${fighterName}`) ||
          file.startsWith(`sound/bank/fighter/se_${fighterName}`)
        ) {
          dirPath = `fighter/${fighterName}/${cValue}`;
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
      });
    });

    // // Process echo mod files and add them to `new-dir-files`
    // const echoDirs = [
    //   "camera",
    //   "kirbycopy",
    //   "movie",
    //   "result",
    //   "model",
    //   "motion",
    //   "sound",
    //   "effect",
    // ];

    // echoDirs.forEach((dir) => {
    //   const echoPath = path.join(modDir, "fighter", fighterName, dir);
    //   if (fs.existsSync(echoPath)) {
    //     const echoFiles = findFighterFiles(echoPath); // Use the helper function to collect all files
    //     echoFiles.forEach((file) => {
    //       const relativePath = file.replace(modDir, "").replace(/\\/g, "/");
    //       const match = relativePath.match(/c\d{2,3}/); // Extract the 'c' value
    //       if (match) {
    //         const cValue = match[0];
    //         let dirPath = "";
    //
    //         // Determine the directory based on the file type
    //         if (relativePath.startsWith(`camera/fighter/${fighterName}/`)) {
    //           dirPath = `fighter/${fighterName}/camera/${cValue}`;
    //         } else if (
    //           relativePath.startsWith(
    //             `fighter/kirby/model/copy_${fighterName}_`,
    //           )
    //         ) {
    //           dirPath = `fighter/${fighterName}/kirbycopy/${cValue}`;
    //         } else if (
    //           relativePath.startsWith(`fighter/${fighterName}/movie/`)
    //         ) {
    //           dirPath = `fighter/${fighterName}/movie/${cValue}`;
    //         } else if (
    //           relativePath.startsWith(`fighter/${fighterName}/result/`)
    //         ) {
    //           dirPath = `fighter/${fighterName}/result/${cValue}`;
    //         } else if (
    //           relativePath.startsWith(`fighter/${fighterName}/model/`) ||
    //           relativePath.startsWith(`fighter/${fighterName}/motion/`) ||
    //           relativePath.startsWith(`fighter/${fighterName}/sound/`) ||
    //           relativePath.startsWith(`fighter/${fighterName}/effect/`)
    //         ) {
    //           dirPath = `fighter/${fighterName}/${cValue}`;
    //         }
    //
    //         // Add the file to the appropriate directory in `newDirFiles`
    //         if (dirPath) {
    //           if (!newDirFiles[dirPath]) {
    //             newDirFiles[dirPath] = [];
    //           }
    //           if (!newDirFiles[dirPath].includes(relativePath)) {
    //             newDirFiles[dirPath].push(relativePath);
    //           }
    //         }
    //       }
    //     });
    //   }
    // });

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

    // // Step 7: Save the resulting configuration to a JSON file
    // const configPath = path.join(outDir, "config.json");
    // fs.writeFileSync(
    //   configPath,
    //   JSON.stringify(this.resultingConfig, null, 2),
    //   "utf-8",
    // );
    // console.log(`Configuration saved to ${configPath}`);
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

// export function main(
//   modDirectory,
//   hashesFile,
//   fighterName,
//   currentAlt,
//   targetAlt,
//   shareSlot,
//   outDir,
//   echoColorStart,
//   numColorSlots,
//   baseEchoSlot,
// ) {
//   if (outDir && !fs.existsSync(outDir)) {
//     fs.mkdirSync(outDir, { recursive: true });
//   }
//   console.log("Starting reslotFighterFiles...");
//   reslotFighterFiles(
//     modDirectory,
//     currentAlt,
//     targetAlt,
//     shareSlot,
//     outDir,
//     fighterName,
//     echoColorStart,
//     numColorSlots,
//     baseEchoSlot,
//   );
//
//   console.log("Resulting Config:", this.resultingConfig);
// }
