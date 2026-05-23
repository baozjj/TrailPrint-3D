import type { TerrainCropRegion } from "@shared/types/terrain";

export type DemSource = "open-meteo" | "synthetic";

export interface DemGrid {
  cols: number;
  rows: number;
  /** 行优先，单位米（WGS84 椭球高） */
  elevations: Float64Array;
  source: DemSource;
}

const OPEN_METEO = "https://api.open-meteo.com/v1/elevation";

function hashCoord(lat: number, lon: number): number {
  const s = Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** 离线/请求失败时的合成 DEM（确定性） */
function syntheticElevationM(lat: number, lon: number): number {
  const h1 = hashCoord(lat * 80, lon * 80);
  const h2 = hashCoord(lat * 31 + 0.3, lon * 47);
  const h3 = hashCoord(lat * 17, lon * 113 + 0.7);
  const ridge = Math.sin((lon - lat) * 0.15) * 0.35 + 0.5;
  return (h1 * 120 + h2 * 80 + h3 * 40 + ridge * 60) - 30;
}

function gridLatLon(
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
): { lats: number[]; lons: number[] } {
  const lats: number[] = [];
  const lons: number[] = [];
  for (let row = 0; row < rows; row++) {
    const t = rows <= 1 ? 0.5 : row / (rows - 1);
    const lat = crop.minLat + (crop.maxLat - crop.minLat) * t;
    for (let col = 0; col < cols; col++) {
      const s = cols <= 1 ? 0.5 : col / (cols - 1);
      const lon = crop.minLon + (crop.maxLon - crop.minLon) * s;
      lats.push(lat);
      lons.push(lon);
    }
  }
  return { lats, lons };
}

const BATCH_SIZE = 80;

async function fetchOpenMeteoBatch(
  lats: number[],
  lons: number[],
): Promise<number[] | null> {
  const params = new URLSearchParams();
  for (let i = 0; i < lats.length; i++) {
    params.append("latitude", lats[i]!.toFixed(6));
    params.append("longitude", lons[i]!.toFixed(6));
  }
  const url = `${OPEN_METEO}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { elevation?: number[] };
    if (!Array.isArray(data.elevation) || data.elevation.length !== lats.length) {
      return null;
    }
    return data.elevation;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenMeteo(
  lats: number[],
  lons: number[],
): Promise<number[] | null> {
  if (lats.length === 0) return null;
  const out: number[] = [];
  for (let start = 0; start < lats.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, lats.length);
    const batch = await fetchOpenMeteoBatch(
      lats.slice(start, end),
      lons.slice(start, end),
    );
    if (!batch) return null;
    out.push(...batch);
  }
  return out;
}

export async function sampleDemGrid(
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
): Promise<DemGrid> {
  const { lats, lons } = gridLatLon(crop, cols, rows);
  const elevations = new Float64Array(cols * rows);

  const remote = await fetchOpenMeteo(lats, lons);
  if (remote && remote.length === elevations.length) {
    for (let i = 0; i < elevations.length; i++) {
      elevations[i] = remote[i] ?? syntheticElevationM(lats[i]!, lons[i]!);
    }
    return { cols, rows, elevations, source: "open-meteo" };
  }

  for (let i = 0; i < elevations.length; i++) {
    elevations[i] = syntheticElevationM(lats[i]!, lons[i]!);
  }
  return { cols, rows, elevations, source: "synthetic" };
}
