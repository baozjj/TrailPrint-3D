import type { BaseShape, BorderTextEdge, TextFacing } from "@shared/types";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import type { TrayFootprint, Vec2 } from "@shared/utils/tray-footprint";
import { layoutCharacterStrokes } from "./border-text-glyphs";
import {
  alongOffsetMm,
  normalOffsetMm,
} from "@shared/utils/border-text-layout";
import { DEFAULT_BORDER_FONT_SIZE_MM } from "@shared/tray/border-text-defaults";

const ENGRAVE_DEPTH_MM = 0.45;
const RELIEF_HEIGHT_MM = 0.4;

function edgeRimMidline(
  footprint: TrayFootprint,
  edgeIndex: number,
  shape: BaseShape,
): { start: Vec2; end: Vec2; outward: Vec2 } | null {
  if (shape === "rectangle") {
    const hw = footprint.outerHw ?? 0;
    const hh = footprint.outerHh ?? 0;
    const rw = footprint.recessHw ?? hw;
    const rh = footprint.recessHh ?? hh;
    const midHw = (hw + rw) / 2;
    const midHh = (hh + rh) / 2;
    switch (edgeIndex) {
      case 0:
        return {
          start: { x: -midHw, y: midHh },
          end: { x: midHw, y: midHh },
          outward: { x: 0, y: 1 },
        };
      case 1:
        return {
          start: { x: -midHw, y: -midHh },
          end: { x: midHw, y: -midHh },
          outward: { x: 0, y: -1 },
        };
      case 2:
        return {
          start: { x: -midHw, y: -midHh },
          end: { x: -midHw, y: midHh },
          outward: { x: -1, y: 0 },
        };
      case 3:
        return {
          start: { x: midHw, y: -midHh },
          end: { x: midHw, y: midHh },
          outward: { x: 1, y: 0 },
        };
      default:
        return null;
    }
  }

  const n = footprint.outer.length;
  if (n < 3 || footprint.recessInner.length < n) return null;
  const i = edgeIndex % n;
  const next = (i + 1) % n;
  const a = footprint.outer[i]!;
  const b = footprint.outer[next]!;
  const ar = footprint.recessInner[i]!;
  const br = footprint.recessInner[next]!;
  const start = { x: (a.x + ar.x) / 2, y: (a.y + ar.y) / 2 };
  const end = { x: (b.x + br.x) / 2, y: (b.y + br.y) / 2 };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const tx = (end.x - start.x) / len;
  const ty = (end.y - start.y) / len;
  const outward = { x: -ty, y: tx };
  const dot = mid.x * outward.x + mid.y * outward.y;
  if (dot < 0) {
    outward.x *= -1;
    outward.y *= -1;
  }
  return { start, end, outward };
}

function extrudeStrokeBox(
  a: Vec2,
  b: Vec2,
  halfW: number,
  z0: number,
  z1: number,
  positions: number[],
  indices: number[],
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * halfW;
  const ny = (dx / len) * halfW;
  const corners = [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
  const base = positions.length / 3;
  for (const c of corners) positions.push(c.x, c.y, z0);
  for (const c of corners) positions.push(c.x, c.y, z1);
  const tri = (i0: number, i1: number, i2: number) =>
    indices.push(base + i0, base + i1, base + i2);
  tri(0, 1, 5);
  tri(0, 5, 4);
  tri(1, 2, 6);
  tri(1, 6, 5);
  tri(2, 3, 7);
  tri(2, 7, 6);
  tri(3, 0, 4);
  tri(3, 4, 7);
  tri(0, 2, 1);
  tri(0, 3, 2);
  tri(4, 5, 6);
  tri(4, 6, 7);
}

function transformStroke(
  stroke: Vec2[],
  origin: Vec2,
  tangent: Vec2,
  facing: TextFacing,
): [Vec2, Vec2] {
  let tx = tangent.x;
  let ty = tangent.y;
  let pySign = 1;
  if (facing === "inward") {
    tx = -tx;
    ty = -ty;
    pySign = -1;
  }
  const map = (p: Vec2): Vec2 => ({
    x: origin.x + p.x * tx - p.y * ty * pySign,
    y: origin.y + p.x * ty + p.y * tx * pySign,
  });
  return [map(stroke[0]!), map(stroke[1]!)];
}

export async function buildBorderTextMeshes(
  footprint: TrayFootprint,
  shape: BaseShape,
  edges: BorderTextEdge[],
  rimTopZ: number,
  borderTextEnabled: boolean,
): Promise<TerrainMeshPayload | null> {
  if (!borderTextEnabled || shape === "circle") return null;
  if (!edges.some((e) => e.content.trim())) return null;

  const positions: number[] = [];
  const indices: number[] = [];

  for (let ei = 0; ei < edges.length; ei++) {
    const edge = edges[ei]!;
    const text = edge.content.trim();
    if (!text) continue;

    const line = edgeRimMidline(footprint, ei, shape);
    if (!line) continue;

    const segLen = Math.hypot(
      line.end.x - line.start.x,
      line.end.y - line.start.y,
    );
    const tangent = {
      x: (line.end.x - line.start.x) / segLen,
      y: (line.end.y - line.start.y) / segLen,
    };

    const fontSize = edge.fontSizeMm || DEFAULT_BORDER_FONT_SIZE_MM;
    const strokes = await layoutCharacterStrokes(text, edge.fontId, fontSize);
    const along = alongOffsetMm(edge, segLen, text);
    const normal = normalOffsetMm(edge);
    const origin = {
      x: line.start.x + tangent.x * along + line.outward.x * normal,
      y: line.start.y + tangent.y * along + line.outward.y * normal,
    };

    const intaglio = edge.style === "intaglio";
    const zTop = rimTopZ;
    const zBot = intaglio ? rimTopZ - ENGRAVE_DEPTH_MM : rimTopZ;
    const zTopRelief = intaglio ? rimTopZ : rimTopZ + RELIEF_HEIGHT_MM;

    const halfStroke = 0.22;
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      const [a, b] = transformStroke(
        stroke,
        origin,
        tangent,
        edge.facing ?? "outward",
      );
      extrudeStrokeBox(a, b, halfStroke, zBot, zTopRelief, positions, indices);
    }
  }

  if (!positions.length) return null;

  return {
    positions,
    indices,
    minSurfaceZ: rimTopZ,
    bottomZ: rimTopZ - ENGRAVE_DEPTH_MM,
    gridCols: 0,
    gridRows: 0,
  };
}
