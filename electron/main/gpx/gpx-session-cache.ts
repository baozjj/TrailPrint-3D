import type { GpxImportResult } from "@shared/types/gpx";

/** 主进程最近一次 GPX 解析结果（避免 IPC 丢失轨迹点数组） */
let lastParse: GpxImportResult | null = null;

export function setGpxSessionCache(result: GpxImportResult): void {
  lastParse = result;
}

export function getGpxSessionCache(): GpxImportResult | null {
  return lastParse;
}

export function clearGpxSessionCache(): void {
  lastParse = null;
}
