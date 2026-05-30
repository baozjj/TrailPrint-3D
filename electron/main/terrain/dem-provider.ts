import type { MapCropConfig } from "@shared/types/config";
import type { DemFetchOptions } from "@shared/types/dem";
import type { TerrainCropRegion } from "@shared/types/terrain";
import { heightfieldSampleGeo } from "@shared/utils/map-mm-projection";
import { sampleElevationsOpenTopography } from "./opentopography-provider";

export interface DemGrid {
  cols: number;
  rows: number;
  /** 行优先，单位米（WGS84 椭球高） */
  elevations: Float64Array;
  source: "opentopography";
}

export async function sampleDemGrid(
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
  options: DemFetchOptions,
): Promise<DemGrid> {
  const { lats, lons } = heightfieldSampleGeo(
    crop,
    cols,
    rows,
    mapCrop,
    viewportWidth,
    viewportHeight,
  );

  const elevations = await sampleElevationsOpenTopography(
    crop,
    options.dataset,
    options.openTopographyApiKey,
    lats,
    lons,
  );

  return { cols, rows, elevations, source: "opentopography" };
}
