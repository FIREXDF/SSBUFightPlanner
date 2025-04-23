const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    save: (_req) => {
        ipcRenderer.send('save', _req);
    },
    prompt: function(title, val) {
        return ipcRenderer.sendSync('prompt', { title, val })
    },
    openSaveDir: function() {
        ipcRenderer.send('open_save_dir');
    },
    loadJSON: function(path) {
        return ipcRenderer.sendSync('loadJSON', path);
    }
})