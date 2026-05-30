import type { MapCropConfig, TerrainMeshQuality } from "../types/config";

export type { TerrainMeshQuality };

/** 制版档 DEM 下载超时 (ms) */
export const STUDIO_DEM_FETCH_TIMEOUT_MS = 300_000;

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

const SPECS: Record<TerrainMeshQuality, TerrainMeshQualitySpec> = {
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
  /** 约百万级 DEM 采样，适合大尺寸 FDM 细模；生成/导出耗时长、内存占用高 */
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

export function terrainMeshQualitySpec(
  quality: TerrainMeshQuality | undefined,
): TerrainMeshQualitySpec {
  return SPECS[quality ?? "high"];
}

export function gridResolutionForQuality(
  cropWidthMm: number,
  cropHeightMm: number,
  quality: TerrainMeshQuality | undefined,
): { cols: number; rows: number } {
  const spec = terrainMeshQualitySpec(quality);
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
  quality: TerrainMeshQuality | undefined,
): string {
  const spec = terrainMeshQualitySpec(quality);
  const { widthMm, heightMm } = estimatePrintFootprintMm(mapCrop);
  const { cols, rows } = gridResolutionForQuality(widthMm, heightMm, quality);
  return `DEM ${cols}×${rows}（上限 ${spec.maxGrid}），卫星贴图 ${spec.texturePx}px，预览与导出一致`;
}

/** 3D 预览红色轨迹圆管分段数 */
export function trailPreviewTubeSegments(
  pointCount: number,
  quality: TerrainMeshQuality | undefined,
): number {
  const spec = terrainMeshQualitySpec(quality);
  const q = quality ?? "high";
  const perPoint =
    q === "studio"
      ? 14
      : q === "extreme"
        ? 10
        : q === "ultra"
          ? 8
          : q === "high"
            ? 5
            : 3;
  return Math.max(48, Math.min(spec.maxGrid, pointCount * perPoint));
}

/** 该档位 DEM 采样点数量（用于 UI 性能提示） */
export function demSampleCount(
  mapCrop: MapCropConfig,
  quality: TerrainMeshQuality | undefined,
): number {
  const { widthMm, heightMm } = estimatePrintFootprintMm(mapCrop);
  const { cols, rows } = gridResolutionForQuality(widthMm, heightMm, quality);
  return cols * rows;
}
