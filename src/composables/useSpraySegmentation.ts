import { ref, markRaw } from "vue";
import type {
  SprayGenerateMasksResponse,
  SprayMaskMeshPayload,
  SprayPaintPlan,
  SpraySegmentProgress,
} from "@shared/types/spray-paint";
import type { TerrainCropRegion, TerrainGenerateResponse } from "@shared/types/terrain";
import type { AppConfig } from "@shared/types/config";
import {
  buildDefaultColorSlots,
  clampColorCount,
  defaultHexForRegion,
  SPRAY_COLOR_COUNT_MAX,
  SPRAY_COLOR_COUNT_MIN,
} from "@shared/utils/spray-palette";
import { paintBrushInPlace, paintStrokeInPlace } from "@/utils/spray-vertex-colors";
import {
  serializeCrop,
  serializeHeightPreview,
  serializeSprayPlan,
} from "@/utils/ipc-serialize";

const plan = ref<SprayPaintPlan | null>(null);
const masks = ref<SprayMaskMeshPayload[]>([]);
const maskWarnings = ref<string[]>([]);
const segmenting = ref(false);
const generatingMasks = ref(false);
const progress = ref<SpraySegmentProgress | null>(null);
const error = ref<string | null>(null);
const maskError = ref<string | null>(null);
const paintMode = ref(false);
const paintRegionId = ref<number | null>(null);
const paintBrushRadius = ref(2);
let lastPaintMm: { x: number; y: number } | null = null;

export function useSpraySegmentation() {
  let offProgress: (() => void) | null = null;

  function clearProgressListener(): void {
    offProgress?.();
    offProgress = null;
  }

  function attachProgressListener(): void {
    clearProgressListener();
    offProgress = window.trailPrint.onSprayProgress((p) => {
      progress.value = p;
    });
  }

  function clearMasksAfterEdit(): void {
    masks.value = [];
    maskWarnings.value = [];
    maskError.value = null;
  }

  function endPaintStroke(): void {
    if (lastPaintMm && plan.value) {
      plan.value.source = "manual";
      clearMasksAfterEdit();
    }
    lastPaintMm = null;
  }

  function initManualPaintPlan(
    config: AppConfig,
    result: TerrainGenerateResponse,
  ): boolean {
    const preview = result.heightPreview;
    if (!preview || !result.crop) return false;
    const cols = preview.cols;
    const rows = preview.rows;
    const n = clampColorCount(config.sprayPaint.colorCount);
    plan.value = {
      colors: buildDefaultColorSlots(n),
      cellRegions: new Array(cols * rows).fill(0),
      gridCols: cols,
      gridRows: rows,
      source: "manual",
      generatedAt: Date.now(),
      satelliteUsed: false,
    };
    clearMasksAfterEdit();
    error.value = null;
    return true;
  }

  /** 进入手涂：无 plan 时先初始化空白格网分色 */
  function startManualPaint(
    config: AppConfig,
    result: TerrainGenerateResponse,
    regionId = 0,
  ): boolean {
    config.sprayPaint.enabled = true;
    if (!plan.value && !initManualPaintPlan(config, result)) {
      error.value = "地形数据未就绪，无法手涂";
      return false;
    }
    paintMode.value = true;
    paintRegionId.value = regionId;
    return true;
  }

  async function runSegmentation(
    config: AppConfig,
    result: TerrainGenerateResponse,
    viewportWidth: number,
    viewportHeight: number,
  ): Promise<SprayPaintPlan | null> {
    if (!result.heightPreview || !result.crop) {
      error.value = "地形数据未就绪";
      return null;
    }

    segmenting.value = true;
    error.value = null;
    maskError.value = null;
    progress.value = { phase: "satellite", progress: 0, message: "正在分色…" };
    attachProgressListener();

    try {
      const res = await window.trailPrint.segmentSprayPaint({
        config,
        heightPreview: serializeHeightPreview(result.heightPreview),
        crop: serializeCrop(result.crop),
        viewportWidth,
        viewportHeight,
      });
      plan.value = res.plan;
      clearMasksAfterEdit();
      endPaintStroke();
      return res.plan;
    } catch (err) {
      error.value =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "分色失败，请重试";
      return null;
    } finally {
      segmenting.value = false;
      clearProgressListener();
    }
  }

  async function runMaskGeneration(
    config: AppConfig,
    result: TerrainGenerateResponse,
  ): Promise<SprayGenerateMasksResponse | null> {
    if (!plan.value || !result.heightPreview || !result.crop) {
      maskError.value = "请先规则分色或手涂分色";
      return null;
    }

    generatingMasks.value = true;
    maskError.value = null;
    progress.value = { phase: "masks", progress: 0, message: "正在生成遮挡罩…" };
    attachProgressListener();

    try {
      const res = await window.trailPrint.generateSprayMasks({
        config,
        plan: serializeSprayPlan(plan.value),
        heightPreview: serializeHeightPreview(result.heightPreview),
        crop: serializeCrop(result.crop),
      });
      masks.value = res.masks.map((mask) => markRaw(mask));
      maskWarnings.value = res.warnings;
      return res;
    } catch (err) {
      maskError.value =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "遮挡罩生成失败，请重试";
      return null;
    } finally {
      generatingMasks.value = false;
      clearProgressListener();
    }
  }

  function updateColorHex(regionId: number, hex: string): void {
    if (!plan.value) return;
    plan.value = {
      ...plan.value,
      colors: plan.value.colors.map((c) =>
        c.regionId === regionId ? { ...c, hex } : c,
      ),
      source: "manual",
    };
    clearMasksAfterEdit();
  }

  function selectPaintBrush(regionId: number): void {
    if (!plan.value) return;
    paintRegionId.value = regionId;
    if (!paintMode.value) paintMode.value = true;
  }

  function setPaintMode(enabled: boolean): void {
    paintMode.value = enabled;
    if (!enabled) {
      paintRegionId.value = null;
      endPaintStroke();
    }
  }

  function paintAtMm(
    crop: TerrainCropRegion,
    xMm: number,
    yMm: number,
    regionId: number,
  ): Set<number> {
    const changed = new Set<number>();
    if (!plan.value) return changed;
    const { gridCols: cols, gridRows: rows, cellRegions } = plan.value;
    const r = paintBrushRadius.value;
    if (lastPaintMm) {
      paintStrokeInPlace(
        cellRegions,
        cols,
        rows,
        crop,
        lastPaintMm.x,
        lastPaintMm.y,
        xMm,
        yMm,
        regionId,
        r,
        changed,
      );
    } else {
      paintBrushInPlace(
        cellRegions,
        cols,
        rows,
        crop,
        xMm,
        yMm,
        regionId,
        r,
        changed,
      );
    }
    lastPaintMm = { x: xMm, y: yMm };
    return changed;
  }

  function syncPlanColorCount(colorCount: number): void {
    const n = clampColorCount(colorCount);
    if (!plan.value) return;
    const colors = plan.value.colors.slice(0, n);
    while (colors.length < n) {
      const regionId = colors.length;
      colors.push({
        index: regionId + 1,
        regionId,
        hex: defaultHexForRegion(regionId, n),
        label: String(regionId + 1).padStart(2, "0"),
      });
    }
    const remapped = plan.value.cellRegions.map((r) => Math.min(r, n - 1));
    plan.value = {
      ...plan.value,
      colors: colors.map((c, i) => ({ ...c, index: i + 1 })),
      cellRegions: remapped,
      source: "manual",
    };
    clearMasksAfterEdit();
  }

  function addColorSlot(config: AppConfig): boolean {
    const next = clampColorCount(config.sprayPaint.colorCount + 1);
    if (next === config.sprayPaint.colorCount) return false;
    config.sprayPaint.colorCount = next;
    if (plan.value) syncPlanColorCount(next);
    return true;
  }

  function removeColorSlot(config: AppConfig): boolean {
    const next = clampColorCount(config.sprayPaint.colorCount - 1);
    if (next === config.sprayPaint.colorCount) return false;
    config.sprayPaint.colorCount = next;
    if (plan.value) syncPlanColorCount(next);
    if (paintRegionId.value != null && paintRegionId.value >= next) {
      paintRegionId.value = next - 1;
    }
    return true;
  }

  function resetPlan(): void {
    plan.value = null;
    masks.value = [];
    maskWarnings.value = [];
    error.value = null;
    maskError.value = null;
    progress.value = null;
    paintMode.value = false;
    paintRegionId.value = null;
    endPaintStroke();
  }

  return {
    plan,
    masks,
    maskWarnings,
    segmenting,
    generatingMasks,
    progress,
    error,
    maskError,
    paintMode,
    paintRegionId,
    paintBrushRadius,
    runSegmentation,
    runMaskGeneration,
    initManualPaintPlan,
    startManualPaint,
    updateColorHex,
    selectPaintBrush,
    setPaintMode,
    paintAtMm,
    endPaintStroke,
    addColorSlot,
    removeColorSlot,
    syncPlanColorCount,
    resetPlan,
    SPRAY_COLOR_COUNT_MIN,
    SPRAY_COLOR_COUNT_MAX,
  };
}
