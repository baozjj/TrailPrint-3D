import { readFile } from 'fs/promises'
import type { GpxBounds, GpxPoint } from '@shared/types'
import type { GpxImportResult, GpxParseRequest } from '@shared/types/gpx'
import { IpcException } from '@shared/ipc/types'
import { computeTrackDistanceKm } from './distance'

const TRKPT_RE =
  /<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*\s+lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi
const TRKPT_RE_ALT =
  /<trkpt\s+[^>]*lon=["']([^"']+)["'][^>]*\s+lat=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi
const RTEPT_RE =
  /<rtept\s+[^>]*lat=["']([^"']+)["'][^>]*\s+lon=["']([^"']+)["'][^>]*\/?>/gi
const RTEPT_RE_ALT =
  /<rtept\s+[^>]*lon=["']([^"']+)["'][^>]*\s+lat=["']([^"']+)["'][^>]*\/?>/gi
const WPT_RE =
  /<wpt\s+[^>]*lat=["']([^"']+)["'][^>]*\s+lon=["']([^"']+)["'][^>]*\/?>/gi
const WPT_RE_ALT =
  /<wpt\s+[^>]*lon=["']([^"']+)["'][^>]*\s+lat=["']([^"']+)["'][^>]*\/?>/gi
const ELE_RE = /<ele>([^<]+)<\/ele>/i
const NAME_RE = /<name>([^<]+)<\/name>/i

function parseCoord(value: string): number {
  const n = parseFloat(value)
  if (Number.isNaN(n)) throw new IpcException('GPX_INVALID_COORD', '坐标格式无效')
  return n
}

function extractElevation(inner: string): number | undefined {
  const m = inner.match(ELE_RE)
  if (!m) return undefined
  const ele = parseFloat(m[1].trim())
  return Number.isNaN(ele) ? undefined : ele
}

function collectPoints(
  xml: string,
  reLatLon: RegExp,
  reLonLat: RegExp,
  withInner: boolean
): GpxPoint[] {
  const points: GpxPoint[] = []
  let m: RegExpExecArray | null

  const run = (re: RegExp, swap: boolean): void => {
    re.lastIndex = 0
    while ((m = re.exec(xml)) !== null) {
      const lat = parseCoord(swap ? m[2] : m[1])
      const lon = parseCoord(swap ? m[1] : m[2])
      const inner = withInner ? m[3] : ''
      const ele = withInner ? extractElevation(inner) : undefined
      points.push(ele !== undefined ? { lat, lon, ele } : { lat, lon })
    }
  }

  run(reLatLon, false)
  run(reLonLat, true)
  return points
}

function collectSimplePoints(xml: string, reLatLon: RegExp, reLonLat: RegExp): GpxPoint[] {
  const points: GpxPoint[] = []
  let m: RegExpExecArray | null

  const run = (re: RegExp, swap: boolean): void => {
    re.lastIndex = 0
    while ((m = re.exec(xml)) !== null) {
      points.push({
        lat: parseCoord(swap ? m[2] : m[1]),
        lon: parseCoord(swap ? m[1] : m[2])
      })
    }
  }

  run(reLatLon, false)
  run(reLonLat, true)
  return points
}

function dedupeAdjacent(points: GpxPoint[]): GpxPoint[] {
  if (points.length === 0) return points
  const out: GpxPoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    const prev = out[out.length - 1]
    if (p.lat === prev.lat && p.lon === prev.lon) continue
    out.push(p)
  }
  return out
}

function computeBounds(points: GpxPoint[]): GpxBounds {
  let minLat = points[0].lat
  let maxLat = points[0].lat
  let minLon = points[0].lon
  let maxLon = points[0].lon
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  return { minLat, maxLat, minLon, maxLon }
}

function extractTrackName(xml: string): string | undefined {
  const trkName = xml.match(/<trk>[\s\S]*?<name>([^<]+)<\/name>/i)
  if (trkName) return trkName[1].trim()
  const metaName = xml.match(/<metadata>[\s\S]*?<name>([^<]+)<\/name>/i)
  if (metaName) return metaName[1].trim()
  const docName = xml.match(NAME_RE)
  return docName ? docName[1].trim() : undefined
}

function parseGpxXml(xml: string, fileName?: string): GpxImportResult {
  const trimmed = xml.trim()
  if (!trimmed) {
    throw new IpcException('GPX_EMPTY', 'GPX 文件为空')
  }
  if (!trimmed.includes('<gpx') && !trimmed.includes('<trkpt') && !trimmed.includes('<wpt')) {
    throw new IpcException('GPX_INVALID_FORMAT', '不是有效的 GPX 文件')
  }

  let points = collectPoints(xml, TRKPT_RE, TRKPT_RE_ALT, true)
  if (points.length === 0) {
    points = collectSimplePoints(xml, RTEPT_RE, RTEPT_RE_ALT)
  }
  if (points.length === 0) {
    points = collectSimplePoints(xml, WPT_RE, WPT_RE_ALT)
  }

  points = dedupeAdjacent(points)

  if (points.length === 0) {
    throw new IpcException('GPX_NO_TRACK', '未找到轨迹点，请确认文件包含 trk/rte/wpt 数据')
  }

  const bounds = computeBounds(points)
  const distanceKm = computeTrackDistanceKm(points)
  const trackName = extractTrackName(xml) ?? fileName?.replace(/\.gpx$/i, '')

  return {
    points,
    bounds,
    trackName,
    pointCount: points.length,
    distanceKm,
    suggestedCenter: {
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lon: (bounds.minLon + bounds.maxLon) / 2
    }
  }
}

export async function parseGpxFile(req: GpxParseRequest): Promise<GpxImportResult> {
  let xml: string
  const fileName = req.fileName

  if (req.filePath) {
    try {
      xml = await readFile(req.filePath, 'utf-8')
    } catch {
      throw new IpcException('GPX_READ_FAILED', '无法读取 GPX 文件')
    }
  } else if (req.content) {
    xml = req.content
  } else {
    throw new IpcException('INVALID_REQUEST', '缺少 filePath 或 content')
  }

  return parseGpxXml(xml, fileName)
}
