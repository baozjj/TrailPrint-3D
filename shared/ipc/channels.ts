/**
 * IPC 通道命名约定：
 * - 请求/响应：domain:action（如 app:ping）
 * - 单向事件：domain:event（后续任务扩展）
 */
export const IpcChannels = {
  /** 健康检查 / 示例调用 */
  APP_PING: 'app:ping',
  /** 将重度计算任务提交到主进程队列 */
  TASK_ENQUEUE: 'task:enqueue',
  /** 查询队列状态 */
  TASK_STATUS: 'task:status',
  /** 解析 GPX 文件（主进程） */
  GPX_PARSE: 'gpx:parse'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
