import { buildHeightfieldTerrainMesh } from "../shared/utils/heightfield-mesh.ts";
import type { TerrainCropRegion } from "../shared/types/terrain.ts";
import { analyzeMesh } from "../shared/utils/mesh-manifold.ts";
import { weldMeshVertices } from "./validate-mesh.ts";

function syntheticHeights(cols: number, rows: number): Float64Array {
  const h = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const s = col / (cols - 1);
      const t = row / (rows - 1);
      h[row * cols + col] = 8 + 6 * Math.sin(s * Math.PI * 2) * Math.cos(t * Math.PI * 2);
    }
  }
  return h;
}

const crop: TerrainCropRegion = {
  shape: "circle",
  centerLat: 30.56,
  centerLon: 104.28,
  bearingDeg: 0,
  minLat: 30.55,
  maxLat: 30.57,
  minLon: 104.27,
  maxLon: 104.29,
  widthMm: 160,
  heightMm: 160,
  radiusMm: 80,
};

const rectCrop: TerrainCropRegion = { ...crop, shape: "rectangle" };

for (const [label, c] of [
  ["circle", crop],
  ["rectangle", rectCrop],
] as const) {
  const mesh = buildHeightfieldTerrainMesh(
    c,
    syntheticHeights(64, 64),
    64,
    64,
    3,
  );
  console.log(`${label} 64×64:`, analyzeMesh(mesh));
}

for (const [cols, rows] of [
  [64, 64],
  [120, 120],
  [192, 192],
] as const) {
  const mesh = buildHeightfieldTerrainMesh(
    crop,
    syntheticHeights(cols, rows),
    cols,
    rows,
    3,
  );
  console.log(`circle ${cols}×${rows}:`, analyzeMesh(mesh));
  console.log(
    `  welded 0.5mm:`,
    analyzeMesh(weldMeshVertices(mesh, 0.5)),
  );
}
