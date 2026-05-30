/**
 * 主进程重度计算任务队列（占位实现）。
 *
 * 职责边界（任务-00）：
 * - 渲染进程：仅 UI 展示与参数状态管理
 * - 主进程：GPX 解析、DEM 采样、布尔/挖槽、STL 生成、ZIP 打包
 *
 * 所有耗时任务应通过 enqueue 入队，避免阻塞 Electron 事件循环与 UI。
 */
import { randomUUID } from 'crypto'
import type { IpcError, TaskEnqueueRequest, TaskKind, TaskRecord, TaskStatus } from '@shared/ipc/types'
import type { TerrainGenerateRequest } from '@shared/types/terrain'
import { generateTerrainMain } from './terrain/terrain-main-service'
import { generateModelsZip } from './export/export-service'
import type { AppConfig } from '@shared/types'

type TaskHandler = (task: TaskRecord, payload?: Record<string, unknown>) => Promise<void>

const terrainResults = new Map<string, unknown>()

const handlers: Partial<Record<TaskKind, TaskHandler>> = {
  'gpx-parse': async () => {
    await delay(50)
  },
  'dem-sample': async () => {
    await delay(80)
  },
  'terrain-generate': async (_task, payload) => {
    const req = payload as TerrainGenerateRequest | undefined
    if (!req?.config) {
      throw new Error('terrain-generate 需要 payload.config')
    }
    const result = await generateTerrainMain(req)
    terrainResults.set(_task.id, result)
  },
  'mesh-boolean': async () => {
    await delay(120)
  },
  'stl-export': async () => {
    await delay(60)
  },
  'zip-pack': async (_task, payload) => {
    const p = payload as {
      config?: AppConfig
      viewportWidth?: number
      viewportHeight?: number
    } | undefined
    if (!p?.config) {
      throw new Error('zip-pack 需要 payload.config')
    }
    await generateModelsZip(
      {
        config: p.config,
        viewportWidth: p.viewportWidth ?? 800,
        viewportHeight: p.viewportHeight ?? 600,
      },
      () => undefined,
      null,
    )
  }
}

const tasks = new Map<string, TaskRecord>()
const taskPayloads = new Map<string, TaskEnqueueRequest['payload']>()
let running = false

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function enqueueTask(
  kind: TaskKind,
  payload?: TaskEnqueueRequest['payload']
): TaskRecord {
  const record: TaskRecord = {
    id: randomUUID(),
    kind,
    status: 'queued',
    createdAt: Date.now()
  }
  tasks.set(record.id, record)
  taskPayloads.set(record.id, payload)
  void drainQueue()
  return record
}

export function getTerrainTaskResult(taskId: string): unknown {
  return terrainResults.get(taskId)
}

export function listTasks(taskId?: string): TaskRecord[] {
  const all = [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt)
  if (taskId) {
    const one = tasks.get(taskId)
    return one ? [one] : []
  }
  return all.slice(0, 50)
}

async function drainQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    while (true) {
      const next = [...tasks.values()].find((t) => t.status === 'queued')
      if (!next) break
      await runTask(next)
    }
  } finally {
    running = false
  }
}

async function runTask(task: TaskRecord): Promise<void> {
  task.status = 'running'
  const handler = handlers[task.kind]
  const payload = taskPayloads.get(task.id)
  try {
    if (!handler) {
      throw new Error(`未注册的任务类型: ${task.kind}`)
    }
    await handler(task, payload)
    task.status = 'done'
    task.finishedAt = Date.now()
  } catch (err) {
    task.status = 'failed'
    task.finishedAt = Date.now()
    task.error = toIpcError(err)
  }
}

function toIpcError(err: unknown): IpcError {
  if (err instanceof Error) {
    return { code: 'TASK_FAILED', message: err.message }
  }
  return { code: 'TASK_FAILED', message: String(err) }
}

export function getQueueRunning(): boolean {
  return running
}
