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
  TrayGenerateResponse,
  ExportGenerateRequest,
  ExportGenerateResponse,
  ExportProgress
} from '@shared/ipc/types'
import { isIpcError, type IpcError } from '@shared/ipc/types'

function invokeErrorMessage(err: unknown): string {
  if (isIpcError(err)) {
    return err.message
  }
  if (err instanceof Error) {
    const m = err.message
    const stripped = m.replace(
      /^Error invoking remote method '[^']+':\s*/,
      '',
    )
    if (stripped === '[object Object]') {
      return '操作失败，请重试'
    }
    if (stripped.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(stripped)
        if (isIpcError(parsed)) {
          return parsed.message
        }
      } catch {
        /* 非 JSON */
      }
    }
    return stripped || m
  }
  return String(err)
}

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, payload)) as T
  } catch (err) {
    throw {
      code: 'IPC_INVOKE_FAILED',
      message: invokeErrorMessage(err),
    } satisfies IpcError
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
    invoke<TrayGenerateResponse>(IpcChannels.TRAY_GENERATE, req),
  generateExport: (req: ExportGenerateRequest) =>
    invoke<ExportGenerateResponse>(IpcChannels.EXPORT_GENERATE, req),
  revealExport: (zipPath: string) =>
    invoke<{ ok: true }>(IpcChannels.EXPORT_REVEAL, zipPath),
  onExportProgress: (callback: (progress: ExportProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ExportProgress) => {
      callback(progress)
    }
    ipcRenderer.on(IpcChannels.EXPORT_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannels.EXPORT_PROGRESS, handler)
    }
  }
}

export type TrailPrintApi = typeof api

contextBridge.exposeInMainWorld('trailPrint', api)
