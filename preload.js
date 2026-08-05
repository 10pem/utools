const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  renderHtml: () => ipcRenderer.invoke('render-html'),
  jsonFormat: () => ipcRenderer.invoke('json-format'),
  curlToPython: () => ipcRenderer.invoke('curl-to-python'),
  executePython: (code) => ipcRenderer.invoke('execute-python', code),
  togglePin: (pinned) => ipcRenderer.invoke('toggle-pin', pinned),
  closeMenu: () => ipcRenderer.send('close-menu'),
  onJsonResult: (callback) => {
    ipcRenderer.on('json-result', (_, data) => callback(data))
  },
  onCurlResult: (callback) => {
    ipcRenderer.on('curl-result', (_, data) => callback(data))
  },
  onTimestampResult: (callback) => {
    ipcRenderer.on('timestamp-result', (_, data) => callback(data))
  },
  findInPage: (text) => ipcRenderer.send('find-in-page', text),
  findNext: () => ipcRenderer.send('find-next'),
  findPrev: () => ipcRenderer.send('find-prev'),
  findStop: () => ipcRenderer.send('find-stop'),
  onFindCount: (callback) => {
    ipcRenderer.on('find-count', (_, data) => callback(data))
  },
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  closeWindow: () => ipcRenderer.send('close-window'),
  onSearchbarFocus: (callback) => {
    ipcRenderer.on('searchbar-focus', () => callback())
  },
})
