// Exposes the farm API to the UI. Runs sandboxed: only `electron` can be imported,
// local modules are bundled in by electron-vite.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type FarmApi } from '../shared/api'

function subscribe<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): () => void {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(...(args as Args))
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: FarmApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.snapshot),
  onSnapshot: (listener) => subscribe(IPC.snapshotChanged, listener),
  onFocusPlot: (listener) => subscribe(IPC.focusPlot, listener),
  info: () => ipcRenderer.invoke(IPC.info),
  plant: (request) => ipcRenderer.invoke(IPC.plant, request),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  revive: (plotId) => ipcRenderer.invoke(IPC.revive, plotId),
  stop: (plotId) => ipcRenderer.invoke(IPC.stop, plotId),
  harvest: (plotId) => ipcRenderer.invoke(IPC.harvest, plotId),
  readOutput: (plotId) => ipcRenderer.invoke(IPC.readOutput, plotId),
  onOutput: (listener) => subscribe(IPC.output, listener),
  write: (plotId, data) => ipcRenderer.send(IPC.write, plotId, data),
  resize: (plotId, cols, rows) => ipcRenderer.send(IPC.resize, plotId, cols, rows)
}

contextBridge.exposeInMainWorld('farm', api)
