import type { LabColor } from "@shared/utils/lab-color";
import { labDistance, rgbToLab } from "@shared/utils/lab-color";

/** categoryId: 0 rock, 1 building, 2 water, 3 sand, 4 dirt, 5 snow, 6 vegetation, 7 unknown */
export const CATEGORY_ANCHORS: Record<number, LabColor> = {
  0: { L: 45, a: 2, b: 8 },
  1: { L: 55, a: 0, b: -2 },
  2: { L: 35, a: -5, b: -25 },
  3: { L: 75, a: 2, b: 25 },
  4: { L: 50, a: 5, b: 15 },
  5: { L: 92, a: -1, b: 2 },
  6: { L: 42, a: -12, b: 10 },
};

/** 冲突消解优先级（高 → 低） */
export const CATEGORY_PRIORITY = [2, 5, 1, 3, 4, 0, 6, 7] as const;

const MATCH_THRESHOLD = 28;
const MIN_SCORE = 6;

export interface CategoryScoreInput {
  r: number;
  g: number;
  b: number;
  elevationNorm: number;
  slopeNorm: number;
  hasSatellite: boolean;
}

function terrainBonus(
  categoryId: number,
  elevationNorm: number,
  slopeNorm: number,
): number {
  switch (categoryId) {
    case 0:
      if (elevationNorm > 0.75 && slopeNorm > 0.5) return 14;
      if (elevationNorm > 0.55 && slopeNorm > 0.35) return 8;
      return 0;
    case 2:
      if (elevationNorm < 0.15 && slopeNorm < 0.2) return 16;
      if (elevationNorm < 0.25 && slopeNorm < 0.3) return 8;
      return 0;
    case 5:
      if (elevationNorm > 0.6 && slopeNorm < 0.35) return 10;
      return 0;
    case 6:
      if (elevationNorm > 0.15 && elevationNorm < 0.65 && slopeNorm < 0.45)
        return 8;
      return 0;
    case 4:
      if (slopeNorm < 0.25 && elevationNorm < 0.55) return 6;
      return 0;
    case 3:
      if (elevationNorm > 0.35 && elevationNorm < 0.75 && slopeNorm < 0.3)
        return 6;
      return 0;
    default:
      return 0;
  }
}

function scoreCategory(
  categoryId: number,
  lab: LabColor,
  input: CategoryScoreInput,
): number {
  const anchor = CATEGORY_ANCHORS[categoryId];
  if (!anchor) return 0;

  let score = Math.max(0, MATCH_THRESHOLD - labDistance(lab, anchor));
  score += terrainBonus(categoryId, input.elevationNorm, input.slopeNorm);

  if (!input.hasSatellite) {
    score *= categoryId === 7 ? 0 : 0.35;
    score += terrainBonus(categoryId, input.elevationNorm, input.slopeNorm);
  }

  return score;
}

export function classifyCategory(input: CategoryScoreInput): number {
  const lab = rgbToLab(input.r, input.g, input.b);
  const scores = new Map<number, number>();

  for (const categoryId of CATEGORY_PRIORITY) {
    if (categoryId === 7) continue;
    scores.set(categoryId, scoreCategory(categoryId, lab, input));
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [bestId, bestScore] = ranked[0] ?? [7, 0];

  if (bestScore < MIN_SCORE) return 7;

  const tied = ranked.filter(
    ([, score]) => Math.abs(score - bestScore) < 4,
  );
  if (tied.length <= 1) return bestId!;

  for (const priorityId of CATEGORY_PRIORITY) {
    if (tied.some(([id]) => id === priorityId)) return priorityId;
  }

  return bestId!;
}

export function classifyCategoryTerrainOnly(
  elevationNorm: number,
  slopeNorm: number,
): number {
  if (elevationNorm < 0.15 && slopeNorm < 0.2) return 2;
  if (elevationNorm > 0.75 && slopeNorm > 0.5) return 0;
  if (elevationNorm > 0.6 && slopeNorm < 0.3) return 5;
  if (elevationNorm > 0.45 && slopeNorm > 0.4) return 0;
  if (slopeNorm < 0.2 && elevationNorm < 0.4) return 4;
  if (elevationNorm > 0.35 && elevationNorm < 0.7 && slopeNorm < 0.35)
    return 6;
  return 7;
}
