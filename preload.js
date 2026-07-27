const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  renderHtml: () => ipcRenderer.invoke('render-html'),
  jsonFormat: () => ipcRenderer.invoke('json-format'),
  togglePin: (pinned) => ipcRenderer.invoke('toggle-pin', pinned),
  closeMenu: () => ipcRenderer.send('close-menu'),
  onJsonResult: (callback) => {
    ipcRenderer.on('json-result', (_, data) => callback(data))
  },
})
