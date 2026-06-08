import type { AppConfig } from "@shared/types";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import {
  computeMagnetHoleLayout,
  type MagnetHole2D,
  type MagnetLayoutOptions,
} from "@shared/utils/magnet-hole-layout";
import { computeTrayFootprint, type TrayFootprint } from "../tray/tray-footprint";
import { applyCylinderCuts, type CylinderCut } from "./mesh-cylinder-cut";

function holesToCuts(
  holes: MagnetHole2D[],
  radius: number,
  zBottom: number,
  zTop: number,
): CylinderCut[] {
  return holes.map((h) => ({
    x: h.x,
    y: h.y,
    radius,
    zBottom,
    zTop,
  }));
}

function magnetRadiusMm(config: AppConfig): number {
  return Math.max(0.5, config.assembly.magnet.diameterMm / 2);
}

function magnetDepthMm(config: AppConfig): number {
  return Math.max(0.5, config.assembly.magnet.thicknessMm);
}

function magnetLayoutOptionsFromFootprint(
  footprint: TrayFootprint,
): MagnetLayoutOptions {
  return {
    footprintShape: footprint.shape,
    polygonVertexCount:
      footprint.shape === "polygon" ? footprint.outer.length : undefined,
  };
}

/** 与托盘/地形外轮廓使用同一 footprint 解析磁铁孔数量与形状 */
function magnetLayoutForConfig(config: AppConfig): ReturnType<
  typeof computeMagnetHoleLayout
> {
  const footprint = computeTrayFootprint(config);
  return computeMagnetHoleLayout(
    config,
    magnetLayoutOptionsFromFootprint(footprint),
  );
}

/** 主模型底面拼接定位孔（自底面向上挖） */
export function applyTerrainSnapFitHoles(
  mesh: TerrainMeshPayload,
  config: AppConfig,
): TerrainMeshPayload {
  const { snapFit } = magnetLayoutForConfig(config);
  if (!snapFit.length) return mesh;

  const depth = magnetDepthMm(config);
  const cuts = holesToCuts(
    snapFit,
    magnetRadiusMm(config),
    mesh.bottomZ,
    mesh.bottomZ + depth,
  );
  return applyCylinderCuts(mesh, cuts);
}

/** 托盘：凹槽底面拼接孔（向下挖）+ 底面冰箱贴孔（自底面向上挖） */
export function applyTrayMagnetHoles(
  mesh: TerrainMeshPayload,
  config: AppConfig,
  footprint?: TrayFootprint,
): TerrainMeshPayload {
  const layout = footprint
    ? computeMagnetHoleLayout(
        config,
        magnetLayoutOptionsFromFootprint(footprint),
      )
    : magnetLayoutForConfig(config);
  if (!layout.snapFit.length && !layout.fridge.length) return mesh;

  const radius = magnetRadiusMm(config);
  const depth = magnetDepthMm(config);
  const floorZ = config.tray.totalThicknessMm - config.tray.recessDepthMm;
  const cuts: CylinderCut[] = [];

  if (layout.snapFit.length) {
    cuts.push(...holesToCuts(layout.snapFit, radius, floorZ - depth, floorZ));
  }

  if (layout.fridge.length) {
    cuts.push(...holesToCuts(layout.fridge, radius, 0, depth));
  }

  return applyCylinderCuts(mesh, cuts);
}
