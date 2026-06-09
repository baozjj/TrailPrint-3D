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
import { buildTrayBaseMesh } from "./tray-base-mesh";
import { buildBorderTextMeshes } from "./border-text-mesh";
import { mergeMeshPayloads } from "./mesh-merge";
import { applyTrayMagnetHoles } from "../assembly/apply-magnet-holes";

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

  const base = buildTrayBaseMesh(footprint, config.tray);
  const borderTextEnabled =
    config.mapCrop.shape !== "circle" &&
    config.tray.borderTextByEdge.some((e) => e.content.trim().length > 0);

  const textMesh = await buildBorderTextMeshes(
    footprint,
    config.mapCrop.shape,
    config.tray.borderTextByEdge,
    config.tray.totalThicknessMm,
    borderTextEnabled,
  );

  let mesh = textMesh ? mergeMeshPayloads([base, textMesh]) : base;

  if (config.assembly.magnet.enabled) {
    const holes = computeTrayBottomMagnetHoles(config, footprint);
    logMagnetDebug({
      phase: "tray-layout",
      mapCropShape: config.mapCrop.shape,
      polygonSides: config.mapCrop.polygonSides,
      footprintShape: footprint.shape,
      outerVertCount: footprint.outer.length,
      magnetEnabled: true,
      circleCount: config.assembly.magnet.circleCount,
      holeCount: holes.length,
      holes,
    });
    logMagnetDebug({
      phase: "tray-validate",
      footprintShape: footprint.shape,
      outerVertCount: footprint.outer.length,
      holeCount: holes.length,
      note: magnetDebugSummary({
        phase: "tray-validate",
        footprintShape: footprint.shape,
        outerVertCount: footprint.outer.length,
        holeCount: holes.length,
      }),
    });
    if (footprint.shape === "polygon" && holes.length !== footprint.outer.length) {
      throw new IpcException(
        "MAGNET_LAYOUT",
        `多边形托盘磁铁孔数量异常（期望 ${footprint.outer.length}，实际 ${holes.length}）`,
      );
    }
  }

  mesh = applyTrayMagnetHoles(mesh, config, footprint);

  return {
    mesh,
    generationMs: Date.now() - started,
    hasBorderText: Boolean(textMesh),
  };
}
