import type { AppConfig, BaseShape } from "../types/config";
import { physicalFootprintMm } from "./crop-region";
import { regularPolygonVertexAngleRad } from "./footprint";
import {
  clampCornerRadiusMm,
  roundedRectanglePolygon,
  roundedRegularPolygon,
} from "./rounded-footprint";

export interface Vec2 {
  x: number;
  y: number;
}

/** 托盘顶视轮廓（地形外扩 rim / 凹槽公差后的真实几何） */
export interface TrayFootprint {
  shape: BaseShape;
  /** 托盘外轮廓（顶视） */
  outer: Vec2[];
  /** 主模型容纳凹槽内轮廓（含托盘公差） */
  recessInner: Vec2[];
  outerRadius?: number;
  recessRadius?: number;
  outerHw?: number;
  outerHh?: number;
  recessHw?: number;
  recessHh?: number;
}

function regularPolygonVertices(n: number, radius: number): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = regularPolygonVertexAngleRad(i, n);
    verts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return verts;
}

function scaleVerts(verts: Vec2[], scale: number): Vec2[] {
  return verts.map((v) => ({ x: v.x * scale, y: v.y * scale }));
}

/**
 * 托盘外廓 = 地形打印轮廓外扩 rim；凹槽 = 地形轮廓外扩 trayTolerance。
 * 磁铁孔、托盘网格均以此轮廓为唯一几何来源。
 */
export function computeTrayFootprint(config: AppConfig): TrayFootprint {
  const { mapCrop, tray, assembly } = config;
  const tol = assembly.trayToleranceMm;
  const rim = tray.rimWidthMm;
  const foot = physicalFootprintMm(mapCrop);

  if (mapCrop.shape === "circle") {
    const terrainR = foot.radiusMm ?? foot.widthMm / 2;
    const recessR = terrainR + tol;
    const outerR = recessR + rim;
    return {
      shape: "circle",
      outer: regularPolygonVertices(48, outerR),
      recessInner: regularPolygonVertices(48, recessR),
      outerRadius: outerR,
      recessRadius: recessR,
    };
  }

  if (mapCrop.shape === "rectangle") {
    const terrainHw = mapCrop.lengthMm / 2;
    const terrainHh = mapCrop.widthMm / 2;
    const cornerR = clampCornerRadiusMm(mapCrop.cornerRadiusMm, mapCrop);
    const recessHw = terrainHw + tol;
    const recessHh = terrainHh + tol;
    const outerHw = recessHw + rim;
    const outerHh = recessHh + rim;
    return {
      shape: "rectangle",
      outer: roundedRectanglePolygon(outerHw, outerHh, cornerR + tol + rim),
      recessInner: roundedRectanglePolygon(recessHw, recessHh, cornerR + tol),
      outerHw,
      outerHh,
      recessHw,
      recessHh,
    };
  }

  const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)));
  const terrainR = foot.radiusMm ?? foot.widthMm / 2;
  const cornerR = clampCornerRadiusMm(mapCrop.cornerRadiusMm, mapCrop);
  const terrainVerts = roundedRegularPolygon(n, terrainR, cornerR);
  const recessScale = (terrainR + tol) / terrainR;
  const outerScale = (terrainR + tol + rim) / terrainR;
  return {
    shape: "polygon",
    outer: scaleVerts(terrainVerts, outerScale),
    recessInner: scaleVerts(terrainVerts, recessScale),
    outerRadius: terrainR + tol + rim,
    recessRadius: terrainR + tol,
  };
}
