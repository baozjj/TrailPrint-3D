import { parseGpxFile } from "../electron/main/gpx/parse-gpx.ts";
import { generateTerrainMain } from "../electron/main/terrain/terrain-main-service.ts";
import { createDefaultConfig } from "../shared/types/config.ts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(): void {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

const gpxPath = resolve("fixtures/sample-trail.gpx");
const parsed = await parseGpxFile({ filePath: gpxPath, fileName: "sample-trail.gpx" });

let config = createDefaultConfig();
config.gpx.imported = true;
config.gpx.filePath = gpxPath;
config.gpx.fileName = "sample-trail.gpx";
config.gpx.points = parsed.points;
config.gpx.rawPoints = parsed.points;
config.gpx.bounds = parsed.bounds;
config.gpx.pointCount = parsed.pointCount;
config.gpx.distanceKm = parsed.distanceKm;
config.mapCrop.mapCenterLat = parsed.suggestedCenter.lat;
config.mapCrop.mapCenterLon = parsed.suggestedCenter.lon;
config.mapCrop.mapZoom = 14;
config.mapCrop.shape = "circle";
config.mapCrop.radiusMm = 80;

import { buildHeightfieldTerrainMesh } from "../shared/utils/heightfield-mesh.ts";
import { analyzeMesh, weldMeshVertices } from "./validate-mesh.ts";

const resPreview = await generateTerrainMain({
  config,
  viewportWidth: 900,
  viewportHeight: 700,
  highQualityPreview: true,
});

const resExport = await generateTerrainMain({
  config,
  viewportWidth: 900,
  viewportHeight: 700,
  stlExport: true,
});

const hp = resExport.heightPreview;
const rebuilt = buildHeightfieldTerrainMesh(
  resExport.crop,
  hp.heights,
  hp.cols,
  hp.rows,
  hp.baseThicknessMm,
);

console.log("dem source:", resExport.demSource);
console.log("mesh analysis:");
for (const [label, mesh] of [
  ["preview-server-mesh", resPreview.mesh],
  ["export-server-mesh", resExport.mesh],
  ["export-rebuilt-no-holes", rebuilt],
  ["export-welded-0.5", weldMeshVertices(resExport.mesh, 0.5)],
] as const) {
  console.log(label, analyzeMesh(mesh));
}

const res = resExport;

const zs = res.heightPreview.heights;
let minZ = Infinity;
let maxZ = -Infinity;
for (const z of zs) {
  if (z < minZ) minZ = z;
  if (z > maxZ) maxZ = z;
}
console.log("GPX E2E", {
  points: parsed.pointCount,
  terrainTris: res.mesh.indices.length / 3,
  heightMmMin: minZ,
  heightMmMax: maxZ,
  heightSpanMm: maxZ - minZ,
  footprintMm: res.crop.widthMm,
  dem: res.demSource,
  ms: res.generationMs,
});

if (res.mesh.indices.length === 0) {
  process.exitCode = 1;
  console.error("FAIL: empty terrain mesh");
}
