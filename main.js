// IPC: Run reslotter.py with arguments
try {
    const { ipcMain: ipcMainReslot } = require('electron');
    // Helper to resolve Python command robustly (tries env override, python, python3, py -3, py)
    let cachedPython = null;
    const resolvePython = async () => {
        if (cachedPython) return cachedPython;
        const { spawn } = require('child_process');
        const candidates = [];
        const override = process.env.FIGHTPLANNER_PYTHON && process.env.FIGHTPLANNER_PYTHON.trim();
        if (override) {
            // Allow specifying additional default args via env like: "C:\\Python311\\python.exe|--someflag"
            const [cmd, ...rest] = override.split('|');
            candidates.push({ cmd, baseArgs: rest });
            try { log.info('[reslotter] Python override via FIGHTPLANNER_PYTHON =', override); } catch {}
        }
        candidates.push({ cmd: 'python', baseArgs: [] });
        candidates.push({ cmd: 'python3', baseArgs: [] });
        if (process.platform === 'win32') {
            candidates.push({ cmd: 'py', baseArgs: ['-3'] });
            candidates.push({ cmd: 'py', baseArgs: [] });
        }
        for (const c of candidates) {
            try {
                try { log.info('[reslotter] Trying Python candidate:', c.cmd, (c.baseArgs.join(' ')), '--version'); } catch {}
                const testArgs = [...c.baseArgs, '--version'];
                const ok = await new Promise((resolve) => {
                    try {
                        const child = spawn(c.cmd, testArgs);
                        let out = '';
                        let err = '';
                        child.stdout?.on('data', d => { out += d.toString(); });
                        child.stderr?.on('data', d => { err += d.toString(); });
                        child.on('error', () => resolve(false));
                        child.on('close', (code) => {
                            const version = (out || err || '').toString().trim();
                            resolve(code === 0 || !!version);
                        });
                    } catch {
                        resolve(false);
                    }
                });
                if (ok) {
                    try { log.info('[reslotter] Python resolved to:', c.cmd, c.baseArgs.join(' ')); } catch {}
                    cachedPython = c; // cache
                    return c;
                }
            } catch { /* try next */ }
        }
        try { log.warn('[reslotter] No Python interpreter found (tried override, python, python3, py -3, py).'); } catch {}
        return null;
    };

    // Check Python availability
    ipcMainReslot.handle('check-python', async () => {
        try {
            const resolved = await resolvePython();
            if (!resolved) return { available: false, error: 'No Python interpreter found in PATH (tried python, python3, py -3, py).' };
            // Get version string using resolved interpreter
            const { spawn } = require('child_process');
            const args = [...resolved.baseArgs, '--version'];
            const { version, exitCode } = await new Promise((resolve) => {
                let out = '';
                let err = '';
                const ch = spawn(resolved.cmd, args);
                ch.stdout?.on('data', d => { out += d.toString(); });
                ch.stderr?.on('data', d => { err += d.toString(); });
                ch.on('error', () => resolve({ version: '', exitCode: 1 }));
                ch.on('close', (code) => resolve({ version: (out || err || '').toString().trim(), exitCode: code }));
            });
            try { log.info('[reslotter] Python check OK:', resolved.cmd, resolved.baseArgs.join(' '), '=>', version); } catch {}
            return { available: true, version, exitCode, command: resolved.cmd, baseArgs: resolved.baseArgs };
        } catch (e) {
            return { available: false, error: e.message };
        }
    });
    ipcMainReslot.handle('run-reslotter', async (event, payload) => {
        const path = require('path');
        const fs = require('fs');
        const { spawn } = require('child_process');
        const logPrefix = '[reslotter]';
        try {
            const { modDirectory, fighterName, currentAlt, targetAlt, shareSlot, outDirectory } = payload || {};
            if (!modDirectory || !fighterName || !currentAlt || !targetAlt || !shareSlot) {
                throw new Error('Missing required reslotter arguments');
            }
            const resolveScriptPath = () => {
                const base = process.resourcesPath || '';
                const candidates = [
                    // Preferred location (no duplicate 'resources')
                    path.join(base, 'src', 'resources', 'reslot', 'reslotter.py'),
                    // Prefer unpacked when packaged
                    path.join(base, 'app.asar.unpacked', 'src', 'resources', 'reslot', 'reslotter.py'),
                    // Fallback: inside asar (we will copy out if used)
                    path.join(base, 'app.asar', 'src', 'resources', 'reslot', 'reslotter.py'),
                    // Dev fallback
                    path.join(__dirname, 'src', 'resources', 'reslot', 'reslotter.py'),
                ];
                const checks = [];
                for (const p of candidates) {
                    let exists = false;
                    try { exists = fs.existsSync(p); } catch { exists = false; }
                    try { log.info('[reslotter] search candidate:', p, 'exists:', exists); } catch {}
                    checks.push({ path: p, exists });
                    if (exists) return { foundPath: p, checks };
                }
                return { foundPath: null, checks };
            };
            const { foundPath: scriptPath, checks: pathChecks } = resolveScriptPath();
            if (!scriptPath) {
                try { log.error('[reslotter] reslotter.py not found. Candidates tried:', pathChecks.map(c => `${c.path} (exists=${c.exists})`).join(' | ')); } catch {}
                throw new Error('reslotter.py not found in resources');
            }
            let scriptDir = path.dirname(scriptPath);
            let scriptRunPath = scriptPath;
            let hashesPath = path.join(scriptDir, 'dir_info_with_files_trimmed.json');
            if (!fs.existsSync(hashesPath)) {
                try { log.error('[reslotter] Hashes file missing:', hashesPath); } catch {}
                throw new Error('Hashes file not found: ' + hashesPath);
            }
            try { log.info('[reslotter] Using script (original):', scriptPath); log.info('[reslotter] Using hashes:', hashesPath); } catch {}

            // If the script is inside an ASAR archive, copy the whole reslot folder to a temp dir
            if (scriptPath.includes('.asar')) {
                const os = require('os');
                const fse = require('fs-extra');
                const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fp-reslot-'));
                const tmpReslotDir = path.join(tmpRoot, 'reslot');
                try { log.info('[reslotter] Script in ASAR, copying to temp:', tmpReslotDir); } catch {}
                await fse.copy(scriptDir, tmpReslotDir, { overwrite: true });
                scriptDir = tmpReslotDir;
                hashesPath = path.join(scriptDir, 'dir_info_with_files_trimmed.json');
                scriptRunPath = path.join(scriptDir, 'reslotter.py');
                try { log.info('[reslotter] Temp script dir:', scriptDir); log.info('[reslotter] Temp hashes path:', hashesPath); } catch {}
            }

            const resolvedPy = await resolvePython();
            if (!resolvedPy) {
                throw new Error('No Python interpreter found. Ensure python is installed and on PATH.');
            }
            const args = [
                ...resolvedPy.baseArgs,
                scriptRunPath,
                modDirectory,
                hashesPath,
                String(fighterName),
                String(currentAlt),
                String(targetAlt),
                String(shareSlot),
                outDirectory || modDirectory,
            ];

            log.info(logPrefix, 'Running:', resolvedPy.cmd, args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));

            const child = spawn(resolvedPy.cmd, args, { cwd: scriptDir, env: process.env });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });

            const exitCode = await new Promise((resolve, reject) => {
                child.on('error', reject);
                child.on('close', resolve);
            });

            log.info(logPrefix, 'Exit code:', exitCode);
            if (stdout) log.info(logPrefix, 'stdout:', stdout.slice(0, 4000));
            if (stderr) log.warn(logPrefix, 'stderr:', stderr.slice(0, 4000));

            return { exitCode, stdout, stderr };
        } catch (e) {
            log.error('[reslotter] failed:', e);
            throw e;
        }
    });
} catch (e) {
    // main may not yet be fully initialized when patch loads; ignore here
}
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');  // Add regular fs
const fsp = require('fs').promises;  // Rename fs.promises to fsp
const fse = require('fs-extra');
const electronFs = require('original-fs');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');
const os = require('os');
const Store = require('electron-store');
const toml = require('toml');
const discordRPC = require('./discordRPC');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { format } = require('date-fns');
const { createFPP } = require('./src/js/createFPP');
const { extractFPP } = require('./src/js/extractFPP');
const Sentry = require('@sentry/node');
     
ipcMain.on('error', (event, error) => {
    console.error('IPC Error:', error);
    Sentry.captureException(error);
});

ipcMain.handle('log-renderer-error', (event, errorDetails) => {
    console.error('Renderer Error:', errorDetails);
    Sentry.withScope((scope) => {
        scope.setExtra('filename', errorDetails.filename || 'unknown');
        scope.setExtra('lineno', errorDetails.lineno || 'unknown');
        scope.setExtra('colno', errorDetails.colno || 'unknown');
        Sentry.captureException(new Error(errorDetails.message || 'Unknown Error'));
    });
});

ipcMain.handle('open-tutorial-window', () => {
    openTutorialWindow();
    return true;
});

log.transports.file.level = 'info';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';

// Set up logging configuration with date-based filenames
const logDirectory = path.join(app.getPath('userData'), 'logs');
const currentDate = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
const logFilename = `fightplanner_${currentDate}.log`;

// Ensure logs directory exists
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

// Configure electron-log
log.transports.file.resolvePathFn = () => path.join(logDirectory, logFilename);
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.level = 'info';

// Log application start
log.info('Application started');
log.info(`Log file: ${logFilename}`);

// Remove old logs (keep last 7 days)
async function cleanOldLogs() {
    log.info('Cleaning old logs...');
  try {
    const files = await fsp.readdir(logDirectory);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const file of files) {
      // Ne supprimer que les fichiers .log
      if (!file.endsWith('.log')) continue;

      const filePath = path.join(logDirectory, file);
      const stats = await fsp.stat(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        await fsp.unlink(filePath);
        log.info('Deleted old log file:', file);
      }
    }
  } catch (error) {
    log.error('Error cleaning old logs:', error);
  }
}

// Clean old logs on startup
cleanOldLogs();

// Capture console output
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
};

console.log = (...args) => {
    log.info(...args);
    originalConsole.log(...args);
};

console.error = (...args) => {
    log.error(...args);
    originalConsole.error(...args);
};

console.warn = (...args) => {
    log.warn(...args);
    originalConsole.warn(...args);
};

console.info = (...args) => {
    log.info(...args);
    originalConsole.info(...args);
};

// Initialize electron store
const store = new Store();

async function askToEnableSentry() {
    const result = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Yes', 'No'],
        defaultId: 0,
        cancelId: 1,
        title: 'Enable Error Reporting',
        message: 'Do you want to enable error reporting to help improve the application?',
        detail: 'Error reports will be sent to the developer to help fix issues. You can disable this in the settings later.'
    });

    const userChoice = result.response === 0; // 0 = Yes, 1 = No
    store.set('sentryEnabled', userChoice);
    return userChoice;
}

// Vérifiez si Sentry est activé dans les paramètres ou demandez à l'utilisateur
(async () => {
    const hasAsked = store.get('hasAskedForSentry', false);
    const sentryEnabled = store.get('sentryEnabled', false);

    if (!hasAsked) {
        const userChoice = await askToEnableSentry();
        store.set('hasAskedForSentry', true);

        if (userChoice) {
            initializeSentry();
        }
    } else if (sentryEnabled) {
        initializeSentry();
    }
})();

// Fonction pour initialiser Sentry
function initializeSentry() {
    Sentry.init({
        dsn: 'https://5775ecb986d21269a8960ce6459d1143@o4509832073773056.ingest.de.sentry.io/4509832076001360',
    });

    process.on('uncaughtException', (err) => {
        console.error("Uncaught Exception:", err.message);
        Sentry.captureException(err);
    });

    process.on('unhandledRejection', (reason) => {
        console.error("Unhandled Rejection:", reason);
        Sentry.captureException(reason instanceof Error ? reason : new Error(reason));
    });
}

// Constants
const DISABLED_MODS_FOLDER_NAME = '{disabled_mod}';
const DISABLED_PLUGINS_FOLDER_NAME = 'disabled_plugins';
const PLUGIN_EXTENSION = '.nro';

let mainWindow;
let hiddenWindow;
let initialProtocolUrl = null;

// AppData plugin metadata (versions/catalog) locations
const PLUGINS_META_DIR = path.join(app.getPath('userData'), 'plugins-meta');
const PLUGIN_VERSIONS_PATH = path.join(PLUGINS_META_DIR, 'plugin-versions.json');
const PLUGIN_CATALOG_PATH = path.join(PLUGINS_META_DIR, 'plugin-catalog.json');
const PLUGIN_SOURCES_PATH = path.join(PLUGINS_META_DIR, 'plugin-sources.json');
const PLUGIN_LATEST_CACHE_PATH = path.join(PLUGINS_META_DIR, 'plugin-latest-cache.json');

async function ensurePluginsMetaFiles() {
    try {
    log.info('[plugins-meta] ensure dir ->', PLUGINS_META_DIR);
    await fse.ensureDir(PLUGINS_META_DIR);
        // Seed catalog/versions from repo resources if missing; else create minimal defaults
        if (!(await fse.pathExists(PLUGIN_CATALOG_PATH))) {
            const repoCatalog = path.join(__dirname, 'src', 'resources', 'plugin-catalog.json');
            if (await fse.pathExists(repoCatalog)) {
        log.info('[plugins-meta] seeding catalog from', repoCatalog, 'to', PLUGIN_CATALOG_PATH);
        await fse.copy(repoCatalog, PLUGIN_CATALOG_PATH);
            } else {
        log.warn('[plugins-meta] no repo catalog file, creating empty catalog at', PLUGIN_CATALOG_PATH);
                await fsp.writeFile(PLUGIN_CATALOG_PATH, '[]', 'utf8');
            }
        }
        if (!(await fse.pathExists(PLUGIN_VERSIONS_PATH))) {
            const repoVersions = path.join(__dirname, 'src', 'resources', 'plugin-versions.json');
            if (await fse.pathExists(repoVersions)) {
        log.info('[plugins-meta] seeding versions from', repoVersions, 'to', PLUGIN_VERSIONS_PATH);
        await fse.copy(repoVersions, PLUGIN_VERSIONS_PATH);
            } else {
        log.warn('[plugins-meta] no repo versions file, creating empty versions at', PLUGIN_VERSIONS_PATH);
                await fsp.writeFile(PLUGIN_VERSIONS_PATH, '{}', 'utf8');
            }
        }
        if (!(await fse.pathExists(PLUGIN_LATEST_CACHE_PATH))) {
            await fsp.writeFile(PLUGIN_LATEST_CACHE_PATH, '{}', 'utf8');
        }
    } catch (e) {
        console.error('Failed to ensure plugins meta files:', e);
    log.error('[plugins-meta] ensurePluginsMetaFiles failed:', e);
    }
}

async function readJson(file, fallback) {
    try {
        const buf = await fsp.readFile(file, 'utf8');
        const data = JSON.parse(buf);
        log.info('[plugins-meta] readJson OK:', file);
        return data;
    } catch (e) {
        log.warn('[plugins-meta] readJson failed for', file, '-> using fallback. Error:', e.message);
        return fallback;
    }
}

async function writeJson(file, data) {
    await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
    log.info('[plugins-meta] writeJson OK:', file);
}

// Read the repo-bundled catalog (resources) if present
async function readResourceCatalog() {
    try {
        const repoCatalog = path.join(__dirname, 'src', 'resources', 'plugin-catalog.json');
        const buf = await fsp.readFile(repoCatalog, 'utf8');
        const data = JSON.parse(buf);
        log.info('[plugins-meta] read resource catalog OK');
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

// Merge AppData catalog with resource catalog (enrich missing fields like checkUrl/url)
async function getEffectiveCatalog() {
    const user = await readJson(PLUGIN_CATALOG_PATH, []);
    const sources = await readJson(PLUGIN_SOURCES_PATH, {});
    const res = await readResourceCatalog();
    const resArr = Array.isArray(res) ? res : [];
    const userArr = Array.isArray(user) ? user : [];
    if (userArr.length === 0 && resArr.length === 0) return [];
    const resMap = new Map(resArr.map(e => [e && e.id, e]).filter(([k]) => !!k));
    const merged = userArr.map(u => {
        const overlay = resMap.get(u && u.id) || {};
        // Only fill when missing in user entry
        const sourceOverlay = u && sources && sources[u.id] ? sources[u.id] : {};
        return {
            ...u,
            repo: u.repo || overlay.repo || sourceOverlay.repo,
            assetPattern: u.assetPattern || overlay.assetPattern,
            checkUrl: u.checkUrl || overlay.checkUrl || sourceOverlay.checkUrl,
            url: u.url || overlay.url,
        };
    });
    // Add entries present only in resource catalog but not in user
    const mergedIds = new Set(merged.map(e => e && e.id).filter(Boolean));
    for (const e of resArr) {
        if (!e || !e.id || mergedIds.has(e.id)) continue;
        merged.push(e);
        mergedIds.add(e.id);
    }
    // Add entries present only in sources (installed via URL but not cataloged)
    for (const [sid, s] of Object.entries(sources || {})) {
        if (!sid || mergedIds.has(sid)) continue;
        merged.push({ id: sid, name: sid, repo: s.repo, checkUrl: s.checkUrl });
        mergedIds.add(sid);
    }
    return merged;
}

async function getInstalledPluginFiles() {
    const pluginsPath = store.get('pluginsPath', '');
    if (!pluginsPath) return [];
    const skylinePath = path.dirname(pluginsPath);
    const disabledPath = path.join(skylinePath, DISABLED_PLUGINS_FOLDER_NAME);
    const out = [];
    try {
        const files = await fsp.readdir(pluginsPath);
        for (const f of files) if (f.toLowerCase().endsWith(PLUGIN_EXTENSION)) out.push(f);
    } catch {}
    try {
        const files = await fsp.readdir(disabledPath);
        for (const f of files) if (f.toLowerCase().endsWith(PLUGIN_EXTENSION)) out.push(f);
    } catch {}
    return out;
}

function isEntryInstalled(entry, installedFiles) {
    if (!entry || !installedFiles || installedFiles.length === 0) return false;
    const id = String(entry.id || '').toLowerCase();
    let re = null;
    if (entry.assetPattern) {
        try { re = new RegExp(entry.assetPattern); } catch { re = null; }
    }
    return installedFiles.some(f => {
        const name = f.toLowerCase();
        if (id && name.includes(id)) return true;
        if (re && re.test(f)) return true;
        return false;
    });
}

function normalizeVersion(v) {
    if (!v) return '';
    const s = String(v).trim();
    return s.startsWith('v') || s.startsWith('V') ? s.slice(1) : s;
}

// Try to extract a semver-ish version from a string (filename or URL)
function extractVersionFromString(input) {
    if (!input) return null;
    try {
        const s = String(input);
        const dotty = s.replace(/_/g, '.');
        // Require at least one dot to avoid matching plain numeric IDs from CDN URLs
        const m = dotty.match(/(?:^|[\/_\-])v?([0-9]+(?:\.[0-9]+){1,3}(?:-[0-9A-Za-z.]+)?)(?=[^0-9A-Za-z.-]|$)/);
        return m && m[1] ? normalizeVersion(m[1]) : null;
    } catch {
        return null;
    }
}

function isLikelyVersion(v) {
    if (!v) return false;
    const s = normalizeVersion(v);
    // Accept x.y, x.y.z, x.y.z.w with optional pre-release
    return /^\d+\.\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.]+)?$/.test(s);
}

function compareSemver(a, b) {
    const as = normalizeVersion(a).split('.').map(n => parseInt(n, 10) || 0);
    const bs = normalizeVersion(b).split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(as.length, bs.length);
    for (let i = 0; i < len; i++) {
        const x = as[i] || 0;
        const y = bs[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

async function fetchLatestReleaseInfo(repo, assetPattern) {
    try {
        const url = `https://api.github.com/repos/${repo}/releases/latest`;
    log.info('[plugins-meta] GitHub latest:', url, 'pattern:', assetPattern || '(none)');
    const { data } = await axios.get(url, {
            headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'FightPlanner' }
        });
        const latestVersion = normalizeVersion(data.tag_name || data.name || '');
        let downloadUrl = null;
        if (Array.isArray(data.assets)) {
            const assets = data.assets;
            let matcher = null;
            if (assetPattern) {
                try { matcher = new RegExp(assetPattern); } catch { matcher = null; }
            }
            let match = null;
            if (matcher) {
                match = assets.find(a => matcher.test(a.name));
            }
            if (!match) {
                // Prefer direct .nro assets
                match = assets.find(a => a.name && a.name.toLowerCase().endsWith(PLUGIN_EXTENSION));
            }
            if (!match) {
                // Fall back to common archive formats (zip first)
                match = assets.find(a => a.name && /\.zip$/i.test(a.name));
            }
            if (!match) {
                match = assets.find(a => a.name && /\.(7z|rar)$/i.test(a.name));
            }
            downloadUrl = match ? match.browser_download_url : null;
        }
    log.info('[plugins-meta] GitHub result:', repo, 'version=', latestVersion || '(none)', 'asset=', downloadUrl || '(none)');
        return { latestVersion, downloadUrl };
    } catch (e) {
        console.error('Failed to fetch latest release for', repo, e.message);
    log.warn('[plugins-meta] GitHub latest failed for', repo, e.message);
        return { latestVersion: null, downloadUrl: null };
    }
}

// Resolve latest by following a provided URL (e.g., releases/latest/download/asset.nro)
async function resolveLatestFromCheckUrl(checkUrl) {
    try {
        log.info('[plugins-meta] resolve via URL:', checkUrl);
        const resp = await axios({
            method: 'get',
            url: checkUrl,
            responseType: 'stream',
            headers: { 'Accept': 'application/octet-stream', 'User-Agent': 'FightPlanner' },
            maxRedirects: 10,
        });
        const finalUrl = (resp?.request?.res?.responseUrl) || (resp?.request?._redirectable?._currentUrl) || checkUrl;
        // Try to parse version from the final URL or Content-Disposition
        let latestVersion = extractVersionFromString(finalUrl);
        if (!latestVersion) {
            const cd = resp.headers && (resp.headers['content-disposition'] || resp.headers['Content-Disposition']);
            if (cd) {
                const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
                const fname = decodeURIComponent(m && (m[1] || m[2] || '')).trim();
                latestVersion = extractVersionFromString(fname) || null;
            }
        }
        log.info('[plugins-meta] URL resolve result:', { latestVersion: latestVersion || '(none)', finalUrl });
        return { latestVersion: latestVersion || null, downloadUrl: finalUrl };
    } catch (e) {
        log.warn('[plugins-meta] resolve via URL failed:', checkUrl, e.message);
        return { latestVersion: null, downloadUrl: null };
    }
}

async function deleteExistingPluginFiles(pluginId, assetPattern) {
    const pluginsPath = store.get('pluginsPath', '');
    if (!pluginsPath) return;
    const skylinePath = path.dirname(pluginsPath);
    const disabledPluginsPath = path.join(skylinePath, DISABLED_PLUGINS_FOLDER_NAME);
    let regex = null;
    if (assetPattern) {
        try { regex = new RegExp(assetPattern); } catch { regex = null; }
    }
    const tryDelete = async (dir) => {
        try {
            const files = await fsp.readdir(dir);
            for (const file of files) {
                if (!file.toLowerCase().endsWith(PLUGIN_EXTENSION)) continue;
                const nameLc = file.toLowerCase();
                const matchById = pluginId && nameLc.includes(String(pluginId).toLowerCase());
                const matchByPattern = regex ? regex.test(file) : false;
                if (matchById || matchByPattern) {
                    await fse.remove(path.join(dir, file));
                }
            }
        } catch {}
    };
    await tryDelete(pluginsPath);
    await tryDelete(disabledPluginsPath);
}

async function installPluginFromUrlInternal(url, options = {}) {
    const { pluginId, assetPattern } = options || {};
    const pluginsPath = store.get('pluginsPath');
    if (!pluginsPath) {
        throw new Error('Plugins directory not set');
    }
    await fse.ensureDir(pluginsPath);
    log.info('[plugins] Install from URL ->', url, 'dest root:', pluginsPath);
    const initialUrlObj = new URL(url);
    let provisionalName = path.basename(initialUrlObj.pathname) || `plugin_${Date.now()}${PLUGIN_EXTENSION}`;
    // Don't force .nro here; we'll decide based on final type

    // Request (will follow redirects), then decide final filename from headers or final URL
    const response = await axios({
        method: 'get',
        url,
        responseType: 'stream',
        headers: { 'Accept': 'application/octet-stream', 'User-Agent': 'FightPlanner' },
        maxRedirects: 10,
    });
    const finalUrl = (response?.request?.res?.responseUrl) || (response?.request?._redirectable?._currentUrl) || url;
    let finalName = null;
    const cd = response.headers && (response.headers['content-disposition'] || response.headers['Content-Disposition']);
    if (cd) {
        const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
        const fname = decodeURIComponent(m && (m[1] || m[2] || '')).trim();
        if (fname) finalName = fname;
    }
    if (!finalName) {
        try {
            const fUrlObj = new URL(finalUrl);
            finalName = path.basename(fUrlObj.pathname);
        } catch {
            finalName = null;
        }
    }
    const resolvedName = finalName || provisionalName;
    const lower = (resolvedName || '').toLowerCase();
    const isZip = /\.zip$/i.test(lower);
    const isSevenZip = /\.7z$/i.test(lower);
    const isRar = /\.rar$/i.test(lower);
    const isNro = /\.nro$/i.test(lower);

    const versionFromUrl = extractVersionFromString(finalUrl);
    let versionFromName = extractVersionFromString(resolvedName);

    if (isNro) {
        // Direct .nro -> write into plugins folder
        let fileName = resolvedName;
        if (!fileName.toLowerCase().endsWith(PLUGIN_EXTENSION)) fileName += PLUGIN_EXTENSION;
        let destPath = path.join(pluginsPath, fileName);
        if (await fse.pathExists(destPath)) {
            try {
                await fse.remove(destPath);
                log.info('[plugins] Replaced existing file:', destPath);
            } catch (e) {
                let counter = 1;
                while (await fse.pathExists(destPath)) {
                    const base = path.basename(fileName, PLUGIN_EXTENSION);
                    destPath = path.join(pluginsPath, `${base}_${counter}${PLUGIN_EXTENSION}`);
                    counter++;
                }
                log.warn('[plugins] Could not replace existing, using unique name:', destPath);
            }
        }
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        log.info('[plugins] Downloaded plugin ->', destPath);
        return { id: path.basename(destPath), name: path.basename(destPath), path: destPath, enabled: true, finalUrl, versionFromUrl, versionFromName };
    }

    // Archive or other type -> download to temp, then extract .nro
    const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'fp-plugin-'));
    const tmpFile = path.join(tmpRoot, resolvedName || `asset_${Date.now()}`);
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tmpFile);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    log.info('[plugins] Downloaded asset to temp ->', tmpFile);

    let extractedNroPath = null;
    try {
        if (isZip) {
            const zip = new AdmZip(tmpFile);
            const entries = zip.getEntries();
            // Find candidate .nro
            let candidate = null;
            let pat = null;
            if (assetPattern) {
                try { pat = new RegExp(assetPattern, 'i'); } catch { pat = null; }
            }
            for (const e of entries) {
                if (e.isDirectory) continue;
                const name = e.entryName;
                if (!/\.nro$/i.test(name)) continue;
                if (pat && pat.test(path.basename(name))) { candidate = e; break; }
                if (!candidate && pluginId && name.toLowerCase().includes(String(pluginId).toLowerCase())) candidate = e;
                if (!candidate) candidate = e; // fallback to first .nro
            }
            if (!candidate) throw new Error('No .nro found in archive');
            const outName = path.basename(candidate.entryName);
            const outPath = path.join(pluginsPath, outName);
            // Replace existing
            if (await fse.pathExists(outPath)) {
                await fse.remove(outPath).catch(() => {});
            }
            zip.extractEntryTo(candidate, pluginsPath, false, true);
            extractedNroPath = outPath;
            versionFromName = extractVersionFromString(outName) || versionFromName;
            log.info('[plugins] Extracted .nro from zip ->', outPath);
        } else if (isSevenZip || isRar) {
            // Try using existing archive extraction helper to a temp dir, then search .nro
            const extractDir = path.join(tmpRoot, 'extracted');
            await fse.ensureDir(extractDir);
            try {
                await extractArchive(tmpFile, extractDir);
                // Scan for .nro
                const files = await fse.readdir(extractDir);
                let pat = null;
                if (assetPattern) { try { pat = new RegExp(assetPattern, 'i'); } catch { pat = null; } }
                let chosen = null;
                const walk = async (dir) => {
                    const items = await fse.readdir(dir);
                    for (const it of items) {
                        const full = path.join(dir, it);
                        const st = await fse.stat(full);
                        if (st.isDirectory()) { await walk(full); continue; }
                        if (!/\.nro$/i.test(it)) continue;
                        if (pat && pat.test(it)) { chosen = full; return; }
                        if (!chosen && pluginId && it.toLowerCase().includes(String(pluginId).toLowerCase())) chosen = full;
                        if (!chosen) chosen = full;
                    }
                };
                await walk(extractDir);
                if (!chosen) throw new Error('No .nro found in archive');
                const outPath = path.join(pluginsPath, path.basename(chosen));
                await fse.copy(chosen, outPath, { overwrite: true });
                extractedNroPath = outPath;
                versionFromName = extractVersionFromString(path.basename(chosen)) || versionFromName;
                log.info('[plugins] Extracted .nro from archive ->', outPath);
            } catch (e) {
                throw e;
            }
        } else {
            throw new Error('Unsupported asset type');
        }
    } finally {
        // Cleanup temp (best-effort)
        try { await fse.remove(tmpRoot); } catch {}
    }

    if (!extractedNroPath) {
        throw new Error('Failed to extract .nro from asset');
    }
    return { id: path.basename(extractedNroPath), name: path.basename(extractedNroPath), path: extractedNroPath, enabled: true, finalUrl, versionFromUrl, versionFromName };
}

async function checkPluginUpdatesOnStartup() {
    try {
        const pluginsPath = store.get('pluginsPath', '');
        if (!pluginsPath) return; // Skip if not configured
        await ensurePluginsMetaFiles();
    const catalog = await getEffectiveCatalog();
    const versions = await readJson(PLUGIN_VERSIONS_PATH, {});
    const latestCache = await readJson(PLUGIN_LATEST_CACHE_PATH, {});
        if (!Array.isArray(catalog) || catalog.length === 0) return;
        const installedFiles = await getInstalledPluginFiles();

        const updates = [];
        for (const entry of catalog) {
            const { id, name, repo, assetPattern, checkUrl, url } = entry || {};
            if (id === 'arcropolis') {
                log.info('[plugins-meta] arcropolis entry:', { repo, assetPattern, checkUrl, url });
            }
            if (!id || !repo) continue;
            // Skip entries that are clearly not installed (avoids querying example placeholders)
            if (!versions[id] && !isEntryInstalled(entry, installedFiles)) {
                continue;
            }
            const current = versions[id] || null;
            let latestVersion = null;
            let downloadUrl = null;
            // Prefer URL-based resolution when provided
            const check = checkUrl || url || null;
            if (check) {
                const r = await resolveLatestFromCheckUrl(check);
                latestVersion = r.latestVersion;
                downloadUrl = r.downloadUrl;
            }
            // Fallback to GitHub API resolution
            if (!latestVersion) {
                const r = await fetchLatestReleaseInfo(repo, assetPattern);
                latestVersion = r.latestVersion;
                downloadUrl = r.downloadUrl;
            }
            // Update cache with the resolved latest version (even if we skip update)
            if (latestVersion && isLikelyVersion(latestVersion)) {
                latestCache[id] = { latestVersion, ts: Date.now() };
            }
            // Do NOT guess a latest/download URL when we couldn't match an asset.
            // We'll rely on GitHub API-provided assets (which may be archives) and handle extraction.
            if (id === 'arcropolis') {
                log.info('[plugins-meta] arcropolis resolved:', { latestVersion: latestVersion || '(none)', downloadUrl: downloadUrl || '(none)' });
            }
            if (!latestVersion) continue;
            if (!current || compareSemver(current, latestVersion) < 0) {
                updates.push({ id, name: name || id, current: current || 'none', latest: latestVersion, downloadUrl, assetPattern });
            }
        }

        // Persist the latest version cache before asking the user
        await writeJson(PLUGIN_LATEST_CACHE_PATH, latestCache);

    log.info('[plugins-meta] startup updates found:', updates.length);
        if (updates.length === 0) return;

        const message = updates.map(u => `• ${u.name}: ${u.current} → ${u.latest}`).join('\n');
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Plugin updates available',
            message: 'New plugin version(s) available',
            detail: `${message}\n\nDo you want me to update them now?`,
            buttons: ['Update now', 'Later'],
            defaultId: 0,
            cancelId: 1
        });

        if (response !== 0) return; // user chose Later

    for (const u of updates) {
            try {
    if (u.downloadUrl) {
                    log.info('[plugins-meta] updating', u.id, '->', u.latest);
            await deleteExistingPluginFiles(u.id, u.assetPattern);
            const result = await installPluginFromUrlInternal(u.downloadUrl, { pluginId: u.id, assetPattern: u.assetPattern });
                    // Try to extract version from the download result
                    let newVersion = null;
                    if (result.versionFromUrl && isLikelyVersion(result.versionFromUrl)) {
                        newVersion = result.versionFromUrl;
                        log.info('[plugins-meta] update: version from finalUrl:', newVersion);
                    } else if (result.versionFromName && isLikelyVersion(result.versionFromName)) {
                        newVersion = result.versionFromName;
                        log.info('[plugins-meta] update: version from fileName:', newVersion);
                    } else if (latestCache[u.id]?.latestVersion && isLikelyVersion(latestCache[u.id].latestVersion)) {
                        newVersion = latestCache[u.id].latestVersion;
                        log.info('[plugins-meta] update: fallback to cached latest:', newVersion);
                    } else if (u.latest && isLikelyVersion(u.latest)) {
                        newVersion = u.latest;
                        log.info('[plugins-meta] update: fallback to catalog latest:', newVersion);
                    }
                    if (newVersion) {
                        versions[u.id] = newVersion;
                        log.info('[plugins-meta] update: wrote version for', u.id, newVersion);
                    }
                } else {
                    // No direct download URL found; still record the latest version we resolved
                    const latestForId = latestCache[u.id]?.latestVersion || u.latest;
                    if (latestForId && isLikelyVersion(latestForId)) {
                        versions[u.id] = normalizeVersion(latestForId);
                        log.info('[plugins-meta] update: no asset URL, set version for', u.id, 'to', versions[u.id]);
                    } else {
                        log.warn('[plugins-meta] update: no asset URL and no valid latest version for', u.id);
                    }
                }
            } catch (e) {
                console.error(`Failed to update plugin ${u.id}:`, e);
                log.error('[plugins-meta] update failed for', u.id, e);
            }
        }
        await writeJson(PLUGIN_VERSIONS_PATH, versions);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('plugins-updated', updates);
        }
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Plugins updated',
            message: 'Selected plugins have been updated.'
        });
    } catch (e) {
        console.error('checkPluginUpdatesOnStartup error:', e);
        log.error('[plugins-meta] startup update error:', e);
    }
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv, workingDirectory) => {
        // Someone tried to run a second instance
        if (process.platform === 'win32') {
            // Check for protocol URL in the second instance's arguments
            const protocolUrl = argv.find(arg => arg.startsWith('fightplanner://'));
            if (protocolUrl && mainWindow) {
                handleProtocolUrl(protocolUrl);
            }
        }
        
        // Focus the main window
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('fightplanner', process.execPath, [path.resolve(process.argv[1])]);
        }
    } else {
        app.setAsDefaultProtocolClient('fightplanner');
    }

app.whenReady().then(async () => {
    const hasAsked = store.get('hasAskedForSentry', false);
    const sentryEnabled = store.get('sentryEnabled', false);

    if (!hasAsked) {
        const userChoice = await askToEnableSentry();
        store.set('hasAskedForSentry', true);

        if (userChoice) {
            initializeSentry();
        }
    } else if (sentryEnabled) {
        initializeSentry();
    }

    // Continue avec le reste de l'initialisation de l'application
    if (!mainWindow) {
        createWindow();
    }


    // Create hidden window for audio
    hiddenWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            width: 1300,
            height: 800,
            contextIsolation: true,
        },
    });
    
    hiddenWindow.loadFile('./src/windows/audioPlayer.html');
    
    // Set initial volume
    const volume = store.get('volume', 100);
    hiddenWindow.webContents.on('did-finish-load', () => {
        hiddenWindow.webContents.executeJavaScript(`
            setVolume(${volume});
        `);
    });

        // Handle protocol URL if present
        if (process.platform === 'win32') {
            const url = process.argv.find(arg => arg.startsWith('fightplanner:'));
            if (url) {
                handleProtocolUrl(url);
            }
        }
        if (initialProtocolUrl) {
            handleProtocolUrl(initialProtocolUrl);
            initialProtocolUrl = null;
        }
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Window control handlers
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
});
        
    });


    
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    app.on('window-all-closed', function () {
        if (hiddenWindow && !hiddenWindow.isDestroyed()) {
            hiddenWindow.destroy();
        }
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('open-url', async (event, url) => {
        event.preventDefault();
        handleProtocolUrl(url);
    });

    

    app.on('second-instance', async (event, argv) => {
        if (process.platform === 'win32') {
            const url = argv.find(arg => arg.startsWith('fightplanner:'));
            if (url) {
                handleProtocolUrl(url);
            }
        }
    });
    
    function showErrorModal(message) {
        if (!mainWindow || !mainWindow.webContents) return;

        const sanitizedMessage = message.replace(/'/g, "\\'").replace(/\n/g, '<br>');
        const modalScript = `
            (function() {
                function createErrorModal(message) {
                    // Remove existing modal if any
                    let existingModal = document.getElementById('errorModal');
                    if (existingModal) {
                        existingModal.remove();
                    }

                    // Create modal HTML
                    const modalHtml = \`
                        <div class="modal fade" id="errorModal" tabindex="-1" role="dialog" aria-labelledby="errorModalLabel" aria-hidden="true">
                            <div class="modal-dialog" role="document">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title" id="errorModalLabel">Error</h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>
                                    <div class="modal-body">\${message}</div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;

                    // Add modal to body
                    document.body.insertAdjacentHTML('beforeend', modalHtml);

                    // Show modal
                    const modalElement = document.getElementById('errorModal');
                    if (modalElement) {
                        const modal = new bootstrap.Modal(modalElement, {
                            keyboard: false,
                            backdrop: 'static'
                        });
                        modal.show();
                    }
                }

                // Wait for Bootstrap to be available
                function showError() {
                    if (typeof bootstrap !== 'undefined') {
                        createErrorModal('${sanitizedMessage}');
                    } else {
                        setTimeout(showError, 100);
                    }
                }

                showError();
            })();
        `;

        mainWindow.webContents.executeJavaScript(modalScript).catch(err => {
            console.error('Error showing modal:', err);
            // Fallback to basic alert if modal fails
            mainWindow.webContents.executeJavaScript(`alert("${sanitizedMessage}");`);
        });
    }
    
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        setTimeout(() => {
            showErrorModal(`An unexpected error occurred in launch: ${error.message}. If your config is not gone you can still use FightPlanner, but please make a suggestion with the link in the settings and put your user id in the suggestion and the error .`);
        }, 1000);
    if (store.get('sentryEnabled', true)) {
        Sentry.captureException(error);
    }
    });

    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled Rejection:', reason);
    if (store.get('sentryEnabled', true)) {
        Sentry.captureException(reason instanceof Error ? reason : new Error(reason));
    }
    });
}

async function createWindow() {
    // Check if it's the first launch
    const isFirstLaunch = !store.get('hasLaunchedBefore');

    mainWindow = new BrowserWindow({
        width: 1300,
        height: 800,
        show: !isFirstLaunch, // Don't show if it's first launch
        frame: false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        backgroundColor: '#1a1a1a',
        webPreferences: {
            nodeIntegration: false,
            enableRemoteModule: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenuBarVisibility(false);

    discordRPC.connect();

    app.on('before-quit', () => {
        if (hiddenWindow && !hiddenWindow.isDestroyed()) {
            hiddenWindow.destroy();
        }
        discordRPC.disconnect();
    });

    mainWindow.loadFile('./src/windows/main.html');

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        if (hiddenWindow && !hiddenWindow.isDestroyed()) {
            hiddenWindow.destroy();
        }
        app.quit();
      });

    // Load custom CSS if it exists
    const customCssPath = store.get('customCssPath', path.join(__dirname, 'custom.css'));
    try {
        await fsp.access(customCssPath);
        mainWindow.webContents.on('did-finish-load', async () => {
            const customCss = await fsp.readFile(customCssPath, 'utf8');
            mainWindow.webContents.insertCSS(customCss);
            mainWindow.webContents.executeJavaScript(`
                document.body.classList.add('custom-theme');
            `);
            console.log('Custom CSS loaded');
        });
    } catch (error) {
        console.log('Custom CSS not found');
    }

    
    autoUpdater.checkForUpdatesAndNotify();

    // If it's the first launch, open tutorial window
    if (isFirstLaunch) {
        openTutorialWindow();
        
        // Mark as launched
        store.set('hasLaunchedBefore', true);
    }
    mainWindow.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    const modsPath = store.get('modsPath', '');
    const pluginsPath = store.get('pluginsPath', '');

    // Only create disabled folders if paths are set and valid
    if (modsPath && pluginsPath) {
        try {
            const ultimatePath = path.dirname(modsPath);
            const skylinePath = path.dirname(pluginsPath);
            
            // Validate paths before creating any folders
            if (!skylinePath.toLowerCase().includes('system32') && 
                !skylinePath.toLowerCase().includes('windows') &&
                await fse.pathExists(modsPath) &&
                await fse.pathExists(pluginsPath)) {
                
                const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);
                const disabledPluginsPath = path.join(skylinePath, DISABLED_PLUGINS_FOLDER_NAME);

                // Create directories with proper error handling
                await Promise.all([
                    fsp.mkdir(disabledModsPath, { recursive: true }).catch(err => 
                        console.error('Failed to create disabled mods directory:', err)),
                    fsp.mkdir(disabledPluginsPath, { recursive: true }).catch(err => 
                        console.error('Failed to create disabled plugins directory:', err))
                ]);

                // Move old folders if necessary
                await Promise.all([
                    checkAndMoveOldDisabledFolder(modsPath, disabledModsPath),
                    checkAndMoveOldDisabledFolder(pluginsPath, disabledPluginsPath)
                ]);
            }
        } catch (error) {
            console.error('Error setting up directories:', error);
        }
    }

    mainWindow.webContents.on('did-finish-load', () => {
        // Inject Bootstrap if not present
        mainWindow.webContents.executeJavaScript(`
            if (typeof bootstrap === 'undefined') {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css';
                document.head.appendChild(link);

                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js';
                document.head.appendChild(script);
            }
        `);
    });
    // Log settings on startup
    logAppSettings();

    // Handle any pending protocol URL after window is created
    mainWindow.webContents.on('did-finish-load', () => {
        if (initialProtocolUrl) {
            handleProtocolUrl(initialProtocolUrl);
            initialProtocolUrl = null;
        }
    });

    const isAprilFools = new Date().getMonth() === 3 && new Date().getDate() === 1;
    
    if (isAprilFools) {
        mainWindow.setTitle('FeetPlanner');
    }

    mainWindow.on('close', (event) => {
        if (activeDownloads.size > 0) {
            const response = dialog.showMessageBoxSync(mainWindow, {
                type: 'warning',
                buttons: ['Cancel', 'Quit'],
                defaultId: 0,
                cancelId: 0,
                title: 'Active Downloads',
                message: 'There are active downloads. Quitting now will cancel them. Do you want to quit?'
            });
            if (response === 0) { // User selected Cancel
                event.preventDefault();
            }
        }
    });

    // After window ready, check plugins updates in background
    setTimeout(() => { checkPluginUpdatesOnStartup(); }, 1000);
}

async function checkAndMoveOldDisabledFolder(folderPath, newDisabledFolderPath) {
    const oldDisabledFolderPath = path.join(folderPath, DISABLED_MODS_FOLDER_NAME);
    try {
        const oldExists = await fse.pathExists(oldDisabledFolderPath);
        if (oldExists) {
            await fse.copy(oldDisabledFolderPath, newDisabledFolderPath, { overwrite: true });
            const files = await fsp.readdir(oldDisabledFolderPath);
            for (const file of files) {
                const oldFilePath = path.join(oldDisabledFolderPath, file);
                const newFilePath = path.join(newDisabledFolderPath, file);
                await fse.move(oldFilePath, newFilePath, { overwrite: true });
            }
            await fse.remove(oldDisabledFolderPath); // Ensure the old folder is deleted
            console.log(`Copied and moved contents from ${oldDisabledFolderPath} to ${newDisabledFolderPath}`);
        }
    } catch (error) {
        console.error('Error copying and moving contents of old disabled folder:', error);
    }
}

// Auto-update event handlers
autoUpdater.on('update-available', () => {
    log.info('Update available.');
    dialog.showMessageBox({
        type: 'info',
        title: 'Update available',
        message: 'A new update is available. It will be downloaded in the background.',
    });
});

autoUpdater.on('update-downloaded', async () => {
    log.info('Update downloaded.');
    const changelog = await fetchChangelog();
    mainWindow.webContents.send('update-downloaded', changelog);
    dialog.showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'A new update is ready. Restart the application to apply the updates.',
        detail: changelog,
        buttons: ['Restart', 'Later']
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

console.log(app.getPath('userData'));

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater:', err);
});

async function fetchChangelog() {
    try {
        const response = await axios.get('https://api.github.com/repos/FIREXDF/SSBUFightPlanner/releases/latest');
        const changelog = response.data.body;
        return changelog;
    } catch (error) {
        console.error('Failed to fetch changelog:', error);
        return 'Failed to fetch changelog.';
    }
}

function openTutorialWindow() {
    tutorialWindow = new BrowserWindow({
        width: 1300,
        height: 800,
        modal: true,
        frame: false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        backgroundColor: '#1a1a1a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    tutorialWindow.loadFile('src/windows/tutorial.html');
}
// Add IPC handlers
ipcMain.handle('tutorial-finished', () => {
    // Show and focus the main window
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        // Rafraîchir la liste des mods après le tuto
        mainWindow.webContents.send('refresh-mods-after-tutorial');
    }

    // Close the tutorial window
    if (tutorialWindow) {
        tutorialWindow.close();
    }

    return true;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options);
    return result;
});


ipcMain.on('download-confirmation', async (event, { confirmed, details }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (confirmed) {
        try {
            // Send download request to renderer process
            mainWindow.webContents.send('start-mod-download', details.downloadLink);
        } catch (error) {
            console.error('Download initiation error:', error);
            
            // Optionally send error back to renderer
            mainWindow.webContents.send('download-error', error.message);
        }
    } else {
        console.log('Mod download cancelled by user');
        
        // Optionally send cancellation notification
        mainWindow.webContents.send('download-cancelled');
    }
});

// Helper function to find the correct 7-Zip binary path based on platform
function get7ZipPath() {
    const resourcePath = process.resourcesPath || path.join(__dirname, '.');
    let binaryName;
    
    // Determine the correct binary name based on platform
    if (process.platform === 'win32') {
        binaryName = '7z.exe';
    } else if (process.platform === 'darwin') {
        binaryName = '7zz';
    } else {
        // Linux or other Unix-like systems
        binaryName = '7zz';
    }
    
    const sevenZipPath = path.join(resourcePath, 'src', 'resources', 'bin', binaryName);
    log.info(`[7zip] Using ${binaryName} from: ${sevenZipPath}`);
    
    return sevenZipPath;
}

function extractArchive(source, destination) {
    return new Promise(async (resolve, reject) => {
        try {
            const sevenZipPath = get7ZipPath();
            
            // Construct extraction command
            const command = `"${sevenZipPath}" x "${source}" -o"${destination}" -y`;

            // Execute extraction
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Extraction command error:', error);
                    console.error('stdout:', stdout);
                    console.error('stderr:', stderr);
                    reject(new Error(`Extraction failed: ${error.message}`));
                    return;
                }
                resolve();
            });
        } catch (error) {
            console.error('Extraction setup error:', error);
            reject(error);
        }
    });
}

// Mod loading handler
ipcMain.handle('load-mods', async () => {
    const modsPath = store.get('modsPath', '');
    if (!modsPath) return [];

    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);
    const legacyDiscovery = store.get('legacyModDiscovery', false);
    const removeDot = store.get('removeDot', false);

    try {
        const mods = [];
        const modMeta = store.get('modsMeta', {});
        
        // Read main mods folder
        const files = await fsp.readdir(modsPath);
        for (const file of files) {
            const filePath = path.join(modsPath, file);
            const stats = await fsp.stat(filePath);
            
            if (stats.isDirectory()) {
                // Skip the disabled mods folder if it happens to be inside the mods folder
                if (file === DISABLED_MODS_FOLDER_NAME) {
                    continue;
                }
                
                // Any mod with a dot prefix is considered disabled, regardless of legacy mode
                const isDotPrefixed = file.startsWith('.');
                const isEnabled = !isDotPrefixed;
                
                // For display purposes, remove the dot from the name only
                const displayName = isDotPrefixed && removeDot ? file.substring(1) : file;
                
                mods.push({
                    id: file,
                    name: displayName,
                    enabled: isEnabled,
                    path: filePath,
                    sortName: isDotPrefixed ? file.substring(1) : file, // Name without dot for sorting
                    installedAt: modMeta?.[file]?.installedAt || null,
                    mtimeMs: stats.mtimeMs
                });
            }
        }

        // Always check the disabled mods folder regardless of mode
        if (await fse.pathExists(disabledModsPath)) {
            try {
                const disabledFiles = await fsp.readdir(disabledModsPath);
                for (const file of disabledFiles) {
                    const filePath = path.join(disabledModsPath, file);
                    const stats = await fsp.stat(filePath);
                    
                    if (stats.isDirectory()) {
                        mods.push({
                            id: file,
                            name: file,
                            enabled: false,
                            path: filePath,
                            sortName: file, // Already without dot prefix
                            installedAt: modMeta?.[file]?.installedAt || null,
                            mtimeMs: stats.mtimeMs
                        });
                    }
                }
            } catch (error) {
                console.error('Error reading disabled mods folder:', error);
            }
        }
        
        // Sort mods: either by recent or by name within enabled/disabled groups
        const sortRecent = store.get('modsSortRecent', false);
        mods.sort((a, b) => {
            // First sort by enabled status
            if (a.enabled !== b.enabled) return a.enabled ? -1 : 1; // Enabled first
            if (sortRecent) {
                const atA = a.installedAt ? new Date(a.installedAt).getTime() : (a.mtimeMs || 0);
                const atB = b.installedAt ? new Date(b.installedAt).getTime() : (b.mtimeMs || 0);
                if (atA !== atB) return atB - atA; // Newest first
            }
            // Fallback alphabetical
            return a.sortName.localeCompare(b.sortName);
        });
        
        // Remove temporary sortName property before returning
    return mods.map(({ sortName, ...mod }) => mod);
    } catch (error) {
        console.error('Error loading mods:', error);
        return [];
    }
});

// Mod installation handler
ipcMain.handle('install-mod', async (event, filePath) => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    try {
        // Generate a unique mod name
        const fileName = path.basename(filePath, path.extname(filePath));
        const modDestPath = path.join(modsPath, fileName);

        // Create a unique folder name if exists
        let uniqueModName = fileName;
        let counter = 1;
        while (await fse.pathExists(path.join(modsPath, uniqueModName))) {
            uniqueModName = `${fileName}_${counter}`;
            counter++;
        }

        // Create destination directory
        const finalDestPath = path.join(modsPath, uniqueModName);
        await fsp.mkdir(finalDestPath, { recursive: true });

        // Determine file type and extract accordingly
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case '.zip':
                await extractZipFile(filePath, finalDestPath);
                break;
            case '.7z':
            case '.rar':
                await extractArchive(filePath, finalDestPath);
                break;
            default:
                throw new Error(`Unsupported file type: ${ext}`);
        }

        // Record installation timestamp metadata for sorting
        try {
            const meta = store.get('modsMeta', {});
            const nowIso = new Date().toISOString();
            meta[uniqueModName] = { ...(meta[uniqueModName] || {}), installedAt: nowIso };
            store.set('modsMeta', meta);
        } catch (e) {
            console.warn('modsMeta persist failed:', e);
        }

        return {
            id: uniqueModName,
            name: uniqueModName,
            path: finalDestPath
        };
    } catch (error) {
        console.error('Mod installation error:', error);
        throw error;
    }
});

// Zip extraction using adm-zip
function extractZipFile(source, destination) {
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip(source);
            zip.extractAllTo(destination, true);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

// Mod toggle handler
ipcMain.handle('toggle-mod', async (event, modId) => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    const legacyDiscovery = store.get('legacyModDiscovery', false);
    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    try {
        // Check if this is a dot-prefixed mod (disabled in legacy mode)
        if (modId.startsWith('.')) {
            // Enable: Remove the dot
            const enabledModId = modId.substring(1);
            const currentPath = path.join(modsPath, modId);
            const newPath = path.join(modsPath, enabledModId);
            
            // Check if paths exist before attempting rename
            if (await fse.pathExists(currentPath)) {
                await fse.rename(currentPath, newPath);
                return true; // Now enabled
            }
        } else if (legacyDiscovery) {
            // Legacy mode - check regular mod path first
            const modPath = path.join(modsPath, modId);
            
            if (await fse.pathExists(modPath)) {
                // Regular mod in mods folder - disable it by adding a dot
                const disabledModId = `.${modId}`;
                const newPath = path.join(modsPath, disabledModId);
                
                await fse.rename(modPath, newPath);
                return false; // Now disabled
            } 
            
            // Check if the mod is in the disabled folder (from non-legacy mode)
            const disabledModPath = path.join(disabledModsPath, modId);
            if (await fse.pathExists(disabledModPath)) {
                // Mod was disabled in non-legacy mode, move to main folder WITHOUT adding dot
                // (this is the key fix - we're enabling it in legacy mode)
                await fse.move(disabledModPath, path.join(modsPath, modId))
                return true; // Now enabled
            }
        } else {
            // Non-legacy mode
            const modPath = path.join(modsPath, modId);
            const disabledModPath = path.join(disabledModsPath, modId);
            
            // Check if mod is in main folder
            if (await fse.pathExists(modPath)) {
                // Disable the mod by moving to disabled folder
                await fse.ensureDir(disabledModsPath);
                await fse.move(modPath, disabledModPath, { overwrite: true });
                return false; // Now disabled
            } 
            
            // Check if mod is in disabled folder
            if (await fse.pathExists(disabledModPath)) {
                // Enable the mod
                await fse.move(disabledModPath, modPath, { overwrite: true });
                return true; // Now enabled
            }
            
            // Check if mod is in legacy format (has dot prefix)
            const legacyDisabledModPath = path.join(modsPath, `.${modId}`);
            if (await fse.pathExists(legacyDisabledModPath)) {
                // Move from legacy format to disabled folder
                await fse.ensureDir(disabledModsPath);
                await fse.move(legacyDisabledModPath, disabledModPath);
                return false; // Keep it disabled, but in non-legacy format
            }
        }

        throw new Error('Mod not found');
    } catch (error) {
        console.error('Mod toggle error:', error);
        hiddenWindow.webContents.executeJavaScript('playError()');
        throw error;
    }
});

ipcMain.handle('get-mod-path', async (event, modId) => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    const enabledModPath = path.join(modsPath, modId);
    const disabledModPath = path.join(disabledModsPath, modId);

    if (await fse.pathExists(enabledModPath)) {
        return enabledModPath;
    }
    if (await fse.pathExists(disabledModPath)) {
        return disabledModPath;
    }

    throw new Error('Mod not found');
});

// Enable all mods handler
ipcMain.handle('enable-all-mods', async () => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods path not set');
    }

    try {
        const ultimatePath = path.dirname(modsPath);
        const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);
        
        // Get all disabled mods
        const disabledMods = await fsp.readdir(disabledModsPath).catch(() => []);
        
        // Enable each mod
        for (const mod of disabledMods) {
            const sourcePath = path.join(disabledModsPath, mod);
            const targetPath = path.join(modsPath, mod);
            await fse.move(sourcePath, targetPath);
        }

        return true;
    } catch (error) {
        console.error('Failed to enable all mods:', error);
        throw error;
    }
});

// Disable all mods handler
ipcMain.handle('disable-all-mods', async () => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods path not set');
    }

    try {
        const ultimatePath = path.dirname(modsPath);
        const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);
        
        // Ensure disabled mods directory exists
        await fse.ensureDir(disabledModsPath);
        
        // Get all enabled mods
        const enabledMods = await fsp.readdir(modsPath);
        
        // Disable each mod
        for (const mod of enabledMods) {
            const sourcePath = path.join(modsPath, mod);
            const targetPath = path.join(disabledModsPath, mod);
            await fse.move(sourcePath, targetPath);
        }

        return true;
    } catch (error) {
        console.error('Failed to disable all mods:', error);
        throw error;
    }
});

// Mod uninstallation handler
ipcMain.handle('uninstall-mod', async (event, modId) => {
    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    }

    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    try {
        // Check in main and disabled folders
        const modPath = path.join(modsPath, modId);
        const disabledModPath = path.join(disabledModsPath, modId);

        if (await fse.pathExists(modPath)) {
            await fse.remove(modPath);
        } else if (await fse.pathExists(disabledModPath)) {
            await fse.remove(disabledModPath);
        } else {
            throw new Error('Mod not found');
        }

        return true;
    } catch (error) {
        console.error('Mod uninstallation error:', error);
        hiddenWindow.webContents.executeJavaScript('playError()');
        throw error;
    }
});

// Mod info handlers
ipcMain.handle('get-mod-preview', async (event, modPath) => {
    try {
        const previewPath = path.join(modPath, 'preview.webp');
        if (await fse.pathExists(previewPath)) {
            return previewPath;
        }
        return null;
    } catch (error) {
        console.error('Error getting mod preview:', error);
        return null;
    }
});

ipcMain.handle('get-mod-info', async (event, modPath) => {
    try {
        const infoPath = path.join(modPath, 'info.toml');
        const modName = path.basename(modPath);
        if (await fse.pathExists(infoPath)) {
            const infoContent = await fsp.readFile(infoPath, 'utf8');
            try {
                return toml.parse(infoContent);
            } catch (parseError) {
                console.error(`TOML parse error in ${infoPath} (mod: ${modName}):`, parseError);
                throw parseError;
            }
        }
        return null;
    } catch (error) {
        const modName = path.basename(modPath);
        console.error(`Error getting mod info for mod "${modName}":`, error);
        return null;
    }
});

ipcMain.handle('save-mod-info', async (event, modPath, info) => {
    try {
        const infoPath = path.join(modPath, 'info.toml');
        
        // Convert the info object to TOML format
        let tomlContent = '';
        for (const [key, value] of Object.entries(info)) {
            // Skip empty values
            if (!value && key !== 'version') continue;
            
            if (key === 'description') {
                tomlContent += `${key} = """\n${value}\n"""\n`;
            } else {
                tomlContent += `${key} = "${value}"\n`;
            }
        }
        
        await fsp.writeFile(infoPath, tomlContent, 'utf8');
        return true;
    } catch (error) {
        console.error('Failed to save mod info:', error);
        throw error;
    }
});

// Open mods folder handler
ipcMain.handle('open-mods-folder', async () => {
    const modsPath = store.get('modsPath');
    if (modsPath) {
        shell.openPath(modsPath);
    }
});

// Open specific mod folder handler
ipcMain.handle('open-mod-folder', async (event, modId) => {
    const modsPath = store.get('modsPath');
    if (modsPath && modId) {
        const ultimatePath = path.dirname(modsPath);
        const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

        const modPath = path.join(modsPath, modId);
        const disabledModPath = path.join(disabledModsPath, modId);

        if (await fse.pathExists(modPath)) {
            shell.openPath(modPath);
        } else if (await fse.pathExists(disabledModPath)) {
            shell.openPath(disabledModPath);
        }
    }
});

// Settings handlers
ipcMain.handle('get-mods-path', () => {
    return store.get('modsPath', '');
});

ipcMain.handle('set-mods-path', (event, newPath) => {
    store.set('modsPath', newPath);
    log.info('Mods path updated:', newPath);
    return true;
});

ipcMain.handle('get-custom-css-path', () => {
    return store.get('customCssPath', '');
});

ipcMain.handle('set-custom-css-path', (event, newPath) => {
    store.set('customCssPath', newPath);
    return true;
});

ipcMain.handle('get-custom-css-enabled', async () => {
    try {
        return store.get('customCssEnabled', false);
    } catch (error) {
        console.error('Failed to get custom CSS enabled state:', error);
        throw error;
    }
});

ipcMain.handle('load-custom-css', async (event, path) => {
    try {
        const customCss = await fsp.readFile(path, 'utf8');
        mainWindow.webContents.insertCSS(customCss);
    } catch (error) {
        console.error('Failed to load custom CSS:', error);
        throw error;
    }
});

ipcMain.handle('remove-custom-css', async () => {
    try {
        mainWindow.webContents.removeInsertedCSS();
        store.delete('customCssPath');
    } catch (error) {
        console.error('Failed to remove custom CSS:', error);
        throw error;
    }
});

ipcMain.handle('select-custom-css-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'CSS Files', extensions: ['css'] }]
    });

    if (result.canceled) {
        return null;
    } else {
        return result.filePaths[0];
    }
});

ipcMain.handle('get-conflict-check-enabled', () => {
    return store.get('conflictCheckEnabled', true);
});

ipcMain.handle('set-conflict-check-enabled', (event, enabled) => {
    store.set('conflictCheckEnabled', enabled);
    return true;
});

// Legacy mod discovery handler
ipcMain.handle('get-legacy-mod-discovery', () => {
    return store.get('legacyModDiscovery', false);
});

ipcMain.handle('set-legacy-mod-discovery', (event, enabled) => {
    store.set('legacyModDiscovery', enabled);
    return true;
});

// Dark mode handler
ipcMain.handle('set-dark-mode', (event, enabled) => {
    store.set('darkMode', enabled);
    return true;
});

ipcMain.handle('get-dark-mode', () => {
    return store.get('darkMode', false);
});

// Mods sorting preference: recent downloads first
ipcMain.handle('get-mods-sort-recent-enabled', () => {
    return store.get('modsSortRecent', false);
});

ipcMain.handle('set-mods-sort-recent-enabled', (event, enabled) => {
    store.set('modsSortRecent', !!enabled);
    return true;
});

ipcMain.handle('get-send-version-enabled', () => {
    return store.get('sendVersionEnabled', true);
});

ipcMain.handle('set-send-version-enabled', (event, enabled) => {
    store.set('sendVersionEnabled', enabled);
    return true;
});

let currentDownload = null;

const activeDownloads = new Map();
let downloadIdCounter = 0;

ipcMain.handle('download-mod', async (event, downloadLink) => {
    let downloadId;
    try {
        downloadId = (downloadIdCounter++).toString();
        const modsPath = store.get('modsPath');
        if (!modsPath) throw new Error('Mods path not set');

        const GameBananaDownloader = require('./src/js/gameBananaDownloader');
        const downloader = new GameBananaDownloader(modsPath, {
            onStart: (message, modName) => {
                event.sender.send('download-status', { 
                    id: downloadId,
                    type: 'start', 
                    message,
                    modName
                });
            },
            onProgress: (message, progress, modName) => {
                event.sender.send('download-status', { 
                    id: downloadId,
                    type: 'progress', 
                    message,
                    progress: progress || 0,
                    modName
                });
            },
            onFinish: (message, modName) => {
                event.sender.send('download-status', { 
                    id: downloadId,
                    type: 'finish', 
                    message,
                    modName
                });
                activeDownloads.delete(downloadId);
                hiddenWindow.webContents.executeJavaScript('playFinish()');
            },
            onError: (message) => {
                event.sender.send('download-status', { 
                    id: downloadId,
                    type: 'error', 
                    message 
                });
                activeDownloads.delete(downloadId);
                hiddenWindow.webContents.executeJavaScript('playError()');
            }
        });

        activeDownloads.set(downloadId, downloader);
        const result = await downloader.downloadMod(downloadLink);
        
        if (result && result.cancelled) {
            event.sender.send('download-status', { 
                id: downloadId,
                type: 'cancelled', 
                message: 'Download cancelled by user' 
            });
            return { cancelled: true };
        }

        return result;
    } catch (error) {
        console.error('Mod download error:', error);
        event.sender.send('download-status', { 
            id: downloadId,
            type: 'error', 
            message: error.message 
        });
        throw error;
    }
});

ipcMain.handle('cancel-download', async (event, downloadId) => {
    try {
        const downloader = activeDownloads.get(downloadId);
        if (downloader) {
            await downloader.cancel();
            currentDownload = null; // Reset current download
            activeDownloads.delete(downloadId);
            event.sender.send('download-status', {
                id: downloadId,
                type: 'cancelled',
                message: 'Download cancelled'
            });
            return true;
        }
        return false;
    } catch (error) {
        console.error('Cancel download error:', error);
        throw error;
    }
});

ipcMain.handle('rename-mod', async (event, { oldName, newName }) => {
    console.log('Rename request received:', { oldName, newName });

    const modsPath = store.get('modsPath');
    if (!modsPath) {
        throw new Error('Mods directory not set');
    } 

    const ultimatePath = path.dirname(modsPath);
    const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

    try {
        // Paths for enabled and disabled mods
        const enabledModPath = path.join(modsPath, oldName);
        const disabledModPath = path.join(disabledModsPath, oldName);

        let sourcePath, destPath;

        // Determine if mod is enabled or disabled
        if (await fse.pathExists(enabledModPath)) {
            sourcePath = enabledModPath;
            destPath = path.join(modsPath, newName);
        } else if (await fse.pathExists(disabledModPath)) {
            sourcePath = disabledModPath;
            destPath = path.join(disabledModsPath, newName);
        } else {
            throw new Error('Mod folder not found');
        }

        // Check if destination path already exists
        if (await fse.pathExists(destPath)) {
            throw new Error('A mod with this name already exists');
        }

        // Use fs.promises for renaming with better error handling
        await fsp.rename(sourcePath, destPath);

        console.log(`Renamed from ${sourcePath} to ${destPath}`);

        return true;
    } catch (error) {
        console.error('Mod rename error:', error);

        // More detailed error handling
        if (error.code === 'EPERM') {
            // Try an alternative method using copy and delete
            try {
                await fse.copy(sourcePath, destPath);
                await fse.remove(sourcePath);
                console.log('Renamed using copy and delete method');
                return true;
            } catch (alternativeError) {
                console.error('Alternative rename method failed:', alternativeError);
                throw new Error('Failed to rename mod. Please close any open files or applications using the mod.');
            }
        }

        throw error;
    }
});
    ipcMain.handle('initialize-configurations', async () => {
        try {
            const path = require('path');
            const fs = require('fs').promises;
    
            // Ensure mods path is set
            const modsPath = store.get('modsPath');
            if (!modsPath) {
                throw new Error('Mods path not set');
            }
    
            // Create necessary directories
            const disabledModsPath = path.join(modsPath, DISABLED_MODS_FOLDER_NAME);
            await fs.mkdir(disabledModsPath, { recursive: true });
    
            // Set default settings
            const defaultSettings = {
                darkMode: false,
                autoUpdate: true,
                language: 'en'
            };
    
            // Save default settings if not exists
            Object.keys(defaultSettings).forEach(key => {
                if (!store.has(key)) {
                    store.set(key, defaultSettings[key]);
                }
            });
    
            // Scan initial mods
            const mods = await scanInitialMods(modsPath);
    
            console.log('Initialization complete:', {
                modsPath,
                settings: defaultSettings,
                initialMods: mods
            });
    
            return {
                modsPath,
                settings: defaultSettings,
                initialMods: mods
            };
        } catch (error) {
            console.error('Configuration initialization error:', error);
            throw error;
        }
    });
    
    // Helper function to scan initial mods
    async function scanInitialMods(modsPath) {
        const path = require('path');
        const fs = require('fs').promises;
    
        try {
            const files = await fs.readdir(modsPath);
            const modFolders = [];
    
            for (const file of files) {
                // Skip specific folders
                if (file === DISABLED_MODS_FOLDER_NAME) continue;
    
                const fullPath = path.join(modsPath, file);
                const stats = await fs.stat(fullPath);
    
                if (stats.isDirectory()) {
                    modFolders.push({
                        name: file,
                        path: fullPath,
                        enabled: true
                    });
                }
            }
    
            // Check disabled mods
            const disabledPath = path.join(modsPath, DISABLED_MODS_FOLDER_NAME);
            try {
                const disabledFiles = await fs.readdir(disabledPath);
                for (const file of disabledFiles) {
                    const fullPath = path.join(disabledPath, file);
                    const stats = await fs.stat(fullPath);
    
                    if (stats.isDirectory()) {
                        modFolders.push({
                            name: file,
                            path: fullPath,
                            enabled: false
                        });
                    }
                }
            } catch (disabledError) {
                // Ignore if disabled folder doesn't exist
                console.log('No disabled mods folder');
            }
    
            return modFolders;
        } catch (error) {
            console.error('Initial mod scan error:', error);
            return [];
        }
    }
    class DiscordRichPresence {
        constructor() {
            this.client = null;
            this.clientId = '1304806839115972628'; // Replace with your Discord app's client ID
            this.startTimestamp = new Date();
        }
    
        async connect() {
            if (this.client) return;
    
            this.client = new discordRPC.Client({ transport: 'ipc' });
    
            try {
                await this.client.login({ clientId: this.clientId });
                this.setActivity({
                    state: 'Browsing Mods',
                    details: 'Exploring Mod Collection',
                    largeImageKey: 'app_logo',
                    largeImageText: 'FightPlanner',
                    startTimestamp: this.startTimestamp
                });
    
                this.client.on('ready', () => {
                    console.log('Discord RPC connected');
                });
            } catch (error) {
                console.error('Discord RPC connection failed', error);
            }
        }
    
        setActivity(options) {
            if (!this.client) return;
    
            this.client.setActivity({
                ...options,
                instance: false
            });
        }
    
        updateModCount(count) {
            this.setActivity({
                state: 'Browsing Mods',
                details: `Managing ${count} Mods`,
                largeImageKey: 'app_logo',
                largeImageText: 'FightPlanner',
                startTimestamp: this.startTimestamp
            });
        }
    
        updateModInstallation() {
            this.setActivity({
                state: 'Modding',
                details: 'Installing Mod',
                largeImageKey: 'app_logo',
                largeImageText: 'FightPlanner',
                smallImageKey: 'install_icon',
                smallImageText: 'Installing'
            });
        }
    
        disconnect() {
            if (this.client) {
                this.client.clearActivity();
                this.client.destroy();
                this.client = null;
            }
        }
        
    }
    
    // Export the Discord RPC instance
    module.exports = new DiscordRichPresence();
    app.whenReady().then(() => {
    });
    ipcMain.on('open-external', (event, url) => {
        shell.openExternal(url);
    });
ipcMain.handle('load-plugins', async () => {
    const pluginsPath = store.get('pluginsPath', '');
    if (!pluginsPath) return [];

    const skylinePath = path.dirname(pluginsPath);
    const disabledPluginsPath = path.join(skylinePath, DISABLED_PLUGINS_FOLDER_NAME);

    try {
        const plugins = [];
        const files = await fsp.readdir(pluginsPath);
        for (const file of files) {
            const filePath = path.join(pluginsPath, file);
            const stats = await fsp.stat(filePath);
            if (stats.isFile() && file.endsWith(PLUGIN_EXTENSION)) {
                plugins.push({ id: file, name: file, path: filePath, enabled: true });
            }
        }

        // Read disabled plugins folder
        try {
            await fsp.access(disabledPluginsPath);
            const disabledFiles = await fsp.readdir(disabledPluginsPath);
            
            for (const file of disabledFiles) {
                const filePath = path.join(disabledPluginsPath, file);
                
                try {
                    const stats = await fsp.stat(filePath);
                    if (stats.isFile() && file.endsWith(PLUGIN_EXTENSION)) {
                        plugins.push({ id: file, name: file, path: filePath, enabled: false });
                    }
                } catch (statError) {
                    console.error(`Error reading disabled plugin ${file}:`, statError);
                }
            }
        } catch {
            // Disabled plugins folder doesn't exist, that's fine
        }

        return plugins;
    } catch (error) {
        console.error('Error loading plugins:', error);
        return [];
    }
});

ipcMain.handle('install-plugin', async (event, filePath) => {
    try {
        // Input validation
        if (!filePath) {
            throw new Error('No file path provided');
        }

        // Handle file path from different sources
        const resolvedPath = typeof filePath === 'object' ? filePath.path : filePath;
        if (typeof resolvedPath !== 'string') {
            throw new TypeError('The "path" argument must be of type string');
        }

        const pluginsPath = store.get('pluginsPath');
        if (!pluginsPath) {
            throw new Error('Plugins directory not set');
        }

        // Validate file extension
        if (!resolvedPath.toLowerCase().endsWith(PLUGIN_EXTENSION)) {
            throw new Error(`Invalid plugin file. Must be a ${PLUGIN_EXTENSION} file`);
        }

        // Check if file exists
        await fsp.access(resolvedPath);

        const fileName = path.basename(resolvedPath);
        const pluginDestPath = path.join(pluginsPath, fileName);

        // Prefer replacing existing file over creating _1
        let uniquePluginName = fileName;
        const initialTargetPath = path.join(pluginsPath, uniquePluginName);
        if (await fse.pathExists(initialTargetPath)) {
            try {
                await fse.remove(initialTargetPath);
                log.info('[plugins-meta] install-plugin replacing existing:', initialTargetPath);
            } catch (e) {
                // Fallback to unique name if we cannot remove
                let counter = 1;
                const nameWithoutExt = path.basename(fileName, PLUGIN_EXTENSION);
                while (await fse.pathExists(path.join(pluginsPath, uniquePluginName))) {
                    uniquePluginName = `${nameWithoutExt}_${counter}${PLUGIN_EXTENSION}`;
                    counter++;
                }
                log.warn('[plugins-meta] install-plugin could not replace, using unique name:', uniquePluginName);
            }
        }

        const finalDestPath = path.join(pluginsPath, uniquePluginName);
        log.info('[plugins-meta] install-plugin start:', {
            source: resolvedPath,
            pluginsPath,
            dest: finalDestPath,
            uniquePluginName
        });

        // Ensure plugins directory exists
        await fse.ensureDir(pluginsPath);

        // Pre-delete existing files if we can identify plugin id
        try {
            await ensurePluginsMetaFiles();
            const preCatalog = await getEffectiveCatalog();
            const fileBase = path.basename(uniquePluginName);
            let matchedPre = null;
            for (const entry of (Array.isArray(preCatalog) ? preCatalog : [])) {
                if (!entry || !entry.id) continue;
                if (entry.assetPattern) {
                    try { const re = new RegExp(entry.assetPattern); if (re.test(fileBase)) { matchedPre = entry; break; } } catch {}
                }
                if (!matchedPre && fileBase.toLowerCase().includes(String(entry.id).toLowerCase())) { matchedPre = entry; break; }
            }
            if (matchedPre && matchedPre.id) {
                log.info('[plugins-meta] install-plugin pre-delete for', matchedPre.id);
                await deleteExistingPluginFiles(matchedPre.id);
            }
        } catch (e) {
            log.warn('[plugins-meta] install-plugin pre-delete skipped:', e.message);
        }

        // Copy instead of move to handle cross-device transfers
        await fse.copy(resolvedPath, finalDestPath);

        const result = {
            id: uniquePluginName,
            name: uniquePluginName,
            path: finalDestPath,
            enabled: true
        };

        // Try to map to catalog and record version in AppData
        try {
            await ensurePluginsMetaFiles();
            const catalog = await getEffectiveCatalog();
            log.info('[plugins-meta] install-plugin catalog size (effective):', Array.isArray(catalog) ? catalog.length : 'invalid');
            if (Array.isArray(catalog) && catalog.length > 0) {
                const fileBase = path.basename(uniquePluginName);
                let matched = null;
                for (const entry of catalog) {
                    if (!entry || !entry.id) continue;
                    if (entry.assetPattern) {
                        try {
                            const re = new RegExp(entry.assetPattern);
                            if (re.test(fileBase)) { matched = entry; break; }
                        } catch {}
                    }
                    if (!matched && fileBase.toLowerCase().includes(String(entry.id).toLowerCase())) {
                        matched = entry;
                        break;
                    }
                }
                log.info('[plugins-meta] install-plugin match:', matched ? { id: matched.id, repo: matched.repo, assetPattern: matched.assetPattern } : '(none)');
                if (matched && matched.repo) {
                    const parsedFromName = extractVersionFromString(fileBase);
                    const info = await fetchLatestReleaseInfo(matched.repo, matched.assetPattern);
                    log.info('[plugins-meta] install-plugin latest info:', info, 'parsedFromName:', parsedFromName);
                    const finalVersionRaw = parsedFromName || (info && info.latestVersion) || null;
                    const finalVersion = isLikelyVersion(finalVersionRaw) ? finalVersionRaw : null;
                    if (finalVersion) {
                        const versions = await readJson(PLUGIN_VERSIONS_PATH, {});
                        versions[matched.id] = finalVersion;
                        await writeJson(PLUGIN_VERSIONS_PATH, versions);
                        log.info('[plugins-meta] install-plugin wrote version:', { id: matched.id, version: finalVersion, path: PLUGIN_VERSIONS_PATH });
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('plugins-updated', [{ id: matched.id }]);
                        }
                    } else {
                        log.warn('[plugins-meta] install-plugin: no valid version resolved for', matched.id, 'raw=', finalVersionRaw);
                    }
                }
            }
        } catch (e) {
            console.warn('install-plugin: version record skipped:', e.message);
            log.warn('[plugins-meta] install-plugin: version record skipped:', e);
        }

        return result;
    } catch (error) {
        console.error('Plugin installation error:', error);
        throw error; // Let the error propagate to the renderer
    }
});

ipcMain.handle('mod:createDirectory', async (event, dirPath) => {
    await fsp.mkdir(dirPath, { recursive: true });
    return true;
});

ipcMain.handle('delete-plugin', async (event, pluginId) => {
    const pluginsPath = store.get('pluginsPath');
    if (!pluginsPath) {
        throw new Error('Plugins directory not set');
    }

    const skylinePath = path.dirname(pluginsPath);
    const disabledPluginsPath = path.join(skylinePath, DISABLED_PLUGINS_FOLDER_NAME);

    try {
        const pluginPath = path.join(pluginsPath, pluginId);
        const disabledPluginPath = path.join(disabledPluginsPath, pluginId);

        if (await fse.pathExists(pluginPath)) {
            await fse.remove(pluginPath);
        } else if (await fse.pathExists(disabledPluginPath)) {
            await fse.remove(disabledPluginPath);
        } else {
            throw new Error('Plugin not found');
        }
        return true;
    } catch (error) {
        console.error('Plugin deletion error:', error);
        throw error;
    }
});

ipcMain.handle('get-plugins-path', () => {
    return store.get('pluginsPath', '');
});

ipcMain.handle('set-plugins-path', (event, newPath) => {
    store.set('pluginsPath', newPath);
    log.info('Plugins path updated:', newPath);
    return true;
});

ipcMain.handle('toggle-plugin', async (event, pluginId) => {
    const pluginsPath = store.get('pluginsPath');
    if (!pluginsPath) {
        throw new Error('Plugins directory not set. Please set a plugins directory in settings first.');
    }

    const skylinePath = path.dirname(pluginsPath);
    const disabledPluginsPath = path.join(skylinePath, DISABLED_PLUGINS_FOLDER_NAME);

    try {
        // Create disabled plugins directory if it doesn't exist
        await fsp.mkdir(disabledPluginsPath, { recursive: true });

        const pluginPath = path.join(pluginsPath, pluginId);
        const disabledPluginPath = path.join(disabledPluginsPath, pluginId);

        if (await fse.pathExists(pluginPath)) {
            // Ensure unique destination path
            let uniqueDisabledPluginPath = disabledPluginPath;
            let counter = 1;
            while (await fse.pathExists(uniqueDisabledPluginPath)) {
                uniqueDisabledPluginPath = path.join(disabledPluginsPath, `${path.basename(pluginId, PLUGIN_EXTENSION)}_${counter}${PLUGIN_EXTENSION}`);
                counter++;
            }

            // Move to disabled folder
            await fse.move(pluginPath, uniqueDisabledPluginPath);
            return false; // Disabled
        } else if (await fse.pathExists(disabledPluginPath)) {
            // Ensure unique destination path
            let uniquePluginPath = pluginPath;
            let counter = 1;
            while (await fse.pathExists(uniquePluginPath)) {
                uniquePluginPath = path.join(pluginsPath, `${path.basename(pluginId, PLUGIN_EXTENSION)}_${counter}${PLUGIN_EXTENSION}`);
                counter++;
            }

            // Move back to main folder
            await fse.move(disabledPluginPath, uniquePluginPath);
            return true; // Enabled
        } else {
            throw new Error('Plugin not found');
        }
    } catch (error) {
        console.error('Plugin toggle error:', error);
        throw error;
    }
});

ipcMain.handle('rename-plugin', async (event, { oldName, newName }) => {
    const pluginsPath = store.get('pluginsPath');
    if (!pluginsPath) {
        throw new Error('Plugins directory not set');
    }

    const skylinePath = path.dirname(pluginsPath);
    const disabledPluginsPath = path.join(skylinePath, DISABLED_PLUGINS_FOLDER_NAME);

    try {
        // Paths for enabled and disabled plugins
        const enabledPluginPath = path.join(pluginsPath, oldName);
        const disabledPluginPath = path.join(disabledPluginsPath, oldName);

        let sourcePath, destPath;

        // Determine if plugin is enabled or disabled
        if (await fse.pathExists(enabledPluginPath)) {
            sourcePath = enabledPluginPath;
            destPath = path.join(pluginsPath, newName);
        } else if (await fse.pathExists(disabledPluginPath)) {
            sourcePath = disabledPluginPath;
            destPath = path.join(disabledPluginsPath, newName);
        } else {
            throw new Error('Plugin folder not found');
        }

        // Check if destination path already exists
        if (await fse.pathExists(destPath)) {
            event.sender.send('plugin-exists', 'A plugin with this name already exists');
            throw new Error('A plugin with this name already exists');
        }

        // Use fs.promises for renaming with better error handling
        await fsp.rename(sourcePath, destPath);

        return true;
    } catch (error) {
        console.error('Plugin rename error:', error);

        // More detailed error handling
        if (error.code === 'EPERM') {
            // Try an alternative method using copy and delete
            try {
                await fse.copy(sourcePath, destPath);
                await fse.remove(sourcePath);
                return true;
            } catch (alternativeError) {
                console.error('Alternative rename method failed:', alternativeError);
                throw new Error('Failed to rename plugin. Please close any open files or applications using the plugin.');
            }
        }

        throw error;
    }
});

ipcMain.handle('open-plugins-folder', async () => {
    try {
        const pluginsPath = store.get('pluginsPath');
        if (!pluginsPath) {
            throw new Error('Plugins path not set');
        }

        if (await fse.pathExists(pluginsPath)) {
            await shell.openPath(pluginsPath);
        } else {
            throw new Error('Plugins folder not found');
        }
    } catch (error) {
        console.error('Failed to open plugins folder:', error);
        throw error;
    }
});

// Helper function to get all files in a directory recursively
async function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = await fsp.readdir(dirPath);

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fsp.stat(filePath);

        if (stat.isDirectory()) {
            arrayOfFiles.push(filePath);
            await getAllFiles(filePath, arrayOfFiles);
        } else {
            arrayOfFiles.push(filePath);
        }
    }

    return arrayOfFiles;
}

// Add this helper function
function isPathInModsDirectory(targetPath, modsPath) {
    const normTargetPath = path.normalize(targetPath).toLowerCase();
    const normModsPath = path.normalize(modsPath).toLowerCase();
    return normTargetPath.startsWith(normModsPath) || normTargetPath.includes('disabled_mod');
}

// Update the get-mod-files handler
ipcMain.handle('get-mod-files', async (event, modPath) => {
    try {
        const modsPath = store.get('modsPath');
        if (!modsPath) {
            throw new Error('Mods directory not set');
        }

        const normalizedModPath = path.normalize(modPath);
        const normalizedModsPath = path.normalize(modsPath);

        // Allow paths in both mods directory and disabled mods directory
        const ultimatePath = path.dirname(modsPath);
        const disabledModsPath = path.join(ultimatePath, DISABLED_MODS_FOLDER_NAME);

        if (!normalizedModPath.startsWith(normalizedModsPath) && 
            !normalizedModPath.startsWith(path.normalize(disabledModsPath))) {
            throw new Error('Access denied: Path is outside mods directory');
        }

        // Get all files recursively
        const files = await getAllFiles(modPath);
        return files.map(file => path.relative(modPath, file));
    } catch (error) {
        console.error('Failed to get mod files:', error);
        throw error;
    }
});

// Settings handlers
ipcMain.handle('get-discord-rpc-enabled', () => {
    return store.get('discordRpcEnabled', true);
});

ipcMain.handle('set-discord-rpc-enabled', (event, enabled) => {
    store.set('discordRpcEnabled', enabled);
    return true;
});

// Discord RPC handlers
ipcMain.handle('connect-discord-rpc', async () => {
    try {
        await discordRPC.connect();
        return true;
    } catch (error) {
        console.error('Failed to connect Discord RPC:', error);
        throw error;
    }
});

ipcMain.handle('disconnect-discord-rpc', async () => {
    try {
        discordRPC.disconnect();
        return true;
    } catch (error) {
        console.error('Failed to disconnect Discord RPC:', error);
        throw error;
    }
});

ipcMain.handle('set-discord-rpc-activity', async (event, activity) => {
    try {
        discordRPC.setActivity(activity);
        return true;
    } catch (error) {
        console.error('Failed to set Discord RPC activity:', error);
        throw error;
    }
});

ipcMain.handle('update-discord-rpc-mod-count', async (event, count) => {
    try {
        discordRPC.updateModBrowsing(count);
        return true;
    } catch (error) {
        console.error('Failed to update Discord RPC mod count:', error);
        throw error;
    }
});

ipcMain.handle('update-discord-rpc-mod-installation', async () => {
    try {
        discordRPC.updateModInstalling();
        return true;
    } catch (error) {
        console.error('Failed to update Discord RPC mod installation:', error);
        throw error;
    }
});

// Emulator handlers
ipcMain.handle('set-emulator-path', (event, path) => {
    store.set('emulatorPath', path);
    return true;
});

ipcMain.handle('get-emulator-path', () => {
    return store.get('emulatorPath', '');
});

ipcMain.handle('set-game-path', (event, path) => {
    store.set('gamePath', path);
    return true;
});

ipcMain.handle('get-game-path', () => {
    return store.get('gamePath', '');
});

ipcMain.handle('set-selected-emulator', (event, emulator) => {
    store.set('selectedEmulator', emulator);
    return true;
});

ipcMain.handle('get-selected-emulator', () => {
    return store.get('selectedEmulator', '');
});

ipcMain.handle('set-yuzu-fullscreen', (event, enabled) => {
    store.set('yuzuFullscreen', enabled);
    return true;
});

ipcMain.handle('get-yuzu-fullscreen', () => {
    return store.get('yuzuFullscreen', false);
});

ipcMain.handle('launch-game', async () => {
    try {
        const emulatorPath = store.get('emulatorPath', '');
        const gamePath = store.get('gamePath', '');
        const selectedEmulator = store.get('selectedEmulator', '');
        const yuzuFullscreen = store.get('yuzuFullscreen', false);

        if (!emulatorPath || !gamePath || !selectedEmulator) {
            throw new Error('Please configure emulator and game paths first');
        }

        let command;
        if (selectedEmulator === 'yuzu') {
            command = `"${emulatorPath}" -g "${gamePath}"${yuzuFullscreen ? ' -f' : ''}`;
        } else if (selectedEmulator === 'ryujinx') {
            command = `"${emulatorPath}" "${gamePath}"`;
        } else {
            throw new Error('Invalid emulator selected');
        }

        exec(command, { maxBuffer: 2048 * 2048 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Failed to launch game:', error);
                console.error('stdout:', stdout);
                console.error('stderr:', stderr);
                throw new Error(`Failed to launch game: ${error.message}`);
            }
        });

        return true;
    } catch (error) {
        console.error('Failed to launch game:', error);
        throw error;
    }
});

function logAppSettings() {
    const settings = {
        modsPath: store.get('modsPath', 'Not set'),
        pluginsPath: store.get('pluginsPath', 'Not set'),
        darkMode: store.get('darkMode', false),
        customCssPath: store.get('customCssPath', 'Not set'),
        discordRpcEnabled: store.get('discordRpcEnabled', true),
        conflictCheckEnabled: store.get('conflictCheckEnabled', true),
        emulatorPath: store.get('emulatorPath', 'Not set'),
        gamePath: store.get('gamePath', 'Not set'),
        selectedEmulator: store.get('selectedEmulator', 'Not set'),
        appVersion: app.getVersion()
    };

    log.info('Application Settings:', JSON.stringify(settings, null, 2));
    return settings;
}

ipcMain.handle('get-current-log', async () => {
    try {
        const logPath = log.transports.file.getFile().path;
        const consoleLog = await fsp.readFile(logPath, 'utf8');
        
        // Get the last 1000 lines to avoid overwhelming the viewer
        const lines = consoleLog.split('\n').slice(-1000);
        return lines.join('\n');
    } catch (error) {
        console.error('Error reading log file:', error);
        throw error;
    }
});

ipcMain.handle('open-logs-folder', async () => {
    try {
        const logPath = path.dirname(log.transports.file.getFile().path);
        await shell.openPath(logPath);
        return true;
    } catch (error) {
        console.error('Error opening logs folder:', error);
        throw error;
    }
});

ipcMain.handle('open-current-log', async () => {
    try {
        const logPath = log.transports.file.getFile().path;
        await shell.openPath(logPath);
        return true;
    } catch (error) {
        console.error('Error opening current log:', error);
        throw error;
    }
});

ipcMain.handle('clear-logs', async () => {
    try {
        const logPath = log.transports.file.getFile().path;
        // Clear the log file by writing an empty string
        await fsp.writeFile(logPath, '');
        // Add a log entry indicating the logs were cleared
        log.info('Logs cleared by user');
        return true;
    } catch (error) {
        console.error('Error clearing logs:', error);
        throw error;
    }
});

function handleProtocolUrl(url) {
    if (!mainWindow || !mainWindow.webContents) {
        initialProtocolUrl = url;
        createWindow();
        return;
    }
    
    // Get the protocol confirmation setting (true means skip confirmation)
    const skipConfirmation = store.get('protocolConfirmEnabled', false);
    
    // Send URL and skipConfirmation flag to renderer
    const sendUrlToRenderer = () => {
        mainWindow.webContents.send('protocol-url', {
            url: url,
            skipConfirmation: skipConfirmation
        });
    };

    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }
    
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    
    mainWindow.focus();

    if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', sendUrlToRenderer);
    } else {
        sendUrlToRenderer();
    }
}

ipcMain.handle('get-protocol-confirm-enabled', () => {
    return store.get('protocolConfirmEnabled', false);
});

ipcMain.handle('set-protocol-confirm-enabled', (event, enabled) => {
    store.set('protocolConfirmEnabled', enabled);
    return true;
});

ipcMain.handle('clear-temp-files', async () => {
    try {
        const appDataPath = app.getPath('userData');
        const modsPath = store.get('modsPath');
        const tempLocations = [
            app.getPath('temp'),
            appDataPath,
            modsPath
        ].filter(Boolean); // Remove null/undefined paths

        let filesRemoved = false;
        
        for (const location of tempLocations) {
            try {
                const entries = await fsp.readdir(location, { withFileTypes: true });
                
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name.toLowerCase().startsWith('temp')) {
                        const fullPath = path.join(location, entry.name);
                        await fse.remove(fullPath);
                        log.info(`Removed temp directory: ${fullPath}`);
                        filesRemoved = true;
                    }
                }
            } catch (err) {
                console.warn(`Error accessing directory ${location}:`, err);
            }
        }

        if (filesRemoved) {
            log.info('Temporary files cleared successfully');
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error clearing temporary files:', error);
        log.error('Failed to clear temporary files:', error);
        throw error;
    }
});

ipcMain.handle('rename-mod-file', async (event, { modPath, oldPath, newPath }) => {
    try {
        const fullOldPath = path.join(modPath, oldPath);
        const fullNewPath = path.join(modPath, newPath);
        
        // Create parent directories if they don't exist
        await fsp.mkdir(path.dirname(fullNewPath), { recursive: true });
        
        // Perform the rename
        try {
            await fsp.rename(fullOldPath, fullNewPath);
        } catch (error) {
            if (error.code === 'EPERM') {
                // If rename fails due to EPERM, try copying and deleting
                await fse.copy(fullOldPath, fullNewPath);
                await fse.remove(fullOldPath);
            } else {
                throw error;
            }
        }
        return true;
    } catch (error) {
        console.error('Error renaming mod file:', error);
        throw error;
    }
});

ipcMain.handle('delete-mod-file', async (event, { modPath, filePath }) => {
    const fullPath = path.join(modPath, filePath);
    try {
        const stat = await fsp.stat(fullPath);

        if (stat.isDirectory()) {
            await fsp.rmdir(fullPath, { recursive: true });
        } else {
            await fsp.unlink(fullPath);
        }

        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn('File or directory does not exist:', fullPath);
            return false; // Indicate that the file or directory was not found
        }
        console.error('Error deleting mod file:', error);
        throw error;
    }
});

ipcMain.handle('write-mod-file', async (event, { filePath, content }) => {
    try {
        await fsp.writeFile(filePath, content, 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing mod file:', error);
        throw error;
    }
});

ipcMain.handle('get-volume', () => {
    return store.get('volume', 100);
});

ipcMain.handle('set-volume', async (event, volume) => {
    try {
        store.set('volume', volume);
        if (hiddenWindow && !hiddenWindow.isDestroyed()) {
            await hiddenWindow.webContents.executeJavaScript(`
                setVolume(${volume});
            `);
        }
        return true;
    } catch (error) {
        console.error('Error setting volume:', error);
        throw error;
    }
});

ipcMain.handle('get-april-fools-enabled', () => {
    return store.get('aprilFoolsEnabled', false);
});

ipcMain.handle('set-april-fools-enabled', (event, enabled) => {
    store.set('aprilFoolsEnabled', enabled);
    return true;
});

// Add these new IPC handlers
ipcMain.handle('toggle-pause-download', async (event, id) => {
    try {
        const downloader = activeDownloads.get(id);
        if (!downloader) {
            throw new Error('No active download found');
        }

        if (downloader.isPaused) {
            await downloader.resume();
            return false; // Not paused anymore
        } else {
            await downloader.pause();
            return true; // Now paused
        }
    } catch (error) {
        console.error('Error toggling pause state:', error);
        throw error;
    }
});

ipcMain.handle('get-active-download', (event, id) => {
    return activeDownloads.has(id);
});

// Add FPP creation handler
ipcMain.handle('create-fpp', async (event, options) => {
    try {
        const modsPath = store.get('modsPath');
        const pluginsPath = store.get('pluginsPath');
        
        // Utiliser le répertoire spécifié ou téléchargements par défaut
        const outputDir = options.outputDir || app.getPath('downloads');
        
        const result = await createFPP({
            ...options,
            modsPath,
            pluginsPath,
            outputDir: outputDir
        });

        return { success: true, path: result.outputPath };
    } catch (error) {
        console.error('Error creating FPP:', error);
        return { success: false, error: error.message };
    }
});

// Add FPP handlers
ipcMain.handle('import-fpp', async (event, filePath) => {
    try {
        const modsPath = store.get('modsPath');
        const pluginsPath = store.get('pluginsPath');

        await extractFPP(filePath, {
            modsPath,
            pluginsPath
        });

        return { success: true };
    } catch (error) {
        console.error('Error importing FPP:', error);
        return { success: false, error: error.message };
    }
});

// Add after other settings handlers
ipcMain.handle('get-workspace-path', () => {
    return store.get('workspacePath', '');
});

ipcMain.handle('set-workspace-path', (event, newPath) => {
    store.set('workspacePath', newPath);
    return true;
});

// Add this handler near the other mod operation handlers
ipcMain.handle('get-disabled-mods', async () => {
    const workspacePath = store.get('workspacePath');
    if (!workspacePath) {
        return [];
    }

    const PresetManager = require('./src/js/presetManager');
    const presetManager = new PresetManager(workspacePath);
    await presetManager.init();
    
    return await presetManager.getDisabledMods();
});

// Add this handler for getting mod hash
ipcMain.handle('get-mod-hash', async (event, modName) => {
    const { getHash } = require('./src/js/hash');
    return getHash(modName);
});

ipcMain.on('play-loading-audio', () => {
    hiddenWindow.webContents.executeJavaScript('playLoading()').catch(console.error);
  });
  ipcMain.on('play-conflict-audio', () => {
    hiddenWindow.webContents.executeJavaScript('playConflict()').catch(console.error);
  });
ipcMain.on('stop-loading-audio', () => {
    hiddenWindow.webContents.executeJavaScript('stopLoading()').catch(console.error);  
});

// Add file operation handlers
ipcMain.handle('file-exists', async (event, filePath) => {
    try {
        await fsp.access(filePath);
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('read-mod-file', async (event, filePath) => {
    try {
        return await fsp.readFile(filePath, 'utf8');
    } catch (error) {
        console.error('Error reading mod file:', error);
        Sentry.captureException(error);
        throw error;
    }
});
ipcMain.handle('get-sentry-enabled', () => {
    return store.get('sentryEnabled', false); // Lire l'état depuis le store
});

ipcMain.handle('set-sentry-enabled', (event, enabled) => {
    store.set('sentryEnabled', enabled); // Enregistrer l'état dans le store
    if (enabled) {
        initializeSentry(); // Réinitialiser Sentry si activé
    }
    return true;
});

// Debug helpers: expose plugins-meta info and open folder
ipcMain.handle('plugins-meta:get', async () => {
    await ensurePluginsMetaFiles();
    const versions = await readJson(PLUGIN_VERSIONS_PATH, {});
    const catalog = await getEffectiveCatalog();
    const sources = await readJson(PLUGIN_SOURCES_PATH, {});
    return {
        dir: PLUGINS_META_DIR,
        versionsPath: PLUGIN_VERSIONS_PATH,
        catalogPath: PLUGIN_CATALOG_PATH,
        sourcesPath: PLUGIN_SOURCES_PATH,
        versions,
        sources,
        catalogSize: Array.isArray(catalog) ? catalog.length : 0
    };
});

ipcMain.handle('plugins-meta:open-folder', async () => {
    await ensurePluginsMetaFiles();
    await shell.openPath(PLUGINS_META_DIR);
    return true;
});

// Download and install plugin from URL; accepts string URL or { url, pluginId, version }
ipcMain.handle('install-plugin-from-url', async (event, payload) => {
    try {
        const url = typeof payload === 'string' ? payload : payload?.url;
        const pluginId = typeof payload === 'object' ? payload?.pluginId : undefined;
        const version = typeof payload === 'object' ? payload?.version : undefined;
        log.info('[plugins-meta] install-plugin-from-url payload:', { url, pluginId, version });
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL');
        }

        // If pluginId is known, pre-delete existing files before install
        if (pluginId) {
            try {
                const catalogDel = await getEffectiveCatalog();
                const entryDel = Array.isArray(catalogDel) ? catalogDel.find(e => e && e.id === pluginId) : null;
                await deleteExistingPluginFiles(pluginId, entryDel?.assetPattern);
                log.info('[plugins-meta] install-plugin-from-url pre-delete for', pluginId);
            } catch {}
        }

        // Install
        let assetPattern = undefined;
        let catalogForInstall = null;
        try {
            catalogForInstall = await getEffectiveCatalog();
        } catch {}
        if (Array.isArray(catalogForInstall)) {
            const entry = catalogForInstall.find(e => e && e.id === pluginId);
            assetPattern = entry?.assetPattern;
        }
        const result = await installPluginFromUrlInternal(url, { pluginId, assetPattern });
        log.info('[plugins-meta] install-plugin-from-url installed:', result?.name || '(unknown)');

        // Optionally record version in AppData versions file
        if (pluginId) {
            try {
                await ensurePluginsMetaFiles();
                const versions = await readJson(PLUGIN_VERSIONS_PATH, {});
                let toWrite = version ? normalizeVersion(version) : undefined;
                // Always try to extract version from both final download URL and filename
                if (!toWrite) {
                    if (result.versionFromUrl && isLikelyVersion(result.versionFromUrl)) {
                        toWrite = result.versionFromUrl;
                        log.info('[plugins-meta] install-plugin-from-url version from finalUrl:', toWrite);
                    } else if (result.versionFromName && isLikelyVersion(result.versionFromName)) {
                        toWrite = result.versionFromName;
                        log.info('[plugins-meta] install-plugin-from-url version from fileName:', toWrite);
                    }
                }
                // Fallback: try to parse from the original URL string
                if (!toWrite && typeof url === 'string') {
                    const urlVersionMatch = url.match(/\/download\/v?([0-9]+(?:\.[0-9]+){1,3})\//i) || url.match(/\/tag\/v?([0-9]+(?:\.[0-9]+){1,3})/i);
                    if (urlVersionMatch && urlVersionMatch[1] && isLikelyVersion(urlVersionMatch[1])) {
                        toWrite = normalizeVersion(urlVersionMatch[1]);
                        log.info('[plugins-meta] install-plugin-from-url version parsed from original URL:', toWrite);
                    }
                }
                // Fallback: try GitHub API (releases/tags)
                if (!toWrite) {
                    const catalog = await getEffectiveCatalog();
                    const entry = Array.isArray(catalog) ? catalog.find(e => e && e.id === pluginId) : null;
                    log.info('[plugins-meta] install-plugin-from-url catalog entry for id:', pluginId, '->', entry ? { id: entry.id, repo: entry.repo } : '(none)');
                    let repoToUse = entry && entry.repo ? entry.repo : undefined;
                    if (!repoToUse && typeof url === 'string') {
                        const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/(?:download|latest\/download)\//i);
                        if (m) repoToUse = `${m[1]}/${m[2]}`;
                    }
                    if (repoToUse) {
                        const info = await fetchLatestReleaseInfo(repoToUse, entry?.assetPattern);
                        if (info && info.latestVersion && isLikelyVersion(info.latestVersion)) {
                            toWrite = info.latestVersion;
                            log.info('[plugins-meta] install-plugin-from-url fallback GitHub API version:', toWrite);
                        }
                    }
                    // If no catalog entry, but URL points to GitHub, store a source checkUrl for future checks
                    if (!entry && typeof url === 'string') {
                        const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/(?:download|latest\/download)\//i);
                        if (m) {
                            const ownerRepo = `${m[1]}/${m[2]}`;
                            const checkUrl = url; // Direct asset URL tracks redirects to specific versions
                            const sources = await readJson(PLUGIN_SOURCES_PATH, {});
                            sources[pluginId] = { repo: ownerRepo, checkUrl };
                            await writeJson(PLUGIN_SOURCES_PATH, sources);
                            log.info('[plugins-meta] install-plugin-from-url stored source for', pluginId, sources[pluginId]);
                        }
                    }
                }
                if (toWrite && isLikelyVersion(toWrite)) {
                    versions[pluginId] = toWrite;
                    log.info('[plugins-meta] install-plugin-from-url writing version:', { id: pluginId, version: toWrite });
                } else {
                    if (toWrite) log.warn('[plugins-meta] install-plugin-from-url discarded unlikely version:', toWrite);
                }
                await writeJson(PLUGIN_VERSIONS_PATH, versions);
                log.info('[plugins-meta] install-plugin-from-url wrote versions file at', PLUGIN_VERSIONS_PATH);
            } catch (e) {
                console.warn('Failed to update plugin version map:', e.message);
                log.warn('[plugins-meta] install-plugin-from-url: failed to update plugin version map:', e);
            }
        }

        // Notify renderer to refresh plugin list
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('plugins-updated', [{ id: pluginId || result.name }]);
        }

        return result;
    } catch (error) {
        console.error('install-plugin-from-url error:', error);
        log.error('[plugins-meta] install-plugin-from-url error:', error);
        throw error;
    }
});