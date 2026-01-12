import path from 'path';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import fse from 'fs-extra';
import os from 'os';

interface ExtractFPPOptions {
  modsPath: string;
  pluginsPath: string;
}

async function extractFPP(
  filePath: string,
  { modsPath, pluginsPath }: ExtractFPPOptions,
) {
  // Create temp directory for extraction
  const tempDir = path.join(os.tmpdir(), `fpp-extract-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Extract FPP to temp directory
    const zip = new AdmZip(filePath);
    zip.extractAllTo(tempDir, true);

    // Read and validate manifest
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    if (!manifest.version || manifest.version !== 1) {
      throw new Error('Invalid or unsupported FPP version');
    }

    // Copy mods
    const modsDir = path.join(tempDir, 'data', 'mods');
    if (await fse.pathExists(modsDir)) {
      const mods = await fs.readdir(modsDir);
      for (const mod of mods) {
        const sourcePath = path.join(modsDir, mod);
        const destPath = path.join(modsPath, mod);
        await fse.copy(sourcePath, destPath);
      }
    }

    // Copy plugins
    const pluginsDir = path.join(tempDir, 'data', 'plugins');
    if (await fse.pathExists(pluginsDir)) {
      const plugins = await fs.readdir(pluginsDir);
      for (const plugin of plugins) {
        const sourcePath = path.join(pluginsDir, plugin);
        const destPath = path.join(pluginsPath, plugin);
        await fse.copy(sourcePath, destPath);
      }
    }

    return { success: true };
  } finally {
    // Clean up temp directory
    await fse.remove(tempDir);
  }
}

export { extractFPP };
