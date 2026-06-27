import type { GeoBounds } from "./map-mm-projection";

export const ESRI_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const TILE_SIZE = 256;

export function lonLatToTileXY(
  lon: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

export function tileXToLon(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return (x / n) * 360 - 180;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = 2 ** zoom;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return (latRad * 180) / Math.PI;
}

export function tileRangeGeoBounds(
  tlX: number,
  tlY: number,
  brX: number,
  brY: number,
  zoom: number,
): GeoBounds {
  return {
    minLon: tileXToLon(tlX, zoom),
    maxLon: tileXToLon(brX + 1, zoom),
    maxLat: tileYToLat(tlY, zoom),
    minLat: tileYToLat(brY + 1, zoom),
  };
}

export function pickSatelliteZoom(
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
  targetPx: number,
): number {
  for (let z = 19; z >= 8; z--) {
    const tl = lonLatToTileXY(minLon, maxLat, z);
    const br = lonLatToTileXY(maxLon, minLat, z);
    const w = (br.x - tl.x + 1) * TILE_SIZE;
    const h = (br.y - tl.y + 1) * TILE_SIZE;
    if (Math.max(w, h) <= targetPx * 1.8) return z;
  }
  return 14;
}

export function esriTileUrl(z: number, x: number, y: number): string {
  return ESRI_TILE_URL.replace("{z}", String(z))
    .replace("{y}", String(y))
    .replace("{x}", String(x));
}
