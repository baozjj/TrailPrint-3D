import type { AppConfig } from "./config";

export const STL_FILE_NAMES = {
  terrainMain: "Terrain_Main.stl",
  trailLine: "Trail_Line.stl",
  trayBase: "Tray_Base.stl",
} as const;

export type ExportPhase =
  | "validate"
  | "terrain"
  | "tray"
  | "stl"
  | "zip"
  | "save"
  | "done";

export interface ExportGenerateRequest {
  config: AppConfig;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ExportProgress {
  phase: ExportPhase;
  /** 0–1 */
  progress: number;
  message: string;
}

export interface ExportGenerateResponse {
  /** 用户选择保存的路径；取消时为 undefined */
  savedPath?: string;
  cancelled: boolean;
  generationMs: number;
}
