// Get the single internal fighter name for the mod (if there is one), ignoring Kirby copy variants
export async function getInternalFighterName(modPath) {
    const nonCopyFighterNames = await getNonCopyFighterNames(modPath);

    if (nonCopyFighterNames.length === 1) {
        return nonCopyFighterNames[0];
    }
}

// Get all fighter names excluding Kirby copy variants
export async function getNonCopyFighterNames(modPath) {
    const fighterPath = modPath + '/fighter';
    const fighterDirs = await window.api.modOperations.getModFiles(fighterPath);
    const fighterFiles = fighterDirs.filter(f => /\.[a-zA-Z0-9]+$/.test(f));
    const nonCopyFiles = fighterFiles.filter(f => !f.startsWith('kirby\\model\\copy_'));

    return [...new Set(
        nonCopyFiles
            .map(f => f.substring(0, f.indexOf('\\')))
            .filter(name => !!name)
    )];
}