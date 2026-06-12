import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { TrayConfig } from "@shared/types";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import { magnetHexagonVertsMm } from "../../../shared/utils/magnet-hole-geometry";
import type { TrayFootprint, Vec2 } from "@shared/utils/tray-footprint";

const CSG_EPS_MM = 0.02;

function polygonToShape(verts: Vec2[]): THREE.Shape {
  const shape = new THREE.Shape();
  if (!verts.length) return shape;
  shape.moveTo(verts[0]!.x, verts[0]!.y);
  for (let i = 1; i < verts.length; i++) {
    shape.lineTo(verts[i]!.x, verts[i]!.y);
  }
  shape.closePath();
  return shape;
}

function disposeBrush(brush: Brush | null | undefined): void {
  brush?.geometry.dispose();
}

/** 凸多边形挤出实心柱（局部 Z=0..height，再平移到 z0） */
function makeExtrudedBrush(verts: Vec2[], z0: number, height: number): Brush {
  const geometry = new THREE.ExtrudeGeometry(polygonToShape(verts), {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  const brush = new Brush(geometry);
  brush.position.z = z0;
  brush.updateMatrixWorld(true);
  return brush;
}

/** 内切圆 = magnetRadiusMm 的正六边形棱柱（沿 +Z 挤出） */
function makeHexagonMagnetBrush(
  x: number,
  y: number,
  magnetRadiusMm: number,
  zBottom: number,
  height: number,
): Brush {
  return makeExtrudedBrush(
    magnetHexagonVertsMm(x, y, magnetRadiusMm),
    zBottom,
    height,
  );
}

function brushToPayload(
  brush: Brush,
  bottomZ: number,
  topZ: number,
): TerrainMeshPayload {
  brush.updateMatrixWorld(true);
  let geometry = brush.geometry.clone();
  geometry.applyMatrix4(brush.matrixWorld);
  geometry = mergeVertices(geometry, 0.01);
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const positions = Array.from(posAttr.array as ArrayLike<number>);
  const indexAttr = geometry.getIndex();
  const indices: number[] = indexAttr
    ? Array.from(indexAttr.array as ArrayLike<number>)
    : Array.from({ length: posAttr.count }, (_, i) => i);
  geometry.dispose();

  return {
    positions,
    indices,
    minSurfaceZ: topZ,
    bottomZ,
    gridCols: 0,
    gridRows: 0,
  };
}

export interface TrayMagnetCutSpec {
  holes: Array<{ x: number; y: number }>;
  /** 磁铁半径 (mm)，对应六边形孔内切圆 */
  radiusMm: number;
  depthMm: number;
}

/**
 * CSG 托盘实体（旧路径，预览/调试保留）。
 * 导出 STL 请使用 {@link buildTrayBaseMeshForExport}（手工封闭体 + ShapeGeometry 底面）。
 */
export function buildTrayBaseMeshCsg(
  footprint: TrayFootprint,
  tray: TrayConfig,
  magnet?: TrayMagnetCutSpec,
): TerrainMeshPayload {
  const { totalThicknessMm, recessDepthMm } = tray;
  const floorZ = totalThicknessMm - recessDepthMm;
  const topZ = totalThicknessMm;

  const evaluator = new Evaluator();
  let brush = makeExtrudedBrush(footprint.outer, 0, topZ);

  const recessCutter = makeExtrudedBrush(
    footprint.recessInner,
    floorZ,
    recessDepthMm + CSG_EPS_MM,
  );
  let prev = brush;
  brush = evaluator.evaluate(prev, recessCutter, SUBTRACTION) as Brush;
  brush.updateMatrixWorld(true);
  disposeBrush(prev);
  disposeBrush(recessCutter);

  if (magnet?.holes.length) {
    for (const hole of magnet.holes) {
      const cutter = makeHexagonMagnetBrush(
        hole.x,
        hole.y,
        magnet.radiusMm,
        -CSG_EPS_MM,
        magnet.depthMm + CSG_EPS_MM * 2,
      );
      prev = brush;
      brush = evaluator.evaluate(prev, cutter, SUBTRACTION) as Brush;
      brush.updateMatrixWorld(true);
      disposeBrush(prev);
      disposeBrush(cutter);
    }
  }

  const payload = brushToPayload(brush, 0, topZ);
  disposeBrush(brush);
  return payload;
}
