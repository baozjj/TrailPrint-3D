import { createDefaultConfig } from "../shared/types/config";
import {
  computeTrayBottomMagnetHoles,
  trayMagnetHoleCount,
} from "../shared/utils/magnet-hole-layout";
import { computeTrayFootprint } from "../shared/utils/tray-footprint";

function assert(name: string, cond: boolean): void {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`ok: ${name}`);
}

const cfg = createDefaultConfig();
cfg.assembly.magnet.enabled = true;
cfg.mapCrop.shape = "polygon";
cfg.mapCrop.polygonSides = 6;
cfg.mapCrop.polygonSideLengthMm = 40;

const hexFootprint = computeTrayFootprint(cfg);
assert("hex footprint shape", hexFootprint.shape === "polygon");
assert("hex footprint 6 verts", hexFootprint.outer.length === 6);

let holes = computeTrayBottomMagnetHoles(cfg, hexFootprint);
assert("hex 6 holes", holes.length === 6);
assert("hex count helper", trayMagnetHoleCount(cfg, hexFootprint) === 6);

cfg.mapCrop.shape = "circle";
const circleFootprint = computeTrayFootprint(cfg);
holes = computeTrayBottomMagnetHoles(cfg, circleFootprint);
assert("circle footprint shape", circleFootprint.shape === "circle");
assert("circle 3 holes", holes.length === 3);

cfg.assembly.magnet.enabled = false;
assert(
  "disabled no holes",
  computeTrayBottomMagnetHoles(cfg, hexFootprint).length === 0,
);

console.log("all magnet layout tests passed");
