import * as THREE from "three";
import type { TerrainCropRegion, TerrainHeightPreview } from "@shared/types/terrain";
import { sampleHeightBilinearMm } from "@shared/utils/heightfield-mesh";

const _localOrigin = new THREE.Vector3();
const _localDirection = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();

const maxSurfaceZCache = new WeakMap<TerrainHeightPreview, number>();

function maxSurfaceZ(preview: TerrainHeightPreview): number {
  let cached = maxSurfaceZCache.get(preview);
  if (cached != null) return cached;
  cached = preview.minSurfaceZ;
  for (let i = 0; i < preview.heights.length; i++) {
    const h = preview.heights[i]!;
    if (Number.isFinite(h) && h > cached) cached = h;
  }
  cached += 2;
  maxSurfaceZCache.set(preview, cached);
  return cached;
}

/**
 * 解析求交：射线与高度场求 (x,y)，避免对完整山体网格做 Raycaster。
 */
export function rayPickHeightfieldLocalMm(
  rayWorld: THREE.Ray,
  localFromWorld: THREE.Matrix4,
  crop: TerrainCropRegion,
  preview: TerrainHeightPreview,
): { xMm: number; yMm: number } | null {
  _invMatrix.copy(localFromWorld).invert();
  _localOrigin.copy(rayWorld.origin).applyMatrix4(_invMatrix);
  _localDirection.copy(rayWorld.direction).transformDirection(_invMatrix).normalize();

  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  const orig = _localOrigin;
  const dir = _localDirection;

  let tMin = 0;
  let tMax = 1e9;

  if (Math.abs(dir.x) > 1e-9) {
    const tx1 = (-hw - orig.x) / dir.x;
    const tx2 = (hw - orig.x) / dir.x;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  } else if (orig.x < -hw || orig.x > hw) {
    return null;
  }

  if (Math.abs(dir.y) > 1e-9) {
    const ty1 = (-hh - orig.y) / dir.y;
    const ty2 = (hh - orig.y) / dir.y;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  } else if (orig.y < -hh || orig.y > hh) {
    return null;
  }

  if (tMin > tMax || tMax < 0) return null;
  tMin = Math.max(tMin, 0);

  const minZ = preview.bottomZ - 1;
  const maxZ = maxSurfaceZ(preview);
  if (Math.abs(dir.z) > 1e-9) {
    const tz1 = (minZ - orig.z) / dir.z;
    const tz2 = (maxZ - orig.z) / dir.z;
    tMin = Math.max(tMin, Math.min(tz1, tz2));
    tMax = Math.min(tMax, Math.max(tz1, tz2));
  }

  if (tMin > tMax) return null;

  const heightAt = (x: number, y: number): number =>
    sampleHeightBilinearMm(
      x,
      y,
      preview.heights,
      preview.cols,
      preview.rows,
      crop,
      preview.minSurfaceZ,
    );

  const diffAt = (t: number): number => {
    const x = orig.x + dir.x * t;
    const y = orig.y + dir.y * t;
    const z = orig.z + dir.z * t;
    return z - heightAt(x, y);
  };

  let lo = tMin;
  let hi = tMax;
  let fLo = diffAt(lo);
  let fHi = diffAt(hi);

  if (fLo <= 0) {
    const hitX = orig.x + dir.x * lo;
    const hitY = orig.y + dir.y * lo;
    if (Math.abs(hitX) <= hw && Math.abs(hitY) <= hh) {
      return { xMm: hitX, yMm: hitY };
    }
  }

  if (fLo * fHi > 0) return null;

  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) * 0.5;
    const fMid = diffAt(mid);
    if (Math.abs(fMid) < 0.08) {
      lo = hi = mid;
      break;
    }
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  const t = (lo + hi) * 0.5;
  return {
    xMm: orig.x + dir.x * t,
    yMm: orig.y + dir.y * t,
  };
}
