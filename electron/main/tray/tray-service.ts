import type { AppConfig } from "@shared/types";
import type {
  TrayGenerateRequest,
  TrayGenerateResponse,
} from "@shared/types/tray";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
import { computeTrayBottomMagnetHoles } from "@shared/utils/magnet-hole-layout";
import {
  logMagnetDebug,
  magnetDebugSummary,
} from "@shared/utils/magnet-debug-log";
import { IpcException } from "@shared/ipc/types";
import { computeTrayFootprint } from "@shared/utils/tray-footprint";
import { buildTrayBaseMeshCsg } from "./tray-csg-mesh";

export async function generateTrayBase(
  req: TrayGenerateRequest,
): Promise<TrayGenerateResponse> {
  const started = Date.now();
  const { config } = req;
  if (!config) {
    throw new IpcException("INVALID_REQUEST", "缺少 config 快照");
  }

  const validation = validateTrayFromAppConfig(config);
  if (!validation.valid) {
    throw new IpcException(
      "TRAY_INVALID",
      validation.message ?? "托盘参数无效",
    );
  }

  const footprint = computeTrayFootprint(config);

  logMagnetDebug({
    phase: "tray-footprint",
    mapCropShape: config.mapCrop.shape,
    polygonSides: config.mapCrop.polygonSides,
    footprintShape: footprint.shape,
    outerVertCount: footprint.outer.length,
    magnetEnabled: config.assembly.magnet.enabled,
    circleCount: config.assembly.magnet.circleCount,
    note:
      config.mapCrop.shape !== footprint.shape
        ? "警告：mapCrop.shape 与 footprint.shape 不一致"
        : undefined,
  });

  const magnetHoles = config.assembly.magnet.enabled
    ? computeTrayBottomMagnetHoles(config, footprint)
    : [];

  const mesh = buildTrayBaseMeshCsg(
    footprint,
    config.tray,
    config.assembly.magnet.enabled
      ? {
          holes: magnetHoles,
          radiusMm: Math.max(0.5, config.assembly.magnet.diameterMm / 2),
          depthMm: Math.max(0.5, config.assembly.magnet.thicknessMm),
        }
      : undefined,
  );

  if (config.assembly.magnet.enabled) {
    logMagnetDebug({
      phase: "tray-layout",
      mapCropShape: config.mapCrop.shape,
      polygonSides: config.mapCrop.polygonSides,
      footprintShape: footprint.shape,
      outerVertCount: footprint.outer.length,
      magnetEnabled: true,
      circleCount: config.assembly.magnet.circleCount,
      holeCount: magnetHoles.length,
      holes: magnetHoles,
    });
    logMagnetDebug({
      phase: "tray-validate",
      footprintShape: footprint.shape,
      outerVertCount: footprint.outer.length,
      holeCount: magnetHoles.length,
      note: magnetDebugSummary({
        phase: "tray-validate",
        footprintShape: footprint.shape,
        outerVertCount: footprint.outer.length,
        holeCount: magnetHoles.length,
      }),
    });
    if (
      footprint.shape === "polygon" &&
      magnetHoles.length !== footprint.outer.length
    ) {
      throw new IpcException(
        "MAGNET_LAYOUT",
        `多边形托盘磁铁孔数量异常（期望 ${footprint.outer.length}，实际 ${magnetHoles.length}）`,
      );
    }
  }

  return {
    mesh,
    generationMs: Date.now() - started,
  };
}
