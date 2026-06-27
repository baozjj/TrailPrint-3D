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
  GPX_PARSE: 'gpx:parse',
  /** 生成 Terrain_Main 网格（主进程 DEM + 网格管线） */
  TERRAIN_GENERATE: 'terrain:generate',
  /** 主进程 → 渲染进程：地形生成进度 */
  TERRAIN_PROGRESS: 'terrain:progress',
  /** 生成 Tray_Base 托盘网格（主进程） */
  TRAY_GENERATE: 'tray:generate',
  /** 生成三件套 STL 并打包 ZIP（主进程，含保存对话框） */
  EXPORT_GENERATE: 'export:generate',
  /** 主进程 → 渲染进程：导出进度 */
  EXPORT_PROGRESS: 'export:progress',
  /** 在文件管理器中显示已导出的 ZIP */
  EXPORT_REVEAL: 'export:reveal',
  /** 喷漆分色：规则映射生成 cellRegions */
  SPRAY_SEGMENT: 'spray:segment',
  /** 主进程 → 渲染进程：喷漆分色进度 */
  SPRAY_PROGRESS: 'spray:progress',
  /** 喷漆分色：生成遮挡罩 mesh */
  SPRAY_GENERATE_MASKS: 'spray:generate-masks'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
