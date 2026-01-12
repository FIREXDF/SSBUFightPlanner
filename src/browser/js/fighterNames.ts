// Get the single internal fighter name for the mod (if there is one), ignoring Kirby copy variants
export function getInternalFighterName(pathData) {
  if (!pathData || typeof pathData !== 'object') {
    return null;
  }

  // Filter out kirby if it only has copy files
  const fighterNames = Object.keys(pathData).filter((fighterName) => {
    // If it's not kirby, keep it
    if (fighterName !== 'kirby') {
      return true;
    }

    // For kirby, check if any files are NOT copy files
    const kirbySlots = pathData[fighterName];

    for (const slot in kirbySlots) {
      const slotData = kirbySlots[slot];

      // Check original files
      if (slotData.filesToBeModified?.length > 0) {
        const hasNonCopyFiles = slotData.filesToBeModified.some(
          (file) =>
            !file.original.includes('kirby\\model\\copy_') &&
            !file.original.includes('kirby/model/copy_'),
        );

        if (hasNonCopyFiles) {
          return true; // Keep kirby since it has non-copy files
        }
      }

      // Check pathsToBeModified
      if (slotData.pathsToBeModified) {
        const hasNonCopyPaths = slotData.pathsToBeModified.some(
          (path) =>
            !path.original.includes('kirby\\model\\copy_') &&
            !path.original.includes('kirby/model/copy_'),
        );

        if (hasNonCopyPaths) {
          return true; // Keep kirby since it has non-copy paths
        }
      }
    }

    // All kirby files are copy files, filter it out
    return false;
  });

  // Return the fighter name only if there's exactly one
  return fighterNames.length === 1 ? fighterNames[0] : null;
}
