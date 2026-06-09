import type { AppConfig } from "@shared/types";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import { computeTrayBottomMagnetHoles } from "@shared/utils/magnet-hole-layout";
import { logMagnetDebug } from "@shared/utils/magnet-debug-log";
import type { TrayFootprint } from "@shared/utils/tray-footprint";
import {
  applyTrayMagnetPockets,
  countBottomHoleOpenings,
  countBottomPlateOverHole,
} from "./tray-magnet-pockets";

function magnetRadiusMm(config: AppConfig): number {
  return Math.max(0.5, config.assembly.magnet.diameterMm / 2);
}

function magnetDepthMm(config: AppConfig): number {
  return Math.max(0.5, config.assembly.magnet.thicknessMm);
}

/** 托盘底面磁铁孔（自底面 z=0 向上挖） */
export function applyTrayMagnetHoles(
  mesh: TerrainMeshPayload,
  config: AppConfig,
  footprint: TrayFootprint,
): TerrainMeshPayload {
  const holes = computeTrayBottomMagnetHoles(config, footprint);
  if (!holes.length) return mesh;

  const radius = magnetRadiusMm(config);
  const depth = magnetDepthMm(config);
  const triBefore = mesh.indices.length / 3;

  const result = applyTrayMagnetPockets(
    mesh,
    footprint.outer,
    holes,
    radius,
    depth,
  );

  const openings = countBottomHoleOpenings(result, holes, radius);
  const covered = countBottomPlateOverHole(result, holes, radius);

  logMagnetDebug({
    phase: "apply-pockets",
    mapCropShape: config.mapCrop.shape,
    footprintShape: footprint.shape,
    outerVertCount: footprint.outer.length,
    holeCount: holes.length,
    cutRadiusMm: radius,
    cutDepthMm: depth,
    triCountBefore: triBefore,
    triCountAfter: result.indices.length / 3,
    note: `底面孔洞开口 ${openings}/${holes.length}，被底面遮挡 ${covered}/${holes.length}`,
  });

  return result;
}
