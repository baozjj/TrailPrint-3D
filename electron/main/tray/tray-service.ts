import type { AppConfig } from "@shared/types";
import type {
  TrayGenerateRequest,
  TrayGenerateResponse,
} from "@shared/types/tray";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
import { IpcException } from "@shared/ipc/types";
import { computeTrayFootprint } from "./tray-footprint";
import { buildTrayBaseMesh } from "./tray-base-mesh";
import { buildBorderTextMeshes } from "./border-text-mesh";
import { mergeMeshPayloads } from "./mesh-merge";

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

  const mesh = textMesh ? mergeMeshPayloads([base, textMesh]) : base;

  return {
    mesh,
    generationMs: Date.now() - started,
    hasBorderText: Boolean(textMesh),
  };
}
