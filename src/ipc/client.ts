import { isIpcError, type IpcError } from '@shared/ipc/types'
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
  TerrainGenerateProgress,
  TrayGenerateRequest,
  TrayGenerateResponse,
  ExportGenerateRequest,
  ExportGenerateResponse,
  ExportProgress
} from '@shared/ipc/types'

function getApi(): Window['trailPrint'] {
  if (!window.trailPrint) {
    throw new Error('preload API 未注入，请检查 preload 脚本')
  }
  return window.trailPrint
}

export async function ipcPing(req?: PingRequest): Promise<PingResponse> {
  return getApi().ping(req)
}

export async function ipcEnqueueTask(
  req: TaskEnqueueRequest
): Promise<TaskEnqueueResponse> {
  return getApi().enqueueTask(req)
}

export async function ipcGetTaskStatus(
  req?: TaskStatusRequest
): Promise<TaskStatusResponse> {
  return getApi().getTaskStatus(req)
}

export async function ipcParseGpx(req: GpxParseRequest): Promise<GpxParseResponse> {
  return getApi().parseGpx(req)
}

export async function ipcGenerateTerrain(
  req: TerrainGenerateRequest
): Promise<TerrainGenerateResponse> {
  return getApi().generateTerrain(req)
}

export async function ipcGenerateTray(
  req: TrayGenerateRequest
): Promise<TrayGenerateResponse> {
  return getApi().generateTray(req)
}

export async function ipcGenerateExport(
  req: ExportGenerateRequest
): Promise<ExportGenerateResponse> {
  return getApi().generateExport(req)
}

export async function ipcRevealExport(zipPath: string): Promise<void> {
  await getApi().revealExport(zipPath)
}

export function ipcOnExportProgress(
  callback: (progress: ExportProgress) => void
): () => void {
  return getApi().onExportProgress(callback)
}

export function ipcOnTerrainProgress(
  callback: (progress: TerrainGenerateProgress) => void,
): () => void {
  return getApi().onTerrainProgress(callback)
}

export function formatIpcError(err: unknown): string {
  if (isIpcError(err)) {
    return err.message
  }
  if (err instanceof Error) {
    const stripped = err.message.replace(
      /^Error invoking remote method '[^']+':\s*/,
      '',
    )
    if (stripped && stripped !== '[object Object]') {
      return stripped
    }
    return err.message
  }
  return String(err)
}

export type { IpcError }
