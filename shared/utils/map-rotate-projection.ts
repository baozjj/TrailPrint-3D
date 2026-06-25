/**
 * 与 leaflet-rotate 一致的屏幕 ↔ 图层坐标变换。
 * @see node_modules/leaflet-rotate/dist/leaflet-rotate-src.js
 */

export interface MapPaneState {
  /** 地图平移偏移 (px)，视口中心对准 mapCenter 时通常为 0 */
  mapPaneX?: number;
  mapPaneY?: number;
}

/** 绕 pivot 旋转（弧度），与 L.Point.rotateFrom 相同 */
export function rotateFrom(
  x: number,
  y: number,
  pivotX: number,
  pivotY: number,
  thetaRad: number,
): { x: number; y: number } {
  if (Math.abs(thetaRad) < 1e-9) return { x, y };
  const dx = x - pivotX;
  const dy = y - pivotY;
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  return {
    x: dx * c - dy * s + pivotX,
    y: dx * s + dy * c + pivotY,
  };
}

/** 绕原点旋转（弧度），与 L.Point.rotate 相同 */
export function rotateAroundOrigin(
  x: number,
  y: number,
  thetaRad: number,
): { x: number; y: number } {
  if (Math.abs(thetaRad) < 1e-9) return { x, y };
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  return {
    x: x * c - y * s,
    y: x * s + y * c,
  };
}

/** 视口像素中心（leaflet _getPixelCenter，mapPane 未偏移时即 w/2,h/2） */
export function pixelCenter(
  viewportWidth: number,
  viewportHeight: number,
  pane: MapPaneState = {},
): { x: number; y: number } {
  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);
  return {
    x: w / 2 - (pane.mapPaneX ?? 0),
    y: h / 2 - (pane.mapPaneY ?? 0),
  };
}

/**
 * 由 bearing 推算 rotatePanePos（leaflet setBearing 自 (0,0) 起算）。
 */
export function computeRotatePanePos(
  bearingDeg: number,
  viewportWidth: number,
  viewportHeight: number,
  pane: MapPaneState = {},
): { x: number; y: number } {
  const center = pixelCenter(viewportWidth, viewportHeight, pane);
  const theta = (bearingDeg * Math.PI) / 180;
  return rotateFrom(0, 0, center.x, center.y, theta);
}

/** layerPoint → containerPoint（leaflet layerPointToContainerPoint） */
export function layerPointToContainerPoint(
  layerX: number,
  layerY: number,
  bearingDeg: number,
  viewportWidth: number,
  viewportHeight: number,
  pane: MapPaneState = {},
): { x: number; y: number } {
  const rp = computeRotatePanePos(
    bearingDeg,
    viewportWidth,
    viewportHeight,
    pane,
  );
  const theta = (bearingDeg * Math.PI) / 180;
  const q = rotateFrom(layerX + rp.x, layerY + rp.y, rp.x, rp.y, theta);
  return {
    x: q.x + (pane.mapPaneX ?? 0),
    y: q.y + (pane.mapPaneY ?? 0),
  };
}

/** containerPoint → layerPoint（leaflet containerPointToLayerPoint） */
export function containerPointToLayerPoint(
  containerX: number,
  containerY: number,
  bearingDeg: number,
  viewportWidth: number,
  viewportHeight: number,
  pane: MapPaneState = {},
): { x: number; y: number } {
  const rp = computeRotatePanePos(
    bearingDeg,
    viewportWidth,
    viewportHeight,
    pane,
  );
  const theta = (bearingDeg * Math.PI) / 180;
  const p = {
    x: containerX - (pane.mapPaneX ?? 0),
    y: containerY - (pane.mapPaneY ?? 0),
  };
  const q = rotateFrom(p.x, p.y, rp.x, rp.y, -theta);
  return { x: q.x - rp.x, y: q.y - rp.y };
}
