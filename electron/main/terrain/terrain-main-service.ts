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
import { buildTerrainMainMesh } from "./mesh-builder";
import { applyTrailGrooveCut } from "./trail-groove";

const GRID_MAX = 72;
const GRID_MIN = 24;

function gridResolution(cropWidthMm: number, cropHeightMm: number): {
  cols: number;
  rows: number;
} {
  const span = Math.max(cropWidthMm, cropHeightMm, 20);
  const step = Math.max(1.5, span / GRID_MAX);
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
  const spanM = Math.max(max - min, 1);
  const out = new Float64Array(dem.length);
  for (let i = 0; i < dem.length; i++) {
    const rel = (dem[i]! - baseM) / spanM;
    out[i] = rel * spanM * zExaggeration * 1000;
  }
  return { heights: out, baseM };
}

export async function generateTerrainMain(
  req: TerrainGenerateRequest,
): Promise<TerrainGenerateResponse> {
  const started = Date.now();
  const { config, viewportWidth, viewportHeight, trailGroove } = req;

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
  const dem = await sampleDemGrid(crop, cols, rows);

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

  let mesh: TerrainMeshPayload = buildTerrainMainMesh({
    crop,
    heightMm,
    cols,
    rows,
    baseThicknessMm: config.terrain.baseSolidThicknessMm,
  });

  mesh = applyTrailGrooveCut(mesh, trailGroove);

  return {
    crop,
    mesh,
    demSource: dem.source,
    generationMs: Date.now() - started,
  };
}
