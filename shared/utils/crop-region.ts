import type { MapCropConfig } from "../types/config";
import type { TerrainCropRegion } from "../types/terrain";
import {
  buildMaskGeometry,
  type MaskScreenGeometry,
} from "./mask-geometry";
import { unprojectPoint } from "./map-projection";

export function physicalFootprintMm(mapCrop: MapCropConfig): {
  widthMm: number;
  heightMm: number;
  radiusMm?: number;
} {
  if (mapCrop.shape === "circle") {
    const d = mapCrop.radiusMm * 2;
    return { widthMm: d, heightMm: d, radiusMm: mapCrop.radiusMm };
  }
  if (mapCrop.shape === "rectangle") {
    return {
      widthMm: mapCrop.lengthMm,
      heightMm: mapCrop.widthMm,
    };
  }
  const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)));
  const side = mapCrop.polygonSideLengthMm;
  const r = side / (2 * Math.sin(Math.PI / n));
  return { widthMm: r * 2, heightMm: r * 2, radiusMm: r };
}

function maskBoundaryPoints(
  mask: MaskScreenGeometry,
  samples = 32,
): Array<{ x: number; y: number }> {
  if (mask.kind === "circle" && mask.r) {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      pts.push({
        x: mask.cx + mask.r * Math.cos(a),
        y: mask.cy + mask.r * Math.sin(a),
      });
    }
    return pts;
  }
  if (mask.kind === "rect" && mask.hw && mask.hh) {
    const { cx, cy, hw, hh } = mask;
    return [
      { x: cx - hw, y: cy - hh },
      { x: cx + hw, y: cy - hh },
      { x: cx + hw, y: cy + hh },
      { x: cx - hw, y: cy + hh },
    ];
  }
  if (mask.vertices?.length) {
    return mask.vertices.map((v) => ({ ...v }));
  }
  return [{ x: mask.cx, y: mask.cy }];
}

function rotateScreenPoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  bearingDeg: number,
): { x: number; y: number } {
  if (Math.abs(bearingDeg) < 0.01) return { x, y };
  const rad = (-bearingDeg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function computeTerrainCropRegion(
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
): TerrainCropRegion {
  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);
  const mask = buildMaskGeometry(mapCrop, w, h);
  const center = { lat: mapCrop.mapCenterLat, lon: mapCrop.mapCenterLon };
  const boundary = maskBoundaryPoints(mask);
  const geoPts = boundary.map((p) => {
    const unrot = rotateScreenPoint(
      p.x,
      p.y,
      w / 2,
      h / 2,
      mapCrop.mapBearingDeg,
    );
    return unprojectPoint(
      unrot.x,
      unrot.y,
      center,
      mapCrop.mapZoom,
      w,
      h,
    );
  });

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const g of geoPts) {
    minLat = Math.min(minLat, g.lat);
    maxLat = Math.max(maxLat, g.lat);
    minLon = Math.min(minLon, g.lon);
    maxLon = Math.max(maxLon, g.lon);
  }

  const footprint = physicalFootprintMm(mapCrop);

  return {
    shape: mapCrop.shape,
    centerLat: mapCrop.mapCenterLat,
    centerLon: mapCrop.mapCenterLon,
    bearingDeg: mapCrop.mapBearingDeg,
    minLat,
    maxLat,
    minLon,
    maxLon,
    widthMm: footprint.widthMm,
    heightMm: footprint.heightMm,
    radiusMm: footprint.radiusMm,
    polygonSides:
      mapCrop.shape === "polygon" ? mapCrop.polygonSides : undefined,
  };
}
