import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import { resamplePolyline, type TrailPointMm } from "@shared/utils/trail-coords";
import { sampleSurfaceHeightMm } from "./surface-sample";

export interface BuildTrailLineOptions {
  polylineMm: TrailPointMm[];
  widthMm: number;
  depthMm: number;
  heightMm: Float64Array;
  cols: number;
  rows: number;
  crop: TerrainCropRegion;
}

/**
 * 生成 Trail_Line 实体网格：顶面贴合 DEM 表面，向下挤出 depthMm，宽度 widthMm。
 */
export function buildTrailLineMesh(
  opts: BuildTrailLineOptions,
): TerrainMeshPayload | null {
  const { polylineMm, widthMm, depthMm, heightMm, cols, rows, crop } = opts;
  if (polylineMm.length < 2 || widthMm <= 0 || depthMm <= 0) return null;

  const path = resamplePolyline(polylineMm, Math.max(0.8, widthMm / 3));
  if (path.length < 2) return null;

  const samples: Array<{ x: number; y: number; zTop: number; zBot: number }> =
    [];
  for (const p of path) {
    const zTop = sampleSurfaceHeightMm(
      p.x,
      p.y,
      heightMm,
      cols,
      rows,
      crop,
    );
    samples.push({
      x: p.x,
      y: p.y,
      zTop,
      zBot: zTop - depthMm,
    });
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const halfW = widthMm / 2;

  function addVertex(x: number, y: number, z: number): number {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    return idx;
  }

  const topLeft: number[] = [];
  const topRight: number[] = [];
  const botLeft: number[] = [];
  const botRight: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i]!;
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;

    topLeft.push(
      addVertex(cur.x + nx * halfW, cur.y + ny * halfW, cur.zTop),
    );
    topRight.push(
      addVertex(cur.x - nx * halfW, cur.y - ny * halfW, cur.zTop),
    );
    botLeft.push(
      addVertex(cur.x + nx * halfW, cur.y + ny * halfW, cur.zBot),
    );
    botRight.push(
      addVertex(cur.x - nx * halfW, cur.y - ny * halfW, cur.zBot),
    );
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const tl0 = topLeft[i]!;
    const tr0 = topRight[i]!;
    const tl1 = topLeft[i + 1]!;
    const tr1 = topRight[i + 1]!;
    const bl0 = botLeft[i]!;
    const br0 = botRight[i]!;
    const bl1 = botLeft[i + 1]!;
    const br1 = botRight[i + 1]!;

    indices.push(tl0, tr0, tl1, tr0, tr1, tl1);
    indices.push(bl0, bl1, br0, bl0, br1, br1);
    indices.push(tl0, tl1, bl0, tl1, bl1, bl0);
    indices.push(tr0, br0, tr1, br0, br1, tr1);
  }

  const zTopMin = Math.min(...samples.map((s) => s.zTop));
  const zBotMin = Math.min(...samples.map((s) => s.zBot));

  return {
    positions,
    indices,
    minSurfaceZ: zTopMin,
    bottomZ: zBotMin,
    gridCols: 0,
    gridRows: 0,
  };
}
