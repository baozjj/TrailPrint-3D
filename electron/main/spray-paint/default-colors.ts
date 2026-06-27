import type { SprayColorSlot } from "@shared/types/spray-paint";
import {
  buildDefaultColorSlots,
  categoryToRegion,
} from "@shared/utils/spray-palette";

export { categoryToRegion, buildDefaultColorSlots };

export function cloneDefaultColors(colorCount: number): SprayColorSlot[] {
  return buildDefaultColorSlots(colorCount);
}
