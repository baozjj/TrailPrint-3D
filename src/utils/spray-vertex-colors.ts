import * as THREE from "three";
import type { SprayColorSlot } from "@shared/types/spray-paint";
import type { TerrainCropRegion } from "@shared/types/terrain";

const SPRAY_COLOR_CACHE_KEY = "sprayColorCache";

type SprayColorCache = {
  cellToVertices: number[][];
  regionRgb: Float32Array;
  regionCount: number;
  bottomZ: number;
  cols: number;
  rows: number;
  colorAttrArray: Float32Array;
};

function hexToLinearRgb(hex: string, out: THREE.Color): THREE.Color {
  const normalized = hex.replace("#", "").trim();
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const value = Number.parseInt(full, 16);
  return out.set(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

function buildRegionRgb(colors: SprayColorSlot[], maxRegions = 8): Float32Array {
  const rgb = new Float32Array(maxRegions * 3);
  const tmp = new THREE.Color();
  const fallback = hexToLinearRgb("#9E9E9E", new THREE.Color());
  for (let id = 0; id < maxRegions; id++) {
    const slot = colors.find((c) => c.regionId === id);
    const c = slot ? hexToLinearRgb(slot.hex, tmp) : fallback;
    rgb[id * 3] = c.r;
    rgb[id * 3 + 1] = c.g;
    rgb[id * 3 + 2] = c.b;
  }
  return rgb;
}

export function gridIndexFromMm(
  xMm: number,
  yMm: number,
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
): number {
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  const colF = ((xMm + hw) / Math.max(crop.widthMm, 1e-6)) * (cols - 1);
  const rowF = ((yMm + hh) / Math.max(crop.heightMm, 1e-6)) * (rows - 1);
  const col = Math.max(0, Math.min(cols - 1, Math.round(colF)));
  const row = Math.max(0, Math.min(rows - 1, Math.round(rowF)));
  return row * cols + col;
}

function gridCellFromMm(
  xMm: number,
  yMm: number,
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
): { row: number; col: number } {
  const idx = gridIndexFromMm(xMm, yMm, crop, cols, rows);
  return { row: Math.floor(idx / cols), col: idx % cols };
}

export function paintBrushInPlace(
  cellRegions: number[],
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  xMm: number,
  yMm: number,
  regionId: number,
  radiusCells: number,
  changed: Set<number>,
): void {
  const { row: cr, col: cc } = gridCellFromMm(xMm, yMm, crop, cols, rows);
  const r = Math.max(0, Math.round(radiusCells));
  for (let dr = -r; dr <= r; dr++) {
    for (let dc = -r; dc <= r; dc++) {
      if (r > 0 && dr * dr + dc * dc > r * r) continue;
      const row = cr + dr;
      const col = cc + dc;
      if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
      const idx = row * cols + col;
      if (cellRegions[idx] !== regionId) {
        cellRegions[idx] = regionId;
        changed.add(idx);
      }
    }
  }
}

function paintBrushAtCell(
  cellRegions: number[],
  cols: number,
  rows: number,
  regionId: number,
  centerRow: number,
  centerCol: number,
  radiusCells: number,
  changed: Set<number>,
): void {
  const r = Math.max(0, Math.round(radiusCells));
  for (let dr = -r; dr <= r; dr++) {
    for (let dc = -r; dc <= r; dc++) {
      if (r > 0 && dr * dr + dc * dc > r * r) continue;
      const row = centerRow + dr;
      const col = centerCol + dc;
      if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
      const idx = row * cols + col;
      if (cellRegions[idx] !== regionId) {
        cellRegions[idx] = regionId;
        changed.add(idx);
      }
    }
  }
}

/** 格网空间 Bresenham 插线涂抹，比 mm 插值步进更快 */
export function paintStrokeInPlace(
  cellRegions: number[],
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  x0Mm: number,
  y0Mm: number,
  x1Mm: number,
  y1Mm: number,
  regionId: number,
  radiusCells: number,
  changed: Set<number>,
): void {
  const start = gridCellFromMm(x0Mm, y0Mm, crop, cols, rows);
  const end = gridCellFromMm(x1Mm, y1Mm, crop, cols, rows);
  let r0 = start.row;
  let c0 = start.col;
  const r1 = end.row;
  const c1 = end.col;

  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1;
  const sc = c0 < c1 ? 1 : -1;
  let err = dr - dc;

  while (true) {
    paintBrushAtCell(cellRegions, cols, rows, regionId, r0, c0, radiusCells, changed);
    if (r0 === r1 && c0 === c1) break;
    const e2 = err * 2;
    if (e2 > -dc) {
      err -= dc;
      r0 += sr;
    }
    if (e2 < dr) {
      err += dr;
      c0 += sc;
    }
  }
}

function buildCellVertexMap(
  geometry: THREE.BufferGeometry,
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
  bottomZ: number,
): number[][] {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const cellToVertices: number[][] = Array.from({ length: cols * rows }, () => []);
  if (!pos) return cellToVertices;

  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) <= bottomZ + 0.05) continue;
    const idx = gridIndexFromMm(pos.getX(i), pos.getY(i), crop, cols, rows);
    cellToVertices[idx]!.push(i);
  }
  return cellToVertices;
}

function ensureSprayColorCache(
  geometry: THREE.BufferGeometry,
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
  colors: SprayColorSlot[],
  bottomZ: number,
): SprayColorCache {
  const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
  const existing = geometry.userData[SPRAY_COLOR_CACHE_KEY] as SprayColorCache | undefined;
  if (
    existing &&
    existing.cols === cols &&
    existing.rows === rows &&
    existing.bottomZ === bottomZ &&
    existing.colorAttrArray === colorAttr?.array
  ) {
    existing.regionRgb = buildRegionRgb(colors, existing.regionCount);
    return existing;
  }

  const cache: SprayColorCache = {
    cellToVertices: buildCellVertexMap(geometry, crop, cols, rows, bottomZ),
    regionRgb: buildRegionRgb(colors),
    regionCount: 8,
    bottomZ,
    cols,
    rows,
    colorAttrArray: (colorAttr?.array as Float32Array) ?? new Float32Array(0),
  };
  geometry.userData[SPRAY_COLOR_CACHE_KEY] = cache;
  return cache;
}

function expandCellsForPatch(
  changedCells: Iterable<number>,
  cols: number,
  rows: number,
): number[] {
  const expanded = new Set<number>();
  for (const idx of changedCells) {
    expanded.add(idx);
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    if (col > 0) expanded.add(idx - 1);
    if (col < cols - 1) expanded.add(idx + 1);
    if (row > 0) expanded.add(idx - cols);
    if (row < rows - 1) expanded.add(idx + cols);
  }
  return expanded.size ? [...expanded] : [];
}

export function patchSprayVertexColorsForCells(
  geometry: THREE.BufferGeometry,
  crop: TerrainCropRegion,
  cellRegions: ArrayLike<number>,
  cols: number,
  rows: number,
  colors: SprayColorSlot[],
  bottomZ: number,
  changedCells: Iterable<number>,
): void {
  let colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute | null;
  if (!colorAttr) {
    applySprayVertexColors(geometry, crop, cellRegions, cols, rows, colors, bottomZ);
    colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
  }

  const cache = ensureSprayColorCache(geometry, crop, cols, rows, colors, bottomZ);
  const arr = colorAttr.array as Float32Array;
  const { regionRgb, cellToVertices } = cache;
  const patchCells = expandCellsForPatch(changedCells, cols, rows);

  for (const cellIdx of patchCells) {
    const regionId = cellRegions[cellIdx] ?? 0;
    const base = regionId * 3;
    const r = regionRgb[base]!;
    const g = regionRgb[base + 1]!;
    const b = regionRgb[base + 2]!;
    const verts = cellToVertices[cellIdx];
    if (!verts?.length) continue;
    for (let vi = 0; vi < verts.length; vi++) {
      const o = verts[vi]! * 3;
      arr[o] = r;
      arr[o + 1] = g;
      arr[o + 2] = b;
    }
  }
  colorAttr.needsUpdate = true;
}

export function applySprayVertexColors(
  geometry: THREE.BufferGeometry,
  crop: TerrainCropRegion,
  cellRegions: ArrayLike<number>,
  cols: number,
  rows: number,
  colors: SprayColorSlot[],
  bottomZ: number,
): void {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  if (!pos) return;

  delete geometry.userData[SPRAY_COLOR_CACHE_KEY];

  const regionRgb = buildRegionRgb(colors);
  const fallback = hexToLinearRgb("#9E9E9E", new THREE.Color());
  const colorAttr = new Float32Array(pos.count * 3);
  const baseColor = new THREE.Color(0.95, 0.93, 0.86);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (z <= bottomZ + 0.05) {
      colorAttr[i * 3] = baseColor.r;
      colorAttr[i * 3 + 1] = baseColor.g;
      colorAttr[i * 3 + 2] = baseColor.b;
      continue;
    }
    const idx = gridIndexFromMm(x, y, crop, cols, rows);
    const regionId = cellRegions[idx] ?? 0;
    const base = regionId * 3;
    colorAttr[i * 3] = regionRgb[base] ?? fallback.r;
    colorAttr[i * 3 + 1] = regionRgb[base + 1] ?? fallback.g;
    colorAttr[i * 3 + 2] = regionRgb[base + 2] ?? fallback.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colorAttr, 3));
  ensureSprayColorCache(geometry, crop, cols, rows, colors, bottomZ);
}
