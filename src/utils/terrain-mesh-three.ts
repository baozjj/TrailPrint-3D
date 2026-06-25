import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MapCropConfig } from "@shared/types/config";
import type {
  TerrainCropRegion,
  TerrainHeightPreview,
} from "@shared/types/terrain";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import { buildFootprintPolygonMm } from "@shared/utils/footprint";
import {
  buildHeightfieldTerrainMesh,
  sampleHeightBilinearMm,
} from "@shared/utils/heightfield-mesh";
import { projectToFootprintMm } from "@shared/utils/footprint";
import {
  geoToNormalizedUv,
  modelMmToLatLon,
  type GeoBounds,
} from "@shared/utils/map-mm-projection";

/** 在高度场（行优先 mm）上双线性采样表面 Z */
function sampleHeightPreviewZ(
  xMm: number,
  yMm: number,
  preview: TerrainHeightPreview,
  crop: TerrainCropRegion,
): number {
  const p = projectToFootprintMm(xMm, yMm, crop);
  return sampleHeightBilinearMm(
    p.x,
    p.y,
    preview.heights,
    preview.cols,
    preview.rows,
    crop,
    preview.minSurfaceZ,
  );
}

/** 3D 预览专用：沿轨迹生成贴地圆管，保证红色轨迹清晰可见 */
export function buildTrailTubeGeometry(
  polyline: Array<{ x: number; y: number }>,
  preview: TerrainHeightPreview,
  crop: TerrainCropRegion,
  widthMm: number,
  tubularSegments?: number,
): THREE.BufferGeometry | null {
  if (polyline.length < 2 || widthMm <= 0) return null;

  const liftMm = 0.35;
  const radius = Math.max(widthMm / 2, 0.6);
  const points: THREE.Vector3[] = [];

  for (const p of polyline) {
    const z = sampleHeightPreviewZ(p.x, p.y, preview, crop) + liftMm;
    points.push(new THREE.Vector3(p.x, p.y, z));
  }

  if (points.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.12);
  const segments =
    tubularSegments ??
    Math.max(32, Math.min(1024, points.length * 4));
  const radialSegments = 8;
  return new THREE.TubeGeometry(
    curve,
    segments,
    radius,
    radialSegments,
    false,
  );
}

/** 高精度网格顶点常 >65535，统一用 Uint32 避免索引截断导致「镂空」 */
function createIndexAttribute(indices: number[]): THREE.BufferAttribute {
  return new THREE.Uint32BufferAttribute(indices, 1);
}

function applyTerrainUvs(
  geometry: THREE.BufferGeometry,
  crop: TerrainCropRegion,
): void {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uvs[i * 2] = THREE.MathUtils.clamp((x + hw) / crop.widthMm, 0, 1);
    uvs[i * 2 + 1] = THREE.MathUtils.clamp((y + hh) / crop.heightMm, 0, 1);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

/** 按顶点经纬度映射卫星贴图 UV，与地图旋转后的 DEM 采样一致 */
export function applyTerrainGeoUvs(
  geometry: THREE.BufferGeometry,
  crop: TerrainCropRegion,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
  textureBounds: GeoBounds,
): void {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const geo = modelMmToLatLon(
      x,
      y,
      mapCrop,
      crop,
      viewportWidth,
      viewportHeight,
    );
    const { u, v } = geoToNormalizedUv(geo.lat, geo.lon, textureBounds);
    uvs[i * 2] = THREE.MathUtils.clamp(u, 0, 1);
    uvs[i * 2 + 1] = THREE.MathUtils.clamp(v, 0, 1);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

export function payloadToBufferGeometry(
  payload: TerrainMeshPayload,
  options?: {
    terrain?: boolean;
    crop?: TerrainCropRegion;
    /** 托盘等硬边 CAD 网格：不合并顶点，避免底面法线被拉歪产生杂色高光 */
    hardEdges?: boolean;
  },
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(payload.positions);
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(createIndexAttribute(payload.indices));

  if (options?.crop) {
    applyTerrainUvs(geometry, options.crop);
  } else if (options?.terrain && pos.length >= 3) {
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 2; i < pos.length; i += 3) {
      const z = pos[i]!;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const zSpan = Math.max(maxZ - minZ, 1);
    const colors = new Float32Array(pos.length);
    const low = new THREE.Color(0.28, 0.52, 0.34);
    const high = new THREE.Color(0.82, 0.76, 0.52);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.length; i += 3) {
      const t = THREE.MathUtils.clamp((pos[i + 2]! - minZ) / zSpan, 0, 1);
      tmp.copy(low).lerp(high, t);
      colors[i] = tmp.r;
      colors[i + 1] = tmp.g;
      colors[i + 2] = tmp.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  let result = geometry;
  if (!options?.hardEdges && options?.crop?.shape !== "polygon") {
    const mergeTol = options?.crop?.shape === "circle" ? 0.001 : 0.02;
    result = mergeVertices(geometry, mergeTol);
    geometry.dispose();
  }
  result.computeVertexNormals();
  result.normalizeNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** 在渲染进程由高度场重建山体（与主进程 STL 同源算法） */
export function buildTerrainGeometryFromPreview(
  crop: TerrainCropRegion,
  preview: TerrainHeightPreview,
): THREE.BufferGeometry {
  const mesh = buildHeightfieldTerrainMesh(
    crop,
    preview.heights,
    preview.cols,
    preview.rows,
    preview.baseThicknessMm,
  );
  return payloadToBufferGeometry(mesh, { crop });
}

export function createFootprintOutline(
  crop: TerrainCropRegion,
  z: number,
): THREE.LineLoop {
  const segments = 72;
  const points: THREE.Vector3[] = [];
  const polygon = buildFootprintPolygonMm(crop);

  if (polygon && polygon.length >= 3) {
    for (const p of polygon) {
      points.push(new THREE.Vector3(p.x, p.y, z));
    }
  } else if (crop.shape === "circle") {
    const r = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z));
    }
  } else {
    const hw = crop.widthMm / 2;
    const hh = crop.heightMm / 2;
    points.push(
      new THREE.Vector3(-hw, -hh, z),
      new THREE.Vector3(hw, -hh, z),
      new THREE.Vector3(hw, hh, z),
      new THREE.Vector3(-hw, hh, z),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
    }),
  );
}

export function disposeMeshGeometries(root: THREE.Object3D): void {
  root.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineLoop) {
      child.geometry.dispose();
    }
  });
}

export function fitCameraToTerrain(
  camera: THREE.PerspectiveCamera,
  controls: {
    target: THREE.Vector3;
    update: () => void;
    minDistance: number;
    maxDistance: number;
  },
  ...objects: THREE.Object3D[]
): void {
  const box = new THREE.Box3();
  for (const obj of objects) {
    box.expandByObject(obj);
  }
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, 40);
  const height = Math.max(size.z, 6);
  const dist = Math.max(span * 2.2, height * 5, 120);

  // Z 向上：从斜上方俯视山体，避免侧视把圆盘看成一条线
  const azimuth = Math.PI / 4;
  const elevation = 0.55;
  camera.position.set(
    center.x + dist * Math.cos(elevation) * Math.cos(azimuth),
    center.y + dist * Math.cos(elevation) * Math.sin(azimuth),
    center.z + dist * Math.sin(elevation),
  );
  controls.target.copy(center);
  camera.near = Math.max(0.5, span * 0.01);
  camera.far = dist * 25;
  camera.updateProjectionMatrix();
  controls.minDistance = span * 0.35;
  controls.maxDistance = dist * 8;
  controls.update();
}
