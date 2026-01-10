export class CharacterScanner {
  characterUsage: Map<string, string[]>;
  characterNames: Map<string, [string, string]>;
  hasScanned: boolean;
  slotUsage: Map<string, Map<string, Set<string>>>;
  characterSlots: Map<string, Set<string>>;

  constructor() {
    const style = document.createElement("style");
    style.innerHTML = `
        #characterSearchInput::placeholder {
            color: #888 !important;
            opacity: 1;
        }
        .sticky-search-bar {
            position: sticky;
            top: 0;
            z-index: 10;
            background: inherit;
            padding-top: 10px;
        }
        `;
    document.head.appendChild(style);

    this.characterUsage = new Map();
    this.hasScanned = false; // Track if initial scan has happened

    // Update character name mapping to include display name and image path
    this.characterNames = new Map([
      [
        "mario",
        [
          "Mario",
          "https://www.smashbros.com/assets_v2/img/fighter/mario/main.png",
        ],
      ],
      [
        "donkey",
        [
          "Donkey Kong",
          "https://www.smashbros.com/assets_v2/img/fighter/donkey_kong/main.png",
        ],
      ],
      [
        "link",
        [
          "Link",
          "https://www.smashbros.com/assets_v2/img/fighter/link/main.png",
        ],
      ],
      [
        "samus",
        [
          "Samus",
          "https://www.smashbros.com/assets_v2/img/fighter/samus/main.png",
        ],
      ],
      [
        "samusd",
        [
          "Dark Samus",
          "https://www.smashbros.com/assets_v2/img/fighter/dark_samus/main.png",
        ],
      ],
      [
        "yoshi",
        [
          "Yoshi",
          "https://www.smashbros.com/assets_v2/img/fighter/yoshi/main.png",
        ],
      ],
      [
        "kirby",
        [
          "Kirby",
          "https://www.smashbros.com/assets_v2/img/fighter/kirby/main.png",
        ],
      ],
      [
        "fox",
        ["Fox", "https://www.smashbros.com/assets_v2/img/fighter/fox/main.png"],
      ],
      [
        "pikachu",
        [
          "Pikachu",
          "https://www.smashbros.com/assets_v2/img/fighter/pikachu/main.png",
        ],
      ],
      [
        "luigi",
        [
          "Luigi",
          "https://www.smashbros.com/assets_v2/img/fighter/luigi/main.png",
        ],
      ],
      [
        "ness",
        [
          "Ness",
          "https://www.smashbros.com/assets_v2/img/fighter/ness/main.png",
        ],
      ],
      [
        "captain",
        [
          "Captain Falcon",
          "https://www.smashbros.com/assets_v2/img/fighter/captain_falcon/main.png",
        ],
      ],
      [
        "purin",
        [
          "Jigglypuff",
          "https://www.smashbros.com/assets_v2/img/fighter/jigglypuff/main.png",
        ],
      ],
      [
        "peach",
        [
          "Peach",
          "https://www.smashbros.com/assets_v2/img/fighter/peach/main.png",
        ],
      ],
      [
        "daisy",
        [
          "Daisy",
          "https://www.smashbros.com/assets_v2/img/fighter/daisy/main.png",
        ],
      ],
      [
        "koopa",
        [
          "Bowser",
          "https://www.smashbros.com/assets_v2/img/fighter/bowser/main.png",
        ],
      ],
      [
        "sheik",
        [
          "Sheik",
          "https://www.smashbros.com/assets_v2/img/fighter/sheik/main.png",
        ],
      ],
      [
        "zelda",
        [
          "Zelda",
          "https://www.smashbros.com/assets_v2/img/fighter/zelda/main.png",
        ],
      ],
      [
        "mariod",
        [
          "Dr. Mario",
          "https://www.smashbros.com/assets_v2/img/fighter/dr_mario/main.png",
        ],
      ],
      [
        "pichu",
        [
          "Pichu",
          "https://www.smashbros.com/assets_v2/img/fighter/pichu/main.png",
        ],
      ],
      [
        "falco",
        [
          "Falco",
          "https://www.smashbros.com/assets_v2/img/fighter/falco/main.png",
        ],
      ],
      [
        "marth",
        [
          "Marth",
          "https://www.smashbros.com/assets_v2/img/fighter/marth/main.png",
        ],
      ],
      [
        "lucina",
        [
          "Lucina",
          "https://www.smashbros.com/assets_v2/img/fighter/lucina/main.png",
        ],
      ],
      [
        "younglink",
        [
          "Young Link",
          "https://www.smashbros.com/assets_v2/img/fighter/young_link/main.png",
        ],
      ],
      [
        "ganon",
        [
          "Ganondorf",
          "https://www.smashbros.com/assets_v2/img/fighter/ganondorf/main.png",
        ],
      ],
      [
        "mewtwo",
        [
          "Mewtwo",
          "https://www.smashbros.com/assets_v2/img/fighter/mewtwo/main.png",
        ],
      ],
      [
        "roy",
        ["Roy", "https://www.smashbros.com/assets_v2/img/fighter/roy/main.png"],
      ],
      [
        "chrom",
        [
          "Chrom",
          "https://www.smashbros.com/assets_v2/img/fighter/chrom/main.png",
        ],
      ],
      [
        "gamewatch",
        [
          "Mr. Game & Watch",
          "https://www.smashbros.com/assets_v2/img/fighter/mr_game_and_watch/main.png",
        ],
      ],
      [
        "metaknight",
        [
          "Meta Knight",
          "https://www.smashbros.com/assets_v2/img/fighter/meta_knight/main.png",
        ],
      ],
      [
        "pit",
        ["Pit", "https://www.smashbros.com/assets_v2/img/fighter/pit/main.png"],
      ],
      [
        "pitb",
        [
          "Dark Pit",
          "https://www.smashbros.com/assets_v2/img/fighter/dark_pit/main.png",
        ],
      ],
      [
        "szerosuit",
        [
          "Zero Suit Samus",
          "https://www.smashbros.com/assets_v2/img/fighter/zero_suit_samus/main.png",
        ],
      ],
      [
        "wario",
        [
          "Wario",
          "https://www.smashbros.com/assets_v2/img/fighter/wario/main.png",
        ],
      ],
      [
        "snake",
        [
          "Snake",
          "https://www.smashbros.com/assets_v2/img/fighter/snake/main.png",
        ],
      ],
      [
        "ike",
        ["Ike", "https://www.smashbros.com/assets_v2/img/fighter/ike/main.png"],
      ],
      [
        "pzenigame",
        [
          "Pokémon Trainer (Squirtle)",
          "https://www.smashbros.com/assets_v2/img/fighter/pokemon_trainer/main.png",
        ],
      ],
      [
        "pfushigisou",
        [
          "Pokémon Trainer (Ivysaur)",
          "https://www.smashbros.com/assets_v2/img/fighter/pokemon_trainer/main.png",
        ],
      ],
      [
        "plizardon",
        [
          "Pokémon Trainer (Charizard)",
          "https://www.smashbros.com/assets_v2/img/fighter/pokemon_trainer/main.png",
        ],
      ],
      [
        "diddy",
        [
          "Diddy Kong",
          "https://www.smashbros.com/assets_v2/img/fighter/diddy_kong/main.png",
        ],
      ],
      [
        "lucas",
        [
          "Lucas",
          "https://www.smashbros.com/assets_v2/img/fighter/lucas/main.png",
        ],
      ],
      [
        "sonic",
        [
          "Sonic",
          "https://www.smashbros.com/assets_v2/img/fighter/sonic/main.png",
        ],
      ],
      [
        "dedede",
        [
          "King Dedede",
          "https://www.smashbros.com/assets_v2/img/fighter/king_dedede/main.png",
        ],
      ],
      [
        "pikmin",
        [
          "Olimar",
          "https://www.smashbros.com/assets_v2/img/fighter/olimar/main.png",
        ],
      ],
      [
        "lucario",
        [
          "Lucario",
          "https://www.smashbros.com/assets_v2/img/fighter/lucario/main.png",
        ],
      ],
      [
        "robot",
        [
          "R.O.B.",
          "https://www.smashbros.com/assets_v2/img/fighter/rob/main.png",
        ],
      ],
      [
        "toonlink",
        [
          "Toon Link",
          "https://www.smashbros.com/assets_v2/img/fighter/toon_link/main.png",
        ],
      ],
      [
        "wolf",
        [
          "Wolf",
          "https://www.smashbros.com/assets_v2/img/fighter/wolf/main.png",
        ],
      ],
      [
        "murabito",
        [
          "Villager",
          "https://www.smashbros.com/assets_v2/img/fighter/villager/main.png",
        ],
      ],
      [
        "rockman",
        [
          "Mega Man",
          "https://www.smashbros.com/assets_v2/img/fighter/mega_man/main.png",
        ],
      ],
      [
        "wiifit",
        [
          "Wii Fit Trainer",
          "https://www.smashbros.com/assets_v2/img/fighter/wii_fit_trainer/main.png",
        ],
      ],
      [
        "rosetta",
        [
          "Rosalina & Luma",
          "https://www.smashbros.com/assets_v2/img/fighter/rosalina_and_luma/main.png",
        ],
      ],
      [
        "littlemac",
        [
          "Little Mac",
          "https://www.smashbros.com/assets_v2/img/fighter/little_mac/main.png",
        ],
      ],
      [
        "gekkouga",
        [
          "Greninja",
          "https://www.smashbros.com/assets_v2/img/fighter/greninja/main.png",
        ],
      ],
      [
        "miifighter",
        [
          "Mii Brawler",
          "https://www.smashbros.com/assets_v2/img/fighter/mii_brawler/main.png",
        ],
      ],
      [
        "miiswordsman",
        [
          "Mii Swordfighter",
          "https://www.smashbros.com/assets_v2/img/fighter/mii_swordfighter/main.png",
        ],
      ],
      [
        "miigunner",
        [
          "Mii Gunner",
          "https://www.smashbros.com/assets_v2/img/fighter/mii_gunner/main.png",
        ],
      ],
      [
        "palutena",
        [
          "Palutena",
          "https://www.smashbros.com/assets_v2/img/fighter/palutena/main.png",
        ],
      ],
      [
        "pacman",
        [
          "Pac-Man",
          "https://www.smashbros.com/assets_v2/img/fighter/pac_man/main.png",
        ],
      ],
      [
        "reflet",
        [
          "Robin",
          "https://www.smashbros.com/assets_v2/img/fighter/robin/main.png",
        ],
      ],
      [
        "shulk",
        [
          "Shulk",
          "https://www.smashbros.com/assets_v2/img/fighter/shulk/main.png",
        ],
      ],
      [
        "koopajr",
        [
          "Bowser Jr.",
          "https://www.smashbros.com/assets_v2/img/fighter/bowser_jr/main.png",
        ],
      ],
      [
        "duckhunt",
        [
          "Duck Hunt",
          "https://www.smashbros.com/assets_v2/img/fighter/duck_hunt/main.png",
        ],
      ],
      [
        "ryu",
        ["Ryu", "https://www.smashbros.com/assets_v2/img/fighter/ryu/main.png"],
      ],
      [
        "ken",
        ["Ken", "https://www.smashbros.com/assets_v2/img/fighter/ken/main.png"],
      ],
      [
        "cloud",
        [
          "Cloud",
          "https://www.smashbros.com/assets_v2/img/fighter/cloud/main.png",
        ],
      ],
      [
        "kamui",
        [
          "Corrin",
          "https://www.smashbros.com/assets_v2/img/fighter/corrin/main.png",
        ],
      ],
      [
        "bayonetta",
        [
          "Bayonetta",
          "https://www.smashbros.com/assets_v2/img/fighter/bayonetta/main.png",
        ],
      ],
      [
        "inkling",
        [
          "Inkling",
          "https://www.smashbros.com/assets_v2/img/fighter/inkling/main.png",
        ],
      ],
      [
        "ridley",
        [
          "Ridley",
          "https://www.smashbros.com/assets_v2/img/fighter/ridley/main.png",
        ],
      ],
      [
        "simon",
        [
          "Simon",
          "https://www.smashbros.com/assets_v2/img/fighter/simon/main.png",
        ],
      ],
      [
        "richter",
        [
          "Richter",
          "https://www.smashbros.com/assets_v2/img/fighter/richter/main.png",
        ],
      ],
      [
        "krool",
        [
          "King K. Rool",
          "https://www.smashbros.com/assets_v2/img/fighter/king_k_rool/main.png",
        ],
      ],
      [
        "shizue",
        [
          "Isabelle",
          "https://www.smashbros.com/assets_v2/img/fighter/isabelle/main.png",
        ],
      ],
      [
        "gaogaen",
        [
          "Incineroar",
          "https://www.smashbros.com/assets_v2/img/fighter/incineroar/main.png",
        ],
      ],
      [
        "packun",
        [
          "Piranha Plant",
          "https://www.smashbros.com/assets_v2/img/fighter/piranha_plant/main.png",
        ],
      ],
      [
        "jack",
        [
          "Joker",
          "https://www.smashbros.com/assets_v2/img/fighter/joker/main.png",
        ],
      ],
      [
        "brave",
        [
          "Hero",
          "https://www.smashbros.com/assets_v2/img/fighter/dq_hero/main.png",
        ],
      ],
      [
        "buddy",
        [
          "Banjo & Kazooie",
          "https://www.smashbros.com/assets_v2/img/fighter/banjo_and_kazooie/main.png",
        ],
      ],
      [
        "dolly",
        [
          "Terry",
          "https://www.smashbros.com/assets_v2/img/fighter/terry/main.png",
        ],
      ],
      [
        "master",
        [
          "Byleth",
          "https://www.smashbros.com/assets_v2/img/fighter/byleth/main.png",
        ],
      ],
      [
        "tantan",
        [
          "Min Min",
          "https://www.smashbros.com/assets_v2/img/fighter/minmin/main.png",
        ],
      ],
      [
        "pickel",
        [
          "Steve",
          "https://www.smashbros.com/assets_v2/img/fighter/steve/main.png",
        ],
      ],
      [
        "edge",
        [
          "Sephiroth",
          "https://www.smashbros.com/assets_v2/img/fighter/sephiroth/main.png",
        ],
      ],
      [
        "eflame",
        [
          "Pyra",
          "https://static.wikia.nocookie.net/heros/images/4/48/Art_Pyra_Ultimate.png/revision/latest?cb=20210409204604&path-prefix=fr",
        ],
      ],
      [
        "elight",
        [
          "Mythra",
          "https://static.wikia.nocookie.net/heroes-fr/images/1/12/Art_Mythra_Ultimate.png/revision/latest?cb=20210219142112&path-prefix=fr",
        ],
      ],
      [
        "demon",
        [
          "Kazuya",
          "https://www.smashbros.com/assets_v2/img/fighter/kazuya/main.png",
        ],
      ],
      [
        "trail",
        [
          "Sora",
          "https://www.smashbros.com/assets_v2/img/fighter/sora/main.png",
        ],
      ],
      [
        "popo",
        [
          "Popo (Ice Climbers)",
          "https://www.smashbros.com/assets_v2/img/fighter/ice_climbers/main.png",
        ],
      ],
      [
        "nana",
        [
          "Nana (Ice Climbers)",
          "https://www.smashbros.com/assets_v2/img/fighter/ice_climbers/main.png",
        ],
      ],
    ]);

    this.slotUsage = new Map(); // Add this to track slot usage
    this.characterSlots = new Map(); // Add this for tracking slots separately
  }

  // Update method to get proper character name
  getCharacterName(internalName) {
    const characterInfo = this.characterNames.get(internalName.toLowerCase());
    return characterInfo ? characterInfo[0] : internalName;
  }

  // Add new method to get character image
  getCharacterImage(internalName) {
    const characterInfo = this.characterNames.get(internalName.toLowerCase());
    return characterInfo ? characterInfo[1] : null;
  }

  // Add the new slot scanning method
  static async scanForSlots(modPath) {
    try {
      const files = await window.api.modOperations.getModFiles(modPath);

      const slotFiles = files.filter((file) => {
        const pathParts = file.split(/[/\\]/);
        const fileName = pathParts[pathParts.length - 1];

        // Check if this is a c0X folder itself
        const isc0XFolder = /^c0\d$/.test(fileName);
        if (isc0XFolder) return true;

        // Check if file is inside a c0X folder
        const isInC0XFolder = pathParts
          .slice(0, -1)
          .some((part) => /^c0\d$/.test(part));
        if (isInC0XFolder) return false;

        // Check for 0X pattern in filename
        return /0\d/.test(fileName);
      });

      // Extract slots from filenames
      const slots = new Set<string>();

      slotFiles.forEach((file) => {
        const pathParts = file.split(/[/\\]/);
        const part = pathParts[pathParts.length - 1];

        if (/^c0\d$/.test(part)) {
          slots.add(part); // Add full c0X for folders
        } else {
          const match = part.match(/0\d/);
          if (match) {
            slots.add("c" + match[0]); // Store as c0X internally
          }
        }
      });

      // Sort slots numerically (c00, c01, c02, etc.)
      const sortedSlots = Array.from(slots).sort((a, b) => {
        const numA = parseInt(a.replace("c0", ""));
        const numB = parseInt(b.replace("c0", ""));
        return numA - numB;
      });

      return {
        currentSlots: sortedSlots,
        affectedFiles: slotFiles,
      };
    } catch (error) {
      console.error("Error scanning for slots:", error);
      throw error;
    }
  }

  async scanMods(force = false) {
    if (this.hasScanned && !force) return;

    const container = document.getElementById("characterSlotsList");
    if (!container) return;

    try {
      container.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-primary"></div>
                    <p class="mt-2 text-body textmuted">Scanning mods...</p>
                </div>
            `;

      const mods = await window.api.modOperations.loadMods();
      this.characterUsage.clear();
      this.slotUsage.clear();
      this.characterSlots.clear(); // Clear slots data

      let scannedCount = 0;
      const totalMods = mods.length;

      container.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-white"></div>
                    <p class="mt-2 text-body textmuted">
                        Scanning mods (<span id="scan-progress">0</span>/${totalMods})
                    </p>
                </div>
            `;

      for (const mod of mods) {
        if (!mod?.path) continue;

        try {
          scannedCount++;
          const progress = document.getElementById("scan-progress") as
            | HTMLSpanElement
            | undefined;
          if (progress) progress.textContent = `${scannedCount}`;

          const files = await window.api.modOperations.getModFiles(mod.path);
          if (!files || !Array.isArray(files)) continue;

          // Process fighter folders
          const fighterFolders = files.filter((file) => {
            const parts = file.split(/[/\\]/);
            return parts.length >= 2 && parts[0] === "fighter";
          });

          if (fighterFolders.length > 0) {
            const characters = new Set(
              fighterFolders
                .map((file) => file.split(/[/\\]/)[1])
                .filter(
                  (char) =>
                    char &&
                    !["common", "effect", "sound"].includes(char.toLowerCase()),
                ),
            );

            // For each character found in the mod
            for (const character of characters) {
              if (!this.characterUsage.has(character)) {
                this.characterUsage.set(character, []);
              }
              if (!this.characterUsage.get(character).includes(mod.name)) {
                this.characterUsage.get(character).push(mod.name);
              }

              // Scan the character's folder for slots
              const characterPath = `${mod.path}/fighter/${character}`;
              try {
                const { currentSlots } =
                  await CharacterScanner.scanForSlots(characterPath);
                if (currentSlots && currentSlots.length > 0) {
                  if (!this.slotUsage.has(character)) {
                    this.slotUsage.set(character, new Map());
                  }
                  currentSlots.forEach((slot) => {
                    if (!this.slotUsage.get(character).has(slot)) {
                      this.slotUsage.get(character).set(slot, new Set());
                    }
                    this.slotUsage.get(character).get(slot).add(mod.name);
                  });
                }
              } catch (slotError) {
                console.warn(
                  `Error scanning slots for ${character} in ${mod.name}:`,
                  slotError,
                );
              }
            }
          }
        } catch (modError) {
          console.warn(`Skipping mod "${mod.name}":`, modError);
          continue;
        }
      }

      this.hasScanned = true;
      this.renderList();
    } catch (error) {
      console.error("Scan error:", error);
      container.innerHTML = `<div class="alert alert-danger">Error scanning mods: ${error.message}</div>`;
    }
  }

  isSystemFolder(name) {
    const systemFolders = ["common", "effect", "sound"];
    return systemFolders.includes(name.toLowerCase()) || name.includes(".");
  }

  addCharacterUsage(character, modName) {
    if (!this.characterUsage.has(character)) {
      this.characterUsage.set(character, []);
    }
    if (!this.characterUsage.get(character).includes(modName)) {
      this.characterUsage.get(character).push(modName);
    }
  }

  renderList() {
    const container = document.getElementById("characterSlotsList");
    if (!container) return;

    const isDarkMode = document.body.classList.contains("dark-mode");

    if (!this.hasScanned) {
      container.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary"></div>
                <p class="mt-2 text-muted">Scanning mods...</p>
            </div>`;
      return;
    }

    // Sauvegarde la valeur et la position du curseur
    let filterValue = "";
    let selectionStart = 0;
    let selectionEnd = 0;

    const existingInput = container.querySelector("#characterSearchInput") as
      | HTMLInputElement
      | undefined;

    if (existingInput) {
      filterValue = existingInput.value;
      selectionStart = existingInput.selectionStart;
      selectionEnd = existingInput.selectionEnd;
    }

    const searchBar = `
        <div class="mb-3 sticky-search-bar">
            <input type="text" id="characterSearchInput" class="form-control" placeholder="Search a characters" value="${filterValue.replace(
              /"/g,
              "&quot;",
            )}">
        </div>
    `;

    // Trie et filtre les personnages
    const sortedCharacters = Array.from(this.characterUsage.entries())
      .map(([character, mods]) => {
        const displayName = this.getCharacterName(character);
        const imagePath = this.getCharacterImage(character);
        return [displayName, mods, imagePath, character];
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    const filteredCharacters = sortedCharacters.filter(([displayName]) =>
      displayName.toLowerCase().includes(filterValue.trim().toLowerCase()),
    );

    if (filteredCharacters.length === 0) {
      container.innerHTML =
        searchBar +
        `
            <div class="alert ${
              isDarkMode ? "alert-dark" : "alert-info"
            } bg-opacity-10">
                <i class="bi bi-info-circle me-2"></i>Characters not found.
            </div>`;
    }

    // Utilise la liste des mods déjà chargée (pas de rescannage)
    const modList = window._cachedModList || [];
    if (
      !window._cachedModList &&
      window.api &&
      window.api.modOperations &&
      window.api.modOperations.loadMods
    ) {
      window.api.modOperations.loadMods().then((mods) => {
        window._cachedModList = mods;
        this.renderList();
      });
      container.innerHTML =
        searchBar +
        `<div class="text-center"><div class="spinner-border text-primary"></div></div>`;
      return;
    }

    // Affichage principal
    const html =
      searchBar +
      `
        <div class="list-group">
            ${filteredCharacters
              .map(
                ([displayName, mods, imagePath, character]) => `
                <div class="list-group-item">
                    <div class="d-flex align-items-center mb-3">
                        ${
                          imagePath
                            ? `
                            <img src="${imagePath}" 
                                alt="${displayName}" 
                                class="character-icon me-3 clickable-image"
                                data-character="${displayName}"
                                data-image="${imagePath}">
                        `
                            : ""
                        }
                        <h5 class="character-name mb-0">${displayName}</h5>
                    </div>
                    <div class="mod-list">
                        ${mods
                          .map((modName) => {
                            const modObj = Array.isArray(modList)
                              ? modList.find((m) => m.name === modName)
                              : null;
                            let modClass = "";
                            if (modObj) {
                              if (modObj.enabled === false) {
                                modClass = "text-danger";
                              } else if (modObj.hasConflict) {
                                modClass = "text-warning";
                              }
                            }
                            return `
                                <div class="mod-entry">
                                    <a href="#" class="mod-link ${modClass}" data-mod-name="${modName}">
                                        <i class="bi bi-dot"></i>${modName}
                                    </a>
                                    <span class="slot-info">
                                        (Slots: ${
                                          this.getModSlots(
                                            character,
                                            modName,
                                          ).join(", ") || "Unknown"
                                        })
                                    </span>
                                </div>
                            `;
                          })
                          .join("")}
                    </div>
                </div>
            `,
              )
              .join("")}
        </div>
    `;
    container.innerHTML = html;
    this.addEventListeners(container);

    // Ajoute l'écouteur sur la barre de recherche
    const searchInput = container.querySelector("#characterSearchInput") as
      | HTMLInputElement
      | undefined;

    if (searchInput) {
      searchInput.value = filterValue;
      searchInput.addEventListener("input", () => this.renderList());

      // Restaure la position du curseur
      searchInput.setSelectionRange(selectionStart, selectionEnd);
      searchInput.focus();
    }
  }

  addEventListeners(container) {
    // Image click handlers
    container.querySelectorAll(".clickable-image").forEach((img) => {
      img.addEventListener("click", (e) => {
        const modal = new bootstrap.Modal(
          document.getElementById("characterImageModal"),
        );
        const modalImg = document.getElementById(
          "characterImageLarge",
        ) as HTMLImageElement;
        const modalTitle = document.getElementById("characterImageModalLabel");

        modalImg.src = e.target.dataset.image;
        modalTitle.textContent = e.target.dataset.character;
        modal.show();
      });
    });

    // Ensure tooltip element exists
    let tooltip = document.getElementById("modPreviewTooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "modPreviewTooltip";
      tooltip.className = "mod-preview-tooltip";
      tooltip.innerHTML = '<img src="" alt="Mod Preview">';
      document.body.appendChild(tooltip);
    }

    const tooltipImg = tooltip.querySelector("img");
    let tooltipTimeout;

    // Mod link handlers with preview tooltip
    container.querySelectorAll(".mod-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const modName = e.target.closest(".mod-link").dataset.modName;
        window.dispatchEvent(
          new CustomEvent("select-mod-from-character", {
            detail: { modName },
          }),
        );
      });

      // Mouse enter handler
      link.addEventListener("mouseenter", async (e) => {
        if (!tooltip) return;

        const modName = e.target.closest(".mod-link").dataset.modName;
        const mods = await window.api.modOperations.loadMods();
        const mod = mods.find((m) => m.name === modName);

        if (mod) {
          tooltipTimeout = setTimeout(async () => {
            const preview = await window.api.modDetails.getPreview(mod.path);
            if (preview && tooltipImg) {
              tooltipImg.src = preview;
              tooltip.style.display = "block";
              requestAnimationFrame(() => tooltip.classList.add("visible"));
            }
          }, 500);
        }
      });

      // Mouse move handler
      link.addEventListener("mousemove", (e) => {
        if (!tooltip || tooltip.style.display !== "block") return;

        const padding = 10;
        const tooltipRect = tooltip.getBoundingClientRect();
        let x = e.clientX + padding;
        let y = e.clientY + padding;

        // Keep tooltip within window bounds
        if (x + tooltipRect.width > window.innerWidth) {
          x = e.clientX - tooltipRect.width - padding;
        }
        if (y + tooltipRect.height > window.innerHeight) {
          y = e.clientY - tooltipRect.height - padding;
        }

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
      });

      // Mouse leave handler
      link.addEventListener("mouseleave", () => {
        if (!tooltip) return;
        clearTimeout(tooltipTimeout);
        tooltip.classList.remove("visible");
        setTimeout(() => {
          if (tooltip) tooltip.style.display = "none";
        }, 200);
      });
    });
  }

  // Add this helper method
  getModSlots(character, modName) {
    const slots = [];
    const modFiles = this.slotUsage.get(character) || new Map();

    // Check each slot for this mod
    modFiles.forEach((mods, slot) => {
      if (mods.has(modName)) {
        slots.push(slot);
      }
    });

    return slots.sort((a, b) => {
      // Sort slots numerically (c00, c01, c02, etc.)
      const numA = parseInt(a.replace("c0", ""));
      const numB = parseInt(b.replace("c0", ""));
      return numA - numB;
    });
  }

  // Method to force refresh
  refresh() {
    this.hasScanned = false; // Reset scan status
    this.scanMods(true); // Force new scan
  }

  // Log slots for debugging
  logSlots() {
    console.log("Character Slots Usage:");
    this.characterSlots.forEach((slots, character) => {
      console.log(`\n${character}:`);
      slots.forEach((mods, slot) => {
        console.log(`  ${slot}: ${Array.from(mods).join(", ")}`);
      });
    });
  }
}
