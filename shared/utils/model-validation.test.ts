import assert from "node:assert/strict";
import { createDefaultConfig } from "../types/config";
import {
  validateAssemblySection,
  validateMagnetAssembly,
  validateModelGeneration,
  validateTrailInPrintArea,
} from "./model-validation";

function testMagnetDepthConflict(): void {
  const config = createDefaultConfig();
  config.assembly.magnet.enabled = true;
  config.tray.totalThicknessMm = 5;
  config.tray.recessDepthMm = 4;
  config.assembly.magnet.thicknessMm = 2;
  config.assembly.magnet.toleranceMm = 0.2;

  const result = validateMagnetAssembly(config);
  assert.equal(result.valid, false);
  assert.match(result.message ?? "", /磁铁孔深/);
}

function testTrailOutsidePrintArea(): void {
  const config = createDefaultConfig();
  config.gpx.imported = true;
  config.gpx.points = [
    { lat: 31, lon: 121 },
    { lat: 31.01, lon: 121.01 },
  ];
  config.gpx.rawPoints = config.gpx.points;
  config.mapCrop.mapCenterLat = 30;
  config.mapCrop.mapCenterLon = 120;

  const result = validateTrailInPrintArea(config, 800, 600);
  assert.equal(result.valid, false);
  assert.match(result.message ?? "", /打印区域/);
}

function testModelGenerationRequiresGpx(): void {
  const config = createDefaultConfig();
  config.gpx.imported = false;
  const result = validateModelGeneration(config);
  assert.equal(result.valid, false);
  assert.equal(result.scope, "gpx");
}

function testAssemblySectionPassesDefault(): void {
  const config = createDefaultConfig();
  assert.equal(validateAssemblySection(config).valid, true);
}

testMagnetDepthConflict();
testTrailOutsidePrintArea();
testModelGenerationRequiresGpx();
testAssemblySectionPassesDefault();
console.log("model-validation tests passed");
