const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra');
const AdmZip = require('adm-zip');
const os = require('os');

async function createFPP({ name, mods, plugins, modsPath, pluginsPath, outputDir }) {
    // Create temp directory for package
    const tempDir = path.join(os.tmpdir(), `fpp-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, 'data'), { recursive: true });

    // Create manifest
    const manifest = {
        version: 1,
        name: name,
        created: new Date().toISOString(),
        files: [],
        directories: []
    };

    try {
        // Copy mods
        if (mods?.length > 0) {
            const modsDir = path.join(tempDir, 'data', 'mods');
            await fs.mkdir(modsDir, { recursive: true });
            
            for (const modId of mods) {
                const modPath = path.join(modsPath, modId);
                if (await fse.pathExists(modPath)) {
                    await fse.copy(modPath, path.join(modsDir, modId));
                    manifest.directories.push(`mods/${modId}`);
                }
            }
        }

        // Copy plugins
        if (plugins?.length > 0) {
            const pluginsDir = path.join(tempDir, 'data', 'plugins');
            await fs.mkdir(pluginsDir, { recursive: true });
            
            for (const pluginId of plugins) {
                const pluginPath = path.join(pluginsPath, pluginId);
                if (await fse.pathExists(pluginPath)) {
                    await fse.copy(pluginPath, path.join(pluginsDir, pluginId));
                    manifest.files.push(`plugins/${pluginId}`);
                }
            }
        }

        // Write manifest
        await fs.writeFile(
            path.join(tempDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );

        // Create FPP archive
        const outputPath = path.join(outputDir, `${name}.fpp`);
        const zip = new AdmZip();
        
        // Add all contents from temp directory
        const allFiles = await getAllFiles(tempDir);
        for (const filePath of allFiles) {
            const relative = path.relative(tempDir, filePath);
            if ((await fs.stat(filePath)).isDirectory()) {
                zip.addFile(relative + '/', Buffer.alloc(0));
            } else {
                zip.addLocalFile(filePath, path.dirname(relative));
            }
        }

        // Write the FPP file
        zip.writeZip(outputPath);

        return { success: true, outputPath };
    } finally {
        // Clean up temp directory
        await fse.remove(tempDir);
    }
}

async function getAllFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
        const res = path.resolve(dir, entry.name);
        return entry.isDirectory() ? getAllFiles(res) : res;
    }));
    return files.flat();
}

module.exports = { createFPP };
