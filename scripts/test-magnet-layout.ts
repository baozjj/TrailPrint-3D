import { createDefaultConfig } from "../shared/types/config";
import {
  computeMagnetHoleLayout,
  resolveFootprintShape,
} from "../shared/utils/magnet-hole-layout";

function assert(name: string, cond: boolean): void {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`ok: ${name}`);
}

const cfg = createDefaultConfig();
cfg.assembly.magnet.enabled = true;
cfg.assembly.magnet.snapFitHole = true;
cfg.assembly.magnet.fridgeMagnetHole = true;

cfg.mapCrop.shape = "polygon";
cfg.mapCrop.polygonSides = 6;
cfg.mapCrop.polygonSideLengthMm = 40;
let layout = computeMagnetHoleLayout(cfg, {
  footprintShape: "polygon",
  polygonVertexCount: 6,
});
assert("hex footprint snap holes", layout.snapFit.length === 6);
assert("hex footprint fridge holes", layout.fridge.length === 6);

// 形状字段异常时，与 tray-footprint 一致仍按多边形处理
const broken = createDefaultConfig();
broken.assembly.magnet.enabled = true;
broken.assembly.magnet.snapFitHole = true;
broken.mapCrop.shape = "polygon";
broken.mapCrop.polygonSides = 6;
assert(
  "resolveFootprintShape polygon",
  resolveFootprintShape(broken.mapCrop) === "polygon",
);
layout = computeMagnetHoleLayout(broken, {
  footprintShape: "polygon",
  polygonVertexCount: 6,
});
assert("polygon via footprint hint", layout.snapFit.length === 6);

cfg.mapCrop.shape = "circle";
layout = computeMagnetHoleLayout(cfg);
assert("circle default 3 holes", layout.snapFit.length === 3);

console.log("all magnet layout tests passed");
