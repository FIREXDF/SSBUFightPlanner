module.exports = {
    init,
    reslotFighterFiles,
    main,
};

const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const readline = require('readline');

function usage() {
  console.log("usage: node reslotter.js <mod_directory> <hashes_file> <fighter_name> <current_alt> <target_alt> <share_slot> <out_directory>");
  process.exit(2);
}

function makeDirsFromFile(filePath) {
  const dirName = path.dirname(filePath);
  fse.ensureDirSync(dirName);
}

function fixWindowsPath(filePath, toLinux) {
  return toLinux ? filePath.replace(/\\/g, '/') : filePath.replace(/\//g, path.sep);
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
        const relativePath = fixWindowsPath(entryPath, true).replace(fixWindowsPath(filesDirectory, true) + '/', '');
        allFiles.push(relativePath); // Add file to the list
      }
    }
  }

  return allFiles;
}
function init(hashesFile, modDirectory, newConfig, fighterName) {
  const filesDirectory = path.join(__dirname, '..', '..', 'Files'); // Path to the 'Files' directory

  // Load vanilla.json
  const vanillaJsonPath = path.join(filesDirectory, 'vanilla.json');
  if (fs.existsSync(vanillaJsonPath)) {
      globalThis.vanillaData = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf-8'));
      console.log("Loaded vanilla.json. Keys:", Object.keys(globalThis.vanillaData));

      // Search for any portion with the original fighter name
      globalThis.fighterData = {};

      // Check within 'file_array' for entries related to the fighter
      if (Array.isArray(globalThis.vanillaData.file_array)) {
          globalThis.fighterData.file_array = globalThis.vanillaData.file_array.filter(file =>
              file.toLowerCase().includes(fighterName.toLowerCase())
          );
      }

      // Check within 'dirs' for entries related to the fighter
      if (Array.isArray(globalThis.vanillaData.dirs)) {
          globalThis.fighterData.dirs = globalThis.vanillaData.dirs.filter(dir =>
              dir.toLowerCase().includes(fighterName.toLowerCase())
          );
      }

      if (
          (!globalThis.fighterData.file_array || globalThis.fighterData.file_array.length === 0) &&
          (!globalThis.fighterData.dirs || globalThis.fighterData.dirs.length === 0)
      ) {
          console.warn(
              `No data found for fighter '${fighterName}' in vanilla.json. Available keys:`,
              Object.keys(globalThis.vanillaData)
          );
          throw new Error(`No data found for fighter '${fighterName}' in vanilla.json`);
      }

      console.log(`Filtered data for fighter '${fighterName}':`, globalThis.fighterData);
  } else {
      throw new Error(`vanilla.json not found in ${filesDirectory}`);
  }

  // Initialize the resulting configuration
  globalThis.resultingConfig = {
      "new-dir-infos": [],
      "new-dir-infos-base": {},
      "share-to-vanilla": {},
      "share-to-added": {},
      "new-dir-files": {}
  };

  console.log("Initialized resultingConfig:", globalThis.resultingConfig);

  // Load known files from Hashes_all.txt
  globalThis.knownFiles = new Set(fs.readFileSync(hashesFile, 'utf-8').split('\n').map(x => x.trim()));

  // Load dir_info_with_files_trimmed.json
  const dirInfoPath = path.join(filesDirectory, 'dir_info_with_files_trimmed.json');
  if (!fs.existsSync(dirInfoPath)) {
      throw new Error(`File not found: ${dirInfoPath}`);
  }
  const dirInfo = JSON.parse(fs.readFileSync(dirInfoPath, 'utf-8'));
  globalThis.dirsData = dirInfo.dirs;
  globalThis.fileArray = dirInfo.file_array;
}

function reslotFighterFiles(modDir, currentAlt, targetAlt, shareSlot, outDir, fighterName, echoColorStart, numColorSlots) {
  const newDirInfos = [];
  const newDirInfosBase = {};
  const shareToVanilla = {};
  const shareToAdded = {};
  const newDirFiles = {};

  // Generate `new-dir-infos` dynamically
  for (let i = 0; i < numColorSlots; i++) {
    const slot = `c${(echoColorStart + i).toString()}`;
    console.log(`Generating slot: ${slot}`);

    newDirInfos.push(`fighter/${fighterName}/${slot}`);
    newDirInfos.push(`fighter/${fighterName}/camera/${slot}`);
    newDirInfos.push(`fighter/${fighterName}/kirbycopy/${slot}`);
    newDirInfos.push(`fighter/${fighterName}/movie/${slot}`);
    newDirInfos.push(`fighter/${fighterName}/result/${slot}`);

    newDirInfosBase[`fighter/${fighterName}/${slot}/camera`] = `fighter/${fighterName}/c00/camera`;
    newDirInfosBase[`fighter/${fighterName}/kirbycopy/${slot}/bodymotion`] = `fighter/${fighterName}/kirbycopy/c00/bodymotion`;
    newDirInfosBase[`fighter/${fighterName}/kirbycopy/${slot}/cmn`] = `fighter/${fighterName}/kirbycopy/c00/cmn`;
    newDirInfosBase[`fighter/${fighterName}/kirbycopy/${slot}/sound`] = `fighter/${fighterName}/kirbycopy/c00/sound`;
    newDirInfosBase[`fighter/${fighterName}/${slot}/cmn`] = `fighter/${fighterName}/c00/cmn`;
  }

  // Parse data for the original fighter and generate `share-to-vanilla`
  if (globalThis.fighterData && globalThis.fighterData.file_array) {
    globalThis.fighterData.file_array.forEach((file) => {
      const baseFile = file.replace(/c\d{2,3}/, 'c00'); // Replace any 'cXX' or 'cXXX' with 'c00'
      const sharedFiles = [];

      for (let i = 0; i < numColorSlots; i++) {
        const slot = `c${(echoColorStart + i).toString()}`;
        sharedFiles.push(file.replace(/c\d{2,3}/, slot)); // Replace 'cXX' or 'cXXX' with the new slot
      }

      shareToVanilla[baseFile] = sharedFiles;
    });
  }

  // Update the global resulting configuration
  globalThis.resultingConfig["new-dir-infos"] = newDirInfos;
  globalThis.resultingConfig["new-dir-infos-base"] = newDirInfosBase;
  globalThis.resultingConfig["share-to-vanilla"] = shareToVanilla;

  console.log("Generated new-dir-infos:", newDirInfos);
  console.log("Generated new-dir-infos-base:", newDirInfosBase);
  console.log("Generated share-to-vanilla:", shareToVanilla);

  // Save the resulting configuration to a JSON file
  const configPath = path.join(outDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(globalThis.resultingConfig, null, 2), 'utf-8');
  console.log(`Configuration saved to ${configPath}`);
}

function main(modDirectory, hashesFile, fighterName, currentAlt, targetAlt, shareSlot, outDir, echoColorStart, numColorSlots) {
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  console.log("Starting reslotFighterFiles...");
  reslotFighterFiles(modDirectory, currentAlt, targetAlt, shareSlot, outDir, fighterName, echoColorStart, numColorSlots);

  console.log("Resulting Config:", globalThis.resultingConfig);
}