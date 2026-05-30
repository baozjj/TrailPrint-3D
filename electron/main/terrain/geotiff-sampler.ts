import { fromArrayBuffer } from "geotiff";
import { IpcException } from "@shared/ipc/types";

const NODATA_CANDIDATES = new Set([-32768, -9999, -99999]);

export interface GeotiffSampler {
  sample(lat: number, lon: number): number | null;
}

/** 从 GeoTIFF 缓冲构建双线性采样器（WGS84 经纬度） */
export async function createGeotiffSampler(
  buffer: ArrayBuffer,
): Promise<GeotiffSampler> {
  let tiff;
  try {
    tiff = await fromArrayBuffer(buffer);
  } catch {
    throw new IpcException(
      "DEM_INVALID_FILE",
      "高程 GeoTIFF 无法解析，请检查 API Key 或缩小地图区域后重试",
    );
  }

  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  if (width < 2 || height < 2) {
    throw new IpcException("DEM_INVALID_FILE", "高程栅格尺寸过小");
  }

  const bbox = image.getBoundingBox();
  const [west, south, east, north] = bbox;
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north) ||
    east <= west ||
    north <= south
  ) {
    throw new IpcException(
      "DEM_INVALID_FILE",
      "高程 GeoTIFF 缺少有效地理范围",
    );
  }

  const rasters = await image.readRasters({ interleave: true });
  const values =
    rasters instanceof Float64Array
      ? rasters
      : rasters instanceof Float32Array
        ? rasters
        : rasters instanceof Int16Array
          ? new Float64Array(rasters)
          : rasters instanceof Int32Array
            ? new Float64Array(rasters)
            : new Float64Array(rasters as ArrayLike<number>);

  function readPixel(px: number, py: number): number | null {
    const ix = Math.max(0, Math.min(width - 1, px));
    const iy = Math.max(0, Math.min(height - 1, py));
    const v = values[iy * width + ix]!;
    if (!Number.isFinite(v) || NODATA_CANDIDATES.has(Math.round(v))) {
      return null;
    }
    return v;
  }

  function sample(lat: number, lon: number): number | null {
    if (lat < south || lat > north || lon < west || lon > east) {
      return null;
    }
    const fx = ((lon - west) / (east - west)) * (width - 1);
    const fy = ((north - lat) / (north - south)) * (height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const tx = fx - x0;
    const ty = fy - y0;

    const v00 = readPixel(x0, y0);
    const v10 = readPixel(x1, y0);
    const v01 = readPixel(x0, y1);
    const v11 = readPixel(x1, y1);
    const corners = [v00, v10, v01, v11].filter((v) => v !== null);
    if (corners.length === 0) return null;
    if (corners.length < 4) {
      return corners.reduce((a, b) => a! + b!, 0)! / corners.length;
    }
    const a = v00! * (1 - tx) + v10! * tx;
    const b = v01! * (1 - tx) + v11! * tx;
    return a * (1 - ty) + b * ty;
  }

  return { sample };
}
