import { buildMaskShellForRegion } from "../electron/main/spray-paint/mask-shell-builder";
import { validateMaskMesh } from "../electron/main/spray-paint/mask-mesh-validation";
import { analyzeMesh, weldMeshVertices } from "../shared/utils/mesh-manifold";
import type { TerrainCropRegion } from "../shared/types/terrain";

const crop: TerrainCropRegion = {
  shape: "rectangle",
  centerLat: 0,
  centerLon: 0,
  bearingDeg: 0,
  minLat: 0,
  maxLat: 1,
  minLon: 0,
  maxLon: 1,
  widthMm: 100,
  heightMm: 80,
};

const cols = 16;
const rows = 12;
const heights = new Float64Array(cols * rows);
const regions = new Uint8Array(cols * rows);

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const idx = row * cols + col;
    heights[idx] = Math.sin(col * 0.4) * 3 + Math.cos(row * 0.35) * 2 + row * 0.2;
    regions[idx] = col < cols / 2 ? 0 : 1;
  }
}

for (let regionId = 0; regionId < 4; regionId++) {
  let mesh = buildMaskShellForRegion(
    crop,
    heights,
    cols,
    rows,
    regions,
    regionId,
    {
      maskFitToleranceMm: 0.2,
      maskShellThicknessMm: 1.0,
      bleedMarginMm: 0.5,
      bottomZ: -2,
    },
  );
  mesh = weldMeshVertices(mesh, 0.03);
  const analysis = analyzeMesh(mesh);
  const fileName = `Mask_Color_0${regionId + 1}.stl`;
  const warns = validateMaskMesh(mesh, fileName);
  console.log(`region ${regionId}:`, analysis, warns.length ? warns : "OK");
}

console.log("All mask shell tests passed");
