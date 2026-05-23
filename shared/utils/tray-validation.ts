import type { AppConfig, TrayConfig } from "../types/config";
import type { TrayValidationResult } from "../types/tray";

export function validateTrayConfig(tray: TrayConfig): TrayValidationResult {
  if (tray.recessDepthMm >= tray.totalThicknessMm) {
    return {
      valid: false,
      message: "下陷深度必须小于总厚度",
    };
  }
  if (tray.recessDepthMm <= 0) {
    return { valid: false, message: "下陷深度必须大于 0" };
  }
  if (tray.totalThicknessMm <= 0) {
    return { valid: false, message: "总厚度必须大于 0" };
  }
  if (tray.rimWidthMm <= 0) {
    return { valid: false, message: "边框宽度必须大于 0" };
  }
  return { valid: true };
}

export function validateTrayFromAppConfig(
  config: AppConfig,
): TrayValidationResult {
  return validateTrayConfig(config.tray);
}
