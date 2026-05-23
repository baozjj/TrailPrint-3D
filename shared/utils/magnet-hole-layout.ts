import type { AppConfig } from "../types/config";
import { physicalFootprintMm } from "./crop-region";

/** 磁铁孔中心 (mm)，与 Terrain_Main / Tray_Base 共用模型平面原点 */
export interface MagnetHole2D {
  x: number;
  y: number;
}

export interface MagnetHoleLayout {
  /** 拼接定位孔：主模型底面 + 托盘凹槽底面配对 */
  snapFit: MagnetHole2D[];
  /** 冰箱贴孔：托盘最底面 */
  fridge: MagnetHole2D[];
}

function snapFitPositionsCircle(radiusMm: number): MagnetHole2D[] {
  const r = radiusMm * 0.55;
  const holes: MagnetHole2D[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    holes.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return holes;
}

function snapFitPositionsRect(hw: number, hh: number): MagnetHole2D[] {
  const ix = hw * 0.55;
  const iy = hh * 0.55;
  return [
    { x: -ix, y: -iy },
    { x: ix, y: -iy },
    { x: ix, y: iy },
    { x: -ix, y: iy },
  ];
}

function fridgePositionsCircle(outerRadiusMm: number): MagnetHole2D[] {
  const r = outerRadiusMm * 0.72;
  const holes: MagnetHole2D[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    holes.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return holes;
}

function fridgePositionsRect(outerHw: number, outerHh: number): MagnetHole2D[] {
  const ix = outerHw * 0.72;
  const iy = outerHh * 0.72;
  return [
    { x: -ix, y: -iy },
    { x: ix, y: -iy },
    { x: ix, y: iy },
    { x: -ix, y: iy },
  ];
}

/**
 * 根据装配配置计算磁铁孔 XY；未启用或对应复选框未勾选时返回空数组。
 */
export function computeMagnetHoleLayout(config: AppConfig): MagnetHoleLayout {
  const { magnet } = config.assembly;
  if (!magnet.enabled) {
    return { snapFit: [], fridge: [] };
  }

  const foot = physicalFootprintMm(config.mapCrop);
  const terrainR = foot.radiusMm ?? foot.widthMm / 2;
  const terrainHw = foot.widthMm / 2;
  const terrainHh = foot.heightMm / 2;

  let snapFit: MagnetHole2D[] = [];
  if (magnet.snapFitHole) {
    if (config.mapCrop.shape === "rectangle") {
      snapFit = snapFitPositionsRect(terrainHw, terrainHh);
    } else {
      snapFit = snapFitPositionsCircle(terrainR);
    }
  }

  let fridge: MagnetHole2D[] = [];
  if (magnet.fridgeMagnetHole) {
    const { tray, assembly } = config;
    const tol = assembly.trayToleranceMm;
    const rim = tray.rimWidthMm;
    if (config.mapCrop.shape === "rectangle") {
      const outerHw = terrainHw + tol + rim;
      const outerHh = terrainHh + tol + rim;
      fridge = fridgePositionsRect(outerHw, outerHh);
    } else {
      const outerR = terrainR + tol + rim;
      fridge = fridgePositionsCircle(outerR);
    }
  }

  return { snapFit, fridge };
}
