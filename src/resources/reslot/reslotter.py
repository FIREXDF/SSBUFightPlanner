# Merged terminal-only reslotter
# Combines core logic from:
# - reslotternoGUI.py (file reslotting + config.json generation)
# - withgui.py (folder scanning, PRCXML creation, UI rename, sharing rules)
#
# Requirements:
# - Hashes_all.txt (same as GUI)
# - dir_info_with_files_trimmed.json (same as no-GUI)
#
# Usage examples:
#   Scan fighters and slots:
#     python merged.py scan --mod-dir "C:\mods\my_mod"
#   Reslot (copy to new folder, exclude blanks):
#     python merged.py reslot --mod-dir "C:\mods\my_mod" --hashes "Hashes_all.txt" --fighter mario \
#       --map c00=c02 --map c01=c03 --share c00=c00 --share c01=c01 --clone --exclude-blanks
#   Reconfig only (no file copy, identity mapping for existing slots):
#     python merged.py reslot --mod-dir "C:\mods\my_mod" --hashes "Hashes_all.txt" --fighter mario --only-config
#   Rename CSS fighter id/images and write PRCXML (set max colors):
#     python merged.py reslot --mod-dir "C:\mods\my_mod" --hashes "Hashes_all.txt" --fighter sonic \
#       --map c00=c10 --share c00=c00 --redirect-name knuckles --redirect-start 0 --prcxml-colors 12
#
import os
import sys
import re
import json
import shutil
import argparse
import xml.etree.ElementTree as ET

# --------------------------
# Legacy usage (match reslotternoGUI.py)
# --------------------------
def usage():
    print("usage: python merged.py <mod_directory> <hashes_file> <fighter_name> <current_alt> <target_alt> <share_slot> <out_directory>")
    sys.exit(2)

# --------------------------
# Shared helpers (from no-GUI)
# --------------------------
def makeDirsFromFile(path):
    dirName = os.path.dirname(path)
    try:
        os.makedirs(dirName)
    except:
        pass

def fix_windows_path(path: str, to_linux: bool):
    if to_linux:
        return path.replace("\\", "/")
    else:
        return path.replace("/", os.sep)

def find_fighter_files(mod_directory):
    all_files = []
    for folders in os.listdir(mod_directory):
        full_path = os.path.join(mod_directory, folders)
        if os.path.isdir(full_path):
            for root, dirs, files in os.walk(full_path):
                if len(files) != 0:
                    for file in files:
                        full_file_path = os.path.join(root, file)
                        toAppend = fix_windows_path(full_file_path, True).replace(mod_directory.replace("\\","/")+"/","")
                        all_files.append(toAppend)
    return all_files

# Globals used by core reslot logic (kept to match original behavior)
dirs_data = None
file_array = None
existing_files = []
existing_config = {}
resulting_config = {}
fighter_files = []
known_files = set()

def reslot_fighter_files(mod_directory, _fighter_files, current_alt, target_alt, share_slot, out_dir, fighter_name):
    reslotted_files = []

    if out_dir != "":
        for file in _fighter_files:
            if (not current_alt.strip('c') in file):
                continue

            lookfor = ""
            replace = ""
            new_file = ""

            if file.startswith("ui/replace/chara") or file.startswith("ui/replace_patch/chara"):
                lookfor = f"{current_alt.strip('c')}.bntx"
                replace = f"{target_alt.strip('c')}.bntx"
                new_file = file.replace(lookfor, replace)

                fighter_keys = [fighter_name]
                if (fighter_name=="popo" or fighter_name=="nana"):
                    fighter_keys = ["ice_climber"]
                elif (fighter_name=="eflame"):
                    fighter_keys = ["eflame_first","eflame_only"]
                elif (fighter_name=="elight"):
                    fighter_keys = ["elight_first","elight_only"]

                for key in fighter_keys:
                    if new_file.__contains__("_" + key + "_") and out_dir != "":
                        makeDirsFromFile(os.path.join(out_dir, new_file))
                        shutil.copy(os.path.join(mod_directory, file), os.path.join(out_dir, new_file))
                continue

            if file.startswith(f"fighter/{fighter_name}"):
                if (not "/"+current_alt+"/" in file):
                    continue
                lookfor = f"/{current_alt}/"
                replace = f"/{target_alt}/"
                new_file = file.replace(lookfor, replace)
            elif file.startswith(f"sound/bank/fighter/se_{fighter_name}") or file.startswith(f"sound/bank/fighter_voice/vc_{fighter_name}"):
                lookfor = f"_{current_alt}"
                replace = f"_{target_alt}"
                new_file = file.replace(lookfor, replace)
            elif file.startswith(f"effect/fighter/{fighter_name}"):
                lookfor = f"{current_alt.strip('c')}"
                replace = f"{target_alt.strip('c')}"
                new_file = file.replace(lookfor, replace)
            else:
                continue

            makeDirsFromFile(os.path.join(out_dir, new_file))
            shutil.copy(os.path.join(mod_directory, file), os.path.join(out_dir, new_file))

            reslotted_files.append(new_file)

    existing_files.extend(reslotted_files)
    if 7 < int(target_alt.strip("c")):
        current_alt_int = int(current_alt.strip("c"))
        share_alt_int = int(share_slot.strip("c")) % 8
        if current_alt_int <= 7:
            add_new_slot(f"fighter/{fighter_name}", current_alt, target_alt,"c0"+str(share_alt_int))
            add_missing_files(reslotted_files, fighter_name, target_alt,True)
        else:
            current_alt_int = int(target_alt.strip("c")) % 8
            add_new_slot(f"fighter/{fighter_name}", f"c0{current_alt_int}", target_alt,"c0"+str(share_alt_int))
            add_missing_files(reslotted_files, fighter_name, target_alt,True)
    else:
        add_missing_files(reslotted_files, fighter_name, target_alt)

    return reslotted_files, _fighter_files

def add_missing_files(reslotted_files, fighter_name, target_alt, is_new_slot=False):
    new_dir_info = f"fighter/{fighter_name}/{target_alt}"
    if new_dir_info not in resulting_config["new-dir-files"]:
        resulting_config["new-dir-files"][new_dir_info] = []

    camera_dir_info = f"fighter/{fighter_name}/{target_alt}/camera"
    if camera_dir_info not in resulting_config["new-dir-files"]:
        resulting_config["new-dir-files"][camera_dir_info] = []

    transplant_dir_info = f"fighter/{fighter_name}/cmn"
    if transplant_dir_info not in resulting_config["new-dir-files"]:
        resulting_config["new-dir-files"][transplant_dir_info] = []

    old_camera_dir = f"fighter/{fighter_name}/camera/{target_alt}"
    if old_camera_dir in resulting_config["new-dir-files"]:
        del resulting_config["new-dir-files"][old_camera_dir]

    custom_extensions = [
        '.nuanmb', '.marker', '.bin', '.tonelabel', '.numatb', '.numdlb', '.nutexb',
        '.numshb', '.numshexb', '.nus3audio', '.nus3bank', '.nuhlpb', '.numdlb', '.xmb', '.kime', '.eff'
    ]
    custom_files = []
    camera_files = []
    transplant_files = []
    effect_files = []

    for file in fighter_files:
        transplant_path = f"effect/fighter/{fighter_name}/transplant/"
        if transplant_path in file:
            if file not in transplant_files:
                transplant_files.append(file)
            continue

        effect_path = f"effect/fighter/{fighter_name}/ef_{fighter_name}_{target_alt}"
        if effect_path in file:
            if file not in effect_files:
                effect_files.append(file)
            continue

        if f"/{target_alt}/" in file or file.endswith(f"/{target_alt}"):
            if file.startswith(f"camera/fighter/{fighter_name}/{target_alt}/"):
                if file.endswith('.nuanmb'):
                    camera_files.append(file)
                continue

            file_ext = os.path.splitext(file)[1].lower()
            is_custom = False
            if file_ext in custom_extensions:
                is_custom = True
            if file not in known_files:
                is_custom = True
            if any(marker in file.lower() for marker in ['body', 'face', 'hair', 'eye', 'brs_', 'bust_', 'hand_']):
                is_custom = True
            if is_custom:
                custom_files.append(file)

    for custom_file in custom_files:
        if custom_file not in resulting_config["new-dir-files"][new_dir_info]:
            resulting_config["new-dir-files"][new_dir_info].append(custom_file)

    for effect_file in effect_files:
        if effect_file not in resulting_config["new-dir-files"][new_dir_info]:
            resulting_config["new-dir-files"][new_dir_info].append(effect_file)

    for camera_file in camera_files:
        if camera_file not in resulting_config["new-dir-files"][camera_dir_info]:
            resulting_config["new-dir-files"][camera_dir_info].append(camera_file)

    for transplant_file in transplant_files:
        if transplant_file not in resulting_config["new-dir-files"][transplant_dir_info]:
            resulting_config["new-dir-files"][transplant_dir_info].append(transplant_file)

    for file in reslotted_files:
        if file.startswith(f"camera/fighter/{fighter_name}/{target_alt}/"):
            continue
        if f"effect/fighter/{fighter_name}/transplant/" in file:
            continue
        if (not is_new_slot and "effect" in file):
            continue
        if file not in known_files and file not in custom_files:
            if file in resulting_config["new-dir-files"][new_dir_info]:
                continue
            resulting_config["new-dir-files"][new_dir_info].append(file)

def add_new_slot(dir_info, source_slot, new_slot, share_slot):
    folders = dir_info.split("/")
    target_dir = dirs_data
    for folder in folders:
        target_dir = target_dir["directories"][folder]

    if source_slot in target_dir["directories"]:
        source_slot_dir = target_dir["directories"][source_slot]
        source_slot_path = "%s/%s" % ((dir_info, source_slot))
        new_slot_dir_path = "%s/%s" % ((dir_info, new_slot))
        share_slot_dir = target_dir["directories"][share_slot]
        share_slot_path = "%s/%s" % ((dir_info, share_slot))

        if (not new_slot_dir_path in resulting_config["new-dir-infos"]):
            resulting_config["new-dir-infos"].append(new_slot_dir_path)

        addFilesToDirInfo(new_slot_dir_path, share_slot_dir["files"], new_slot)
        addSharedFiles(share_slot_dir["files"], source_slot, new_slot,share_slot)

        for dir in source_slot_dir["directories"]:
            source_slot_base = f"{source_slot_path}/{dir}"
            new_slot_base = f"{new_slot_dir_path}/{dir}"
            share_slot_base = f"{share_slot_path}/{dir}"
            resulting_config["new-dir-infos-base"][new_slot_base] = share_slot_base

    for dir in target_dir["directories"]:
        target_obj = target_dir["directories"][dir]
        if source_slot in target_obj["directories"]:
            source_slot_dir = target_obj["directories"][source_slot]
            source_slot_path = f"{dir_info}/{dir}/{source_slot}"
            new_slot_dir_path = f"{dir_info}/{dir}/{new_slot}"
            share_slot_dir = target_obj["directories"][share_slot]
            share_slot_path = f"{dir_info}/{dir}/{share_slot}"

            if (not new_slot_dir_path in resulting_config["new-dir-infos"]):
                resulting_config["new-dir-infos"].append(new_slot_dir_path)

            addFilesToDirInfo(new_slot_dir_path, share_slot_dir["files"], new_slot)
            addSharedFiles(share_slot_dir["files"], source_slot, new_slot,share_slot)

            for child_dir in source_slot_dir["directories"]:
                source_slot_base = f"{source_slot_path}/{child_dir}"
                new_slot_base = f"{new_slot_dir_path}/{child_dir}"
                share_slot_base = f"{share_slot_path}/{child_dir}"
                resulting_config["new-dir-infos-base"][new_slot_base] = share_slot_base

def addFilesToDirInfo(dir_info, files, target_color):
    if dir_info not in resulting_config["new-dir-files"]:
        resulting_config["new-dir-files"][dir_info] = []
    for index in files:
        file_path = file_array[index]
        if file_path.startswith("0x"):
            continue
        new_file_path = re.sub(r"c0[0-9]", target_color, file_path, 1)
        if new_file_path in resulting_config["new-dir-files"][dir_info]:
            continue
        resulting_config["new-dir-files"][dir_info].append(new_file_path)

def IsShareableSound(sound_file):
    return True

def addSharedFiles(src_files, source_color, target_color, share_slot):
    used_files = []
    never_share_extensions = ['.nutexb']
    for index in src_files:
        file_path = file_array[index]
        if file_path.startswith("0x"):
            continue
        if file_path.replace(r"/c0[0-9]/", source_color) in used_files:
            continue
        used_files.append(file_path)

        new_file_path = re.sub(r"c0[0-9]", target_color, file_path, 1)
        if new_file_path in existing_files:
            continue

        file_ext = os.path.splitext(file_path)[1].lower()
        if file_ext in never_share_extensions:
            similar_files_exist = False
            dir_name = os.path.dirname(new_file_path)
            for existing_file in existing_files:
                if dir_name in existing_file:
                    similar_files_exist = True
                    break
            if similar_files_exist:
                continue

        share_to = "share-to-vanilla"
        if "motion/" in file_path or "camera/" in file_path:
            share_to = "share-to-added"
        elif "sound/bank/fighter" in file_path:
            share_to = "share-to-added"

        if file_path not in resulting_config[share_to]:
            resulting_config[share_to][file_path] = []
        if new_file_path not in resulting_config[share_to][file_path]:
            resulting_config[share_to][file_path].append(new_file_path)

def RecursiveRewrite(info,current_alt,target_alt):
    print(info.replace(current_alt,target_alt))
    return info.replace(current_alt,target_alt)

def core_init(hashes_file, mod_directory, newConfig):
    global dirs_data, file_array, existing_files, existing_config, resulting_config, fighter_files, known_files

    fighter_files = find_fighter_files(mod_directory)
    known_files = set(map(lambda x: x.strip(), open(hashes_file, 'r', encoding='utf-8', errors='ignore').readlines()))

    existing_config = {
        "new-dir-infos": [],
        "new-dir-infos-base": {},
        "share-to-vanilla": {},
        "new-dir-files": {},
        "share-to-added": {}
    }

    if (not newConfig):
        existing_config_file = os.path.join(mod_directory, "config.json")
        if (os.path.isfile(existing_config_file)):
            try:
                with open(existing_config_file, "r", encoding='utf-8') as f:
                    config = json.load(f)
                    if "new-dir-infos" in config:
                        existing_config["new-dir-infos"] = config["new-dir-infos"]
                    if "new-dir-infos-base" in config:
                        existing_config["new-dir-infos-base"] = config["new-dir-infos-base"]
                    if "share-to-vanilla" in config:
                        existing_config["share-to-vanilla"] = config["share-to-vanilla"]
                    if "new-dir-files" in config:
                        existing_config["new-dir-files"] = config["new-dir-files"]
                    if "share-to-added" in config:
                        existing_config["share-to-added"] = config["share-to-added"]
            except Exception as e:
                print(f"Warning: failed to load existing config.json: {e}")

    resulting_config = existing_config
    existing_files = fighter_files.copy()

    with open("dir_info_with_files_trimmed.json", "r", encoding='utf-8') as f:
        res = json.load(f)
        dirs_data = res["dirs"]
        file_array = res["file_array"]

def core_run(mod_directory, hashes_file, fighter_name, current_alt, target_alt, share_slot, out_dir):
    reslotted_files, _ = reslot_fighter_files(mod_directory, fighter_files, current_alt, target_alt, share_slot, out_dir, fighter_name)

    if f"fighter/{fighter_name}/cmn" in resulting_config["new-dir-files"]:
        transplant_effects = resulting_config["new-dir-files"].pop(f"fighter/{fighter_name}/cmn")
        ordered_new_dir_files = {}
        for key in resulting_config["new-dir-files"]:
            ordered_new_dir_files[key] = resulting_config["new-dir-files"][key]
        ordered_new_dir_files[f"fighter/{fighter_name}/cmn"] = transplant_effects
        resulting_config["new-dir-files"] = ordered_new_dir_files

# --------------------------
# Public API compatible with reslotternoGUI.py
# --------------------------
def init(hashes_file, mod_directory, newConfig):
    # mirror reslotternoGUI.init(...) behavior using merged core
    core_init(hashes_file, mod_directory, newConfig)

def main(mod_directory, hashes_file, fighter_name, current_alt, target_alt, share_slot, out_dir):
    # create out directory if needed (same behavior as reslotternoGUI.py)
    if (not os.path.exists(out_dir)) and out_dir != "":
        os.makedirs(out_dir, exist_ok=True)

    # run core reslot and config accumulation
    core_run(mod_directory, hashes_file, fighter_name, current_alt, target_alt, share_slot, out_dir)

    # order config sections like withgui
    ordered = ordered_config_dict(resulting_config)

    # copy extras if cloning to a new folder
    target_dir = out_dir if out_dir != "" else mod_directory
    for e in ["info.toml", "preview.webp"]:
        src = os.path.join(mod_directory, e)
        if out_dir != "" and os.path.isfile(src):
            try:
                shutil.copy(src, os.path.join(target_dir, e))
            except Exception:
                pass

    # write config.json to the target directory
    try:
        with open(os.path.join(target_dir, 'config.json'), 'w+', encoding='utf-8') as f:
            json.dump(ordered if ordered else resulting_config, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Warning: failed to write config.json: {e}")

# --------------------------
# CLI Orchestration
# --------------------------
def ordered_config_dict(cfg):
    ordered_config = {}
    sections = ["new-dir-infos", "new-dir-infos-base", "share-to-vanilla", "new-dir-files", "share-to-added"]
    for section in sections:
        if section in cfg:
            ordered_config[section] = cfg[section]
    if "new-dir-files" in ordered_config:
        for key in list(ordered_config["new-dir-files"].keys()):
            if "/camera/" in key and not key.endswith("/camera"):
                alt_key = key.replace("/camera/", "/") + "/camera"
                if alt_key in ordered_config["new-dir-files"]:
                    try:
                        del ordered_config["new-dir-files"][key]
                    except:
                        pass
    return ordered_config

def ensure_out_dir(path):
    try:
        os.makedirs(path, exist_ok=True)
    except:
        pass

# Helper functions (ported/adapted from withgui.py for CLI usage)
def IsValidSearch(searchDir):
    if (not os.path.isdir(searchDir)):
        return False
    whitelist = ["fighter","sound","ui"]
    subfolders = [f.path for f in os.scandir(searchDir) if f.is_dir()]
    for dirname in list(subfolders):
        for w in list(whitelist):
            folderName = os.path.basename(dirname)
            if (folderName.lower() == w.lower()):
                return True
    return False

def find_nth(haystack, needle, n):
    start = haystack.find(needle)
    while start >= 0 and n > 1:
        start = haystack.find(needle, start+len(needle))
        n -= 1
    return start

def GetSlotsFromFolder(folder):
    foundSlots = []
    if (not os.path.isdir(folder)):
        return foundSlots

    # find slots (immediate subdirectories of model/motion folders)
    modelfolders = [f.path for f in os.scandir(folder) if f.is_dir()]
    for m in modelfolders:
        slots = [f.path for f in os.scandir(m) if f.is_dir()]
        for s in slots:
            slot = os.path.basename(s)
            if not slot in foundSlots:
                foundSlots.append(slot)
    return foundSlots

def GetFightersFromFolders(folders, fighter=""):
    fighters = []
    slots = []
    for folder in folders:
        foldername = os.path.basename(folder)
        if (fighter != "" and foldername != fighter):
            continue
        if (foldername != "common"):
            fighters.append(foldername)
            # find slots from model and motion
            for s in GetSlotsFromFolder(os.path.join(folder, "model")):
                if s not in slots:
                    slots.append(s)
            for s in GetSlotsFromFolder(os.path.join(folder, "motion")):
                if s not in slots:
                    slots.append(s)
    return fighters, slots

def GetFightersFromFiles(folders, fighter=""):
    fighters = []
    slots = []
    for f in folders:
        base = os.path.basename(f)
        if (base == "replace" or base == "replace_patch"):
            # look under chara
            chara_dir = os.path.join(f, "chara")
            if os.path.isdir(chara_dir):
                fighterfolders = [os.path.join(chara_dir, d) for d in os.listdir(chara_dir) if os.path.isdir(os.path.join(chara_dir, d))]
                sub_fighters, sub_slots = GetFightersFromFiles(fighterfolders, fighter)
                for fi in sub_fighters:
                    if fi not in fighters:
                        fighters.append(fi)
                for si in sub_slots:
                    if si not in slots:
                        slots.append(si)
            continue

        for (dirpath, dirnames, filenames) in os.walk(f):
            for filename in filenames:
                # need last and second to last '_'
                unders = filename.count("_")
                if unders < 2:
                    continue
                firstUnder = find_nth(filename, "_", unders-1)
                secondUnder = find_nth(filename, "_", unders)
                if firstUnder == -1 or secondUnder == -1:
                    continue
                fightername = filename[firstUnder+1:secondUnder]
                # attempt to find slot id between secondUnder and '.'
                try:
                    slot = filename[secondUnder+1:filename.index('.')]
                except ValueError:
                    slot = filename[secondUnder+1:]
                if (not "c" in slot):
                    slot = "c" + slot

                if (fighter != "" and fightername != fighter):
                    continue
                if not fightername in fighters:
                    fighters.append(fightername)
                if not slot in slots:
                    slots.append(slot)

    return fighters, slots

def SetFighters(mod_dir, fighter=""):
    # returns (fighters_list, slots_list)
    fighters = []
    slots = []

    fighterFolder = os.path.join(mod_dir, "fighter")
    uiFolder = os.path.join(mod_dir, "ui")
    soundFolder = os.path.join(mod_dir, "sound", "bank")

    if (not os.path.isdir(fighterFolder)):
        # check ui
        if os.path.isdir(uiFolder):
            uifolders = [os.path.join(uiFolder, d) for d in os.listdir(uiFolder) if os.path.isdir(os.path.join(uiFolder, d))]
            fighters, slots = GetFightersFromFiles(uifolders, fighter)
        elif os.path.isdir(soundFolder):
            soundfolders = [os.path.join(soundFolder, d) for d in os.listdir(soundFolder) if os.path.isdir(os.path.join(soundFolder, d))]
            fighters, slots = GetFightersFromFiles(soundfolders, fighter)
        else:
            # no recognizable structure
            return [], []
    else:
        fighterfolders = [os.path.join(fighterFolder, d) for d in os.listdir(fighterFolder) if os.path.isdir(os.path.join(fighterFolder, d))]
        fighters, slots = GetFightersFromFolders(fighterfolders, fighter)

    if fighter == "":
        fighters.append("all")

    return fighters, slots

# Utility lists and functions for special-case fighters
Climber = ["popo", "nana"]
Trainer = ["ptrainer","ptrainer_low","pzenigame","pfushigisou","plizardon"]
Aegis = ["element","eflame","elight"]

def GetAssumedShareSlot(source, fighter):
    altsLast2 = ["edge","szerosuit","littlemac","mario","metaknight","jack"]
    altsOdd = ["bayonetta","master","cloud","kamui","ike","shizue","demon",
    "link","packun","reflet","wario","wiifit",
    "ptrainer","ptrainer_low","pfushigisou","plizardon","pzenigame"]
    altsAll = ["koopajr","murabito","purin","pikachu","pichu","sonic"]
    if fighter == "brave" or fighter == "trail":
        return source % 4
    elif fighter == "pikmin" or fighter == "popo" or fighter == "nana":
        return 0 if (source<4) else 4
    elif fighter == "pacman":
        return 0 if (source==0 or source==7) else source
    elif fighter == "ridley":
        return 0 if (source==1 or source==7) else source
    elif fighter == "inkling" or fighter=="pickel":
        return source%2 if source<6 else source
    elif fighter == "shulk":
        return 0 if source<7 else 7
    elif fighter in altsLast2:
        return 0 if source<6 else source
    elif fighter in altsAll:
        return source
    elif fighter in altsOdd:
        return source % 2
    else:
        return 0

def CreatePRCXML(fighter, targetDir, new_max_colors):
    # Minimal CLI-friendly variant of CreatePRCXML from withgui.py
    # new_max_colors: integer
    try:
        prcFile = "/ui_chara_db.prcxml"
        cwd = os.getcwd()
        src_prcxml = os.path.join(cwd, prcFile.lstrip('/'))
        src_txt = src_prcxml.replace('prcxml','txt')
        if (not os.path.isfile(src_prcxml) or not os.path.isfile(src_txt)):
            print("Missing ui_chara_db.prcxml or ui_chara_db.txt in program directory! Cannot create a prcxml")
            return

        prcLocation = os.path.join(targetDir, "ui", "param", "database")
        try:
            os.makedirs(prcLocation, exist_ok=True)
        except:
            pass

        target_path = os.path.join(prcLocation, "ui_chara_db.prcxml")

        # Read index list from txt
        with open(src_txt, 'r', encoding='utf-8', errors='replace') as indexFile:
            indexes = [line.rstrip() for line in indexFile.readlines()]

        targetIndexes = []
        if (fighter in Climber):
            targetIndexes = [17]
        elif (fighter in Trainer):
            targetIndexes = [38,39,40,41]
        elif (fighter in Aegis):
            targetIndexes = [114,115,116,117,118]
        else:
            for i in range(len(indexes)):
                if (fighter == indexes[i].lower()):
                    targetIndexes.append(i)

        if (len(targetIndexes)==0):
            print("prcxml error: could not find fighter index")
            return

        # Very small XML rewrite: copy and replace matching hash40 elements
        # We'll parse original prcxml and write a filtered copy setting color_num
        context = ET.iterparse(src_prcxml, events=('end',))
        out_root = None
        # write a fresh file with UTF-16 encoding header
        for event, elem in context:
            if elem.tag == 'hash40':
                index = elem.attrib.get('index')
                for targetIndex in targetIndexes:
                    if str(index) == str(targetIndex):
                        elem.text = ''
                        elem.tag = 'struct'
                        info = ET.SubElement(elem, 'byte')
                        info.set('hash', 'color_num')
                        info.text = str(new_max_colors)
        # Write out last element to file (compatible with original simplified behavior)
        with open(target_path, 'wb') as f:
            f.write(b"<?xml version=\"1.0\" encoding=\"UTF-16\"?>\n")
            # attempt to write the last parsed element
            try:
                f.write(ET.tostring(elem))
            except Exception:
                pass
        print("Created prcxml at", target_path)
    except Exception as e:
        print("CreatePRCXML error:", e)

def RenameUI(targetFolder, fighter_name, newname, startid=0):
    # CLI-friendly RenameUI: rename files in ui/replace and ui/replace_patch
    print("New CSS name:", newname)
    newid = int(startid or 0)
    folders = [os.path.join(targetFolder, 'ui', 'replace'), os.path.join(targetFolder, 'ui', 'replace_patch')]
    for folder in folders:
        if not os.path.isdir(folder):
            continue
        for (dirpath, dirnames, filenames) in os.walk(folder):
            for filename in filenames:
                fighter_keys = [fighter_name]
                if (fighter_name=="popo" or fighter_name=="nana"):
                    fighter_keys = ["ice_climber"]
                elif (fighter_name=="eflame"):
                    fighter_keys = ["eflame_first","eflame_only"]
                elif (fighter_name=="elight"):
                    fighter_keys = ["elight_first","elight_only"]

                for oldname in fighter_keys:
                    file = os.path.join(dirpath, filename)
                    newfilename = filename.replace("_"+oldname+"_", "_"+newname+"_")
                    if newname+"_" not in newfilename:
                        continue
                    try:
                        costumeslot = newfilename.index(newname+"_")
                        newfilename = newfilename[:costumeslot] + newname + "_" + "{:02d}".format(newid) + ".bntx"
                    except ValueError:
                        # fallback: append newid
                        base, ext = os.path.splitext(newfilename)
                        newfilename = f"{base}_{newid:02d}{ext}"
                    newfile = os.path.join(dirpath.replace("/ui/replace_patch","/ui/replace"), newfilename)
                    try:
                        os.makedirs(os.path.dirname(newfile), exist_ok=True)
                    except:
                        pass
                    try:
                        os.rename(file, newfile)
                    except Exception:
                        # if rename fails, attempt copy then remove
                        try:
                            shutil.copy(file, newfile)
                            os.remove(file)
                        except Exception:
                            pass
                newid = newid + 1

def parse_map_args(maps_list):
    # Accept "c00=c02" or "c00:c02"
    m = {}
    for item in maps_list or []:
        if "=" in item:
            k,v = item.split("=",1)
        elif ":" in item:
            k,v = item.split(":",1)
        else:
            raise ValueError(f"Invalid map '{item}', expected cXX=cYY")
        m[k.strip().replace("+","")] = v.strip().replace("+","")
    return m

def parse_share_args(shares_list):
    s = {}
    for item in shares_list or []:
        if "=" in item:
            k,v = item.split("=",1)
        elif ":" in item:
            k,v = item.split(":",1)
        else:
            raise ValueError(f"Invalid share '{item}', expected cXX=cYY")
        s[k.strip().replace("+","")] = v.strip().replace("+","")
    return s

def reslot_cli(args):
    mod_dir = os.path.abspath(args.mod_dir)
    hashes = os.path.abspath(args.hashes)
    if not os.path.isdir(mod_dir):
        print("Invalid --mod-dir")
        sys.exit(2)
    if not os.path.isfile(hashes):
        print("Invalid --hashes")
        sys.exit(2)
    if not IsValidSearch(mod_dir):
        print("The selected folder doesn't appear to be a valid mod. It must contain the 'fighter', 'sound', or 'ui' folders.")
        sys.exit(2)

    # Determine target directory behavior
    clone = args.clone and not args.only_config
    exclude_blanks = args.exclude_blanks and not args.only_config
    target_dir = mod_dir if args.only_config else (mod_dir + f" ({' '.join([v for v in (args.map or [])][:4]).replace('=',' ').strip()})" if clone else mod_dir+" (Temp)")
    ensure_out_dir(target_dir)

    # Fighters set (handle special groups)
    fighters = [args.fighter.lower()]
    if fighters[0] in Climber:
        fighters = Climber
    if fighters[0] in Trainer:
        fighters = Trainer
    if fighters[0] in Aegis:
        fighters = Aegis

    # Slot maps
    fighters_all, slots_in_mod = SetFighters(mod_dir, fighters[0] if fighters[0] != "all" else "")
    # Build identity map for only-config if not provided
    map_dict = parse_map_args(args.map) if args.map else {}
    share_dict = parse_share_args(args.share) if args.share else {}

    if args.only_config and not map_dict:
        # Identity mapping for each detected slot of this fighter
        # If "all", we iterate all fighters later
        pass
    elif not args.only_config and not map_dict:
        print("No --map provided. Use --map c00=c10 (repeatable) or --only-config.")
        sys.exit(2)

    # Warm up the core
    fresh_config = True
    if os.path.isfile(os.path.join(mod_dir,"config.json")) and not args.only_config:
        # Ask user? In CLI assume append unless --new-config provided
        fresh_config = args.new_config
    core_init(hashes, mod_dir, fresh_config)

    succeeded = False

    # Process "all" fighter or specific
    process_fighters = fighters_all if fighters[0] == "all" else fighters

    for fighter in process_fighters:
        if fighter == "all":
            continue

        # Determine slots for this fighter if only-config or "all"
        per_fighter_slots = []
        # Collect slots from fighter folders
        modelFolder = os.path.join(mod_dir,"fighter",fighter,"model")
        motionFolder = os.path.join(mod_dir,"fighter",fighter,"motion")
        if os.path.isdir(modelFolder):
            per_fighter_slots += GetSlotsFromFolder(modelFolder)
        if os.path.isdir(motionFolder):
            per_fighter_slots += GetSlotsFromFolder(motionFolder)
        per_fighter_slots = sorted(list(set(per_fighter_slots)))

        # Build maps list for this fighter
        pairs = []
        if args.only_config and not map_dict:
            # Identity maps on detected slots
            for s in per_fighter_slots:
                pairs.append((s, s))
        else:
            for k,v in map_dict.items():
                pairs.append((k, v))

        # Determine share slots for each source
        def share_for(src, tgt):
            key = src
            if key in share_dict:
                return share_dict[key]
            # default share logic for added slots (c>=8) or if target is added
            tgt_num = int(tgt.strip("c"))
            src_num = int(src.strip("c"))
            if tgt_num > 7:
                assumed = GetAssumedShareSlot(src_num % 8, fighter)
                return f"c0{assumed}"
            return "c00"  # default vanilla share

        for (source, target) in pairs:
            if (target == "" and exclude_blanks):
                continue
            outdirCall = "" if args.only_config else target_dir
            share = share_for(source, target if target else source)

            if args.only_config:
                print(f"[CONFIG] {fighter} {source}")
            else:
                print(f"[RESLOT] {fighter} {source} -> {target} (share {share})")

            try:
                core_run(mod_dir, hashes, fighter, source, target if not args.only_config else source, share, outdirCall)
                succeeded = True
            except Exception as e:
                print(f"Error: {fighter}/{source}: {e}")
                sys.exit(1)

    if succeeded:
        # Order and cleanup config
        ordered = ordered_config_dict(resulting_config)

        # Copy extras if cloning
        if not args.only_config:
            for e in ["info.toml","preview.webp"]:
                src = os.path.join(mod_dir, e)
                if os.path.isfile(src):
                    shutil.copy(src, os.path.join(target_dir, e))
            if not clone:
                # Replace source with temp result
                shutil.rmtree(mod_dir, ignore_errors=True)
                os.rename(target_dir, mod_dir)
                target_dir = mod_dir

        # PRCXML
        if args.prcxml_colors and args.fighter != "all":
            CreatePRCXML(args.fighter.lower(), target_dir, int(args.prcxml_colors))

        # CSS redirect rename
        if args.redirect_name and args.fighter != "all" and not args.only_config:
            RenameUI(target_dir, args.fighter.lower(), args.redirect_name, int(args.redirect_start or 0))

        # Save config.json
        newConfigLocation = os.path.join(target_dir, 'config.json')
        with open(newConfigLocation, 'w+', encoding='utf-8') as f:
            json.dump(ordered if ordered else resulting_config, f, ensure_ascii=False, indent=4)

        print("Completed.")
        print(target_dir)
    else:
        print("No operations performed.")

def scan_cli(args):
    mod_dir = os.path.abspath(args.mod_dir)
    if not os.path.isdir(mod_dir):
        print("Invalid --mod-dir")
        sys.exit(2)
    if not IsValidSearch(mod_dir):
        print("The selected folder doesn't appear to be a valid mod. It must contain the 'fighter', 'sound', or 'ui' folders.")
        sys.exit(2)
    fighters, _ = SetFighters(mod_dir)
    print("Fighters found:")
    for f in sorted(set(fighters)):
        print(f" - {f}")
    if args.fighter:
        _, slots = SetFighters(mod_dir, args.fighter.lower())
        print(f"Slots for {args.fighter}:")
        for s in sorted(set(slots)):
            print(f" - {s}")

def cli():
    parser = argparse.ArgumentParser(description="Merged terminal-only reslotter (no GUI)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_scan = sub.add_parser("scan", help="Scan fighters and slots")
    p_scan.add_argument("--mod-dir", required=True, help="Path to mod directory")
    p_scan.add_argument("--fighter", required=False, help="Optional fighter to list slots for")
    p_scan.set_defaults(func=scan_cli)

    p_res = sub.add_parser("reslot", help="Reslot files and/or generate config.json")
    p_res.add_argument("--mod-dir", required=True, help="Path to mod directory")
    p_res.add_argument("--hashes", required=True, help="Path to Hashes_all.txt")
    p_res.add_argument("--fighter", required=True, help="Fighter name or 'all'")
    p_res.add_argument("--map", action="append", help="Mapping cXX=cYY, repeatable")
    p_res.add_argument("--share", action="append", help="Share mapping cXX=cYY, repeatable")
    p_res.add_argument("--clone", action="store_true", help="Copy to new folder like '(c00 c01 ... )'")
    p_res.add_argument("--exclude-blanks", action="store_true", help="Exclude blank targets")
    p_res.add_argument("--only-config", action="store_true", help="Only write config.json (no file copy)")
    p_res.add_argument("--new-config", action="store_true", help="Start with new config.json instead of appending")
    p_res.add_argument("--redirect-name", help="CSS redirect new fighter id (e.g., knuckles)")
    p_res.add_argument("--redirect-start", type=int, default=0, help="CSS redirect start color index")
    p_res.add_argument("--prcxml-colors", type=int, help="Write ui_chara_db.prcxml with this max color_num")
    p_res.set_defaults(func=reslot_cli)

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    # Support legacy usage (same as reslotternoGUI.py), or advanced subcommands
    try:
        # Legacy positional mode: script + 7 args
        if len(sys.argv) == 8:
            mod_directory = sys.argv[1]
            hashes_file = sys.argv[2]
            fighter_name = sys.argv[3]
            current_alt = sys.argv[4]
            target_alt = sys.argv[5]
            share_slot = sys.argv[6]
            out_directory = sys.argv[7]

            if not os.path.isdir(mod_directory) or not os.path.isfile(hashes_file):
                usage()
            if not IsValidSearch(mod_directory):
                print("The selected folder doesn't appear to be a valid mod. It must contain the 'fighter', 'sound', or 'ui' folders.")
                sys.exit(2)

            # Initialize (append to existing config by default)
            init(hashes_file, mod_directory, newConfig=False)
            # Execute and write config.json
            main(mod_directory, hashes_file, fighter_name, current_alt, target_alt, share_slot, out_directory)
            print("Completed.")
            print(out_directory if out_directory != "" else mod_directory)

        # Advanced argparse mode if subcommand provided
        elif len(sys.argv) > 1 and sys.argv[1] in ("scan", "reslot"):
            cli()
        else:
            usage()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
