const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveFile: (data, filename) => ipcRenderer.invoke('save-file', { data, filename }),
    getCliArgs: () => ipcRenderer.invoke('get-cli-args'),
    onHeadlessConfig: (callback) => ipcRenderer.on('headless-config', (_event, config) => callback(config)),
    renderComplete: (metadata) => ipcRenderer.send('render-complete', metadata),
    renderError: (msg) => ipcRenderer.send('render-error', msg),
    isElectron: true,
});
