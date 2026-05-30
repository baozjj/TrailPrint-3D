import type { TerrainCropRegion } from "@shared/types/terrain";

const ESRI_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_SIZE = 256;
const MAX_TEXTURE_PX = 1024;

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

/**
 * 按裁剪区地理范围拼接 Esri 世界影像（与 2D 地图同源），供 3D 贴图。
 */
export async function fetchSatelliteTextureForCrop(
  crop: TerrainCropRegion,
  targetPx = MAX_TEXTURE_PX,
): Promise<HTMLCanvasElement> {
  const pad = 0.00015;
  const minLon = crop.minLon - pad;
  const maxLon = crop.maxLon + pad;
  const minLat = crop.minLat - pad;
  const maxLat = crop.maxLat + pad;

  const z = pickZoom(minLon, maxLon, minLat, maxLat, targetPx);
  const tl = lonLatToTileXY(minLon, maxLat, z);
  const br = lonLatToTileXY(maxLon, minLat, z);
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

  if (canvasW <= targetPx && canvasH <= targetPx) return canvas;

  const scale = targetPx / Math.max(canvasW, canvasH);
  const outW = Math.max(64, Math.round(canvasW * scale));
  const outH = Math.max(64, Math.round(canvasH * scale));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) return canvas;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(canvas, 0, 0, outW, outH);
  return out;
}
