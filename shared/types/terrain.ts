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

/** 轻量网格载荷（IPC 传回渲染进程预览） */
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
}

export interface TerrainGenerateRequest {
  config: AppConfig;
  /** 地图视窗像素尺寸（与遮罩几何一致） */
  viewportWidth: number;
  viewportHeight: number;
  /** 可选：任务-04 传入时执行挖槽（当前为占位直通） */
  trailGroove?: TrailGrooveSpec;
}

export interface TerrainGenerateResponse {
  crop: TerrainCropRegion;
  mesh: TerrainMeshPayload;
  /** Trail_Line 可打印实体；无 GPX 或点数不足时为 null */
  trailMesh: TerrainMeshPayload | null;
  /** DEM 来源说明 */
  demSource: "open-meteo" | "synthetic";
  generationMs: number;
}

export interface TerrainGenerateProgress {
  phase: "crop" | "dem" | "mesh" | "done";
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
