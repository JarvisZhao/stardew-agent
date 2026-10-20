// Electron entry point: window, tray, notifications and the IPC bridge to the farm.

import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell, Tray, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as pty from 'node-pty'
import { IPC, KEY_NAMES, type KeyName } from '../shared/api'
import type { ChatItem } from '../shared/chat'
import type { FarmSnapshot, PlantRequest, Plot } from '../shared/types'
import { claudeCandidates, resolveCommand, type ResolvedCommand, type ResolveEnv } from './farm/command'
import { FarmManager } from './farm/FarmManager'
import { pumpkinIcon } from './icon'

const devUrl = process.env.ELECTRON_RENDERER_URL

let manager: FarmManager | null = null
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let disposed = false
let trayHintShown = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('activate', showWindow)
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', (event) => {
    if (disposed || !manager) return
    // Stop the agent processes and save before actually quitting.
    event.preventDefault()
    void manager.dispose().finally(() => {
      disposed = true
      app.quit()
    })
  })
  void app.whenReady().then(start)
}

async function start(): Promise<void> {
  if (process.platform === 'win32') app.setAppUserModelId('com.stardew-agent.app')
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]))
  } else if (!devUrl) {
    Menu.setApplicationMenu(null)
  }

  manager = await FarmManager.create({
    dataDir: path.join(app.getPath('userData'), 'farm'),
    spawn: pty.spawn,
    resolveClaude
  })
  wireFarm(manager)
  registerIpc(manager)
  createTray()
  createWindow()
  updateTray(manager.snapshot())
}

function resolveClaude(): ResolvedCommand | null {
  const ctx: ResolveEnv = {
    platform: process.platform,
    env: process.env,
    homeDir: os.homedir(),
    isFile: (file) => {
      try {
        return fs.statSync(file).isFile()
      } catch {
        return false
      }
    }
  }
  const override = process.env.STARDEW_CLAUDE_PATH
  const file = override && ctx.isFile(override) ? override : resolveCommand('claude', claudeCandidates(ctx), ctx)
  return file ? { file, prefixArgs: [] } : null
}

// ---------------------------------------------------------------- window

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'Agent 农场',
    backgroundColor: '#4f8a33',
    icon: pumpkinIcon(64),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.once('ready-to-show', () => win?.show())

  // The UI never navigates; links open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  // Closing the window keeps the farm (and its sessions) running in the tray.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win?.hide()
    if (!trayHintShown && Notification.isSupported()) {
      trayHintShown = true
      new Notification({ title: 'Agent 农场还在后台', body: '会话会继续运行。从托盘图标重新打开，或在托盘菜单里退出。' }).show()
    }
  })

  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function showWindow(): void {
  if (!manager) return
  if (!win || win.isDestroyed()) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

// ------------------------------------------------------------------ tray

function createTray(): void {
  tray = new Tray(pumpkinIcon(16))
  tray.on('click', showWindow)
}

function updateTray(snapshot: FarmSnapshot): void {
  if (!tray) return
  const waiting = snapshot.plots.filter((p) => p.running && (p.state === 'pest' || p.state === 'thirsty')).length
  const growing = snapshot.plots.filter((p) => p.state === 'growing').length
  tray.setToolTip(waiting > 0 ? `Agent 农场：${waiting} 块地等你` : `Agent 农场：${growing} 块地在长`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开农场', click: showWindow },
      { type: 'separator' },
      { label: `等你处理：${waiting} 块`, enabled: false },
      { label: `生长中：${growing} 块`, enabled: false },
      { type: 'separator' },
      { label: '退出', click: () => void confirmQuit() }
    ])
  )
}

async function confirmQuit(): Promise<void> {
  const running = manager?.runningCount ?? 0
  if (running > 0) {
    const options = {
      type: 'question' as const,
      buttons: ['退出', '取消'],
      defaultId: 1,
      cancelId: 1,
      message: `还有 ${running} 个会话在运行`,
      detail: '退出后这些会话会停止，地块变成休眠。下次打开农场可以唤醒，接着之前的对话。'
    }
    const { response } = win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    if (response !== 0) return
  }
  quitting = true
  app.quit()
}

// ------------------------------------------------------------------ farm

function wireFarm(farm: FarmManager): void {
  farm.on('snapshot', (snapshot) => {
    send(IPC.snapshotChanged, snapshot)
    updateTray(snapshot)
  })

  // Streaming replies change the chat many times a second; forward at most once per frame.
  const pending = new Map<string, Map<string, ChatItem>>()
  let timer: NodeJS.Timeout | null = null
  farm.on('chat', (plotId, items) => {
    const queued = pending.get(plotId) ?? new Map<string, ChatItem>()
    for (const item of items) queued.set(item.id, item)
    pending.set(plotId, queued)
    timer ??= setTimeout(() => {
      timer = null
      for (const [id, changed] of pending) send(IPC.chat, id, [...changed.values()])
      pending.clear()
    }, 16)
  })

  farm.on('attention', (plot) => {
    if (win?.isFocused() || !Notification.isSupported()) return
    notify(plot)
  })
}

function notify(plot: Plot): void {
  const pest = plot.state === 'pest'
  const notification = new Notification({
    title: pest ? `有虫了：${plot.name}` : `缺水了：${plot.name}`,
    body: plot.note ?? (pest ? '在等你审批' : '在等你回复')
  })
  notification.on('click', () => {
    showWindow()
    send(IPC.focusPlot, plot.id)
  })
  notification.show()
}

// ------------------------------------------------------------------- IPC

function registerIpc(farm: FarmManager): void {
  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrusted(event)
      return fn(...args)
    })
  }

  handle(IPC.snapshot, () => farm.snapshot())
  handle(IPC.info, () => ({ platform: process.platform, claudePath: resolveClaude()?.file ?? null, version: app.getVersion() }))
  handle(IPC.plant, (request) => farm.plant(parsePlant(request)))
  handle(IPC.pickDirectory, async () => {
    const options = { properties: ['openDirectory' as const], title: '选择项目目录' }
    const result = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle(IPC.revive, (id) => farm.revive(text(id)))
  handle(IPC.stop, (id) => farm.stop(text(id)))
  handle(IPC.harvest, (id) => farm.harvest(text(id)))
  handle(IPC.readChat, (id) => farm.readChat(text(id)))
  handle(IPC.readScreen, (id) => farm.readScreen(text(id)))
  handle(IPC.sendMessage, (id, message) => farm.sendMessage(text(id), text(message, 100_000)))
  handle(IPC.respondPermission, (id, itemId, allow) => farm.respondPermission(text(id), text(itemId), allow === true))
  handle(IPC.pickOption, (id, label) => farm.pickOption(text(id), text(label, 500)))

  ipcMain.on(IPC.sendKey, (event: IpcMainEvent, id: unknown, key: unknown) => {
    if (isTrusted(event) && typeof id === 'string' && isKeyName(key)) farm.sendKey(id, key)
  })
}

function isKeyName(value: unknown): value is KeyName {
  return typeof value === 'string' && (KEY_NAMES as readonly string[]).includes(value)
}

function isTrusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  return devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
}

function assertTrusted(event: IpcMainInvokeEvent): void {
  if (!isTrusted(event)) throw new Error('untrusted sender')
}

function text(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('参数错误')
  return value
}

function parsePlant(value: unknown): PlantRequest {
  if (!value || typeof value !== 'object') throw new Error('参数错误')
  const v = value as Record<string, unknown>
  const agent = v.agent === 'codex' ? 'codex' : v.agent === 'claude' ? 'claude' : null
  if (!agent) throw new Error('不认识的 agent 类型')
  return { name: text(v.name, 200), cwd: text(v.cwd), agent, remoteControl: v.remoteControl === true }
}
