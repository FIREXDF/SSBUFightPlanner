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

function findFighterFiles(modDirectory) {
  const allFiles = [];
  const folders = fs.readdirSync(modDirectory);

  for (const folder of folders) {
    const fullPath = path.join(modDirectory, folder);
    if (fs.lstatSync(fullPath).isDirectory()) {
      const stack = [fullPath];
      while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current);
        for (const entry of entries) {
          const entryPath = path.join(current, entry);
          if (fs.lstatSync(entryPath).isDirectory()) {
            stack.push(entryPath);
          } else {
            const relativePath = fixWindowsPath(entryPath, true).replace(fixWindowsPath(modDirectory, true) + '/', '');
            allFiles.push(relativePath);
          }
        }
      }
    }
  }

  return allFiles;
}

function init(hashesFile, modDirectory, newConfig) {
  globalThis.fighterFiles = findFighterFiles(modDirectory);

  globalThis.existingConfig = {
      "new-dir-infos": [],
      "new-dir-infos-base": {},
      "share-to-vanilla": {},
      "share-to-added": {},
      "new-dir-files": {}
  };

  if (!newConfig) {
      const configPath = path.join(modDirectory, 'config.json');
      if (fs.existsSync(configPath)) {
          existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
  }

  globalThis.resultingConfig = existingConfig;
  globalThis.existingFiles = [];
  globalThis.knownFiles = new Set(fs.readFileSync(hashesFile, 'utf-8').split('\n').map(x => x.trim()));

  const dirInfoPath = path.join(__dirname, '..', '..', 'Files', 'dir_info_with_files_trimmed.json');
  if (!fs.existsSync(dirInfoPath)) {
      throw new Error(`File not found: ${dirInfoPath}`);
  }
  const dirInfo = JSON.parse(fs.readFileSync(dirInfoPath, 'utf-8'));
  globalThis.dirsData = dirInfo.dirs;
  globalThis.fileArray = dirInfo.file_array;
}

function reslotFighterFiles(modDir, fighterFiles, currentAlt, targetAlt, shareSlot, outDir, fighterName) {
  const reslottedFiles = [];

  for (const file of fighterFiles) {
    if (!file.includes(currentAlt.replace(/^c/, ''))) continue;

    let newFile = null;
    let shouldCopy = true;

    if (file.startsWith(`fighter/${fighterName}`)) {
      if (!file.includes(`/${currentAlt}/`)) continue;
      newFile = file.replace(`/${currentAlt}/`, `/${targetAlt}/`);
    } else if (file.startsWith('ui/replace/chara') || file.startsWith('ui/replace_patch/chara')) {
      const lookFor = `${currentAlt.replace(/^c/, '')}.bntx`;
      const replaceWith = `${targetAlt.replace(/^c/, '')}.bntx`;
      newFile = file.replace(lookFor, replaceWith);

      const fighterKeys =
        fighterName === 'popo' || fighterName === 'nana' ? ['ice_climber'] :
        fighterName === 'eflame' ? ['eflame_first', 'eflame_only'] :
        fighterName === 'elight' ? ['elight_first', 'elight_only'] :
        [fighterName];

      if (!fighterKeys.some(key => newFile.includes(`_${key}_`))) {
        newFile = null;
        shouldCopy = false;
      }
    } else if (file.startsWith(`sound/bank/fighter/se_${fighterName}`) || file.startsWith(`sound/bank/fighter_voice/vc_${fighterName}`)) {
      newFile = file.replace(`_${currentAlt}`, `_${targetAlt}`);
    } else if (file.startsWith(`effect/fighter/${fighterName}`)) {
      newFile = file.replace(currentAlt.replace(/^c/, ''), targetAlt.replace(/^c/, ''));
    }

    if (newFile && outDir && shouldCopy) {
      const outPath = path.join(outDir, newFile);
      makeDirsFromFile(outPath);
      fse.copySync(path.join(modDir, file), outPath);
    }

    if (newFile) reslottedFiles.push(newFile);
  }

  existingFiles.push(...reslottedFiles);
  // Additional logic to add slots and generate config skipped for brevity
  return [reslottedFiles, fighterFiles];
}

function main(modDirectory, hashesFile, fighterName, currentAlt, targetAlt, shareSlot, outDir) {
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const [reslottedFiles, newFighterFiles] = reslotFighterFiles(modDirectory, fighterFiles, currentAlt, targetAlt, shareSlot, outDir, fighterName);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 7) {
    usage();
  } else {
    const [modDir, hashesFile, fighterName, currentAlt, targetAlt, shareSlot, outDir] = args;
    init(hashesFile, modDir, false);
    main(modDir, hashesFile, fighterName, currentAlt, targetAlt, shareSlot, outDir);
  }
}