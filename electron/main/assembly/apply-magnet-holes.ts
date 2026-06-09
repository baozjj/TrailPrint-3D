import type { AppConfig } from "@shared/types";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import { computeTrayBottomMagnetHoles } from "@shared/utils/magnet-hole-layout";
import { logMagnetDebug } from "@shared/utils/magnet-debug-log";
import type { TrayFootprint } from "@shared/utils/tray-footprint";
import {
  applyCylinderCuts,
  countMeshCutIntersections,
  type CylinderCut,
} from "./mesh-cylinder-cut";
import {
  countBottomHoleOpenings,
  countBottomPlateOverHole,
} from "./tray-magnet-diagnostics";

function magnetRadiusMm(config: AppConfig): number {
  return Math.max(0.5, config.assembly.magnet.diameterMm / 2);
}

function magnetDepthMm(config: AppConfig): number {
  return Math.max(0.5, config.assembly.magnet.thicknessMm);
}

/**
 * 托盘底面磁铁盲孔：在完整封闭托盘实体上做圆柱体布尔差集。
 * 保留完整底板，挖除圆柱体后补内壁 + 孔顶面（孔底在 z=bottomZ 敞开，供嵌入磁铁）。
 */
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

  const cuts: CylinderCut[] = holes.map((h) => ({
    x: h.x,
    y: h.y,
    radius,
    zBottom: mesh.bottomZ,
    zTop: mesh.bottomZ + depth,
  }));

  const removed = countMeshCutIntersections(mesh, cuts);
  const result = applyCylinderCuts(mesh, cuts);

  const openings = countBottomHoleOpenings(result, holes, radius);
  const covered = countBottomPlateOverHole(result, holes, radius);

  logMagnetDebug({
    phase: "apply-cylinder-cuts",
    mapCropShape: config.mapCrop.shape,
    footprintShape: footprint.shape,
    outerVertCount: footprint.outer.length,
    holeCount: holes.length,
    cutRadiusMm: radius,
    cutDepthMm: depth,
    triCountBefore: triBefore,
    triCountAfter: result.indices.length / 3,
    note: `圆柱差集移除 ${removed} 三角；底面孔洞开口 ${openings}/${holes.length}，孔口被底板遮挡 ${covered}/${holes.length}`,
  });

  return result;
}
