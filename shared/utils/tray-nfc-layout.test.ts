import assert from "node:assert/strict";
import { createDefaultConfig } from "../types/config";
import { computeTrayFootprint } from "./tray-footprint";
import {
  computeTerrainPrintPolygon,
  computeTrayNfcCavityPolygon,
  computeTrayNfcLayout,
  insetTerrainPrintPolygon,
  LED_POCKET_DEFAULT_LENGTH_MM,
  LED_POCKET_DEFAULT_WIDTH_MM,
  ledPocketRect,
} from "./tray-nfc-layout";
import { regularPolygonCircumradiusMm } from "./footprint";
import { validateTrayConfig } from "./tray-validation";

function testHexagonInset(): void {
  const config = createDefaultConfig();
  config.mapCrop.shape = "polygon";
  config.mapCrop.polygonSides = 6;
  config.mapCrop.polygonSideLengthMm = 45;

  const print = computeTerrainPrintPolygon(config);
  assert.equal(print.verts.length, 6);
  const expectedR = regularPolygonCircumradiusMm(45, 6);
  const actualR = Math.hypot(print.verts[0]!.x, print.verts[0]!.y);
  assert.ok(Math.abs(actualR - expectedR) < 0.01);

  const inset = insetTerrainPrintPolygon(print, 1)!;
  assert.equal(inset.length, 6);
  const insetR = Math.hypot(inset[0]!.x, inset[0]!.y);
  assert.ok(insetR < actualR);
  const apothem = actualR * Math.cos(Math.PI / 6);
  const insetApothem = insetR * Math.cos(Math.PI / 6);
  assert.ok(Math.abs(insetApothem - (apothem - 1)) < 0.05);
}

function testNfcCavitySameShape(): void {
  const config = createDefaultConfig();
  config.mapCrop.shape = "polygon";
  config.mapCrop.polygonSides = 6;
  config.mapCrop.polygonSideLengthMm = 45;
  config.tray.nfc.wallClearanceMm = 1;
  const footprint = computeTrayFootprint(config);
  const cavity = computeTrayNfcCavityPolygon(config, footprint, 1)!;
  assert.equal(cavity.shape, "polygon");
  assert.equal(cavity.verts.length, 6);
}

function testNfcValidationDepth(): void {
  const tray = createDefaultConfig().tray;
  tray.nfc.enabled = true;
  tray.totalThicknessMm = 5;
  tray.recessDepthMm = 2;
  tray.nfc.recessDepthMm = 0.5;
  tray.nfc.ledExtraRecessDepthMm = 0.8;
  assert.equal(validateTrayConfig(tray).valid, true);

  tray.nfc.recessDepthMm = 3;
  assert.equal(validateTrayConfig(tray).valid, false);
}

function testLedPocketDimensions(): void {
  const rect = ledPocketRect(
    { cx: 0, cy: 0, angleRad: 0 },
    LED_POCKET_DEFAULT_LENGTH_MM,
    LED_POCKET_DEFAULT_WIDTH_MM,
  );
  assert.equal(rect.halfW, 2);
  assert.equal(rect.halfH, 1.25);
}

function testNfcLayoutDisabled(): void {
  const config = createDefaultConfig();
  const footprint = computeTrayFootprint(config);
  const layout = computeTrayNfcLayout(config, footprint, 800, 600);
  assert.equal(layout.cavity, null);
  assert.deepEqual(layout.ledPockets, []);
}

testHexagonInset();
testNfcCavitySameShape();
testNfcValidationDepth();
testLedPocketDimensions();
testNfcLayoutDisabled();
console.log("tray-nfc-layout tests passed");
