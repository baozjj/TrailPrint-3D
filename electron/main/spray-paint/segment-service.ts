import type { AppConfig } from "@shared/types/config";
import type {
  SprayPaintPlan,
  SpraySegmentProgress,
  SpraySegmentRequest,
  SpraySegmentResponse,
} from "@shared/types/spray-paint";
import type { TerrainHeightPreview } from "@shared/types/terrain";
import { hydrateGpxConfig } from "../gpx/hydrate-gpx-config";
import {
  classifyCategory,
  classifyCategoryTerrainOnly,
} from "./category-mapper";
import { categoryToRegion, cloneDefaultColors } from "./default-colors";
import { postprocessRegions } from "./region-postprocess";
import { fetchGridSatelliteRgb } from "./satellite-crop";

export type SprayProgressCallback = (progress: SpraySegmentProgress) => void;

function computeElevationNorm(
  heights: ArrayLike<number>,
  cols: number,
  rows: number,
): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const v = heights[i]!;
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const span = Math.max(max - min, 1e-6);
  const out = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const v = heights[row * cols + col] ?? min;
      out[row * cols + col] = (v - min) / span;
    }
  }
  return out;
}

function computeSlopeNorm(
  heights: ArrayLike<number>,
  cols: number,
  rows: number,
  cropWidthMm: number,
  cropHeightMm: number,
): Float32Array {
  const cellDx = cropWidthMm / Math.max(cols - 1, 1);
  const cellDy = cropHeightMm / Math.max(rows - 1, 1);
  const slopes = new Float32Array(cols * rows);
  let maxSlope = 1e-6;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const z = heights[row * cols + col] ?? 0;
      const zLeft = col > 0 ? (heights[row * cols + col - 1] ?? z) : z;
      const zRight =
        col < cols - 1 ? (heights[row * cols + col + 1] ?? z) : z;
      const zUp = row > 0 ? (heights[(row - 1) * cols + col] ?? z) : z;
      const zDown =
        row < rows - 1 ? (heights[(row + 1) * cols + col] ?? z) : z;
      const dzdx = (zRight - zLeft) / (2 * cellDx);
      const dzdy = (zDown - zUp) / (2 * cellDy);
      const slope = Math.hypot(dzdx, dzdy);
      slopes[row * cols + col] = slope;
      maxSlope = Math.max(maxSlope, slope);
    }
  }

  for (let i = 0; i < slopes.length; i++) {
    slopes[i] = slopes[i]! / maxSlope;
  }
  return slopes;
}

function segmentCellsWithCrop(
  config: AppConfig,
  preview: TerrainHeightPreview,
  cropWidthMm: number,
  cropHeightMm: number,
  rgbSamples: Array<{ r: number; g: number; b: number }> | null,
): Uint8Array {
  const cols = preview.cols;
  const rows = preview.rows;
  const heights = preview.heights;
  const elevationNorm = computeElevationNorm(heights, cols, rows);
  const slopeNorm = computeSlopeNorm(
    heights,
    cols,
    rows,
    cropWidthMm,
    cropHeightMm,
  );

  const regions = new Uint8Array(cols * rows);
  const hasSatellite = rgbSamples != null;

  for (let i = 0; i < regions.length; i++) {
    const elev = elevationNorm[i]!;
    const slope = slopeNorm[i]!;
    let categoryId: number;

    if (hasSatellite) {
      const rgb = rgbSamples[i]!;
      categoryId = classifyCategory({
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        elevationNorm: elev,
        slopeNorm: slope,
        hasSatellite: true,
      });
    } else {
      categoryId = classifyCategoryTerrainOnly(elev, slope);
    }

    regions[i] = categoryToRegion(
      categoryId,
      config.sprayPaint.colorCount,
    );
  }

  postprocessRegions(regions, cols, rows);
  return regions;
}

export async function segmentSprayPaint(
  req: SpraySegmentRequest,
  onProgress?: SprayProgressCallback,
): Promise<SpraySegmentResponse> {
  const report = (
    phase: SpraySegmentProgress["phase"],
    progress: number,
    message: string,
  ) => {
    onProgress?.({ phase, progress, message });
  };

  report("satellite", 0.05, "正在准备分色参数…");
  let config = await hydrateGpxConfig(req.config);
  if (!config.sprayPaint) {
    config = {
      ...config,
      sprayPaint: {
        enabled: true,
        colorCount: 4,
        categoryRuleVersion: 1,
        maskShellThicknessMm: 1.0,
        maskFitToleranceMm: 0.2,
        bleedMarginMm: 0.5,
      },
    };
  }

  const preview = req.heightPreview;
  const cols = preview.cols;
  const rows = preview.rows;
  if (preview.heights.length < cols * rows) {
    throw new Error("高度场数据不完整，无法分色");
  }

  let rgbSamples: Array<{ r: number; g: number; b: number }> | null = null;
  let satelliteUsed = false;
  let warning: string | undefined;

  report("satellite", 0.15, "正在获取卫星影像…");
  try {
    rgbSamples = await fetchGridSatelliteRgb(
      req.crop,
      cols,
      rows,
      config.mapCrop,
      req.viewportWidth,
      req.viewportHeight,
    );
    satelliteUsed = true;
    report("satellite", 0.55, "卫星影像已就绪");
  } catch {
    warning = "卫星图不可用，已使用地形规则分色";
    report("satellite", 0.55, warning);
  }

  report("segment", 0.65, "正在映射地表种类…");
  const cellRegions = segmentCellsWithCrop(
    config,
    preview,
    req.crop.widthMm,
    req.crop.heightMm,
    rgbSamples,
  );

  report("smooth", 0.9, "正在平滑分区…");

  const plan: SprayPaintPlan = {
    colors: cloneDefaultColors(config.sprayPaint.colorCount),
    cellRegions: Array.from(cellRegions),
    gridCols: cols,
    gridRows: rows,
    source: "rules",
    generatedAt: Date.now(),
    satelliteUsed,
    warning,
  };

  report("done", 1, "分色完成");
  return { plan };
}
