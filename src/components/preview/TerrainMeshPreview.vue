<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TerrainGenerateResponse } from "@shared/types/terrain";
import { computeTerrainAssemblyOffsetZMm } from "@shared/utils/assembly-layout";
import {
  buildTerrainGeometryFromPreview,
  buildTrailTubeGeometry,
  disposeMeshGeometries,
  fitCameraToTerrain,
  payloadToBufferGeometry,
} from "@/utils/terrain-mesh-three";
import { useConfigStore } from "@/stores/config";
import type { TrayMeshPayload } from "@shared/types/tray";
import {
  trailPreviewTubeSegments,
} from "@shared/utils/terrain-mesh-quality";
import { storeToRefs } from "pinia";

const configStore = useConfigStore();
const { config } = storeToRefs(configStore);

const props = defineProps<{
  result: TerrainGenerateResponse | null;
  trayMesh?: TrayMeshPayload | null;
  generating?: boolean;
  error?: string | null;
  overlayLoading?: boolean;
}>();

const emit = defineEmits<{
  "scene-loading-change": [loading: boolean];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const statusHint = ref<string | null>(null);
const imageryLoading = ref(false);
const sceneBuilding = ref(false);

function syncSceneLoading(): void {
  emit("scene-loading-change", sceneBuilding.value || imageryLoading.value);
}

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let trayRoot: THREE.Group | null = null;
let terrainRoot: THREE.Group | null = null;
let overlayRoot: THREE.Group | null = null;
let terrainMaterial: THREE.MeshStandardMaterial | null = null;
let trayMaterial: THREE.MeshLambertMaterial | null = null;
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
  return `3D 地形预览 · DEM ${grid} · ${r.generationMs}ms`;
});

function disposeSatelliteTexture(): void {
  satelliteTexture?.dispose();
  satelliteTexture = null;
}

function ensureTerrainMaterial(): THREE.MeshStandardMaterial {
  if (!terrainMaterial) {
    terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3ead6,
      roughness: 0.88,
      metalness: 0.01,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }
  return terrainMaterial;
}

function ensureTrayMaterial(): THREE.MeshLambertMaterial {
  if (!trayMaterial) {
    // 预览需 360° 环视：双面 + 哑光 Lambert，避免底面被 FrontSide 剔除
    trayMaterial = new THREE.MeshLambertMaterial({
      color: 0x5c6670,
      flatShading: true,
      side: THREE.DoubleSide,
    });
  }
  return trayMaterial;
}

async function rebuildScene(): Promise<void> {
  if (!trayRoot || !terrainRoot || !overlayRoot || !camera || !controls) return;

  const token = ++rebuildToken;
  sceneBuilding.value = true;
  syncSceneLoading();

  disposeMeshGeometries(trayRoot);
  disposeMeshGeometries(terrainRoot);
  disposeMeshGeometries(overlayRoot);
  trayRoot.clear();
  terrainRoot.clear();
  overlayRoot.clear();
  trayRoot.position.z = 0;
  terrainRoot.position.z = 0;
  overlayRoot.position.z = 0;
  statusHint.value = null;
  disposeSatelliteTexture();

  const r = props.result;
  if (!r?.heightPreview || !r.crop) {
    sceneBuilding.value = false;
    syncSceneLoading();
    return;
  }

  const preview = r.heightPreview;
  if (preview.heights.length < preview.cols * preview.rows) {
    statusHint.value = "高度场数据不完整";
    sceneBuilding.value = false;
    syncSceneLoading();
    return;
  }

  const terrainGeo = buildTerrainGeometryFromPreview(r.crop, preview);
  terrainGeo.computeVertexNormals();
  if (!terrainGeo.getIndex()?.count) {
    statusHint.value = "山体网格为空";
    terrainGeo.dispose();
    sceneBuilding.value = false;
    syncSceneLoading();
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

  imageryLoading.value = false;
  syncSceneLoading();

  if (token !== rebuildToken) return;

  const assemblyOffsetZ = computeTerrainAssemblyOffsetZMm(config.value);
  terrainRoot.position.z = assemblyOffsetZ;
  overlayRoot.position.z = assemblyOffsetZ;

  const tray = props.trayMesh;
  if (tray?.positions?.length && tray.indices?.length) {
    const trayGeo = payloadToBufferGeometry(tray, { hardEdges: true });
    const trayObj = new THREE.Mesh(trayGeo, ensureTrayMaterial());
    trayObj.frustumCulled = false;
    trayObj.renderOrder = -1;
    trayRoot.add(trayObj);
  }

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

  const fitTargets: THREE.Object3D[] = [terrainMesh, overlayRoot];
  if (trayRoot.children.length > 0) fitTargets.unshift(trayRoot);
  fitCameraToTerrain(camera, controls, ...fitTargets);

  if (token === rebuildToken) {
    sceneBuilding.value = false;
    syncSceneLoading();
  }
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

  trayRoot = new THREE.Group();
  terrainRoot = new THREE.Group();
  overlayRoot = new THREE.Group();
  scene.add(trayRoot);
  scene.add(terrainRoot);
  scene.add(overlayRoot);

  scene.add(new THREE.HemisphereLight(0xdceefb, 0x4a5a48, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.65);
  sun.position.set(120, 80, 200);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.28);
  fill.position.set(-60, -40, 80);
  scene.add(fill);
  const under = new THREE.DirectionalLight(0xd8e4ec, 0.45);
  under.position.set(30, -50, -160);
  scene.add(under);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.28;
  // 全角度环绕：允许从顶/底/侧面任意方向观察，不留死角
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;

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
  if (trayRoot) {
    disposeMeshGeometries(trayRoot);
    trayRoot.clear();
  }
  if (terrainRoot) {
    disposeMeshGeometries(terrainRoot);
    terrainRoot.clear();
  }
  if (overlayRoot) {
    disposeMeshGeometries(overlayRoot);
    overlayRoot.clear();
  }
  trayRoot = null;
  terrainRoot = null;
  overlayRoot = null;
  disposeSatelliteTexture();
  terrainMaterial?.dispose();
  terrainMaterial = null;
  trayMaterial?.dispose();
  trayMaterial = null;
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

watch(
  () => [
    props.trayMesh,
    config.value.tray.totalThicknessMm,
    config.value.tray.recessDepthMm,
    config.value.terrain.baseSolidThicknessMm,
  ],
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

defineExpose({ imageryLoading, sceneBuilding });
</script>

<template>
  <div class="terrain-preview">
    <div ref="containerRef" class="terrain-preview__viewport" />
    <div
      v-if="!overlayLoading && imageryLoading"
      class="terrain-preview__badge terrain-preview__badge--load"
    >
      正在加载卫星影像贴图…
    </div>
    <div
      v-else-if="!overlayLoading && sceneBuilding"
      class="terrain-preview__badge terrain-preview__badge--load"
    >
      正在构建 3D 网格…
    </div>
    <div
      v-else-if="!overlayLoading && generating"
      class="terrain-preview__badge"
    >
      正在生成山体 3D 模型…
    </div>
    <div
      v-else-if="!overlayLoading && error"
      class="terrain-preview__badge terrain-preview__badge--err"
    >
      {{ error }}
    </div>
    <div
      v-else-if="!overlayLoading && statusHint"
      class="terrain-preview__badge terrain-preview__badge--err"
    >
      {{ statusHint }}
    </div>
    <div v-else-if="!overlayLoading && !result" class="terrain-preview__badge">
      导入 GPX 后打开 3D 预览，将显示真实地形模型
    </div>
    <div
      v-else-if="
        demLabel &&
        !sceneBuilding &&
        !imageryLoading &&
        !generating &&
        !error &&
        !statusHint
      "
      class="terrain-preview__badge terrain-preview__badge--dim"
    >
      {{ demLabel }}
      <span> · 含托盘底座 · 红=轨迹 · 拖动旋转</span>
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
