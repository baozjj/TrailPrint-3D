import type { AppConfig } from "../types/config";

/** 托盘凹槽底面 Z (mm)，与 Tray_Base 坐标系一致（底面 Z=0） */
export function trayRecessFloorZMm(config: AppConfig): number {
  return config.tray.totalThicknessMm - config.tray.recessDepthMm;
}

/**
 * 预览/装配：将 Terrain_Main 平移至托盘凹槽内。
 * 地形网格底面在 Z = -baseSolidThicknessMm，平移后底面落在凹槽底面。
 */
export function computeTerrainAssemblyOffsetZMm(config: AppConfig): number {
  return trayRecessFloorZMm(config) + config.terrain.baseSolidThicknessMm;
}
