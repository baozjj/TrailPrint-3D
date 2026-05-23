import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import type {
  GpxParseRequest,
  GpxParseResponse,
  PingRequest,
  PingResponse,
  TaskEnqueueRequest,
  TaskEnqueueResponse,
  TaskStatusRequest,
  TaskStatusResponse,
  TerrainGenerateRequest,
  TerrainGenerateResponse,
  TrayGenerateRequest,
  TrayGenerateResponse
} from '@shared/ipc/types'
import { isIpcError } from '@shared/ipc/types'

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, payload)) as T
  } catch (err) {
    if (isIpcError(err)) {
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    throw { code: 'IPC_INVOKE_FAILED', message }
  }
}

/** 暴露给渲染进程的类型安全 IPC API */
const api = {
  ping: (req?: PingRequest) => invoke<PingResponse>(IpcChannels.APP_PING, req),
  enqueueTask: (req: TaskEnqueueRequest) =>
    invoke<TaskEnqueueResponse>(IpcChannels.TASK_ENQUEUE, req),
  getTaskStatus: (req?: TaskStatusRequest) =>
    invoke<TaskStatusResponse>(IpcChannels.TASK_STATUS, req),
  parseGpx: (req: GpxParseRequest) =>
    invoke<GpxParseResponse>(IpcChannels.GPX_PARSE, req),
  generateTerrain: (req: TerrainGenerateRequest) =>
    invoke<TerrainGenerateResponse>(IpcChannels.TERRAIN_GENERATE, req),
  generateTray: (req: TrayGenerateRequest) =>
    invoke<TrayGenerateResponse>(IpcChannels.TRAY_GENERATE, req)
}

export type TrailPrintApi = typeof api

contextBridge.exposeInMainWorld('trailPrint', api)
