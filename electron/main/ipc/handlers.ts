import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { IpcException, type IpcError } from '@shared/ipc/types'
import type {
  PingRequest,
  PingResponse,
  TaskEnqueueRequest,
  TaskEnqueueResponse,
  TaskStatusRequest,
  TaskStatusResponse
} from '@shared/ipc/types'
import { enqueueTask, listTasks } from '../task-queue'

function wrapHandler<Req, Res>(fn: (req: Req) => Res | Promise<Res>) {
  return async (_event: Electron.IpcMainInvokeEvent, req: Req): Promise<Res> => {
    try {
      return await fn(req)
    } catch (err) {
      if (err instanceof IpcException) {
        throw err.toJSON() satisfies IpcError
      }
      throw err
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
      const record = enqueueTask(req.kind)
      return { taskId: record.id }
    })
  )

  ipcMain.handle(
    IpcChannels.TASK_STATUS,
    wrapHandler((req: TaskStatusRequest = {}): TaskStatusResponse => {
      return { tasks: listTasks(req.taskId) }
    })
  )
}
