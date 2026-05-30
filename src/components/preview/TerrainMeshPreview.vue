<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TerrainGenerateResponse } from "@shared/types/terrain";
import {
  buildTerrainGeometryFromPreview,
  buildTrailTubeGeometry,
  disposeMeshGeometries,
  fitCameraToTerrain,
  payloadToBufferGeometry,
} from "@/utils/terrain-mesh-three";

const props = defineProps<{
  result: TerrainGenerateResponse | null;
  generating?: boolean;
  error?: string | null;
  /** 弹窗模式：生成中不显示底部角标（由外层 loading 负责） */
  overlayLoading?: boolean;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const statusHint = ref<string | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let terrainRoot: THREE.Group | null = null;
let overlayRoot: THREE.Group | null = null;
let animationId = 0;
let resizeObserver: ResizeObserver | null = null;

const terrainMaterial = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  vertexColors: true,
  side: THREE.DoubleSide,
});

/** 预览轨迹：不受光照影响，避免被山体颜色淹没 */
const trailMaterial = new THREE.MeshBasicMaterial({
  color: 0xe84335,
  depthTest: true,
  depthWrite: true,
});

const demLabel = computed(() => {
  const r = props.result;
  if (!r) return "";
  const grid = r.heightPreview
    ? `${r.heightPreview.cols}×${r.heightPreview.rows}`
    : "";
  return `OpenTopography · ${grid} · ${r.generationMs}ms`;
});

function rebuildScene(): void {
  if (!terrainRoot || !overlayRoot || !camera || !controls) return;

  disposeMeshGeometries(terrainRoot);
  disposeMeshGeometries(overlayRoot);
  terrainRoot.clear();
  overlayRoot.clear();
  statusHint.value = null;

  const r = props.result;
  if (!r?.heightPreview || !r.crop) return;

  const preview = r.heightPreview;
  if (preview.heights.length < preview.cols * preview.rows) {
    statusHint.value = "高度场数据不完整";
    return;
  }

  const terrainGeo = buildTerrainGeometryFromPreview(r.crop, preview);
  if (!terrainGeo.getIndex()?.count) {
    statusHint.value = "山体网格为空";
    terrainGeo.dispose();
    return;
  }

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMaterial);
  terrainMesh.frustumCulled = false;
  terrainMesh.renderOrder = 0;
  terrainRoot.add(terrainMesh);

  const polyline = r.trailPolylineMm ?? [];
  const trailWidth = r.trailDisplayWidthMm ?? 4;

  if (polyline.length >= 2) {
    const tubeGeo = buildTrailTubeGeometry(
      polyline,
      preview,
      r.crop,
      trailWidth,
    );
    if (tubeGeo) {
      const tube = new THREE.Mesh(tubeGeo, trailMaterial);
      tube.frustumCulled = false;
      tube.renderOrder = 2;
      overlayRoot.add(tube);
    } else if (r.trailMesh?.positions?.length && r.trailMesh.indices?.length) {
      const trailGeo = payloadToBufferGeometry(r.trailMesh);
      const pos = trailGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let vi = 0; vi < pos.count; vi++) {
        pos.setZ(vi, pos.getZ(vi) + 0.35);
      }
      pos.needsUpdate = true;
      trailGeo.computeVertexNormals();
      const trail = new THREE.Mesh(trailGeo, trailMaterial);
      trail.frustumCulled = false;
      trail.renderOrder = 2;
      overlayRoot.add(trail);
    }
  } else if (r.trailMesh?.positions?.length) {
    statusHint.value = "轨迹折线为空，请检查 GPX 是否在白框内";
  }

  fitCameraToTerrain(camera, controls, terrainMesh, overlayRoot);
}

function resize(): void {
  const el = containerRef.value;
  if (!el || !renderer || !camera) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w < 8 || h < 8) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate(): void {
  animationId = requestAnimationFrame(animate);
  controls?.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function initThree(container: HTMLDivElement): void {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1c2e);

  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500000);
  camera.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  terrainRoot = new THREE.Group();
  overlayRoot = new THREE.Group();
  scene.add(terrainRoot);
  scene.add(overlayRoot);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(80, 60, 140);
  scene.add(sun);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI / 2 - 0.12;

  resize();
  rebuildScene();
  animate();

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
}

function disposeThree(): void {
  cancelAnimationFrame(animationId);
  animationId = 0;
  resizeObserver?.disconnect();
  resizeObserver = null;
  controls?.dispose();
  controls = null;
  if (terrainRoot) {
    disposeMeshGeometries(terrainRoot);
    terrainRoot.clear();
  }
  if (overlayRoot) {
    disposeMeshGeometries(overlayRoot);
    overlayRoot.clear();
  }
  terrainRoot = null;
  overlayRoot = null;
  terrainMaterial.dispose();
  trailMaterial.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
}

watch(
  () => props.result,
  () => rebuildScene(),
  { deep: true },
);

onMounted(() => {
  const el = containerRef.value;
  if (el) initThree(el);
});

onUnmounted(() => {
  disposeThree();
});
</script>

<template>
  <div class="terrain-preview">
    <div ref="containerRef" class="terrain-preview__viewport" />
    <div
      v-if="generating && !overlayLoading"
      class="terrain-preview__badge"
    >
      正在生成山体 3D 模型…
    </div>
    <div
      v-else-if="error"
      class="terrain-preview__badge terrain-preview__badge--err"
    >
      {{ error }}
    </div>
    <div
      v-else-if="statusHint"
      class="terrain-preview__badge terrain-preview__badge--err"
    >
      {{ statusHint }}
    </div>
    <div v-else-if="!result" class="terrain-preview__badge">
      导入 GPX 后将自动生成白框内山体预览
    </div>
    <div
      v-else-if="demLabel"
      class="terrain-preview__badge terrain-preview__badge--dim"
    >
      {{ demLabel }}
      <span> · 绿=山体 · 红=轨迹 · 拖动旋转</span>
    </div>
  </div>
</template>

<style scoped>
.terrain-preview {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.terrain-preview__viewport {
  width: 100%;
  height: 100%;
}

.terrain-preview__viewport :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.terrain-preview__badge {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--tp-text-secondary);
  pointer-events: none;
  z-index: 3;
  white-space: nowrap;
}

.terrain-preview__badge--err {
  color: #c62828;
  max-width: 85%;
  text-align: center;
  white-space: normal;
}

.terrain-preview__badge--dim {
  opacity: 0.88;
}
</style>
