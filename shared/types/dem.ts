/** OpenTopography Global DEM API 数据集（与 portal 参数 demtype 一致） */
export type OpenTopoDemType =
  | "COP30"
  | "COP90"
  | "NASADEM"
  | "SRTMGL1"
  | "SRTMGL3";

export const OPEN_TOPO_DEM_OPTIONS: ReadonlyArray<{
  value: OpenTopoDemType;
  label: string;
  hint: string;
}> = [
  { value: "COP30", label: "COP30 (30m)", hint: "默认推荐，Copernicus GLO-30" },
  { value: "COP90", label: "COP90 (90m)", hint: "更快、更粗" },
  { value: "NASADEM", label: "NASADEM", hint: "SRTM 衍生全球 DEM" },
  { value: "SRTMGL1", label: "SRTM 30m", hint: "经典 30m 全球覆盖" },
  { value: "SRTMGL3", label: "SRTM 90m", hint: "低分辨率" },
] as const;

export interface DemFetchOptions {
  dataset: OpenTopoDemType;
  /** OpenTopography API Key */
  openTopographyApiKey: string;
}
