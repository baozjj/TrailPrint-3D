<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TerrainGenerateResponse } from "@shared/types/terrain";
import { buildHeightfieldTerrainMesh } from "@shared/utils/heightfield-mesh";
import {
  buildTerrainGeometryFromPreview,
  buildTrailTubeGeometry,
  disposeMeshGeometries,
  fitCameraToTerrain,
  payloadToBufferGeometry,
} from "@/utils/terrain-mesh-three";
import { fetchSatelliteTextureForCrop } from "@/utils/satellite-imagery";
import { useConfigStore } from "@/stores/config";
import {
  terrainMeshQualitySpec,
  trailPreviewTubeSegments,
} from "@shared/utils/terrain-mesh-quality";
import { storeToRefs } from "pinia";

const configStore = useConfigStore();
const { config } = storeToRefs(configStore);

const props = defineProps<{
  result: TerrainGenerateResponse | null;
  generating?: boolean;
  error?: string | null;
  overlayLoading?: boolean;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const statusHint = ref<string | null>(null);
const imageryLoading = ref(false);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let terrainRoot: THREE.Group | null = null;
let overlayRoot: THREE.Group | null = null;
let terrainMaterial: THREE.MeshStandardMaterial | null = null;
let satelliteTexture: THREE.CanvasTexture | null = null;
let animationId = 0;
let resizeObserver: ResizeObserver | null = null;
let rebuildToken = 0;

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
  return `Esri 卫星影像 · DEM ${grid} · ${r.generationMs}ms`;
});

function disposeSatelliteTexture(): void {
  satelliteTexture?.dispose();
  satelliteTexture = null;
}

function ensureTerrainMaterial(): THREE.MeshStandardMaterial {
  if (!terrainMaterial) {
    terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }
  return terrainMaterial;
}

async function rebuildScene(): Promise<void> {
  if (!terrainRoot || !overlayRoot || !camera || !controls) return;

  const token = ++rebuildToken;

  disposeMeshGeometries(terrainRoot);
  disposeMeshGeometries(overlayRoot);
  terrainRoot.clear();
  overlayRoot.clear();
  statusHint.value = null;
  disposeSatelliteTexture();

  const r = props.result;
  if (!r?.heightPreview || !r.crop) return;

  const preview = r.heightPreview;
  if (preview.heights.length < preview.cols * preview.rows) {
    statusHint.value = "高度场数据不完整";
    return;
  }

  const terrainGeo = buildTerrainGeometryFromPreview(r.crop, preview);
  terrainGeo.computeVertexNormals();
  if (!terrainGeo.getIndex()?.count) {
    statusHint.value = "山体网格为空";
    terrainGeo.dispose();
    return;
  }

  const mat = ensureTerrainMaterial();
  mat.map = null;
  mat.vertexColors = false;
  mat.needsUpdate = true;

  const terrainMesh = new THREE.Mesh(terrainGeo, mat);
  terrainMesh.frustumCulled = false;
  terrainMesh.renderOrder = 0;
  terrainRoot.add(terrainMesh);

  imageryLoading.value = true;
  try {
    const texPx = terrainMeshQualitySpec(
      config.value.terrain.meshQuality,
      config.value.terrain.meshQualityCustom,
    ).texturePx;
    const canvas = await fetchSatelliteTextureForCrop(r.crop, texPx);
    if (token !== rebuildToken) return;
    disposeSatelliteTexture();
    satelliteTexture = new THREE.CanvasTexture(canvas);
    satelliteTexture.colorSpace = THREE.SRGBColorSpace;
    satelliteTexture.anisotropy = renderer
      ? Math.min(8, renderer.capabilities.getMaxAnisotropy())
      : 4;
    satelliteTexture.minFilter = THREE.LinearMipmapLinearFilter;
    satelliteTexture.magFilter = THREE.LinearFilter;
    satelliteTexture.needsUpdate = true;
    mat.map = satelliteTexture;
    mat.needsUpdate = true;
  } catch {
    if (token !== rebuildToken) return;
    terrainGeo.dispose();
    const meshPayload = buildHeightfieldTerrainMesh(
      r.crop,
      preview.heights,
      preview.cols,
      preview.rows,
      preview.baseThicknessMm,
    );
    terrainMesh.geometry = payloadToBufferGeometry(meshPayload, {
      terrain: true,
    });
    mat.map = null;
    mat.vertexColors = true;
    mat.needsUpdate = true;
    statusHint.value = "卫星影像加载失败，已使用地形着色";
  } finally {
    if (token === rebuildToken) imageryLoading.value = false;
  }

  if (token !== rebuildToken) return;

  const polyline = r.trailPolylineMm ?? [];
  const trailWidth = r.trailDisplayWidthMm ?? 4;

  if (polyline.length >= 2) {
    const tubeSegs = trailPreviewTubeSegments(polyline.length, {
      meshQuality: config.value.terrain.meshQuality,
      meshQualityCustom: config.value.terrain.meshQualityCustom,
    });
    const tubeGeo = buildTrailTubeGeometry(
      polyline,
      preview,
      r.crop,
      trailWidth,
      tubeSegs,
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
  scene.background = new THREE.Color(0x87b8d8);

  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500000);
  camera.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  terrainRoot = new THREE.Group();
  overlayRoot = new THREE.Group();
  scene.add(terrainRoot);
  scene.add(overlayRoot);

  scene.add(new THREE.HemisphereLight(0xdceefb, 0x4a5a48, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.65);
  sun.position.set(120, 80, 200);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.28);
  fill.position.set(-60, -40, 80);
  scene.add(fill);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.28;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI / 2 - 0.1;

  resize();
  void rebuildScene();
  animate();

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
}

function disposeThree(): void {
  cancelAnimationFrame(animationId);
  animationId = 0;
  rebuildToken++;
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
  disposeSatelliteTexture();
  terrainMaterial?.dispose();
  terrainMaterial = null;
  trailMaterial.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
}

watch(
  () => props.result,
  () => {
    void rebuildScene();
  },
  { deep: true },
);

onMounted(() => {
  const el = containerRef.value;
  if (el) initThree(el);
});

onUnmounted(() => {
  disposeThree();
});

defineExpose({ imageryLoading });
</script>

<template>
  <div class="terrain-preview">
    <div ref="containerRef" class="terrain-preview__viewport" />
    <div
      v-if="imageryLoading && !overlayLoading"
      class="terrain-preview__badge terrain-preview__badge--load"
    >
      正在加载卫星影像贴图…
    </div>
    <div
      v-else-if="generating && !overlayLoading"
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
      导入 GPX 后打开 3D 预览，将显示卫星影像贴图与真实地形
    </div>
    <div
      v-else-if="demLabel"
      class="terrain-preview__badge terrain-preview__badge--dim"
    >
      {{ demLabel }}
      <span> · 红=轨迹 · 拖动旋转</span>
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

.terrain-preview__badge--load {
  color: var(--tp-text-accent);
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
