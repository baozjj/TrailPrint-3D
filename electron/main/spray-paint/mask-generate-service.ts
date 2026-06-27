import type { AppConfig } from "@shared/types/config";
import type {
  SprayGenerateMasksRequest,
  SprayGenerateMasksResponse,
  SprayMaskMeshPayload,
  SpraySegmentProgress,
} from "@shared/types/spray-paint";
import { weldMeshVertices } from "@shared/utils/mesh-manifold";
import { hydrateGpxConfig } from "../gpx/hydrate-gpx-config";
import {
  buildMaskShellForRegion,
  computeSteepBoundaryWarning,
} from "./mask-shell-builder";
import { validateMaskMesh } from "./mask-mesh-validation";

export type MaskProgressCallback = (progress: SpraySegmentProgress) => void;

function maskFileName(colorIndex: number): string {
  return `Mask_Color_${String(colorIndex).padStart(2, "0")}.stl`;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export async function generateSprayMasks(
  req: SprayGenerateMasksRequest,
  onProgress?: MaskProgressCallback,
): Promise<SprayGenerateMasksResponse> {
  const report = (
    progress: number,
    message: string,
  ) => {
    onProgress?.({ phase: "masks", progress, message });
  };

  report(0.05, "正在准备遮挡罩参数…");
  let config = await hydrateGpxConfig(req.config);
  if (!config.sprayPaint) {
    throw new Error("缺少喷漆分色配置");
  }

  const { plan, heightPreview, crop } = req;
  const cols = plan.gridCols;
  const rows = plan.gridRows;
  if (plan.cellRegions.length < cols * rows) {
    throw new Error("分区数据不完整，无法生成遮挡罩");
  }

  const heights = heightPreview.heights;
  const params = {
    maskFitToleranceMm: config.sprayPaint.maskFitToleranceMm,
    maskShellThicknessMm: config.sprayPaint.maskShellThicknessMm,
    bleedMarginMm: config.sprayPaint.bleedMarginMm,
    bottomZ: heightPreview.bottomZ,
  };

  const warnings: string[] = [];
  if (computeSteepBoundaryWarning(crop, heights, cols, rows, plan.cellRegions)) {
    warnings.push("部分陡崖边界可能溢色，可调大 maskFitToleranceMm");
  }

  const masks: SprayMaskMeshPayload[] = [];
  const colorCount = Math.min(
    config.sprayPaint.colorCount,
    plan.colors.length,
  );

  for (let i = 0; i < colorCount; i++) {
    const slot = plan.colors[i]!;
    report(
      0.1 + (0.85 * i) / colorCount,
      `正在生成 ${maskFileName(slot.index)}…`,
    );
    await yieldToEventLoop();

    let mesh = buildMaskShellForRegion(
      crop,
      heights,
      cols,
      rows,
      plan.cellRegions,
      slot.regionId,
      params,
    );

    if (mesh.indices.length >= 3) {
      await yieldToEventLoop();
      mesh = weldMeshVertices(mesh, 0.03);
      await yieldToEventLoop();
      warnings.push(...validateMaskMesh(mesh, maskFileName(slot.index)));
    }

    masks.push({
      ...mesh,
      colorIndex: slot.index,
      regionId: slot.regionId,
      fileName: maskFileName(slot.index),
    });
    await yieldToEventLoop();
  }

  report(1, "遮挡罩生成完成");
  return { masks, warnings };
}
