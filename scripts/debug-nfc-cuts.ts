import { createDefaultConfig } from "../shared/types/config";
import { computeTrayFootprint } from "../shared/utils/tray-footprint";
import { buildTrayBaseMeshForExport } from "../electron/main/tray/tray-export-mesh";
import { computeTrayBottomMagnetHoles } from "../shared/utils/magnet-hole-layout";
import { magnetCutDimensionsMm } from "../shared/utils/magnet-hole-geometry";
import { computeTrayNfcLayout, computeTrayCoverPolygon, computeTerrainPrintPolygon } from "../shared/utils/tray-nfc-layout";
import { buildTrayCoverMesh } from "../electron/main/tray/tray-cover-mesh";
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

// 环线：起终点重合时只保留一个 LED 槽
const loopCfg = createDefaultConfig();
loopCfg.assembly.magnet.enabled = false;
loopCfg.tray.nfc.enabled = true;
loopCfg.mapCrop.shape = "polygon";
loopCfg.mapCrop.polygonSides = 6;
loopCfg.mapCrop.polygonSideLengthMm = 45;
loopCfg.gpx.imported = true;
loopCfg.gpx.points = [
  { lat: 30.0, lon: 120.0 },
  { lat: 30.01, lon: 120.01 },
  { lat: 30.02, lon: 120.02 },
  { lat: 30.0, lon: 120.0 },
];
loopCfg.gpx.rawPoints = loopCfg.gpx.points;
loopCfg.mapCrop.mapCenterLat = 30.01;
loopCfg.mapCrop.mapCenterLon = 120.01;
const loopLayout = computeTrayNfcLayout(loopCfg, footprint, 800, 600);
assert("loop trail single led", loopLayout.ledPockets.length === 1);

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

const loopMesh = buildTrayBaseMeshForExport(
  footprint,
  loopCfg.tray,
  undefined,
  {
    cavityVerts: loopLayout.cavity!.verts,
    recessDepthMm: loopCfg.tray.nfc.recessDepthMm,
    ledPockets: loopLayout.ledPockets,
    ledExtraRecessDepthMm: loopCfg.tray.nfc.ledExtraRecessDepthMm,
    ledPocketLengthMm: loopCfg.tray.nfc.ledPocketLengthMm,
    ledPocketWidthMm: loopCfg.tray.nfc.ledPocketWidthMm,
    floorZ,
  },
);
assert("loop tray watertight", analyzeMesh(loopMesh).boundaryEdges === 0);

console.log(
  `nfc-top+magnet mesh: ${analysis.vertices} verts, ${analysis.triangles} tris`,
);

const coverVerts = computeTrayCoverPolygon(cfg, cfg.tray.nfc.coverInsetMm)!;
const coverMesh = buildTrayCoverMesh({
  outerVerts: coverVerts,
  ledPockets: nfcLayout.ledPockets,
  ledPocketLengthMm: cfg.tray.nfc.ledPocketLengthMm,
  ledPocketWidthMm: cfg.tray.nfc.ledPocketWidthMm,
  thicknessMm: cfg.tray.nfc.coverThicknessMm,
});
const coverAnalysis = analyzeMesh(coverMesh);
assert("cover hex outline", coverVerts.length === 6);
assert("cover smaller than print", coverVerts[0]!.x < computeTerrainPrintPolygon(cfg).verts[0]!.x);
assert("cover watertight", coverAnalysis.boundaryEdges === 0);
assert(
  "cover thickness",
  Math.abs(coverMesh.minSurfaceZ - cfg.tray.nfc.coverThicknessMm) < 0.01,
);
console.log(`cover mesh: ${coverAnalysis.vertices} verts, ${coverAnalysis.triangles} tris`);
console.log("debug-nfc-cuts passed");
