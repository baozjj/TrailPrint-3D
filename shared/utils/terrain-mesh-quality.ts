/** 地形 / STL 网格精度档位 */
export type TerrainMeshQuality = "standard" | "high" | "ultra";

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
    texturePx: 2048,
    trailStepDivisor: 8,
    trailMinStepMm: 0.18,
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
