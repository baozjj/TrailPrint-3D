/**
 * Electron 主进程入口。
 *
 * 架构职责（见需求文档 §5）：
 * - 本进程：GPX 解析、DEM 采样、网格布尔/挖槽、STL 写出、文件系统与 ZIP
 * - 渲染进程（Vue）：界面、地图交互、轻量 3D 预览、参数状态管理
 */
import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerIpcHandlers } from './ipc/handlers'

const isDev = !app.isPackaged

/** type=module 项目下 preload 构建为 ESM：index.mjs（勿用含 require 的 index.js） */
function resolvePreloadPath(): string {
  const dir = join(__dirname, '../preload')
  const mjs = join(dir, 'index.mjs')
  const cjs = join(dir, 'index.cjs')
  if (existsSync(mjs)) return mjs
  if (existsSync(cjs)) return cjs
  return mjs
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '迹印 TrailPrint 3D',
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
