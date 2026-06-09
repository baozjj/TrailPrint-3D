import { createDefaultConfig } from "../shared/types/config";
import { computeTrayFootprint } from "../shared/utils/tray-footprint";
import { buildTrayBaseMesh } from "../electron/main/tray/tray-base-mesh";
import { computeTrayBottomMagnetHoles } from "../shared/utils/magnet-hole-layout";
import {
  applyTrayMagnetPockets,
  countBottomHoleOpenings,
  countBottomPlateOverHole,
} from "../electron/main/assembly/tray-magnet-pockets";

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
const base = buildTrayBaseMesh(footprint, cfg.tray);
const holes = computeTrayBottomMagnetHoles(cfg, footprint);
const radius = cfg.assembly.magnet.diameterMm / 2;
const depth = cfg.assembly.magnet.thicknessMm;

const mesh = applyTrayMagnetPockets(
  base,
  footprint.outer,
  holes,
  radius,
  depth,
);

const openings = countBottomHoleOpenings(mesh, holes, radius);
const covered = countBottomPlateOverHole(mesh, holes, radius);
assert(`bottom openings ${openings}/6`, openings === 6);
assert(`holes not covered by plate ${covered}/6`, covered === 0);
assert("mesh has more tris than base", mesh.indices.length > base.indices.length);

console.log("debug-magnet-cuts passed");
