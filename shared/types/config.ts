/**
 * 全局参数状态模型 — 覆盖 PRD 五个功能模块的字段占位。
 * 渲染进程负责读写展示；重度计算在主进程读取同构快照。
 */

import type { OpenTopoDemType } from "./dem";

// ─── 模块一：地图选取与尺寸 ─────────────────────────────────────────

export type BaseShape = "circle" | "rectangle" | "polygon";

export interface MapCropConfig {
  shape: BaseShape;
  /** 圆形：打印半径 (mm)，仅用于 STL，不影响地图遮罩视觉大小 */
  radiusMm: number;
  /** 矩形：长 × 宽 (mm)；地图遮罩仅取长宽比，尺寸固定 */
  lengthMm: number;
  widthMm: number;
  /** 正多边形：边数 3–8 影响遮罩形状；边长 (mm) 仅用于 STL */
  polygonSides: number;
  polygonSideLengthMm: number;
  /** 地图视窗中心与缩放（地理坐标，供构图与后续 DEM 采样） */
  mapCenterLat: number;
  mapCenterLon: number;
  mapZoom: number;
  /** 地图旋转角（度，0=北朝上），供裁剪与 STL 朝向 */
  mapBearingDeg: number;
}

// ─── 模块二：主模型生成 ─────────────────────────────────────────────

export type TerrainSmoothing = "raw" | "light" | "medium" | "heavy";

/** 地形 DEM 网格与 3D 预览精度 */
export type TerrainMeshQuality =
  | "standard"
  | "high"
  | "ultra"
  | "extreme"
  | "studio"
  | "custom";

/** meshQuality === "custom" 时生效：DEM 网格单边最大采样数 */
export interface TerrainMeshQualityCustom {
  maxGrid: number;
}

export interface TerrainConfig {
  baseSolidThicknessMm: number;
  zExaggeration: number;
  /** DEM 网格密度：影响 3D 预览与 STL 导出 */
  meshQuality: TerrainMeshQuality;
  /** 自定义精度参数（仅 meshQuality 为 custom 时使用） */
  meshQualityCustom: TerrainMeshQualityCustom;
  smoothing: TerrainSmoothing;
  /** OpenTopography 数据集，见 shared/types/dem.ts */
  demDataset: OpenTopoDemType;
  /** OpenTopography API Key（可由 .env 注入） */
  openTopographyApiKey: string;
}

// ─── 模块三：轨迹模型 ─────────────────────────────────────────────────

export interface TrailConfig {
  gpxSimplify: boolean;
  trailWidthMm: number;
  trailDepthMm: number;
  /** 轨迹顶面高出主模型对应地表的高度 (mm)，用于导出 STL 装配 */
  heightAboveMainMm: number;
}

// ─── 模块四：托盘底座与文字 ───────────────────────────────────────────

export type TextAlign = "left" | "center" | "right";
export type EngraveStyle = "intaglio" | "relief";
/** 刻字朝向：朝外=从托盘外侧可读；朝内=朝向山体中心可读 */
export type TextFacing = "inward" | "outward";

export interface BorderTextEdge {
  content: string;
  /** 沿边对齐（切向）；默认居中 */
  align: TextAlign;
  style: EngraveStyle;
  fontId: string;
  /** 字号 (mm) */
  fontSizeMm: number;
  /** 朝内 / 朝外 */
  facing: TextFacing;
  /** 法向偏移 (mm)，相对边框带厚度中线，正=朝外；0=垂直居中 */
  centerOffsetMm: number;
}

export interface TrayConfig {
  totalThicknessMm: number;
  recessDepthMm: number;
  rimWidthMm: number;
  /** 矩形 4 边 / 正多边形 N 边，任务-05 按形状联动 */
  borderTextByEdge: BorderTextEdge[];
}

// ─── 模块五：打印装配与磁铁 ───────────────────────────────────────────

export interface MagnetConfig {
  enabled: boolean;
  diameterMm: number;
  thicknessMm: number;
  /** 圆形底座磁铁孔数量（仅 shape===circle 时生效，默认 3，范围 2～12） */
  circleCount: number;
  fridgeMagnetHole: boolean;
  snapFitHole: boolean;
}

export interface AssemblyConfig {
  trailToleranceMm: number;
  trayToleranceMm: number;
  magnet: MagnetConfig;
}

// ─── GPX（任务-01）────────────────────────────────────────────────────

export interface GpxPoint {
  lat: number;
  lon: number;
  ele?: number;
}

export interface GpxBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface GpxState {
  imported: boolean;
  fileName?: string;
  /** 本机 GPX 路径（Electron 导入时有值，供主进程导出时重新读取） */
  filePath?: string;
  trackName?: string;
  /** 当前生效轨迹（任务-04 优化后可能替换） */
  points: GpxPoint[];
  /** 原始解析轨迹，供 gpxSimplify 管道使用 */
  rawPoints: GpxPoint[];
  bounds: GpxBounds | null;
  pointCount: number;
  distanceKm: number;
  lastImportError?: string;
}

// ─── 应用全局配置 ───────────────────────────────────────────────────────

export interface AppConfig {
  gpx: GpxState;
  mapCrop: MapCropConfig;
  terrain: TerrainConfig;
  trail: TrailConfig;
  tray: TrayConfig;
  assembly: AssemblyConfig;
}

export function createDefaultConfig(): AppConfig {
  return {
    gpx: {
      imported: false,
      points: [],
      rawPoints: [],
      bounds: null,
      pointCount: 0,
      distanceKm: 0,
    },
    mapCrop: {
      shape: "circle",
      radiusMm: 80,
      lengthMm: 120,
      widthMm: 80,
      polygonSides: 6,
      polygonSideLengthMm: 40,
      mapCenterLat: 0,
      mapCenterLon: 0,
      mapZoom: 12,
      mapBearingDeg: 0,
    },
    terrain: {
      baseSolidThicknessMm: 2,
      zExaggeration: 2,
      meshQuality: "studio",
      meshQualityCustom: { maxGrid: 512 },
      smoothing: "raw",
      demDataset: "COP30",
      openTopographyApiKey: "",
    },
    trail: {
      gpxSimplify: false,
      trailWidthMm: 1,
      trailDepthMm: 1.5,
      heightAboveMainMm: 0.12,
    },
    tray: {
      totalThicknessMm: 8,
      recessDepthMm: 5,
      rimWidthMm: 6,
      borderTextByEdge: [],
    },
    assembly: {
      trailToleranceMm: 0.15,
      trayToleranceMm: 0.2,
      magnet: {
        enabled: false,
        diameterMm: 6,
        thicknessMm: 2,
        circleCount: 3,
        fridgeMagnetHole: false,
        snapFitHole: false,
      },
    },
  };
}
