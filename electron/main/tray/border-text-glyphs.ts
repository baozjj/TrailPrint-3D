import type { Vec2 } from "./tray-footprint";

/** 5×7 点阵笔画（ASCII 子集）；其余字符用矩形轮廓回退 */
const ASCII_STROKES: Record<string, number[][]> = {
  " ": [],
  "-": [[1, 3, 3, 3]],
  "0": [
    [1, 0, 3, 0],
    [1, 6, 3, 6],
    [0, 1, 0, 5],
    [4, 1, 4, 5],
  ],
  "1": [[2, 0, 2, 6]],
  A: [
    [2, 0, 2, 6],
    [0, 6, 4, 6],
    [0, 3, 4, 3],
  ],
  B: [
    [0, 0, 0, 6],
    [0, 0, 3, 0],
    [0, 3, 3, 3],
    [0, 6, 3, 6],
    [3, 0, 4, 1],
    [3, 5, 4, 6],
    [3, 2, 4, 4],
  ],
};

function strokesForChar(ch: string): number[][] {
  const u = ch.toUpperCase();
  if (ASCII_STROKES[u]) return ASCII_STROKES[u]!;
  if (ASCII_STROKES[ch]) return ASCII_STROKES[ch]!;
  return [
    [0, 0, 4, 0],
    [4, 0, 4, 6],
    [4, 6, 0, 6],
    [0, 6, 0, 0],
  ];
}

function glyphStrokesBuiltin(
  ch: string,
  cellW: number,
  cellH: number,
): Vec2[][] {
  const strokes = strokesForChar(ch);
  const scaleX = cellW / 5;
  const scaleY = cellH / 7;
  return strokes.map((s) => [
    { x: s[0]! * scaleX, y: cellH - s[1]! * scaleY },
    { x: s[2]! * scaleX, y: cellH - s[3]! * scaleY },
  ]);
}

/**
 * 字符笔画折线（mm）。fontId 预留 opentype 扩展；当前使用内置字模 + 方框回退。
 */
export async function layoutCharacterStrokes(
  text: string,
  _fontId: string,
  fontSizeMm: number,
): Promise<Vec2[][]> {
  const strokes: Vec2[][] = [];
  const cellW = fontSizeMm * 0.55;
  const gap = fontSizeMm * 0.12;
  let ox = 0;
  for (const ch of text) {
    for (const seg of glyphStrokesBuiltin(ch, cellW, fontSizeMm)) {
      strokes.push([
        { x: seg[0]!.x + ox, y: seg[0]!.y },
        { x: seg[1]!.x + ox, y: seg[1]!.y },
      ]);
    }
    ox += cellW + gap;
  }
  return strokes;
}
