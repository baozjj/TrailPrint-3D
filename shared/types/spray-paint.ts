import type { AppConfig } from "./config";
import type { TerrainCropRegion, TerrainHeightPreview, TerrainMeshPayload } from "./terrain";

export type SprayPaintSource = "rules" | "manual";

export interface SprayColorSlot {
  index: number;
  hex: string;
  /** 内部序号，UI 不展示文字标签 */
  label: string;
  description?: string;
  regionId: number;
}

export interface SprayPaintPlan {
  colors: SprayColorSlot[];
  /** 行优先 regionId，长度 = gridCols × gridRows */
  cellRegions: number[];
  gridCols: number;
  gridRows: number;
  source: SprayPaintSource;
  generatedAt: number;
  /** 是否使用了卫星图颜色（false 表示仅地形规则降级） */
  satelliteUsed: boolean;
  warning?: string;
}

export interface SpraySegmentRequest {
  config: AppConfig;
  heightPreview: TerrainHeightPreview;
  crop: TerrainCropRegion;
  viewportWidth: number;
  viewportHeight: number;
}

export interface SpraySegmentProgress {
  phase: "satellite" | "segment" | "smooth" | "masks" | "done";
  progress: number;
  message: string;
}

export interface SpraySegmentResponse {
  plan: SprayPaintPlan;
}

export interface SprayGenerateMasksRequest {
  config: AppConfig;
  plan: SprayPaintPlan;
  heightPreview: TerrainHeightPreview;
  crop: TerrainCropRegion;
}

export interface SprayMaskMeshPayload extends TerrainMeshPayload {
  colorIndex: number;
  regionId: number;
  fileName: string;
}

export interface SprayGenerateMasksResponse {
  masks: SprayMaskMeshPayload[];
  warnings: string[];
}

export type SprayMaskViewMode =
  | "terrain-colors"
  | "terrain-plus-mask"
  | "mask-only";

export interface SprayMaskUiState {
  viewMode: SprayMaskViewMode;
  /** 1-based colorIndex，null = 无选中 */
  activeMaskIndex: number | null;
  showAllMasks: boolean;
  /** 当前套合的罩 */
  fitMaskIndex: number | null;
}
