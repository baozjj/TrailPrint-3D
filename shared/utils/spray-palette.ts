import type { SprayColorSlot } from "@shared/types/spray-paint";

/** categoryId: 0 rock, 1 building, 2 water, 3 sand, 4 dirt, 5 snow, 6 vegetation, 7 unknown */
export const SPRAY_CATEGORY_HEX: Record<number, string> = {
  0: "#F5E6A3", // 山体岩石 — 淡黄
  1: "#9E9E9E", // 建筑 — 灰
  2: "#3B82F6", // 水体 — 蓝
  3: "#D4A574", // 沙地 — 沙黄
  4: "#F5E6A3", // 土路 — 淡黄
  5: "#F8F8F8", // 雪地 — 白
  6: "#4A8F3A", // 植被 — 绿
  7: "#B0B0B0", // 未知 — 灰
};

/** 4 色合并：categoryId → regionId */
export const CATEGORY_TO_REGION_V1: Record<number, number> = {
  0: 2,
  1: 3,
  2: 1,
  3: 2,
  4: 2,
  5: 1,
  6: 0,
  7: 3,
};

export const SPRAY_COLOR_COUNT_MIN = 2;
export const SPRAY_COLOR_COUNT_MAX = 8;
export const SPRAY_COLOR_COUNT_DEFAULT = 4;

export function categoryToRegion(
  categoryId: number,
  colorCount: number,
): number {
  const cat = Math.max(0, Math.min(7, categoryId));
  if (colorCount >= 8) return cat;
  if (colorCount === 4) return CATEGORY_TO_REGION_V1[cat] ?? 3;
  return Math.min(
    Math.floor((cat * colorCount) / 8),
    colorCount - 1,
  );
}

export function defaultHexForRegion(
  regionId: number,
  colorCount: number,
): string {
  if (colorCount >= 8) {
    return SPRAY_CATEGORY_HEX[regionId] ?? "#B0B0B0";
  }
  if (colorCount === 4) {
    const map: Record<number, string> = {
      0: SPRAY_CATEGORY_HEX[6]!,
      1: SPRAY_CATEGORY_HEX[2]!,
      2: SPRAY_CATEGORY_HEX[0]!,
      3: SPRAY_CATEGORY_HEX[1]!,
    };
    return map[regionId] ?? "#B0B0B0";
  }
  const cat = Math.min(
    Math.floor((regionId * 8) / Math.max(colorCount, 1)),
    7,
  );
  return SPRAY_CATEGORY_HEX[cat] ?? "#B0B0B0";
}

export function buildDefaultColorSlots(colorCount: number): SprayColorSlot[] {
  const n = clampColorCount(colorCount);
  const slots: SprayColorSlot[] = [];
  for (let regionId = 0; regionId < n; regionId++) {
    slots.push({
      index: regionId + 1,
      regionId,
      hex: defaultHexForRegion(regionId, n),
      label: String(regionId + 1).padStart(2, "0"),
    });
  }
  return slots;
}

export function clampColorCount(count: number): number {
  return Math.max(
    SPRAY_COLOR_COUNT_MIN,
    Math.min(SPRAY_COLOR_COUNT_MAX, Math.round(count)),
  );
}
