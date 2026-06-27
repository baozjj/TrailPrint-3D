import { nativeImage } from "electron";
import type { MapCropConfig } from "@shared/types/config";
import type { TerrainCropRegion } from "@shared/types/terrain";
import {
  geoToNormalizedUv,
  heightfieldGeoBounds,
  heightfieldSampleGeo,
  type GeoBounds,
} from "@shared/utils/map-mm-projection";
import {
  esriTileUrl,
  lonLatToTileXY,
  pickSatelliteZoom,
  TILE_SIZE,
  tileRangeGeoBounds,
} from "@shared/utils/satellite-tiles";

const MAX_CANVAS_PX = 4096;

export interface GridRgbSample {
  r: number;
  g: number;
  b: number;
}

async function fetchTileBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`卫星瓦片请求失败 (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function blitBitmap(
  dest: Buffer,
  destW: number,
  destX: number,
  destY: number,
  src: Buffer,
  srcW: number,
  srcH: number,
): void {
  for (let y = 0; y < srcH; y++) {
    const dy = destY + y;
    if (dy < 0) continue;
    for (let x = 0; x < srcW; x++) {
      const dx = destX + x;
      if (dx < 0 || dx >= destW) continue;
      const srcIdx = (y * srcW + x) * 4;
      const destIdx = (dy * destW + dx) * 4;
      dest[destIdx] = src[srcIdx]!;
      dest[destIdx + 1] = src[srcIdx + 1]!;
      dest[destIdx + 2] = src[srcIdx + 2]!;
      dest[destIdx + 3] = 255;
    }
  }
}

function sampleBitmapRgb(
  bitmap: Buffer,
  width: number,
  height: number,
  px: number,
  py: number,
): GridRgbSample {
  const x = Math.max(0, Math.min(width - 1, px));
  const y = Math.max(0, Math.min(height - 1, py));
  const idx = (y * width + x) * 4;
  return {
    r: bitmap[idx + 2]!,
    g: bitmap[idx + 1]!,
    b: bitmap[idx]!,
  };
}

function sampleAtGeo(
  bitmap: Buffer,
  width: number,
  height: number,
  bounds: GeoBounds,
  lat: number,
  lon: number,
): GridRgbSample {
  const { u, v } = geoToNormalizedUv(lat, lon, bounds);
  const px = Math.round(u * (width - 1));
  const py = Math.round(v * (height - 1));
  return sampleBitmapRgb(bitmap, width, height, px, py);
}

export async function fetchGridSatelliteRgb(
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
): Promise<GridRgbSample[]> {
  const sampleBounds = heightfieldGeoBounds(
    crop,
    cols,
    rows,
    mapCrop,
    viewportWidth,
    viewportHeight,
  );
  const targetPx = Math.min(
    MAX_CANVAS_PX,
    Math.max(cols, rows) * 4,
  );
  const zoom = pickSatelliteZoom(
    sampleBounds.minLon,
    sampleBounds.maxLon,
    sampleBounds.minLat,
    sampleBounds.maxLat,
    targetPx,
  );
  const tl = lonLatToTileXY(sampleBounds.minLon, sampleBounds.maxLat, zoom);
  const br = lonLatToTileXY(sampleBounds.maxLon, sampleBounds.minLat, zoom);
  const tileCountX = br.x - tl.x + 1;
  const tileCountY = br.y - tl.y + 1;
  const canvasW = tileCountX * TILE_SIZE;
  const canvasH = tileCountY * TILE_SIZE;

  const bitmap = Buffer.alloc(canvasW * canvasH * 4, 255);
  const jobs: Array<Promise<void>> = [];

  for (let ty = 0; ty < tileCountY; ty++) {
    for (let tx = 0; tx < tileCountX; tx++) {
      const x = tl.x + tx;
      const y = tl.y + ty;
      const url = esriTileUrl(zoom, x, y);
      jobs.push(
        fetchTileBuffer(url).then((buf) => {
          const img = nativeImage.createFromBuffer(buf);
          const size = img.getSize();
          const tileBitmap = img.toBitmap();
          blitBitmap(
            bitmap,
            canvasW,
            tx * TILE_SIZE,
            ty * TILE_SIZE,
            tileBitmap,
            size.width,
            size.height,
          );
        }),
      );
    }
  }

  await Promise.all(jobs);

  const bounds = tileRangeGeoBounds(tl.x, tl.y, br.x, br.y, zoom);
  const { lats, lons } = heightfieldSampleGeo(
    crop,
    cols,
    rows,
    mapCrop,
    viewportWidth,
    viewportHeight,
  );

  const samples: GridRgbSample[] = [];
  for (let i = 0; i < lats.length; i++) {
    samples.push(
      sampleAtGeo(bitmap, canvasW, canvasH, bounds, lats[i]!, lons[i]!),
    );
  }
  return samples;
}
