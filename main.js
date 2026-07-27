const { app, Tray, Menu, BrowserWindow, clipboard, globalShortcut, ipcMain, screen, nativeImage } = require('electron')
const path = require('path')
const { uIOhook } = require('uiohook-napi')

let tray = null
let menuWindow = null
let isPinned = false

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示菜单', click: () => showMenu() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        uIOhook.stop()
        globalShortcut.unregisterAll()
        app.quit()
      }
    }
  ])
  tray.setToolTip('桌面工具')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => showMenu())
}

function showMenu(cursorPos) {
  if (menuWindow && !menuWindow.isDestroyed()) {
    if (!isPinned) {
      safeCloseMenu()
    } else {
      menuWindow.focus()
    }
    return
  }

  const pos = cursorPos || screen.getCursorScreenPoint()

  const windowWidth = 200
  const windowHeight = 135
  const pad = 6

  const displays = screen.getAllDisplays()
  const currentDisplay = displays.find(d =>
    pos.x >= d.bounds.x && pos.x <= d.bounds.x + d.bounds.width &&
    pos.y >= d.bounds.y && pos.y <= d.bounds.y + d.bounds.height
  ) || screen.getPrimaryDisplay()

  const { bounds } = currentDisplay
  let winX = Math.round(Math.min(Math.max(pos.x, bounds.x + pad), bounds.x + bounds.width - windowWidth - pad))
  let winY = Math.round(Math.min(Math.max(pos.y, bounds.y + pad), bounds.y + bounds.height - windowHeight - pad))

  menuWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: winX,
    y: winY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })

  menuWindow.loadFile(path.join(__dirname, 'src', 'menu.html'))

  menuWindow.once('ready-to-show', () => {
    menuWindow.show()
    menuWindow.focus()
  })

  menuWindow.on('blur', () => {
    if (!isPinned) safeCloseMenu()
  })

  menuWindow.on('closed', () => {
    menuWindow = null
    isPinned = false
  })
}

function safeCloseMenu() {
  if (menuWindow && !menuWindow.isDestroyed()) {
    menuWindow.destroy()
    menuWindow = null
    isPinned = false
  }
}

function setupGlobalHook() {
  uIOhook.on('mousedown', (e) => {
    if (e.button !== 3) return
    if (menuWindow && !menuWindow.isDestroyed()) {
      const b = menuWindow.getBounds()
      if (e.x >= b.x && e.x <= b.x + b.width && e.y >= b.y && e.y <= b.y + b.height) {
        return
      }
    }
    showMenu({ x: e.x, y: e.y })
  })
  uIOhook.start()
}

function setupIPC() {
  ipcMain.handle('render-html', async () => {
    let html = clipboard.readHTML()
    if (!html) html = clipboard.readText()
    if (!html) return { success: false, error: '剪贴板中没有内容' }
    createRendererWindow(html)
    safeCloseMenu()
    return { success: true }
  })

  ipcMain.handle('json-format', async () => {
    const text = clipboard.readText()
    if (!text) {
      createJsonResultWindow(null, '剪贴板中没有文本内容')
      safeCloseMenu()
      return { success: false, error: '剪贴板中没有文本内容' }
    }
    try {
      const parsed = JSON.parse(text)
      const formatted = JSON.stringify(parsed, null, 2)
      clipboard.writeText(formatted)
      createJsonResultWindow(formatted)
      safeCloseMenu()
      return { success: true }
    } catch (e) {
      createJsonResultWindow(null, `无效的 JSON：${e.message}`)
      safeCloseMenu()
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('toggle-pin', (_, pinned) => {
    isPinned = pinned
  })

  ipcMain.on('close-menu', () => {
    safeCloseMenu()
  })
}

function createRendererWindow(html) {
  const win = new BrowserWindow({
    width: 1000,
    height: 750,
    title: 'Render HTML',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (m) win.setTitle(m[1])
}

function createJsonResultWindow(formatted, error) {
  const win = new BrowserWindow({
    width: 650,
    height: 500,
    title: error ? 'JSON 格式化 - 错误' : 'JSON 格式化结果',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })
  win.loadFile(path.join(__dirname, 'src', 'json-format.html'))
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('json-result', { formatted, error })
  })
}

app.whenReady().then(() => {
  createTray()
  setupIPC()
  setupGlobalHook()
  globalShortcut.register('CmdOrCtrl+Shift+H', () => showMenu())
})

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  uIOhook.stop()
  globalShortcut.unregisterAll()
})
