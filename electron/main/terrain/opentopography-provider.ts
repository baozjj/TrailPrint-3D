import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import type { OpenTopoDemType } from "@shared/types/dem";
import type { TerrainCropRegion } from "@shared/types/terrain";
import { IpcException } from "@shared/ipc/types";
import { createGeotiffSampler, type GeotiffSampler } from "./geotiff-sampler";

const OT_API = "https://portal.opentopography.org/API/globaldem";
const FETCH_TIMEOUT_MS = 120_000;

/** 解析 API Key：配置快照 → 环境变量 OPENTOPOGRAPHY_API_KEY */
export function resolveOpenTopoApiKey(fromConfig: string): string {
  const key =
    fromConfig.trim() || process.env.OPENTOPOGRAPHY_API_KEY?.trim() || "";
  if (!key) {
    throw new IpcException(
      "DEM_API_KEY_REQUIRED",
      "未配置 OpenTopography API Key，请在侧栏顶部填写",
    );
  }
  return key;
}

export interface OtBbox {
  south: number;
  north: number;
  west: number;
  east: number;
}

function padBbox(
  south: number,
  north: number,
  west: number,
  east: number,
): OtBbox {
  const latSpan = Math.max(north - south, 0.0005);
  const lonSpan = Math.max(east - west, 0.0005);
  const padLat = Math.max(latSpan * 0.08, 0.0008);
  const padLon = Math.max(lonSpan * 0.08, 0.0008);
  return {
    south: south - padLat,
    north: north + padLat,
    west: west - padLon,
    east: east + padLon,
  };
}

/** 下载 bbox 须覆盖全部 DEM 采样点（含多边形外接框角点、地图旋转后的网格角点） */
function bboxForDemSamples(
  crop: TerrainCropRegion,
  lats: number[],
  lons: number[],
): OtBbox {
  let south = crop.minLat;
  let north = crop.maxLat;
  let west = crop.minLon;
  let east = crop.maxLon;
  for (let i = 0; i < lats.length; i++) {
    south = Math.min(south, lats[i]!);
    north = Math.max(north, lats[i]!);
    west = Math.min(west, lons[i]!);
    east = Math.max(east, lons[i]!);
  }
  return padBbox(south, north, west, east);
}

function cacheDir(): string {
  return join(app.getPath("userData"), "dem-cache");
}

function cacheFilePath(
  demtype: OpenTopoDemType,
  bbox: OtBbox,
): string {
  const key = [
    demtype,
    bbox.south.toFixed(5),
    bbox.north.toFixed(5),
    bbox.west.toFixed(5),
    bbox.east.toFixed(5),
  ].join("_");
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(cacheDir(), `${demtype}_${hash}.tif`);
}

async function readCached(path: string): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(path);
    if (buf.byteLength < 1024) return null;
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch {
    return null;
  }
}

function parseOtErrorBody(text: string): string {
  const trimmed = text.trim().slice(0, 400);
  if (trimmed.includes("API_Key") || trimmed.includes("API key")) {
    return "OpenTopography API Key 无效或未填写";
  }
  if (trimmed.includes("rate") || trimmed.includes("limit")) {
    return "OpenTopography 请求受限，请稍后再试或更换 API Key";
  }
  if (trimmed.includes("area") || trimmed.includes("km")) {
    return "请求区域过大，请缩小地图范围";
  }
  return trimmed || "OpenTopography 返回错误";
}

async function downloadGeotiff(
  demtype: OpenTopoDemType,
  bbox: OtBbox,
  apiKey: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<ArrayBuffer> {
  const url = new URL(OT_API);
  url.searchParams.set("demtype", demtype);
  url.searchParams.set("south", String(bbox.south));
  url.searchParams.set("north", String(bbox.north));
  url.searchParams.set("west", String(bbox.west));
  url.searchParams.set("east", String(bbox.east));
  url.searchParams.set("outputFormat", "GTiff");
  url.searchParams.set("API_Key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    const contentType = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();

    if (!res.ok) {
      const detail = parseOtErrorBody(
        contentType.includes("json")
          ? new TextDecoder().decode(buf)
          : new TextDecoder().decode(buf.slice(0, 512)),
      );
      throw new IpcException("DEM_FETCH_FAILED", detail);
    }

    if (
      contentType.includes("xml") ||
      contentType.includes("html") ||
      buf.byteLength < 1024
    ) {
      const detail = parseOtErrorBody(new TextDecoder().decode(buf.slice(0, 800)));
      throw new IpcException("DEM_INVALID_FILE", detail);
    }

    return buf;
  } catch (err) {
    if (err instanceof IpcException) throw err;
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? "下载 OpenTopography 高程超时，请检查网络后重试"
        : "无法连接 OpenTopography，请检查网络或代理";
    throw new IpcException("DEM_FETCH_FAILED", msg);
  } finally {
    clearTimeout(timeout);
  }
}

let samplerMemo: { path: string; sampler: GeotiffSampler } | null = null;

async function loadSampler(
  demtype: OpenTopoDemType,
  bbox: OtBbox,
  apiKey: string,
  fetchTimeoutMs = FETCH_TIMEOUT_MS,
): Promise<GeotiffSampler> {
  await mkdir(cacheDir(), { recursive: true });
  const path = cacheFilePath(demtype, bbox);

  if (samplerMemo?.path === path) {
    return samplerMemo.sampler;
  }

  let buffer = await readCached(path);
  if (!buffer) {
    buffer = await downloadGeotiff(demtype, bbox, apiKey, fetchTimeoutMs);
    await writeFile(path, Buffer.from(buffer));
  }

  const sampler = await createGeotiffSampler(buffer);
  samplerMemo = { path, sampler };
  return sampler;
}

export async function sampleElevationsOpenTopography(
  crop: TerrainCropRegion,
  demtype: OpenTopoDemType,
  apiKey: string,
  lats: number[],
  lons: number[],
  options?: { fetchTimeoutMs?: number },
): Promise<Float64Array> {
  const key = resolveOpenTopoApiKey(apiKey);

  const bbox = bboxForDemSamples(crop, lats, lons);
  const sampler = await loadSampler(
    demtype,
    bbox,
    key,
    options?.fetchTimeoutMs,
  );
  const out = new Float64Array(lats.length);

  for (let i = 0; i < lats.length; i++) {
    const v = sampler.sample(lats[i]!, lons[i]!);
    // 栅格 nodata / 遮罩外角点：留 NaN，由 fillDemHoles 邻域填补
    out[i] = v === null || !Number.isFinite(v) ? NaN : v;
  }

  let validCount = 0;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i]!)) validCount++;
  }
  if (validCount === 0) {
    throw new IpcException(
      "DEM_FETCH_FAILED",
      "高程栅格在采样区域无有效值，请调整地图区域或更换 DEM 数据源",
    );
  }

  return out;
}

/** 清除进程内 GeoTIFF 采样器缓存（测试或切换 Key 后可选调用） */
export function clearOpenTopoSamplerMemo(): void {
  samplerMemo = null;
}
