/** 2D 凸多边形裁剪（Sutherland–Hodgman），用于将 DEM 方格三角化限制在打印轮廓内 */

export interface Vec2 {
  x: number;
  y: number;
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** 点 p 在有向边 a→b 的左侧（含边上）时为 inside */
function insideHalfPlane(
  p: Vec2,
  a: Vec2,
  b: Vec2,
): boolean {
  return cross2(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y) >= -1e-9;
}

function intersectSegments(
  p: Vec2,
  q: Vec2,
  a: Vec2,
  b: Vec2,
): Vec2 {
  const r = { x: q.x - p.x, y: q.y - p.y };
  const s = { x: b.x - a.x, y: b.y - a.y };
  const denom = cross2(r.x, r.y, s.x, s.y);
  if (Math.abs(denom) < 1e-12) return { x: p.x, y: p.y };
  const t = cross2(a.x - p.x, a.y - p.y, s.x, s.y) / denom;
  return { x: p.x + t * r.x, y: p.y + t * r.y };
}

/** 用凸裁剪多边形（CCW）裁剪 subject 多边形 */
export function clipPolygonConvex(
  subject: Vec2[],
  clip: Vec2[],
): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return [];
  let output = subject.slice();
  for (let i = 0; i < clip.length; i++) {
    const input = output;
    output = [];
    if (!input.length) break;
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const pin = insideHalfPlane(p, a, b);
      const qin = insideHalfPlane(q, a, b);
      if (pin) {
        if (!qin) output.push(intersectSegments(p, q, a, b));
        output.push(p);
      } else if (qin) {
        output.push(intersectSegments(p, q, a, b));
      }
    }
  }
  return output;
}

/** 圆盘用正 N 边形近似（CCW，从顶部开始） */
export function circleClipPolygon(
  radiusMm: number,
  segments = 96,
): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: radiusMm * Math.cos(a), y: radiusMm * Math.sin(a) });
  }
  return pts;
}

/** 矩形裁剪多边形（CCW） */
export function rectangleClipPolygon(hw: number, hh: number): Vec2[] {
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}
