import type { AppConfig } from "./config";
import type { TerrainMeshPayload } from "./terrain";

/** Tray_Base 轻量网格（与 TerrainMeshPayload 同构） */
export type TrayMeshPayload = TerrainMeshPayload;

export interface TrayGenerateRequest {
  config: AppConfig;
}

export interface TrayGenerateResponse {
  mesh: TrayMeshPayload;
  generationMs: number;
  /** 是否包含边框文字几何 */
  hasBorderText: boolean;
}

export interface TrayValidationResult {
  valid: boolean;
  message?: string;
}
