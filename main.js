const { app, Tray, Menu, BrowserWindow, clipboard, globalShortcut, ipcMain, screen, nativeImage } = require('electron')
const path = require('path')
const { execFile } = require('child_process')
const fs = require('fs')
const { uIOhook } = require('uiohook-napi')

let tray = null
let menuWindow = null
let isPinned = false
let searchBarWindow = null
let searchTargetWindow = null

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
  const windowHeight = 225
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
    const ts = detectTimestamp(clipboard.readText())
    if (ts) {
      showTimestampPopup(ts, { x: e.x, y: e.y })
    } else {
      showMenu({ x: e.x, y: e.y })
    }
  })
  uIOhook.start()
}

function detectTimestamp(text) {
  if (!text) return null
  const s = text.trim()
  if (/^\d{10}$/.test(s)) return { value: s, unit: 's' }
  if (/^\d{13}$/.test(s)) return { value: s, unit: 'ms' }
  return null
}

function formatTimestamp(ts) {
  const ms = ts.unit === 'ms' ? parseInt(ts.value) : parseInt(ts.value) * 1000
  const date = new Date(ms)
  if (isNaN(date.getTime())) return null
  const pad = n => String(n).padStart(2, '0')
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  const utc = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const tz = `UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  const diff = Date.now() - ms
  let relative
  const abs = Math.abs(diff)
  const future = diff < 0
  if (abs < 60000) relative = `${Math.floor(abs / 1000)} 秒${future ? '后' : '前'}`
  else if (abs < 3600000) relative = `${Math.floor(abs / 60000)} 分钟${future ? '后' : '前'}`
  else if (abs < 86400000) relative = `${Math.floor(abs / 3600000)} 小时${future ? '后' : '前'}`
  else if (abs < 2592000000) relative = `${Math.floor(abs / 86400000)} 天${future ? '后' : '前'}`
  else relative = `${(abs / 2592000000).toFixed(1)} 个月${future ? '后' : '前'}`
  return { local, utc, tz, relative, unitLabel: ts.unit === 'ms' ? '毫秒 (ms)' : '秒 (s)' }
}

let timestampWindow = null

function showTimestampPopup(ts, pos) {
  const info = formatTimestamp(ts)
  if (!info) return showMenu({ x: pos.x, y: pos.y })
  safeCloseTimestampPopup()

  const windowWidth = 300
  const windowHeight = 200
  const pad = 6

  const displays = screen.getAllDisplays()
  const currentDisplay = displays.find(d =>
    pos.x >= d.bounds.x && pos.x <= d.bounds.x + d.bounds.width &&
    pos.y >= d.bounds.y && pos.y <= d.bounds.y + d.bounds.height
  ) || screen.getPrimaryDisplay()

  const { bounds } = currentDisplay
  let winX = Math.round(Math.min(Math.max(pos.x, bounds.x + pad), bounds.x + bounds.width - windowWidth - pad))
  let winY = Math.round(Math.min(Math.max(pos.y, bounds.y + pad), bounds.y + bounds.height - windowHeight - pad))

  timestampWindow = new BrowserWindow({
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

  timestampWindow.loadFile(path.join(__dirname, 'src', 'timestamp.html'))
  timestampWindow.once('ready-to-show', () => {
    timestampWindow.show()
    timestampWindow.focus()
    timestampWindow.webContents.send('timestamp-result', { value: ts.value, ...info })
  })

  timestampWindow.on('blur', () => {
    safeCloseTimestampPopup()
  })

  timestampWindow.on('closed', () => {
    timestampWindow = null
  })
}

function safeCloseTimestampPopup() {
  if (timestampWindow && !timestampWindow.isDestroyed()) {
    timestampWindow.destroy()
    timestampWindow = null
  }
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

  ipcMain.handle('curl-to-python', async () => {
    const text = clipboard.readText()
    if (!text) {
      createCurlResultWindow(null, '剪贴板中没有内容')
      safeCloseMenu()
      return { success: false, error: '剪贴板中没有内容' }
    }
    try {
      const code = curlToPython(text)
      clipboard.writeText(code)
      createCurlResultWindow(code)
      safeCloseMenu()
      return { success: true }
    } catch (e) {
      createCurlResultWindow(null, `转换失败：${e.message}`)
      safeCloseMenu()
      return { success: false, error: e.message }
    }
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

  ipcMain.handle('execute-python', async (_, code) => {
    const tmpFile = path.join(app.getPath('temp'), `curl_run_${Date.now()}.py`)
    fs.writeFileSync(tmpFile, code, 'utf8')
    try {
      const { stdout, stderr } = await new Promise((resolve, reject) => {
        execFile('python', [tmpFile], { timeout: 30000 }, (err, stdout, stderr) => {
          if (err && err.code === 'ENOENT') return reject(new Error('未找到 python 命令，请确保 Python 已安装并添加到 PATH'))
          if (err && err.killed) return reject(new Error('执行超时（30秒）'))
          resolve({ stdout, stderr, err })
        })
      })
      if (stderr) return { statusCode: 0, body: stdout, error: stderr }
      const lines = stdout.split('\n')
      let statusCode = 200
      let last = lines[lines.length - 1]
      if (last === '') {
        lines.pop()
        last = lines[lines.length - 1]
      }
      const statusMatch = last && (last.match(/^###STATUS###\s*(\d{3})\r?$/) || last.match(/^<Response \[(\d{3})\]\r?$/))
      if (statusMatch) {
        statusCode = parseInt(statusMatch[1])
        lines.pop()
      }
      return {
        statusCode,
        body: lines.join('\n'),
        error: null
      }
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  })

  ipcMain.handle('toggle-pin', (_, pinned) => {
    isPinned = pinned
  })

  ipcMain.on('close-menu', () => {
    safeCloseMenu()
  })

  ipcMain.on('find-in-page', (_, text) => {
    lastSearchText = text
    if (searchTargetWindow && !searchTargetWindow.isDestroyed()) {
      searchTargetWindow.webContents.findInPage(text)
    }
  })

  ipcMain.on('find-next', () => {
    if (searchTargetWindow && !searchTargetWindow.isDestroyed() && lastSearchText) {
      searchTargetWindow.webContents.findInPage(lastSearchText, { findNext: true, forward: true })
    }
  })

  ipcMain.on('find-prev', () => {
    if (searchTargetWindow && !searchTargetWindow.isDestroyed() && lastSearchText) {
      searchTargetWindow.webContents.findInPage(lastSearchText, { findNext: true, forward: false })
    }
  })

  ipcMain.on('find-stop', () => {
    if (searchTargetWindow && !searchTargetWindow.isDestroyed()) {
      searchTargetWindow.webContents.stopFindInPage('clearSelection')
    }
  })

  ipcMain.on('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === searchBarWindow) closeSearchBar()
    else if (win === timestampWindow) safeCloseTimestampPopup()
  })

  ipcMain.handle('copy-text', async (_, text) => {
    clipboard.writeText(text)
    return { success: true }
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

  win.webContents.on('before-input-event', (event, input) => {
    const isCtrlOrCmd = input.control || input.meta
    if (isCtrlOrCmd && input.key.toLowerCase() === 'f' && !input.shift && !input.alt) {
      event.preventDefault()
      toggleSearchBar(win)
    } else if (input.type === 'keyDown' && input.key === 'F3') {
      event.preventDefault()
      if (searchBarWindow && !searchBarWindow.isDestroyed() && searchTargetWindow === win) {
        win.webContents.findInPage(lastSearchText || '', { findNext: true, forward: true })
      } else {
        toggleSearchBar(win)
      }
    } else if (input.type === 'keyDown' && (input.key === 'Escape') && searchTargetWindow === win) {
      closeSearchBar()
    }
  })

  win.webContents.on('found-in-page', (event, result) => {
    if (searchBarWindow && !searchBarWindow.isDestroyed() && searchTargetWindow === win) {
      searchBarWindow.webContents.send('find-count', result)
    }
  })
}

let lastSearchText = ''

function toggleSearchBar(win) {
  if (searchBarWindow && !searchBarWindow.isDestroyed() && searchTargetWindow === win) {
    closeSearchBar()
    return
  }
  createSearchBar(win)
}

function createSearchBar(win) {
  closeSearchBar()
  searchTargetWindow = win

  const w = 300
  const h = 40
  const b = win.getBounds()
  const x = Math.round(b.x + b.width - w - 12)
  const y = Math.round(b.y + 12)

  searchBarWindow = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
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
  searchBarWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(searchBarHTML())}`)
  searchBarWindow.once('ready-to-show', () => {
    searchBarWindow.show()
    searchBarWindow.focus()
    searchBarWindow.webContents.send('searchbar-focus')
  })
  searchBarWindow.on('blur', () => {
    closeSearchBar()
  })
  searchBarWindow.on('closed', () => {
    searchBarWindow = null
    searchTargetWindow = null
    win.stopFindInPage('clearSelection')
  })

  const syncPos = () => {
    if (!searchBarWindow || searchBarWindow.isDestroyed()) return
    const nb = win.getBounds()
    searchBarWindow.setPosition(Math.round(nb.x + nb.width - w - 12), Math.round(nb.y + 12))
  }
  win.on('move', syncPos)
  win.on('resize', syncPos)
}

function closeSearchBar() {
  if (searchBarWindow && !searchBarWindow.isDestroyed()) {
    searchBarWindow.destroy()
    searchBarWindow = null
  }
  if (searchTargetWindow && !searchTargetWindow.isDestroyed()) {
    searchTargetWindow.stopFindInPage('clearSelection')
  }
  searchTargetWindow = null
  lastSearchText = ''
}

function searchBarHTML() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: transparent; overflow: hidden; }
.bar {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(28, 28, 32, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px 6px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  height: 34px;
  margin: 3px;
}
input {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  outline: none;
  color: #cdd6f4;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 5px;
  font-family: 'Segoe UI', sans-serif;
}
input:focus { border-color: #4FC3F7; }
.count { color: #7f849c; font-size: 11px; min-width: 34px; text-align: center; font-family: 'Segoe UI', sans-serif; }
button {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #cdd6f4;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}
button:hover { background: rgba(255, 255, 255, 0.16); }
</style>
</head>
<body>
<div class="bar">
  <input id="q" placeholder="在页面中搜索…" spellcheck="false">
  <span class="count" id="count">0/0</span>
  <button id="prev" title="上一个 (Shift+Enter)">▲</button>
  <button id="next" title="下一个 (Enter)">▼</button>
  <button id="close" title="关闭 (Esc)">✕</button>
</div>
<script>
const input = document.getElementById('q')
const count = document.getElementById('count')
let active = 0, total = 0
window.api.onFindCount(({ total: t, activeIndex: a }) => {
  total = t
  active = a
  count.textContent = t ? \`\${a + 1}/\${t}\` : '0/0'
})
input.addEventListener('input', () => {
  const text = input.value
  active = 0
  if (text) window.api.findInPage(text)
  else window.api.findStop()
})
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (input.value) window.api.findNext()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    window.api.closeWindow()
  }
})
document.getElementById('next').addEventListener('click', () => { if (input.value) window.api.findNext() })
document.getElementById('prev').addEventListener('click', () => { if (input.value) window.api.findPrev() })
document.getElementById('close').addEventListener('click', () => window.api.closeWindow())
window.api.onSearchbarFocus(() => input.focus())
</script>
</body>
</html>`
}

function createCurlResultWindow(code, error) {
  const win = new BrowserWindow({
    width: 1050,
    height: 560,
    title: error ? 'CURL → Python - 错误' : 'CURL → Python 结果',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })
  win.loadFile(path.join(__dirname, 'src', 'curl-to-python.html'))
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('curl-result', { code, error })
  })
}

function curlToPython(curl) {
  const args = parseCurlArgs(curl.trim())
  let method = 'GET'
  const headers = {}
  let dataRaw = null
  let hasData = false
  let cookie = null
  let auth = null
  let verify = true
  let url = null

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === 'curl') continue
    if (a === '-X' || a === '--request') {
      method = args[++i].toUpperCase()
    } else if (a === '-H' || a === '--header') {
      const h = args[++i]
      const colon = h.indexOf(':')
      if (colon > 0) {
        headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim()
      }
    } else if (a === '-d' || a === '--data' || a === '--data-raw') {
      const val = args[++i]
      dataRaw = dataRaw ? dataRaw + '&' + val : val
      hasData = true
    } else if (a === '--data-urlencode') {
      const val = args[++i]
      dataRaw = dataRaw ? dataRaw + '&' + val : val
      hasData = true
    } else if (a === '-b' || a === '--cookie') {
      cookie = args[++i]
    } else if (a === '-u' || a === '--user') {
      auth = args[++i]
    } else if (a === '-k' || a === '--insecure') {
      verify = false
    } else if (a === '-L' || a === '--location') {
    } else if (a === '--url') {
      url = args[++i]
    } else if (a.startsWith('--url=')) {
      url = a.slice(6)
    } else if (a.startsWith('-')) {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) i++
    } else if (!url) {
      url = a
    }
  }

  if (!url) throw new Error('未找到 URL')

  const ct = Object.keys(headers).find(k => k.toLowerCase() === 'content-type')
  const isJson = ct && headers[ct].toLowerCase().includes('application/json')

  if (hasData && method === 'GET') method = 'POST'
  if (!hasData && ['POST', 'PUT', 'PATCH'].includes(method)) hasData = true

  let code = 'import requests\n'
  if (hasData && isJson) code += 'import json\n'
  code += '\n'

  if (Object.keys(headers).length) {
    code += `headers = ${JSON.stringify(headers, null, 2)}\n`
  }
  code += `url = ${JSON.stringify(url)}\n`

  let useJsonDumps = false
  if (dataRaw && isJson) {
    let parsed
    try { parsed = JSON.parse(dataRaw) } catch { parsed = dataRaw }
    if (typeof parsed === 'object' && parsed !== null) {
      code += `data = ${JSON.stringify(parsed, null, 4)}\n`
      useJsonDumps = true
    } else {
      code += `data = ${JSON.stringify(dataRaw)}\n`
    }
  } else if (dataRaw) {
    code += `data = ${JSON.stringify(dataRaw)}\n`
  }

  if (cookie) {
    const pairs = cookie.split(';').map(s => s.trim()).filter(Boolean)
    const cookieDict = {}
    for (const p of pairs) {
      const eq = p.indexOf('=')
      if (eq > 0) cookieDict[p.slice(0, eq).trim()] = p.slice(eq + 1).trim()
      else cookieDict[p] = ''
    }
    code += `cookies = ${JSON.stringify(cookieDict, null, 4)}\n`
  }
  if (auth) {
    const colon = auth.indexOf(':')
    if (colon > 0) {
      code += `auth = (${JSON.stringify(auth.slice(0, colon))}, ${JSON.stringify(auth.slice(colon + 1))})\n`
    } else {
      code += `auth = (${JSON.stringify(auth)}, '')\n`
    }
  }

  if (useJsonDumps) {
    code += `data = json.dumps(data, separators=(',', ':'))\n`
  }

  code += `\nresponse = requests.${method.toLowerCase()}(url`
  if (Object.keys(headers).length) code += ', headers=headers'
  if (hasData) code += ', data=data'
  if (cookie) code += ', cookies=cookies'
  if (auth) code += ', auth=auth'
  if (!verify) code += ', verify=False'
  code += ')\n\n'
  code += 'print(response.text)\n'
  code += "print('###STATUS###', response.status_code)\n"
  return code
}

function parseCurlArgs(s) {
  const args = []
  let i = 0
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') { i++; continue }
    if (s[i] === '\\' && i + 1 < s.length && (s[i + 1] === '\n' || s[i + 1] === '\r')) {
      i += 2
      continue
    }
    if (s[i] === '$' && i + 1 < s.length && s[i + 1] === "'") {
      let j = i + 2
      let buf = ''
      while (j < s.length && s[j] !== "'") {
        if (s[j] === '\\' && j + 1 < s.length) {
          if (s[j + 1] === '\n' || s[j + 1] === '\r') { j += 2; continue }
          if (s[j + 1] === "'") buf += "'"
          else if (s[j + 1] === '\\') buf += '\\'
          else if (s[j + 1] === 'n') buf += '\n'
          else if (s[j + 1] === 't') buf += '\t'
          else if (s[j + 1] === 'r') buf += '\r'
          else buf += s[j + 1]
          j += 2
        } else {
          buf += s[j]; j++
        }
      }
      args.push(buf)
      i = j + 1
    } else if (s[i] === "'") {
      let j = i + 1
      while (j < s.length && s[j] !== "'") {
        if (s[j] === '\\' && j + 1 < s.length && (s[j + 1] === '\n' || s[j + 1] === '\r')) {
          j += 2
          continue
        }
        j++
      }
      args.push(s.slice(i + 1, j))
      i = j + 1
    } else if (s[i] === '"') {
      let j = i + 1
      let buf = ''
      while (j < s.length) {
        if (s[j] === '\\' && j + 1 < s.length && (s[j + 1] === '\n' || s[j + 1] === '\r')) {
          j += 2
          continue
        }
        if (s[j] === '\\' && j + 1 < s.length) { buf += s[j + 1]; j += 2 }
        else if (s[j] === '"') { j++; break }
        else { buf += s[j]; j++ }
      }
      args.push(buf)
      i = j
    } else {
      let j = i
      while (j < s.length && s[j] !== ' ' && s[j] !== '\t' && s[j] !== '\n') {
        if (s[j] === '\\' && j + 1 < s.length && (s[j + 1] === '\n' || s[j + 1] === '\r')) {
          j += 2
          continue
        }
        j++
      }
      args.push(s.slice(i, j))
      i = j
    }
  }
  return args
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
