import type {
  MapCropConfig,
  TerrainMeshQuality,
  TerrainMeshQualityCustom,
} from "../types/config";

export type { TerrainMeshQuality };

/** 制版档 DEM 下载超时 (ms) */
export const STUDIO_DEM_FETCH_TIMEOUT_MS = 300_000;

/** 自定义 DEM 网格单边上限范围 */
export const CUSTOM_MESH_GRID_MIN = 72;
export const CUSTOM_MESH_GRID_MAX = 1536;
export const CUSTOM_MESH_GRID_DEFAULT = 512;

export interface TerrainMeshQualitySpec {
  /** DEM 网格单边最大采样数 */
  maxGrid: number;
  minGrid: number;
  /** 相邻采样点最小间距 (mm) */
  minStepMm: number;
  /** 地表 Z 上限 (mm)，防止极端夸张 */
  zCapMm: number;
  /** 3D 预览卫星贴图边长 (px) */
  texturePx: number;
  /** 轨迹挤出重采样步长 = trailWidth / trailStepDivisor */
  trailStepDivisor: number;
  /** 轨迹重采样绝对下限 (mm) */
  trailMinStepMm: number;
}

type PresetTerrainMeshQuality = Exclude<TerrainMeshQuality, "custom">;

const PRESET_SPECS: Record<PresetTerrainMeshQuality, TerrainMeshQualitySpec> =
  {
    standard: {
      maxGrid: 160,
      minGrid: 72,
      minStepMm: 0.85,
      zCapMm: 36,
      texturePx: 1024,
      trailStepDivisor: 3,
      trailMinStepMm: 0.4,
    },
    high: {
      maxGrid: 256,
      minGrid: 112,
      minStepMm: 0.42,
      zCapMm: 48,
      texturePx: 2048,
      trailStepDivisor: 5,
      trailMinStepMm: 0.28,
    },
    ultra: {
      maxGrid: 384,
      minGrid: 160,
      minStepMm: 0.26,
      zCapMm: 56,
      texturePx: 3072,
      trailStepDivisor: 8,
      trailMinStepMm: 0.18,
    },
    extreme: {
      maxGrid: 512,
      minGrid: 224,
      minStepMm: 0.14,
      zCapMm: 64,
      texturePx: 4096,
      trailStepDivisor: 12,
      trailMinStepMm: 0.1,
    },
    studio: {
      maxGrid: 1024,
      minGrid: 384,
      minStepMm: 0.08,
      zCapMm: 72,
      texturePx: 6144,
      trailStepDivisor: 16,
      trailMinStepMm: 0.06,
    },
  };

export function clampCustomMaxGrid(value: number): number {
  if (!Number.isFinite(value)) return CUSTOM_MESH_GRID_DEFAULT;
  return Math.min(
    CUSTOM_MESH_GRID_MAX,
    Math.max(CUSTOM_MESH_GRID_MIN, Math.round(value)),
  );
}

export function normalizeMeshQualityCustom(
  custom: TerrainMeshQualityCustom | undefined | null,
): TerrainMeshQualityCustom {
  return { maxGrid: clampCustomMaxGrid(custom?.maxGrid ?? CUSTOM_MESH_GRID_DEFAULT) };
}

function buildCustomSpec(maxGrid: number): TerrainMeshQualitySpec {
  const g = clampCustomMaxGrid(maxGrid);
  const t = g / 1024;
  return {
    maxGrid: g,
    minGrid: Math.max(CUSTOM_MESH_GRID_MIN, Math.round(g * 0.375)),
    minStepMm: Math.max(0.05, 0.08 / Math.max(t, 0.25)),
    zCapMm: Math.min(80, 36 + g / 16),
    texturePx: Math.min(8192, Math.max(1024, Math.round(g * 6))),
    trailStepDivisor: Math.max(3, Math.round(g / 64)),
    trailMinStepMm: Math.max(0.05, 0.06 / Math.max(t, 0.25)),
  };
}

export type MeshQualityOptions = {
  meshQuality?: TerrainMeshQuality;
  meshQualityCustom?: TerrainMeshQualityCustom | null;
};

export function terrainMeshQualitySpec(
  quality: TerrainMeshQuality | undefined,
  custom?: TerrainMeshQualityCustom | null,
): TerrainMeshQualitySpec {
  if (quality === "custom") {
    return buildCustomSpec(
      normalizeMeshQualityCustom(custom).maxGrid,
    );
  }
  return PRESET_SPECS[quality ?? "high"];
}

export function gridResolutionForQuality(
  cropWidthMm: number,
  cropHeightMm: number,
  quality: TerrainMeshQuality | undefined,
  custom?: TerrainMeshQualityCustom | null,
): { cols: number; rows: number } {
  const spec = terrainMeshQualitySpec(quality, custom);
  const span = Math.max(cropWidthMm, cropHeightMm, 20);
  const step = Math.max(spec.minStepMm, span / spec.maxGrid);
  const cols = Math.min(
    spec.maxGrid,
    Math.max(spec.minGrid, Math.round(cropWidthMm / step)),
  );
  const rows = Math.min(
    spec.maxGrid,
    Math.max(spec.minGrid, Math.round(cropHeightMm / step)),
  );
  return { cols, rows };
}

/** 高网格档位使用更长 DEM 下载超时 */
export function demFetchTimeoutMs(
  quality: TerrainMeshQuality | undefined,
  custom?: TerrainMeshQualityCustom | null,
): number | undefined {
  const spec = terrainMeshQualitySpec(quality, custom);
  return spec.maxGrid >= 768 ? STUDIO_DEM_FETCH_TIMEOUT_MS : undefined;
}

/** 由地图裁剪配置估算打印外廓 (mm)，用于 UI 展示实际网格规模 */
export function estimatePrintFootprintMm(mapCrop: MapCropConfig): {
  widthMm: number;
  heightMm: number;
} {
  if (mapCrop.shape === "circle") {
    const d = mapCrop.radiusMm * 2;
    return { widthMm: d, heightMm: d };
  }
  if (mapCrop.shape === "rectangle") {
    return { widthMm: mapCrop.lengthMm, heightMm: mapCrop.widthMm };
  }
  const n = Math.max(3, mapCrop.polygonSides);
  const side = mapCrop.polygonSideLengthMm;
  const r = side / (2 * Math.sin(Math.PI / n));
  const d = r * 2;
  return { widthMm: d, heightMm: d };
}

export function meshQualitySummary(
  mapCrop: MapCropConfig,
  options: MeshQualityOptions,
): string {
  const quality = options.meshQuality;
  const custom = options.meshQualityCustom;
  const spec = terrainMeshQualitySpec(quality, custom);
  const { widthMm, heightMm } = estimatePrintFootprintMm(mapCrop);
  const { cols, rows } = gridResolutionForQuality(
    widthMm,
    heightMm,
    quality,
    custom,
  );
  const label =
    quality === "custom" ? `自定义上限 ${spec.maxGrid}` : `上限 ${spec.maxGrid}`;
  return `DEM ${cols}×${rows}（${label}），卫星贴图 ${spec.texturePx}px，预览与导出一致`;
}

/** 3D 预览红色轨迹圆管分段数 */
export function trailPreviewTubeSegments(
  pointCount: number,
  options: MeshQualityOptions,
): number {
  const spec = terrainMeshQualitySpec(
    options.meshQuality,
    options.meshQualityCustom,
  );
  const perPoint = Math.max(3, Math.round(spec.maxGrid / 73));
  return Math.max(48, Math.min(spec.maxGrid, pointCount * perPoint));
}

/** 该档位 DEM 采样点数量（用于 UI 性能提示） */
export function demSampleCount(
  mapCrop: MapCropConfig,
  options: MeshQualityOptions,
): number {
  const { widthMm, heightMm } = estimatePrintFootprintMm(mapCrop);
  const { cols, rows } = gridResolutionForQuality(
    widthMm,
    heightMm,
    options.meshQuality,
    options.meshQualityCustom,
  );
  return cols * rows;
}
