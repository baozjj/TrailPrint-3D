import type { AppConfig, TrayConfig } from "../types/config";
import type { TrayValidationResult } from "../types/tray";
import { computeTrayCoverPolygon } from "./tray-nfc-layout";

const MIN_BOTTOM_FLOOR_MM = 0.3;

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

  if (tray.nfc?.enabled) {
    const nfc = tray.nfc;
    if (nfc.wallClearanceMm < 0) {
      return { valid: false, message: "NFC 距内壁距离不能为负" };
    }
    if (nfc.recessDepthMm <= 0) {
      return { valid: false, message: "NFC 下沉深度必须大于 0" };
    }
    if (nfc.ledExtraRecessDepthMm < 0) {
      return { valid: false, message: "LED 额外下沉深度不能为负" };
    }
    if (nfc.ledPocketLengthMm <= 0) {
      return { valid: false, message: "LED 安装腔长度必须大于 0" };
    }
    if (nfc.ledPocketWidthMm <= 0) {
      return { valid: false, message: "LED 安装腔宽度必须大于 0" };
    }
    if (nfc.coverThicknessMm <= 0) {
      return { valid: false, message: "盖片厚度必须大于 0" };
    }
    if (nfc.coverInsetMm < 0) {
      return { valid: false, message: "盖片内缩距离不能为负" };
    }
    const bottomSolidMm = tray.totalThicknessMm - tray.recessDepthMm;
    const maxLedDepth = bottomSolidMm - MIN_BOTTOM_FLOOR_MM;
    const maxNfcDepth = maxLedDepth - nfc.ledExtraRecessDepthMm;
    if (nfc.recessDepthMm > maxNfcDepth) {
      return {
        valid: false,
        message: `NFC 下沉深度过大（底面可用 ${bottomSolidMm.toFixed(1)} mm，请减小 NFC 或 LED 深度）`,
      };
    }
    if (nfc.recessDepthMm + nfc.ledExtraRecessDepthMm > maxLedDepth) {
      return {
        valid: false,
        message: "NFC 与 LED 合计下沉深度超过底面可用厚度",
      };
    }
  }

  return { valid: true };
}

export function validateTrayFromAppConfig(
  config: AppConfig,
): TrayValidationResult {
  const base = validateTrayConfig(config.tray);
  if (!base.valid) return base;

  if (config.tray.nfc.enabled && config.tray.nfc.coverInsetMm > 0) {
    const outline = computeTrayCoverPolygon(
      config,
      config.tray.nfc.coverInsetMm,
    );
    if (!outline) {
      return {
        valid: false,
        message: "盖片内缩过大，请减小内缩距离或增大打印尺寸",
      };
    }
  }

  return { valid: true };
}
