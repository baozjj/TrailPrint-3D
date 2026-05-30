import type { AppConfig } from "@shared/types";
import type {
  TerrainGenerateRequest,
  TerrainGenerateResponse,
  TerrainMeshPayload,
} from "@shared/types/terrain";
import { computeTerrainCropRegion } from "@shared/utils/crop-region";
import { IpcException } from "@shared/ipc/types";
import { sampleDemGrid } from "./dem-provider";
import { applyTerrainSmoothing, fillDemHoles } from "./smoothing";
import {
  buildHeightfieldTerrainMesh,
  heightPreviewFromField,
} from "@shared/utils/heightfield-mesh";
import { buildTrailLineMesh } from "./trail-line-mesh";
import { buildTrailLinePolyline } from "./trail-pipeline";
import { hydrateGpxConfig } from "../gpx/hydrate-gpx-config";
import { trailLineWidthMmForPrint } from "@shared/utils/footprint";
import { ensureMapZoomFitsTrail } from "@shared/utils/trail-fit";
import {
  metersPerDegreeLat,
  metersPerDegreeLon,
} from "@shared/utils/map-projection";
import {
  gridResolutionForQuality,
  STUDIO_DEM_FETCH_TIMEOUT_MS,
  terrainMeshQualitySpec,
} from "@shared/utils/terrain-mesh-quality";
import type { TerrainMeshQuality } from "@shared/types/config";

/**
 * DEM 海拔 (m) → 模型 Z (mm)。
 * 按打印区域水平跨度与地理跨度比例换算垂直高度（与 2D 地图比例一致），再乘 Z 夸张系数。
 */
function heightsToMm(
  dem: Float64Array,
  crop: TerrainCropRegion,
  zExaggeration: number,
  meshQuality: TerrainMeshQuality | undefined,
): { heights: Float64Array; baseM: number } {
  const zCapMm = terrainMeshQualitySpec(meshQuality).zCapMm;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < dem.length; i++) {
    const v = dem[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) min = 0;
  const baseM = min;

  const latMid = (crop.minLat + crop.maxLat) / 2;
  const geoW = Math.max(
    (crop.maxLon - crop.minLon) * metersPerDegreeLon(latMid),
    1,
  );
  const geoH = Math.max((crop.maxLat - crop.minLat) * metersPerDegreeLat(), 1);
  const horizMm = Math.max(crop.widthMm, crop.heightMm, 20);
  /** 模型 1mm 水平 ≈ 多少米地理距离；垂直同比例 ×1000 换算为 mm */
  const mmPerMeter = horizMm / Math.max(geoW, geoH);

  const raw = new Float64Array(dem.length);
  let maxZ = 0;
  for (let i = 0; i < dem.length; i++) {
    const v = dem[i]!;
    const relM = Number.isFinite(v) ? v - baseM : 0;
    const z = relM * mmPerMeter * zExaggeration;
    raw[i] = z;
    if (z > maxZ) maxZ = z;
  }

  const scale = maxZ > zCapMm ? zCapMm / maxZ : 1;
  const out = new Float64Array(dem.length);
  for (let i = 0; i < dem.length; i++) {
    out[i] = raw[i]! * scale;
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

  const meshQuality = config.terrain.meshQuality ?? "high";
  const { cols, rows } = gridResolutionForQuality(
    crop.widthMm,
    crop.heightMm,
    meshQuality,
  );
  const qualitySpec = terrainMeshQualitySpec(meshQuality);
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
      fetchTimeoutMs:
        meshQuality === "studio" ? STUDIO_DEM_FETCH_TIMEOUT_MS : undefined,
    },
  );

  fillDemHoles(dem.elevations, cols, rows);
  const smoothed = applyTerrainSmoothing(
    dem.elevations,
    cols,
    rows,
    config.terrain.smoothing,
  );

  const { heights: heightMm } = heightsToMm(
    smoothed,
    crop,
    config.terrain.zExaggeration,
    meshQuality,
  );

  const surfaceForTrail = new Float64Array(heightMm);

  const mesh: TerrainMeshPayload = buildHeightfieldTerrainMesh(
    crop,
    heightMm,
    cols,
    rows,
    config.terrain.baseSolidThicknessMm,
  );

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
      sampleStepMm: Math.max(
        qualitySpec.trailMinStepMm,
        printWidth / qualitySpec.trailStepDivisor,
      ),
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
