import type { MapCropConfig } from '@shared/types'

/**
 * 地图遮罩仅表达「形状 + 长宽比」，尺寸固定（相对画布）。
 * radiusMm / lengthMm / widthMm / polygonSideLengthMm 仅用于 STL 生成，不参与遮罩像素计算。
 */

/** 遮罩外接圆半径占画布短边的比例（固定视觉大小） */
const MASK_FILL_RATIO = 0.34

export interface MaskScreenGeometry {
  kind: 'circle' | 'rect' | 'polygon'
  cx: number
  cy: number
  /** 圆形半径 */
  r?: number
  /** 矩形半宽、半高（像素） */
  hw?: number
  hh?: number
  /** 正多边形顶点（相对画布坐标） */
  vertices?: Array<{ x: number; y: number }>
}

export function buildMaskGeometry(
  mapCrop: MapCropConfig,
  canvasW: number,
  canvasH: number
): MaskScreenGeometry {
  const cx = canvasW / 2
  const cy = canvasH / 2
  const baseR = Math.min(canvasW, canvasH) * MASK_FILL_RATIO

  if (mapCrop.shape === 'circle') {
    return { kind: 'circle', cx, cy, r: baseR }
  }

  if (mapCrop.shape === 'rectangle') {
    const ratio = mapCrop.lengthMm / Math.max(mapCrop.widthMm, 1)
    let hw: number
    let hh: number
    if (ratio >= 1) {
      hw = baseR * Math.min(ratio, 2)
      hh = baseR
    } else {
      hw = baseR
      hh = baseR / ratio
      hh = Math.min(hh, baseR * 2)
    }
    const scale = baseR / Math.max(hw, hh)
    hw *= scale
    hh *= scale
    return { kind: 'rect', cx, cy, hw, hh }
  }

  const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)))
  const vertices: Array<{ x: number; y: number }> = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    vertices.push({
      x: cx + baseR * Math.cos(a),
      y: cy + baseR * Math.sin(a)
    })
  }
  return { kind: 'polygon', cx, cy, vertices }
}

/** 正多边形 SVG 顶点列表（viewBox 像素坐标） */
export function maskPolygonPoints(vertices: Array<{ x: number; y: number }>): string {
  return vertices.map((v) => `${v.x},${v.y}`).join(' ')
}

/** SVG even-odd 路径：外框 + 中心镂空（用于固定屏幕遮罩层） */
export function maskEvenOddPath(
  mapCrop: MapCropConfig,
  width: number,
  height: number
): string {
  const m = buildMaskGeometry(mapCrop, width, height)
  const outer = `M 0 0 H ${width} V ${height} H 0 Z`
  let hole = ''
  if (m.kind === 'circle' && m.r) {
    const r = m.r
    hole = `M ${m.cx} ${m.cy} m -${r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`
  } else if (m.kind === 'rect' && m.hw && m.hh) {
    const x1 = m.cx - m.hw
    const y1 = m.cy - m.hh
    const x2 = m.cx + m.hw
    const y2 = m.cy + m.hh
    hole = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`
  } else if (m.vertices?.length) {
    hole =
      m.vertices
        .map((v, i) => (i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`))
        .join(' ') + ' Z'
  }
  return `${outer} ${hole}`
}

/** 仅镂空区域轮廓，用于白色虚线描边 */
export function maskHoleOutlinePath(
  mapCrop: MapCropConfig,
  width: number,
  height: number
): string {
  const m = buildMaskGeometry(mapCrop, width, height)
  if (m.kind === 'circle' && m.r) {
    const r = m.r
    return `M ${m.cx} ${m.cy} m -${r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`
  }
  if (m.kind === 'rect' && m.hw && m.hh) {
    const x1 = m.cx - m.hw
    const y1 = m.cy - m.hh
    const x2 = m.cx + m.hw
    const y2 = m.cy + m.hh
    return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`
  }
  if (m.vertices?.length) {
    return (
      m.vertices.map((v, i) => (i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`)).join(' ') +
      ' Z'
    )
  }
  return ''
}

export function traceMaskPath(ctx: CanvasRenderingContext2D, mask: MaskScreenGeometry): void {
  if (mask.kind === 'circle' && mask.r) {
    ctx.arc(mask.cx, mask.cy, mask.r, 0, Math.PI * 2)
    return
  }
  if (mask.kind === 'rect' && mask.hw && mask.hh) {
    ctx.rect(mask.cx - mask.hw, mask.cy - mask.hh, mask.hw * 2, mask.hh * 2)
    return
  }
  if (mask.kind === 'polygon' && mask.vertices?.length) {
    mask.vertices.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y)
      else ctx.lineTo(v.x, v.y)
    })
    ctx.closePath()
  }
}
