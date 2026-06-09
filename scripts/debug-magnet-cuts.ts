import { createDefaultConfig } from "../shared/types/config";
import { computeTrayFootprint } from "../shared/utils/tray-footprint";
import { buildTrayBaseMeshCsg } from "../electron/main/tray/tray-csg-mesh";
import { computeTrayBottomMagnetHoles } from "../shared/utils/magnet-hole-layout";
import {
  bottomPlateCoversPoint,
  countBottomHoleOpenings,
  countBottomPlateOverHole,
} from "../electron/main/assembly/tray-magnet-pockets";
import { analyzeMesh } from "../shared/utils/mesh-manifold";

function assert(name: string, cond: boolean): void {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`ok: ${name}`);
}

const cfg = createDefaultConfig();
cfg.assembly.magnet.enabled = true;
cfg.mapCrop.shape = "polygon";
cfg.mapCrop.polygonSides = 6;
cfg.mapCrop.polygonSideLengthMm = 40;

const footprint = computeTrayFootprint(cfg);
const holes = computeTrayBottomMagnetHoles(cfg, footprint);
const radius = cfg.assembly.magnet.diameterMm / 2;
const depth = cfg.assembly.magnet.thicknessMm;

const mesh = buildTrayBaseMeshCsg(footprint, cfg.tray, {
  holes,
  radiusMm: radius,
  depthMm: depth,
});

const openings = countBottomHoleOpenings(mesh, holes, radius);
const covered = countBottomPlateOverHole(mesh, holes, radius);
const analysis = analyzeMesh(mesh);

assert(`bottom openings ${openings}/6`, openings === 6);
assert(`holes not covered by plate ${covered}/6`, covered === 0);
assert("center covered by bottom plate", bottomPlateCoversPoint(mesh, 0, 0));
assert(
  "between-hole region covered",
  bottomPlateCoversPoint(mesh, 0, footprint.outer[0]!.y * 0.35),
);
assert("no non-manifold edges", analysis.nonManifoldEdges === 0);
assert("has triangles", mesh.indices.length > 48);

console.log(
  `magnet mesh: ${analysis.vertices} verts, ${analysis.triangles} tris, boundary=${analysis.boundaryEdges}`,
);
console.log("debug-magnet-cuts passed");
