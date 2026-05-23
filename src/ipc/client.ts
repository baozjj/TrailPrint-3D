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
  TerrainGenerateResponse
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

export function formatIpcError(err: unknown): string {
  if (isIpcError(err)) {
    return err.message
  }
  if (err instanceof Error) {
    return err.message
  }
  return String(err)
}

export type { IpcError }
