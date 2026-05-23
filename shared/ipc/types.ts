/** IPC 统一错误结构，主进程 reject 时序列化传递 */
export interface IpcError {
  code: string
  message: string
}

export function isIpcError(value: unknown): value is IpcError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as IpcError).code === 'string' &&
    typeof (value as IpcError).message === 'string'
  )
}

export class IpcException extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'IpcException'
    this.code = code
  }

  toJSON(): IpcError {
    return { code: this.code, message: this.message }
  }
}

export interface PingRequest {
  message?: string
}

export interface PingResponse {
  reply: string
  process: 'main'
  timestamp: number
}

export type TaskKind =
  | 'gpx-parse'
  | 'dem-sample'
  | 'mesh-boolean'
  | 'stl-export'
  | 'zip-pack'

export interface TaskEnqueueRequest {
  kind: TaskKind
  payload?: Record<string, unknown>
}

export interface TaskEnqueueResponse {
  taskId: string
}

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed'

export interface TaskStatusRequest {
  taskId?: string
}

export interface TaskRecord {
  id: string
  kind: TaskKind
  status: TaskStatus
  error?: IpcError
  createdAt: number
  finishedAt?: number
}

export interface TaskStatusResponse {
  tasks: TaskRecord[]
}
