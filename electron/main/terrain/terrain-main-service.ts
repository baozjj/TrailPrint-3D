import type { AppConfig } from "@shared/types";
import type {
  TerrainCropRegion,
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
  minHeightFieldMm,
} from "@shared/utils/heightfield-mesh";
import { buildTrailLineMesh } from "./trail-line-mesh";
import { buildTrailGrooveSpec, buildTrailLinePolyline } from "./trail-pipeline";
import { applyGrooveToHeightField } from "./trail-groove";
import { applyTerrainSnapFitHoles } from "../assembly/apply-magnet-holes";
import { imprintGrooveOnTerrainMesh } from "@shared/utils/trail-groove-imprint";
import { hydrateGpxConfig } from "../gpx/hydrate-gpx-config";
import {
  trailLineDepthMmForPrint,
  trailLineWidthMmForPrint,
  trailHeightAboveMainMm,
} from "@shared/utils/footprint";
import { computeFlatGrooveFloorZMm } from "@shared/utils/trail-groove-floor";
import { ensureMapZoomFitsTrail } from "@shared/utils/trail-fit";
import {
  metersPerDegreeLat,
  metersPerDegreeLon,
} from "@shared/utils/map-projection";
import {
  demFetchTimeoutMs,
  gridResolutionForQuality,
  terrainMeshQualitySpec,
} from "@shared/utils/terrain-mesh-quality";
import type { TerrainMeshQuality } from "@shared/types/config";

/**
 * DEM 海拔 (m) → 模型 Z (mm)，原地写入 elevations，避免高精度下重复分配巨型数组。
 */
function elevationsToHeightMmInPlace(
  elevations: Float64Array,
  crop: TerrainCropRegion,
  zExaggeration: number,
  meshQuality: TerrainMeshQuality | undefined,
  meshQualityCustom: AppConfig["terrain"]["meshQualityCustom"],
): { baseM: number } {
  const zCapMm = terrainMeshQualitySpec(meshQuality, meshQualityCustom).zCapMm;
  let minM = Infinity;
  let maxZ = 0;
  for (let i = 0; i < elevations.length; i++) {
    const v = elevations[i]!;
    if (Number.isFinite(v) && v < minM) minM = v;
  }
  if (!Number.isFinite(minM)) minM = 0;
  const baseM = minM;

  const latMid = (crop.minLat + crop.maxLat) / 2;
  const geoW = Math.max(
    (crop.maxLon - crop.minLon) * metersPerDegreeLon(latMid),
    1,
  );
  const geoH = Math.max((crop.maxLat - crop.minLat) * metersPerDegreeLat(), 1);
  const horizMm = Math.max(crop.widthMm, crop.heightMm, 20);
  const mmPerMeter = horizMm / Math.max(geoW, geoH);

  for (let i = 0; i < elevations.length; i++) {
    const v = elevations[i]!;
    const relM = Number.isFinite(v) ? v - baseM : 0;
    const z = relM * mmPerMeter * zExaggeration;
    elevations[i] = z;
    if (z > maxZ) maxZ = z;
  }

  const scale = maxZ > zCapMm ? zCapMm / maxZ : 1;
  if (scale !== 1) {
    for (let i = 0; i < elevations.length; i++) {
      elevations[i] = elevations[i]! * scale;
    }
  }
  return { baseM };
}

const EMPTY_TERRAIN_MESH: TerrainMeshPayload = {
  positions: [],
  indices: [],
  minSurfaceZ: 0,
  bottomZ: 0,
  gridCols: 0,
  gridRows: 0,
};

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
  const meshQualityCustom = config.terrain.meshQualityCustom ?? {
    maxGrid: 512,
  };
  const { cols, rows } = gridResolutionForQuality(
    crop.widthMm,
    crop.heightMm,
    meshQuality,
    meshQualityCustom,
  );
  const qualitySpec = terrainMeshQualitySpec(meshQuality, meshQualityCustom);
  const buildExportMesh = Boolean(req.stlExport);
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
      fetchTimeoutMs: demFetchTimeoutMs(meshQuality, meshQualityCustom),
    },
  );

  fillDemHoles(dem.elevations, cols, rows);
  const smoothed = applyTerrainSmoothing(
    dem.elevations,
    cols,
    rows,
    config.terrain.smoothing,
  );

  elevationsToHeightMmInPlace(
    smoothed,
    crop,
    config.terrain.zExaggeration,
    meshQuality,
    meshQualityCustom,
  );
  const heightMm = smoothed;
  const surfaceForTrail = new Float64Array(heightMm);
  let flatFloorZ: number | null = null;
  let exportGroove: ReturnType<typeof buildTrailGrooveSpec> = undefined;

  if (buildExportMesh) {
    exportGroove = buildTrailGrooveSpec(
      config,
      crop,
      viewportWidth,
      viewportHeight,
    );
    if (exportGroove) {
      flatFloorZ = computeFlatGrooveFloorZMm({
        polylineMm: exportGroove.polylineMm,
        widthMm: exportGroove.widthMm,
        depthMm: exportGroove.depthMm,
        surfaceMm: surfaceForTrail,
        cols,
        rows,
        crop,
      });
      if (flatFloorZ != null) exportGroove.floorZMm = flatFloorZ;
      applyGrooveToHeightField(
        heightMm,
        cols,
        rows,
        crop,
        exportGroove,
        surfaceForTrail,
      );
    }
  }

  const minSurfaceZ = minHeightFieldMm(heightMm);
  const baseThicknessMm = config.terrain.baseSolidThicknessMm;

  let mesh: TerrainMeshPayload = buildExportMesh
    ? buildHeightfieldTerrainMesh(crop, heightMm, cols, rows, baseThicknessMm)
    : { ...EMPTY_TERRAIN_MESH, gridCols: cols, gridRows: rows };

  if (buildExportMesh) {
    mesh = imprintGrooveOnTerrainMesh(mesh, exportGroove);
    mesh = applyTerrainSnapFitHoles(mesh, config);
  }

  const heightPreview = heightPreviewFromField(
    heightMm,
    cols,
    rows,
    baseThicknessMm,
    buildExportMesh ? mesh.minSurfaceZ : minSurfaceZ,
  );

  const polylineMm = buildTrailLinePolyline(
    config,
    crop,
    viewportWidth,
    viewportHeight,
  );
  const trailPolylineMm = exportGroove?.polylineMm ?? polylineMm;
  const printWidth = req.trailLineWidthMm ?? trailLineWidthMmForPrint(config);
  let trailMesh: TerrainMeshPayload | null = null;
  if (buildExportMesh && trailPolylineMm.length >= 2) {
    trailMesh = buildTrailLineMesh({
      polylineMm: trailPolylineMm,
      widthMm: printWidth,
      depthMm: trailLineDepthMmForPrint(config),
      heightMm: surfaceForTrail,
      cols,
      rows,
      crop,
      flatFloorZMm: flatFloorZ ?? undefined,
      zTopOffsetMm: trailHeightAboveMainMm(config),
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
