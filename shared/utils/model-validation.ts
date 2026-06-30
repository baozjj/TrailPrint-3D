import type { AppConfig } from "../types/config";
import type { TrayValidationResult } from "../types/tray";
import { computeTerrainCropRegion } from "./crop-region";
import { computeTrayBottomMagnetHoles } from "./magnet-hole-layout";
import { magnetCutDimensionsMm } from "./magnet-hole-geometry";
import { computeTrayFootprint, type Vec2 } from "./tray-footprint";
import {
  computeTrayNfcCavityPolygon,
  computeTrayNfcLedPockets,
} from "./tray-nfc-layout";
import { projectTrailToModelMm } from "./trail-coords";
import { resolveTrailPoints } from "./trail-resolve";
import { validateTrayFromAppConfig } from "./tray-validation";

const MIN_BOTTOM_FLOOR_MM = 0.3;
const MIN_MAGNET_WALL_MM = 0.8;
const MIN_VIEWPORT_PX = 64;

export type ModelValidationScope =
  | "gpx"
  | "viewport"
  | "tray"
  | "trail"
  | "magnet"
  | "nfc";

export interface ModelValidationResult extends TrayValidationResult {
  scope?: ModelValidationScope;
}

export interface ModelValidationOptions {
  viewportWidth?: number;
  viewportHeight?: number;
  /** 未导入 GPX 时是否视为错误（侧栏托盘区可设为 false） */
  requireGpx?: boolean;
}

function fail(
  scope: ModelValidationScope,
  message: string,
): ModelValidationResult {
  return { valid: false, message, scope };
}

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function minDistanceToPolygonBoundary(
  px: number,
  py: number,
  verts: ReadonlyArray<Vec2>,
): number {
  if (verts.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    min = Math.min(
      min,
      distancePointToSegment(px, py, a.x, a.y, b.x, b.y),
    );
  }
  return min;
}

/** 轨迹是否投影进打印区（与导出 STL 轨迹一致） */
export function validateTrailInPrintArea(
  config: AppConfig,
  viewportWidth: number,
  viewportHeight: number,
): ModelValidationResult {
  const points = resolveTrailPoints(config);
  if (points.length < 2) {
    return fail("gpx", "轨迹点数不足，无法生成模型");
  }

  const crop = computeTerrainCropRegion(
    config.mapCrop,
    viewportWidth,
    viewportHeight,
  );
  const polyline = projectTrailToModelMm(points, crop, {
    mapCrop: config.mapCrop,
    viewportWidth,
    viewportHeight,
  });

  if (polyline.length < 2) {
    return fail(
      "trail",
      "轨迹未进入打印区域。请在 2D 地图中将红色轨迹拖入中心白框内，或调整地图缩放/位置后重试",
    );
  }

  return { valid: true };
}

/** 磁铁孔深与托盘底面、外缘余量 */
export function validateMagnetAssembly(
  config: AppConfig,
): ModelValidationResult {
  if (!config.assembly.magnet.enabled) {
    return { valid: true };
  }

  const magnet = config.assembly.magnet;
  if (magnet.diameterMm <= 0) {
    return fail("magnet", "磁铁直径必须大于 0");
  }
  if (magnet.thicknessMm <= 0) {
    return fail("magnet", "磁铁厚度必须大于 0");
  }

  const bottomSolidMm =
    config.tray.totalThicknessMm - config.tray.recessDepthMm;
  const cut = magnetCutDimensionsMm(magnet);
  const maxDepth = bottomSolidMm - MIN_BOTTOM_FLOOR_MM;
  if (cut.depthMm > maxDepth) {
    return fail(
      "magnet",
      `磁铁孔深（含公差 ${cut.depthMm.toFixed(1)} mm）超过托盘底面可用厚度（${maxDepth.toFixed(1)} mm），请减小磁铁厚度/公差或增大托盘总厚度`,
    );
  }

  const footprint = computeTrayFootprint(config);
  const holes = computeTrayBottomMagnetHoles(config, footprint);
  for (const hole of holes) {
    const wall = minDistanceToPolygonBoundary(
      hole.x,
      hole.y,
      footprint.outer,
    );
    if (wall < cut.radiusMm + MIN_MAGNET_WALL_MM) {
      return fail(
        "magnet",
        "磁铁直径过大或托盘边框过窄，磁铁孔距外缘过近。请减小磁铁直径、缩小边框宽度或增大打印尺寸",
      );
    }
  }

  return { valid: true };
}

/** NFC 几何布局（腔体、LED 位） */
export function validateTrayNfcLayout(
  config: AppConfig,
  viewportWidth: number,
  viewportHeight: number,
): ModelValidationResult {
  if (!config.tray.nfc.enabled) {
    return { valid: true };
  }

  const footprint = computeTrayFootprint(config);
  const cavity = computeTrayNfcCavityPolygon(
    config,
    footprint,
    config.tray.nfc.wallClearanceMm,
  );
  if (!cavity) {
    return fail(
      "nfc",
      "NFC 容纳腔过小，请减小「距打印内壁」或增大打印尺寸",
    );
  }

  const trailCheck = validateTrailInPrintArea(
    config,
    viewportWidth,
    viewportHeight,
  );
  if (!trailCheck.valid) {
    return { ...trailCheck, scope: "nfc" };
  }

  const ledPockets = computeTrayNfcLedPockets(
    config,
    viewportWidth,
    viewportHeight,
  );
  if (ledPockets.length === 0) {
    return fail(
      "nfc",
      "无法定位 LED 安装位。请确保轨迹进入打印区域（白框内）后再启用 NFC",
    );
  }

  return { valid: true };
}

/**
 * 预览 / 导出前的统一参数冲突校验。
 * 传入地图预览视口尺寸时，会额外检查轨迹投影与 NFC LED 位。
 */
export function validateModelGeneration(
  config: AppConfig,
  options: ModelValidationOptions = {},
): ModelValidationResult {
  const requireGpx = options.requireGpx ?? true;

  if (requireGpx && !config.gpx.imported) {
    return fail("gpx", "请先导入 GPX 轨迹文件");
  }

  const pointCount = Math.max(
    config.gpx.points.length,
    config.gpx.rawPoints.length,
  );
  if (requireGpx && pointCount < 2) {
    return fail("gpx", "轨迹点数不足，无法生成模型");
  }

  const vw = options.viewportWidth ?? 0;
  const vh = options.viewportHeight ?? 0;
  const hasViewport = vw >= MIN_VIEWPORT_PX && vh >= MIN_VIEWPORT_PX;

  if (
    options.viewportWidth != null &&
    options.viewportHeight != null &&
    !hasViewport
  ) {
    return fail("viewport", "预览区域尺寸过小，请放大窗口后重试");
  }

  const trayCheck = validateTrayFromAppConfig(config);
  if (!trayCheck.valid) {
    return { ...trayCheck, scope: "tray" };
  }

  const magnetCheck = validateMagnetAssembly(config);
  if (!magnetCheck.valid) return magnetCheck;

  if (requireGpx && hasViewport) {
    const trailCheck = validateTrailInPrintArea(config, vw, vh);
    if (!trailCheck.valid) return trailCheck;

    if (config.tray.nfc.enabled) {
      const nfcCheck = validateTrayNfcLayout(config, vw, vh);
      if (!nfcCheck.valid) return nfcCheck;
    }
  }

  return { valid: true };
}

/** 侧栏「托盘」区块：数值 + 布局（不强制已导入 GPX） */
export function validateTraySection(
  config: AppConfig,
  viewport?: { width: number; height: number },
): ModelValidationResult {
  const trayCheck = validateTrayFromAppConfig(config);
  if (!trayCheck.valid) {
    return { ...trayCheck, scope: "tray" };
  }

  if (
    config.tray.nfc.enabled &&
    viewport &&
    viewport.width >= MIN_VIEWPORT_PX &&
    viewport.height >= MIN_VIEWPORT_PX
  ) {
    const footprint = computeTrayFootprint(config);
    const cavity = computeTrayNfcCavityPolygon(
      config,
      footprint,
      config.tray.nfc.wallClearanceMm,
    );
    if (!cavity) {
      return fail(
        "nfc",
        "NFC 容纳腔过小，请减小「距打印内壁」或增大打印尺寸",
      );
    }

    if (config.gpx.imported) {
      const nfcCheck = validateTrayNfcLayout(
        config,
        viewport.width,
        viewport.height,
      );
      if (!nfcCheck.valid) return nfcCheck;
    }
  }

  return { valid: true };
}

/** 侧栏「装配与磁铁」区块 */
export function validateAssemblySection(
  config: AppConfig,
): ModelValidationResult {
  return validateMagnetAssembly(config);
}
