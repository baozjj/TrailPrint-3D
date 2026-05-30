import * as THREE from "three";
import type {
  TerrainCropRegion,
  TerrainHeightPreview,
} from "@shared/types/terrain";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import { buildFootprintPolygonMm } from "@shared/utils/footprint";
import { buildHeightfieldTerrainMesh } from "@shared/utils/heightfield-mesh";

/** 在高度场（行优先 mm）上双线性采样表面 Z */
function sampleHeightPreviewZ(
  xMm: number,
  yMm: number,
  preview: TerrainHeightPreview,
  crop: TerrainCropRegion,
): number {
  const { cols, rows, heights } = preview;
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  const s = (xMm + hw) / Math.max(crop.widthMm, 1e-6);
  const t = (yMm + hh) / Math.max(crop.heightMm, 1e-6);
  const colF = s * (cols - 1);
  const rowF = t * (rows - 1);
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(colF)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(rowF)));
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);
  const fc = colF - c0;
  const fr = rowF - r0;
  const z00 = heights[r0 * cols + c0] ?? 0;
  const z10 = heights[r0 * cols + c1] ?? z00;
  const z01 = heights[r1 * cols + c0] ?? z00;
  const z11 = heights[r1 * cols + c1] ?? z10;
  const z0 = z00 * (1 - fc) + z10 * fc;
  const z1 = z01 * (1 - fc) + z11 * fc;
  return z0 * (1 - fr) + z1 * fr;
}

/** 3D 预览专用：沿轨迹生成贴地圆管，保证红色轨迹清晰可见 */
export function buildTrailTubeGeometry(
  polyline: Array<{ x: number; y: number }>,
  preview: TerrainHeightPreview,
  crop: TerrainCropRegion,
  widthMm: number,
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
  const tubularSegments = Math.max(32, Math.min(512, points.length * 4));
  const radialSegments = 8;
  return new THREE.TubeGeometry(
    curve,
    tubularSegments,
    radius,
    radialSegments,
    false,
  );
}

function createIndexAttribute(indices: number[]): THREE.BufferAttribute {
  let max = 0;
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i]!;
    if (v > max) max = v;
    if (max > 65535) {
      return new THREE.Uint32BufferAttribute(indices, 1);
    }
  }
  return new THREE.Uint16BufferAttribute(indices, 1);
}

export function payloadToBufferGeometry(
  payload: TerrainMeshPayload,
  options?: { terrain?: boolean },
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(payload.positions);
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(createIndexAttribute(payload.indices));

  if (options?.terrain && pos.length >= 3) {
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

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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
  return payloadToBufferGeometry(mesh, { terrain: true });
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
