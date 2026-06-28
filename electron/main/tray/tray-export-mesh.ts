import type { TrayConfig } from "../../../shared/types";
import type { TerrainMeshPayload } from "../../../shared/types/terrain";
import { weldMeshVertices } from "../../../shared/utils/mesh-manifold";
import type { TrayFootprint } from "../../../shared/utils/tray-footprint";
import { applyTrayMagnetPockets } from "../assembly/tray-bottom-features";
import {
  applyTrayTopNfcFeatures,
  type TrayNfcMeshSpec,
} from "../assembly/tray-top-nfc-features";
import { buildTrayBaseMesh } from "./tray-base-mesh";
import type { TrayMagnetCutSpec } from "./tray-csg-mesh";

/**
 * 导出用托盘网格：手工封闭体 + 底面磁铁孔 + 顶面 NFC/LED 腔，最后焊接为 0 开放边。
 */
export function buildTrayBaseMeshForExport(
  footprint: TrayFootprint,
  tray: TrayConfig,
  magnet?: TrayMagnetCutSpec,
  nfc?: TrayNfcMeshSpec,
): TerrainMeshPayload {
  let mesh = buildTrayBaseMesh(footprint, tray);
  if (magnet?.holes.length) {
    mesh = applyTrayMagnetPockets(
      mesh,
      footprint.outer,
      magnet.holes,
      magnet.radiusMm,
      magnet.depthMm,
    );
  }
  if (nfc?.cavityVerts.length) {
    mesh = applyTrayTopNfcFeatures(mesh, footprint.recessInner, nfc);
  }
  return weldMeshVertices(mesh, 0.05);
}
