import type { AppConfig } from "@shared/types";
import type {
  TerrainGenerateRequest,
  TerrainGenerateResponse,
  TerrainMeshPayload,
} from "@shared/types/terrain";
import { computeTerrainCropRegion } from "@shared/utils/crop-region";
import { IpcException } from "@shared/ipc/types";
import { sampleDemGrid } from "./dem-provider";
import { applyTerrainSmoothing } from "./smoothing";
import {
  buildHeightfieldTerrainMesh,
  heightPreviewFromField,
} from "@shared/utils/heightfield-mesh";
import { applyGrooveToHeightField } from "./trail-groove";
import { buildTrailLineMesh } from "./trail-line-mesh";
import {
  buildTrailGrooveSpec,
  buildTrailLinePolyline,
} from "./trail-pipeline";
import { applyTerrainSnapFitHoles } from "../assembly/apply-magnet-holes";
import { hydrateGpxConfig } from "../gpx/hydrate-gpx-config";
import { trailLineWidthMmForPrint } from "@shared/utils/footprint";
import { ensureMapZoomFitsTrail } from "@shared/utils/trail-fit";

/** 高度场网格分辨率（OpenTopography 单次 GeoTIFF + 本地采样，可保持较高精度） */
const GRID_MAX = 120;
const GRID_MIN = 64;

function gridResolution(cropWidthMm: number, cropHeightMm: number): {
  cols: number;
  rows: number;
} {
  const span = Math.max(cropWidthMm, cropHeightMm, 20);
  const step = Math.max(1.0, span / GRID_MAX);
  const cols = Math.min(
    GRID_MAX,
    Math.max(GRID_MIN, Math.round(cropWidthMm / step)),
  );
  const rows = Math.min(
    GRID_MAX,
    Math.max(GRID_MIN, Math.round(cropHeightMm / step)),
  );
  return { cols, rows };
}

/**
 * DEM 海拔 (m) → 模型表面高度 (mm)。
 * 按相对高差归一化到固定起伏幅度，避免「真实海拔×1000」在 80mm 圆盘上拉出针状体。
 */
function heightsToMm(
  dem: Float64Array,
  zExaggeration: number,
): { heights: Float64Array; baseM: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < dem.length; i++) {
    const v = dem[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) min = 0;
  const baseM = min;
  const spanM = Math.max(max - min, 0.001);
  /** 白框内目标最大起伏 (mm)，再乘侧栏 Z 夸张系数 */
  const maxReliefMm = 26;
  const out = new Float64Array(dem.length);
  for (let i = 0; i < dem.length; i++) {
    const rel = (dem[i]! - baseM) / spanM;
    out[i] = rel * maxReliefMm * zExaggeration;
  }
  return { heights: out, baseM };
}

export async function generateTerrainMain(
  req: TerrainGenerateRequest,
): Promise<TerrainGenerateResponse> {
  const started = Date.now();
  let { config, viewportWidth, viewportHeight } = req;
  config = await hydrateGpxConfig(config);
  config = ensureMapZoomFitsTrail(config, viewportWidth, viewportHeight);

  if (viewportWidth < 8 || viewportHeight < 8) {
    throw new IpcException(
      "INVALID_VIEWPORT",
      "视窗尺寸过小，无法计算裁剪范围",
    );
  }

  const crop = computeTerrainCropRegion(
    config.mapCrop,
    viewportWidth,
    viewportHeight,
  );

  const { cols, rows } = gridResolution(crop.widthMm, crop.heightMm);
  const dem = await sampleDemGrid(
    crop,
    cols,
    rows,
    config.mapCrop,
    viewportWidth,
    viewportHeight,
    {
      dataset: config.terrain.demDataset,
      openTopographyApiKey: config.terrain.openTopographyApiKey,
    },
  );

  const smoothed = applyTerrainSmoothing(
    dem.elevations,
    cols,
    rows,
    config.terrain.smoothing,
  );

  const { heights: heightMm } = heightsToMm(
    smoothed,
    config.terrain.zExaggeration,
  );

  const surfaceForTrail = new Float64Array(heightMm);
  const groove =
    req.trailGroove ??
    buildTrailGrooveSpec(config, crop, viewportWidth, viewportHeight);

  applyGrooveToHeightField(heightMm, cols, rows, crop, groove);

  let mesh: TerrainMeshPayload = buildHeightfieldTerrainMesh(
    crop,
    heightMm,
    cols,
    rows,
    config.terrain.baseSolidThicknessMm,
  );
  mesh = applyTerrainSnapFitHoles(mesh, config);

  const heightPreview = heightPreviewFromField(
    heightMm,
    cols,
    rows,
    config.terrain.baseSolidThicknessMm,
    mesh.minSurfaceZ,
  );

  const polylineMm = buildTrailLinePolyline(
    config,
    crop,
    viewportWidth,
    viewportHeight,
  );
  const printWidth = req.trailLineWidthMm ?? trailLineWidthMmForPrint(config);
  let trailMesh: TerrainMeshPayload | null = null;
  if (polylineMm.length >= 2) {
    trailMesh = buildTrailLineMesh({
      polylineMm,
      widthMm: printWidth,
      depthMm: config.trail.trailDepthMm,
      heightMm: surfaceForTrail,
      cols,
      rows,
      crop,
    });
  }

  return {
    crop,
    mesh,
    heightPreview,
    trailMesh,
    trailPolylineMm: polylineMm,
    trailDisplayWidthMm: config.trail.trailWidthMm,
    demSource: dem.source,
    generationMs: Date.now() - started,
  };
}
