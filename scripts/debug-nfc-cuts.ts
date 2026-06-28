import { createDefaultConfig } from "../shared/types/config";
import { computeTrayFootprint } from "../shared/utils/tray-footprint";
import { buildTrayBaseMeshForExport } from "../electron/main/tray/tray-export-mesh";
import { computeTrayBottomMagnetHoles } from "../shared/utils/magnet-hole-layout";
import { magnetCutDimensionsMm } from "../shared/utils/magnet-hole-geometry";
import { computeTrayNfcLayout } from "../shared/utils/tray-nfc-layout";
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
cfg.tray.nfc.enabled = true;
cfg.mapCrop.shape = "polygon";
cfg.mapCrop.polygonSides = 6;
cfg.mapCrop.polygonSideLengthMm = 45;
cfg.gpx.imported = true;
cfg.gpx.points = [
  { lat: 30.0, lon: 120.0 },
  { lat: 30.01, lon: 120.01 },
  { lat: 30.02, lon: 120.02 },
];
cfg.gpx.rawPoints = cfg.gpx.points;
cfg.mapCrop.mapCenterLat = 30.01;
cfg.mapCrop.mapCenterLon = 120.01;

const footprint = computeTrayFootprint(cfg);
const holes = computeTrayBottomMagnetHoles(cfg, footprint);
const { radiusMm: radius, depthMm: depth } = magnetCutDimensionsMm(
  cfg.assembly.magnet,
);
const nfcLayout = computeTrayNfcLayout(cfg, footprint, 800, 600);
const floorZ = cfg.tray.totalThicknessMm - cfg.tray.recessDepthMm;

assert("nfc cavity exists", nfcLayout.cavity != null);
assert("nfc is hexagon", nfcLayout.cavity!.verts.length === 6);
assert("led pockets count", nfcLayout.ledPockets.length === 2);

const mesh = buildTrayBaseMeshForExport(
  footprint,
  cfg.tray,
  { holes, radiusMm: radius, depthMm: depth },
  {
    cavityVerts: nfcLayout.cavity!.verts,
    recessDepthMm: cfg.tray.nfc.recessDepthMm,
    ledPockets: nfcLayout.ledPockets,
    ledExtraRecessDepthMm: cfg.tray.nfc.ledExtraRecessDepthMm,
    ledPocketLengthMm: cfg.tray.nfc.ledPocketLengthMm,
    ledPocketWidthMm: cfg.tray.nfc.ledPocketWidthMm,
    floorZ,
  },
);

const openings = countBottomHoleOpenings(mesh, holes, radius);
const covered = countBottomPlateOverHole(mesh, holes, radius);
const analysis = analyzeMesh(mesh);

assert(`magnet openings ${openings}/6`, openings === 6);
assert(`magnet holes not covered ${covered}/6`, covered === 0);
assert("bottom still closed", bottomPlateCoversPoint(mesh, 0, 0));
assert("no non-manifold edges", analysis.nonManifoldEdges === 0);
assert("watertight mesh", analysis.boundaryEdges === 0);

console.log(
  `nfc-top+magnet mesh: ${analysis.vertices} verts, ${analysis.triangles} tris`,
);
console.log("debug-nfc-cuts passed");
