import fs from "fs";
import path from "path";
import fse from "fs-extra";
import readline from "readline";

function usage() {
  console.log(
    "usage: node reslotter.js <mod_directory> <hashes_file> <fighter_name> <current_alt> <target_alt> <share_slot> <out_directory>",
  );
  process.exit(2);
}

function makeDirsFromFile(filePath) {
  const dirName = path.dirname(filePath);
  fse.ensureDirSync(dirName);
}

function fixWindowsPath(filePath, toLinux) {
  return toLinux
    ? filePath.replace(/\\/g, "/")
    : filePath.replace(/\//g, path.sep);
}

function findFighterFiles(filesDirectory) {
  const allFiles = [];
  const stack = [filesDirectory]; // Start with the root directory

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current);

    for (const entry of entries) {
      const entryPath = path.join(current, entry);
      if (fs.lstatSync(entryPath).isDirectory()) {
        stack.push(entryPath); // Add subdirectory to the stack
      } else {
        const relativePath = fixWindowsPath(entryPath, true).replace(
          fixWindowsPath(filesDirectory, true) + "/",
          "",
        );
        allFiles.push(relativePath); // Add file to the list
      }
    }
  }

  return allFiles;
}

export function init(hashesFile, modDirectory, newConfig, fighterName) {
  const filesDirectory = path.join(__dirname, "..", "..", "Files"); // Path to the 'Files' directory

  // Load vanilla.json
  const vanillaJsonPath = path.join(filesDirectory, "vanilla.json");
  if (fs.existsSync(vanillaJsonPath)) {
    globalThis.vanillaData = JSON.parse(
      fs.readFileSync(vanillaJsonPath, "utf-8"),
    );
    console.log(
      "Loaded vanilla.json. Keys:",
      Object.keys(globalThis.vanillaData),
    );

    // Search for any portion with the original fighter name
    globalThis.fighterData = {};

    // Check within 'file_array' for entries related to the fighter
    if (Array.isArray(globalThis.vanillaData.file_array)) {
      globalThis.fighterData.file_array =
        globalThis.vanillaData.file_array.filter((file) =>
          file.toLowerCase().includes(fighterName.toLowerCase()),
        );
    }

    // Check within 'dirs' for entries related to the fighter
    if (Array.isArray(globalThis.vanillaData.dirs)) {
      globalThis.fighterData.dirs = globalThis.vanillaData.dirs.filter((dir) =>
        dir.toLowerCase().includes(fighterName.toLowerCase()),
      );
    }

    if (
      (!globalThis.fighterData.file_array ||
        globalThis.fighterData.file_array.length === 0) &&
      (!globalThis.fighterData.dirs || globalThis.fighterData.dirs.length === 0)
    ) {
      console.warn(
        `No data found for fighter '${fighterName}' in vanilla.json. Available keys:`,
        Object.keys(globalThis.vanillaData),
      );
      throw new Error(
        `No data found for fighter '${fighterName}' in vanilla.json`,
      );
    }

    console.log(
      `Filtered data for fighter '${fighterName}':`,
      globalThis.fighterData,
    );
  } else {
    throw new Error(`vanilla.json not found in ${filesDirectory}`);
  }

  // Initialize the resulting configuration
  globalThis.resultingConfig = {
    "new-dir-infos": [],
    "new-dir-infos-base": {},
    "share-to-vanilla": {},
    "share-to-added": {},
    "new-dir-files": {},
  };

  console.log("Initialized resultingConfig:", globalThis.resultingConfig);

  // Load known files from Hashes_all.txt
  globalThis.knownFiles = new Set(
    fs
      .readFileSync(hashesFile, "utf-8")
      .split("\n")
      .map((x) => x.trim()),
  );

  // Load dir_info_with_files_trimmed.json
  const dirInfoPath = path.join(
    filesDirectory,
    "dir_info_with_files_trimmed.json",
  );
  if (!fs.existsSync(dirInfoPath)) {
    throw new Error(`File not found: ${dirInfoPath}`);
  }
  const dirInfo = JSON.parse(fs.readFileSync(dirInfoPath, "utf-8"));
  globalThis.dirsData = dirInfo.dirs;
  globalThis.fileArray = dirInfo.file_array;
}

export function reslotFighterFiles(
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
  const fighterDirectories = globalThis.fighterData.file_array || [];
  if (!fighterDirectories.length) {
    console.error(`No data found for fighter '${fighterName}' in fighterData.`);
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
  Object.entries(combinedShares).forEach(([baseFile, sharedFiles]) => {
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

  // Process echo mod files and add them to `new-dir-files`
  const echoDirs = [
    "camera",
    "kirbycopy",
    "movie",
    "result",
    "model",
    "motion",
    "sound",
    "effect",
  ];
  echoDirs.forEach((dir) => {
    const echoPath = path.join(modDir, "fighter", fighterName, dir);
    if (fs.existsSync(echoPath)) {
      const echoFiles = findFighterFiles(echoPath); // Use the helper function to collect all files
      echoFiles.forEach((file) => {
        const relativePath = file.replace(modDir, "").replace(/\\/g, "/");
        const match = relativePath.match(/c\d{2,3}/); // Extract the 'c' value
        if (match) {
          const cValue = match[0];
          let dirPath = "";

          // Determine the directory based on the file type
          if (relativePath.startsWith(`camera/fighter/${fighterName}/`)) {
            dirPath = `fighter/${fighterName}/camera/${cValue}`;
          } else if (
            relativePath.startsWith(`fighter/kirby/model/copy_${fighterName}_`)
          ) {
            dirPath = `fighter/${fighterName}/kirbycopy/${cValue}`;
          } else if (relativePath.startsWith(`fighter/${fighterName}/movie/`)) {
            dirPath = `fighter/${fighterName}/movie/${cValue}`;
          } else if (
            relativePath.startsWith(`fighter/${fighterName}/result/`)
          ) {
            dirPath = `fighter/${fighterName}/result/${cValue}`;
          } else if (
            relativePath.startsWith(`fighter/${fighterName}/model/`) ||
            relativePath.startsWith(`fighter/${fighterName}/motion/`) ||
            relativePath.startsWith(`fighter/${fighterName}/sound/`) ||
            relativePath.startsWith(`fighter/${fighterName}/effect/`)
          ) {
            dirPath = `fighter/${fighterName}/${cValue}`;
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
  });

  // Step 4: Sort `new-dir-files` by directory keys and file names
  const sortedNewDirFiles = {};
  Object.keys(newDirFiles)
    .sort() // Sort directory keys alphabetically
    .forEach((dir) => {
      sortedNewDirFiles[dir] = newDirFiles[dir].sort(); // Sort file names within each directory
    });

  // Update the global resulting configuration
  globalThis.resultingConfig["new-dir-files"] = sortedNewDirFiles;

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
  globalThis.resultingConfig["new-dir-infos"] = newDirInfos;
  globalThis.resultingConfig["new-dir-infos-base"] = newDirInfosBase;
  globalThis.resultingConfig["share-to-vanilla"] = sortedShareToVanilla;
  globalThis.resultingConfig["share-to-added"] = sortedShareToAdded;
  globalThis.resultingConfig["new-dir-files"] = sortedNewDirFiles;

  console.log("Generated new-dir-infos:", newDirInfos);
  console.log("Generated new-dir-infos-base:", newDirInfosBase);
  console.log("Generated share-to-vanilla (sorted):", sortedShareToVanilla);
  console.log("Generated share-to-added (sorted):", sortedShareToAdded);
  console.log("Generated new-dir-files (sorted):", sortedNewDirFiles);

  // Step 7: Save the resulting configuration to a JSON file
  const configPath = path.join(outDir, "config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify(globalThis.resultingConfig, null, 2),
    "utf-8",
  );
  console.log(`Configuration saved to ${configPath}`);
}

export function main(
  modDirectory,
  hashesFile,
  fighterName,
  currentAlt,
  targetAlt,
  shareSlot,
  outDir,
  echoColorStart,
  numColorSlots,
  baseEchoSlot,
) {
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  console.log("Starting reslotFighterFiles...");
  reslotFighterFiles(
    modDirectory,
    currentAlt,
    targetAlt,
    shareSlot,
    outDir,
    fighterName,
    echoColorStart,
    numColorSlots,
    baseEchoSlot,
  );

  console.log("Resulting Config:", globalThis.resultingConfig);
}
