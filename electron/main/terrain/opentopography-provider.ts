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
      "未配置 OpenTopography API Key，请在 .env 中设置 OPENTOPOGRAPHY_API_KEY",
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

function padBbox(crop: TerrainCropRegion): OtBbox {
  const latSpan = Math.max(crop.maxLat - crop.minLat, 0.0005);
  const lonSpan = Math.max(crop.maxLon - crop.minLon, 0.0005);
  const padLat = Math.max(latSpan * 0.08, 0.0008);
  const padLon = Math.max(lonSpan * 0.08, 0.0008);
  return {
    south: crop.minLat - padLat,
    north: crop.maxLat + padLat,
    west: crop.minLon - padLon,
    east: crop.maxLon + padLon,
  };
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
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
): Promise<GeotiffSampler> {
  await mkdir(cacheDir(), { recursive: true });
  const path = cacheFilePath(demtype, bbox);

  if (samplerMemo?.path === path) {
    return samplerMemo.sampler;
  }

  let buffer = await readCached(path);
  if (!buffer) {
    buffer = await downloadGeotiff(demtype, bbox, apiKey);
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
): Promise<Float64Array> {
  const key = resolveOpenTopoApiKey(apiKey);

  const bbox = padBbox(crop);
  const sampler = await loadSampler(demtype, bbox, key);
  const out = new Float64Array(lats.length);

  for (let i = 0; i < lats.length; i++) {
    const v = sampler.sample(lats[i]!, lons[i]!);
    if (v === null || !Number.isFinite(v)) {
      throw new IpcException(
        "DEM_FETCH_FAILED",
        "高程栅格在部分采样点无有效值，请调整地图区域或更换 DEM 数据源",
      );
    }
    out[i] = v;
  }

  return out;
}

/** 清除进程内 GeoTIFF 采样器缓存（测试或切换 Key 后可选调用） */
export function clearOpenTopoSamplerMemo(): void {
  samplerMemo = null;
}
