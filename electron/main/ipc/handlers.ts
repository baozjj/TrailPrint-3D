import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { IpcException, type IpcError } from '@shared/ipc/types'
import type {
  GpxParseRequest,
  GpxParseResponse,
  PingRequest,
  PingResponse,
  TaskEnqueueRequest,
  TaskEnqueueResponse,
  TaskStatusRequest,
  TaskStatusResponse
} from '@shared/ipc/types'
import { parseGpxFile } from '../gpx/parse-gpx'
import { setGpxSessionCache } from '../gpx/gpx-session-cache'
import { generateTerrainMain } from '../terrain/terrain-main-service'
import { enqueueTask, listTasks } from '../task-queue'
import type {
  TerrainGenerateRequest,
  TerrainGenerateResponse
} from '@shared/types/terrain'
import type {
  TrayGenerateRequest,
  TrayGenerateResponse
} from '@shared/types/tray'
import type {
  ExportGenerateRequest,
  ExportGenerateResponse
} from '@shared/types/export'
import { generateTrayBase } from '../tray/tray-service'
import { generateModelsZip, revealExportZip } from '../export/export-service'
import { segmentSprayPaint } from '../spray-paint/segment-service'
import { generateSprayMasks } from '../spray-paint/mask-generate-service'
import type {
  SpraySegmentRequest,
  SpraySegmentResponse,
  SprayGenerateMasksRequest,
  SprayGenerateMasksResponse,
} from '@shared/types/spray-paint'

function wrapHandler<Req, Res>(fn: (req: Req) => Res | Promise<Res>) {
  return async (_event: Electron.IpcMainInvokeEvent, req: Req): Promise<Res> => {
    try {
      return await fn(req)
    } catch (err) {
      if (err instanceof IpcException) {
        // 必须 throw Error：抛普通对象在渲染进程会变成 [object Object]
        throw new Error(err.message)
      }
      if (err instanceof Error) {
        throw err
      }
      throw new Error(String(err))
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(
    IpcChannels.APP_PING,
    wrapHandler((req: PingRequest = {}): PingResponse => {
      const message = req.message?.trim() || 'TrailPrint 3D'
      return {
        reply: `主进程已收到: ${message}`,
        process: 'main',
        timestamp: Date.now()
      }
    })
  )

  ipcMain.handle(
    IpcChannels.TASK_ENQUEUE,
    wrapHandler((req: TaskEnqueueRequest): TaskEnqueueResponse => {
      if (!req?.kind) {
        throw new IpcException('INVALID_REQUEST', '缺少任务类型 kind')
      }
      const record = enqueueTask(req.kind, req.payload)
      return { taskId: record.id }
    })
  )

  ipcMain.handle(
    IpcChannels.TASK_STATUS,
    wrapHandler((req: TaskStatusRequest = {}): TaskStatusResponse => {
      return { tasks: listTasks(req.taskId) }
    })
  )

  ipcMain.handle(
    IpcChannels.GPX_PARSE,
    wrapHandler(async (req: GpxParseRequest): Promise<GpxParseResponse> => {
      const result = await parseGpxFile(req)
      setGpxSessionCache(result)
      return { result }
    })
  )

  ipcMain.handle(
    IpcChannels.TERRAIN_GENERATE,
    async (
      event: Electron.IpcMainInvokeEvent,
      req: TerrainGenerateRequest,
    ): Promise<TerrainGenerateResponse> => {
      try {
        if (!req?.config) {
          throw new IpcException('INVALID_REQUEST', '缺少 config 快照')
        }
        return await generateTerrainMain(req, (progress) => {
          event.sender.send(IpcChannels.TERRAIN_PROGRESS, progress)
        })
      } catch (err) {
        if (err instanceof IpcException) {
          throw new Error(err.message)
        }
        if (err instanceof Error) {
          throw err
        }
        throw new Error(String(err))
      }
    },
  )

  ipcMain.handle(
    IpcChannels.TRAY_GENERATE,
    wrapHandler(
      async (req: TrayGenerateRequest): Promise<TrayGenerateResponse> => {
        if (!req?.config) {
          throw new IpcException('INVALID_REQUEST', '缺少 config 快照')
        }
        return generateTrayBase(req)
      }
    )
  )

  ipcMain.handle(
    IpcChannels.EXPORT_REVEAL,
    wrapHandler((zipPath: string): { ok: true } => {
      if (typeof zipPath !== 'string' || !zipPath.trim()) {
        throw new IpcException('INVALID_PATH', '文件路径无效')
      }
      revealExportZip(zipPath)
      return { ok: true }
    })
  )

  ipcMain.handle(
    IpcChannels.EXPORT_GENERATE,
    async (
      event: Electron.IpcMainInvokeEvent,
      req: ExportGenerateRequest
    ): Promise<ExportGenerateResponse> => {
      try {
        if (!req?.config) {
          throw new IpcException('INVALID_REQUEST', '缺少 config 快照')
        }
        const win = BrowserWindow.fromWebContents(event.sender)
        return await generateModelsZip(
          req,
          (progress) => {
            event.sender.send(IpcChannels.EXPORT_PROGRESS, progress)
          },
          win
        )
      } catch (err) {
        if (err instanceof IpcException) {
          throw err.toJSON() satisfies IpcError
        }
        throw err
      }
    }
  )

  ipcMain.handle(
    IpcChannels.SPRAY_SEGMENT,
    async (
      event: Electron.IpcMainInvokeEvent,
      req: SpraySegmentRequest,
    ): Promise<SpraySegmentResponse> => {
      try {
        if (!req?.config || !req.heightPreview || !req.crop) {
          throw new IpcException('INVALID_REQUEST', '缺少分色参数')
        }
        return await segmentSprayPaint(req, (progress) => {
          event.sender.send(IpcChannels.SPRAY_PROGRESS, progress)
        })
      } catch (err) {
        if (err instanceof IpcException) {
          throw new Error(err.message)
        }
        if (err instanceof Error) {
          throw err
        }
        throw new Error(String(err))
      }
    },
  )

  ipcMain.handle(
    IpcChannels.SPRAY_GENERATE_MASKS,
    async (
      event: Electron.IpcMainInvokeEvent,
      req: SprayGenerateMasksRequest,
    ): Promise<SprayGenerateMasksResponse> => {
      try {
        if (!req?.config || !req.plan || !req.heightPreview || !req.crop) {
          throw new IpcException('INVALID_REQUEST', '缺少遮挡罩参数')
        }
        return await generateSprayMasks(req, (progress) => {
          event.sender.send(IpcChannels.SPRAY_PROGRESS, progress)
        })
      } catch (err) {
        if (err instanceof IpcException) {
          throw new Error(err.message)
        }
        if (err instanceof Error) {
          throw err
        }
        throw new Error(String(err))
      }
    },
  )
}
