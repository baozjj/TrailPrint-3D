import type { AppConfig, BaseShape, TerrainSmoothing } from "./config";

/** 地理裁剪范围（供主进程 DEM 采样） */
export interface TerrainCropRegion {
  shape: BaseShape;
  centerLat: number;
  centerLon: number;
  bearingDeg: number;
  /** 外接矩形（度） */
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  /** 物理打印尺寸 (mm) */
  widthMm: number;
  heightMm: number;
  /** 圆形半径 / 多边形外接圆半径 (mm)，非圆形为 undefined */
  radiusMm?: number;
  polygonSides?: number;
}

/** 3D 预览专用：规则高度场，渲染进程本地重建山体 */
export interface TerrainHeightPreview {
  cols: number;
  rows: number;
  /** 行优先地表高度 (mm)，已含挖槽 */
  heights: Float64Array | number[];
  minSurfaceZ: number;
  bottomZ: number;
  baseThicknessMm: number;
}

export interface TerrainMeshPayload {
  /** 顶点坐标 [x0,y0,z0, x1,y1,z1, ...] 单位 mm，原点在模型中心、Z 向上 */
  positions: number[];
  /** 三角面索引 */
  indices: number[];
  /** 表面最低 Z（地形最低点，相对模型坐标） */
  minSurfaceZ: number;
  /** 底面 Z（纯平底） */
  bottomZ: number;
  gridCols: number;
  gridRows: number;
}

/** 任务-04：轨迹槽挖除规格（主模型表面布尔减） */
export interface TrailGrooveSpec {
  /** 轨迹折线，模型平面坐标 mm（与 Terrain_Main 同一坐标系） */
  polylineMm: Array<{ x: number; y: number }>;
  /** 凹槽宽度 (mm)，含任务-06 装配公差：trailWidth + 2×trailTolerance */
  widthMm: number;
  /** 凹槽深度 (mm)，等于轨迹厚度 trailDepthMm */
  depthMm: number;
  /** 平底槽底 Z (mm)，通常为 -depthMm（相对 Z=0 基准） */
  floorZMm?: number;
}

export interface TerrainGenerateRequest {
  config: AppConfig;
  /** 地图视窗像素尺寸（与遮罩几何一致） */
  viewportWidth: number;
  viewportHeight: number;
  /** 3D 弹窗预览：更高 DEM 网格密度；不挖轨迹槽（轨迹用圆管叠加） */
  highQualityPreview?: boolean;
  /** STL 导出：与预览同密度 DEM，并执行轨迹挖槽 */
  stlExport?: boolean;
  /** 可选：任务-04 传入时执行挖槽（当前为占位直通） */
  trailGroove?: TrailGrooveSpec;
  /**
   * Trail_Line 实体宽度 (mm)。未指定时使用 config.trail.trailWidthMm。
   * 装配公差仅扩大主模型凹槽，不缩小轨迹件宽度。
   */
  trailLineWidthMm?: number;
}

export interface TerrainGenerateResponse {
  crop: TerrainCropRegion;
  mesh: TerrainMeshPayload;
  /** 规则高度场，供 3D 预览可靠重建山体 */
  heightPreview: TerrainHeightPreview;
  /** Trail_Line 可打印实体；无 GPX 或点数不足时为 null */
  trailMesh: TerrainMeshPayload | null;
  /** 3D 预览：模型平面轨迹折线 (mm) */
  trailPolylineMm: Array<{ x: number; y: number }>;
  /** 3D 预览：轨迹显示宽度 (mm) */
  trailDisplayWidthMm: number;
  /** DEM 数据来源（OpenTopography 栅格） */
  demSource: "opentopography";
  generationMs: number;
}

export type TerrainGeneratePhase =
  | "prepare"
  | "crop"
  | "dem"
  | "process"
  | "trail"
  | "mesh"
  | "done";

export interface TerrainGenerateProgress {
  phase: TerrainGeneratePhase;
  /** 0–1 */
  progress: number;
  message: string;
}

/** 渲染进程 3D 场景构建进度 */
export type TerrainScenePhase = "terrain" | "tray" | "trail" | "camera" | "done";

export interface TerrainSceneProgress {
  phase: TerrainScenePhase;
  /** 0–1 */
  progress: number;
  message: string;
}

/** 与 UI 字段对齐的生成参数快照 */
export interface TerrainMainParams {
  baseThicknessMm: number;
  zExaggeration: number;
  terrainSmoothing: TerrainSmoothing;
}

export function terrainParamsFromConfig(
  config: AppConfig,
): TerrainMainParams {
  return {
    baseThicknessMm: config.terrain.baseSolidThicknessMm,
    zExaggeration: config.terrain.zExaggeration,
    terrainSmoothing: config.terrain.smoothing,
  };
}
