import type { MapCropConfig } from "@shared/types/config";
import type { TerrainCropRegion } from "@shared/types/terrain";
import type { GeoBounds } from "@shared/utils/map-mm-projection";
import { heightfieldGeoBounds } from "@shared/utils/map-mm-projection";

const ESRI_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_SIZE = 256;
/** 单张卫星贴图最长边上限，避免超出常见 GPU 纹理限制 */
const MAX_TEXTURE_PX = 8192;

export type SatelliteTextureGeoBounds = GeoBounds;

export interface SatelliteTextureFetchOptions {
  mapCrop: MapCropConfig;
  viewportWidth: number;
  viewportHeight: number;
  gridCols: number;
  gridRows: number;
}

export interface SatelliteTextureResult {
  canvas: HTMLCanvasElement;
  /** 拼接画布实际覆盖的地理范围（与 UV 计算一致） */
  bounds: SatelliteTextureGeoBounds;
}

function lonLatToTileXY(
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

function tileXToLon(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return (x / n) * 360 - 180;
}

function tileYToLat(y: number, zoom: number): number {
  const n = 2 ** zoom;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return (latRad * 180) / Math.PI;
}

function tileRangeGeoBounds(
  tlX: number,
  tlY: number,
  brX: number,
  brY: number,
  zoom: number,
): SatelliteTextureGeoBounds {
  return {
    minLon: tileXToLon(tlX, zoom),
    maxLon: tileXToLon(brX + 1, zoom),
    maxLat: tileYToLat(tlY, zoom),
    minLat: tileYToLat(brY + 1, zoom),
  };
}

function pickZoom(
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

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("卫星瓦片加载失败"));
    img.src = url;
  });
}

/** 与 fetchSatelliteTextureForCrop 使用同一套瓦片范围，供 UV 预计算 */
export function planSatelliteTextureForCrop(
  crop: TerrainCropRegion,
  targetPx: number,
  options: SatelliteTextureFetchOptions,
): {
  bounds: SatelliteTextureGeoBounds;
  zoom: number;
  cappedPx: number;
} {
  const cappedPx = Math.min(Math.max(256, targetPx), MAX_TEXTURE_PX);
  const sampleBounds = heightfieldGeoBounds(
    crop,
    options.gridCols,
    options.gridRows,
    options.mapCrop,
    options.viewportWidth,
    options.viewportHeight,
  );
  const z = pickZoom(
    sampleBounds.minLon,
    sampleBounds.maxLon,
    sampleBounds.minLat,
    sampleBounds.maxLat,
    cappedPx,
  );
  const tl = lonLatToTileXY(sampleBounds.minLon, sampleBounds.maxLat, z);
  const br = lonLatToTileXY(sampleBounds.maxLon, sampleBounds.minLat, z);
  return {
    bounds: tileRangeGeoBounds(tl.x, tl.y, br.x, br.y, z),
    zoom: z,
    cappedPx,
  };
}

/**
 * 按裁剪区地理范围拼接 Esri 世界影像（与 2D 地图同源），供 3D 贴图。
 * UV 须用返回的 bounds + 顶点经纬度（见 applyTerrainGeoUvs）。
 */
export async function fetchSatelliteTextureForCrop(
  crop: TerrainCropRegion,
  targetPx = 2048,
  options: SatelliteTextureFetchOptions,
): Promise<SatelliteTextureResult> {
  const plan = planSatelliteTextureForCrop(crop, targetPx, options);
  const z = plan.zoom;
  const cappedPx = plan.cappedPx;
  const sampleBounds = heightfieldGeoBounds(
    crop,
    options.gridCols,
    options.gridRows,
    options.mapCrop,
    options.viewportWidth,
    options.viewportHeight,
  );
  const tl = lonLatToTileXY(sampleBounds.minLon, sampleBounds.maxLat, z);
  const br = lonLatToTileXY(sampleBounds.maxLon, sampleBounds.minLat, z);
  const tileCountX = br.x - tl.x + 1;
  const tileCountY = br.y - tl.y + 1;

  const canvasW = tileCountX * TILE_SIZE;
  const canvasH = tileCountY * TILE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建影像画布");

  const jobs: Array<Promise<void>> = [];
  for (let ty = 0; ty < tileCountY; ty++) {
    for (let tx = 0; tx < tileCountX; tx++) {
      const x = tl.x + tx;
      const y = tl.y + ty;
      const url = ESRI_TILE.replace("{z}", String(z))
        .replace("{y}", String(y))
        .replace("{x}", String(x));
      jobs.push(
        loadTile(url).then((img) => {
          ctx.drawImage(img, tx * TILE_SIZE, ty * TILE_SIZE);
        }),
      );
    }
  }

  await Promise.all(jobs);

  let outCanvas = canvas;
  if (canvasW > cappedPx || canvasH > cappedPx) {
    const scale = cappedPx / Math.max(canvasW, canvasH);
    const outW = Math.max(64, Math.round(canvasW * scale));
    const outH = Math.max(64, Math.round(canvasH * scale));
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d");
    if (octx) {
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(canvas, 0, 0, outW, outH);
      outCanvas = out;
    }
  }

  return { canvas: outCanvas, bounds: plan.bounds };
}
