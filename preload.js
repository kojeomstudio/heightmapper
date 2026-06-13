const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveFile: (data, filename) => ipcRenderer.invoke('save-file', { data, filename }),
    renderComplete: (metadata) => ipcRenderer.send('render-complete', metadata),
    renderError: (msg) => ipcRenderer.send('render-error', msg),
    isElectron: true,
});
