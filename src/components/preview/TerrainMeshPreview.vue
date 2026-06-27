<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TerrainGenerateResponse, TerrainSceneProgress } from "@shared/types/terrain";
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
import type { SprayMaskMeshPayload, SprayMaskUiState, SprayPaintPlan } from "@shared/types/spray-paint";
import { hexToRgb } from "@shared/utils/lab-color";
import { applySprayVertexColors, patchSprayVertexColorsForCells } from "@/utils/spray-vertex-colors";
import { rayPickHeightfieldLocalMm } from "@/utils/terrain-heightfield-pick";
import { useSpraySegmentation } from "@/composables/useSpraySegmentation";
import { storeToRefs } from "pinia";

const configStore = useConfigStore();
const { config } = storeToRefs(configStore);
const { paintAtMm, endPaintStroke } = useSpraySegmentation();

const props = defineProps<{
  result: TerrainGenerateResponse | null;
  trayMesh?: TrayMeshPayload | null;
  generating?: boolean;
  error?: string | null;
  overlayLoading?: boolean;
  sprayEnabled?: boolean;
  sprayPlan?: SprayPaintPlan | null;
  sprayMasks?: SprayMaskMeshPayload[];
  sprayUiState?: SprayMaskUiState | null;
  sprayPaintMode?: boolean;
  sprayPaintRegionId?: number | null;
}>();

const emit = defineEmits<{
  "scene-loading-change": [loading: boolean];
  "scene-progress": [progress: TerrainSceneProgress];
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
let maskRoot: THREE.Group | null = null;
let overlayRoot: THREE.Group | null = null;
let terrainMaterial: THREE.MeshStandardMaterial | null = null;
let trayMaterial: THREE.MeshLambertMaterial | null = null;
let terrainMeshRef: THREE.Mesh | null = null;
let animationId = 0;
let resizeObserver: ResizeObserver | null = null;
let rebuildToken = 0;
let maskRebuildToken = 0;
const raycaster = new THREE.Raycaster();
const paintPointer = new THREE.Vector2();
const terrainLocalMatrix = new THREE.Matrix4();
let isPainting = false;
let paintCanvas: HTMLCanvasElement | null = null;
let pendingPaintX: number | null = null;
let pendingPaintY: number | null = null;
let paintFrameRaf = 0;

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

function applySprayColorsToTerrain(
  mesh: THREE.Mesh,
  crop: NonNullable<TerrainGenerateResponse["crop"]>,
  preview: NonNullable<TerrainGenerateResponse["heightPreview"]>,
): void {
  const plan = props.sprayPlan;
  if (!props.sprayEnabled || !plan) return;
  applySprayVertexColors(
    mesh.geometry as THREE.BufferGeometry,
    crop,
    plan.cellRegions,
    plan.gridCols,
    plan.gridRows,
    plan.colors,
    preview.bottomZ,
  );
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.vertexColors = true;
  mat.map = null;
  mat.color.setHex(0xffffff);
  mat.needsUpdate = true;
}

function resetTerrainMaterial(mesh: THREE.Mesh): void {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.vertexColors = false;
  mat.map = null;
  mat.color.setHex(0xf3ead6);
  const geo = mesh.geometry as THREE.BufferGeometry;
  geo.deleteAttribute("color");
  mat.needsUpdate = true;
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

function reportScene(
  phase: TerrainSceneProgress["phase"],
  progress: number,
  message: string,
): void {
  emit("scene-progress", { phase, progress, message });
}

function disposeObjectMaterials(root: THREE.Object3D): void {
  root.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const m of mats) m.dispose();
    }
  });
}

function applyMaskViewState(): void {
  const state = props.sprayUiState;
  const showTerrain = !state || state.viewMode !== "mask-only";

  if (terrainRoot) terrainRoot.visible = showTerrain;
  if (trayRoot) trayRoot.visible = showTerrain;
  if (overlayRoot) overlayRoot.visible = showTerrain;
  if (!maskRoot) return;

  for (const child of maskRoot.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const colorIndex = child.userData.colorIndex as number;
    const mat = child.material as THREE.MeshStandardMaterial;

    let visible = false;
    let opacity = 0.45;

    if (!state) {
      child.visible = false;
      continue;
    }

    switch (state.viewMode) {
      case "terrain-colors":
        visible = false;
        break;
      case "terrain-plus-mask":
        if (state.showAllMasks) {
          visible = true;
          opacity = colorIndex === state.fitMaskIndex ? 0.45 : 0.28;
        } else if (state.fitMaskIndex != null) {
          visible = colorIndex === state.fitMaskIndex;
          opacity = 0.45;
        }
        break;
      case "mask-only":
        if (state.fitMaskIndex != null) {
          visible = colorIndex === state.fitMaskIndex;
          opacity = 0.85;
        }
        break;
    }

    child.visible = visible;
    mat.opacity = opacity;
    mat.needsUpdate = true;
  }
}

function rebuildMaskMeshes(assemblyOffsetZ: number): void {
  void rebuildMaskMeshesAsync(assemblyOffsetZ);
}

async function rebuildMaskMeshesAsync(assemblyOffsetZ: number): Promise<void> {
  if (!maskRoot) return;
  const token = ++maskRebuildToken;
  disposeMeshGeometries(maskRoot);
  disposeObjectMaterials(maskRoot);
  maskRoot.clear();
  maskRoot.position.z = assemblyOffsetZ;

  const masks = props.sprayMasks ?? [];
  const plan = props.sprayPlan;
  if (!masks.length) return;

  for (const mask of masks) {
    if (token !== maskRebuildToken || !maskRoot) return;
    if (!mask.positions?.length || !mask.indices?.length) continue;

    const geo = payloadToBufferGeometry(mask);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (token !== maskRebuildToken || !maskRoot) {
      geo.dispose();
      return;
    }
    geo.computeVertexNormals();

    const slot = plan?.colors.find((c) => c.index === mask.colorIndex);
    const rgb = slot ? hexToRgb(slot.hex) : { r: 180, g: 180, b: 180 };
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255),
      transparent: true,
      opacity: 0.45,
      roughness: 0.75,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.userData.colorIndex = mask.colorIndex;
    mesh.visible = false;
    maskRoot.add(mesh);
  }

  applyMaskViewState();
}

async function rebuildScene(): Promise<void> {
  if (!trayRoot || !terrainRoot || !maskRoot || !overlayRoot || !camera || !controls) return;

  const token = ++rebuildToken;
  sceneBuilding.value = true;
  reportScene("terrain", 0.05, "正在初始化 3D 场景…");
  syncSceneLoading();

  disposeMeshGeometries(trayRoot);
  disposeMeshGeometries(terrainRoot);
  disposeMeshGeometries(maskRoot);
  disposeMeshGeometries(overlayRoot);
  trayRoot.clear();
  terrainRoot.clear();
  maskRoot.clear();
  overlayRoot.clear();
  trayRoot.position.z = 0;
  terrainRoot.position.z = 0;
  maskRoot.position.z = 0;
  overlayRoot.position.z = 0;
  statusHint.value = null;

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

  reportScene("terrain", 0.2, "正在构建山体网格…");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const terrainGeo = buildTerrainGeometryFromPreview(r.crop, preview);
  terrainGeo.computeVertexNormals();
  if (!terrainGeo.getIndex()?.count) {
    statusHint.value = "山体网格为空";
    terrainGeo.dispose();
    sceneBuilding.value = false;
    syncSceneLoading();
    return;
  }

  reportScene("terrain", 0.55, "正在应用山体材质…");

  const mat = ensureTerrainMaterial();
  mat.map = null;
  mat.needsUpdate = true;

  const terrainMesh = new THREE.Mesh(terrainGeo, mat);
  terrainMesh.frustumCulled = false;
  terrainMesh.renderOrder = 0;
  if (props.sprayEnabled && props.sprayPlan) {
    applySprayColorsToTerrain(terrainMesh, r.crop, preview);
  } else {
    resetTerrainMaterial(terrainMesh);
  }
  terrainMeshRef = terrainMesh;
  terrainRoot.add(terrainMesh);

  imageryLoading.value = false;
  syncSceneLoading();

  if (token !== rebuildToken) return;

  const assemblyOffsetZ = computeTerrainAssemblyOffsetZMm(config.value);
  terrainRoot.position.z = assemblyOffsetZ;
  maskRoot.position.z = assemblyOffsetZ;
  overlayRoot.position.z = assemblyOffsetZ;
  rebuildMaskMeshes(assemblyOffsetZ);

  const tray = props.trayMesh;
  if (tray?.positions?.length && tray.indices?.length) {
    reportScene("tray", 0.65, "正在加载托盘底座…");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const trayGeo = payloadToBufferGeometry(tray, { hardEdges: true });
    const trayObj = new THREE.Mesh(trayGeo, ensureTrayMaterial());
    trayObj.frustumCulled = false;
    trayObj.renderOrder = -1;
    trayRoot.add(trayObj);
  }

  const polyline = r.trailPolylineMm ?? [];
  const trailWidth = r.trailDisplayWidthMm ?? 4;

  if (polyline.length >= 2) {
    reportScene("trail", 0.78, "正在绘制轨迹…");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
  reportScene("camera", 0.92, "正在调整视角…");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  fitCameraToTerrain(camera, controls, ...fitTargets);

  if (token === rebuildToken) {
    reportScene("done", 1, "预览已就绪");
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
  maskRoot = new THREE.Group();
  overlayRoot = new THREE.Group();
  scene.add(trayRoot);
  scene.add(terrainRoot);
  scene.add(maskRoot);
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

  paintCanvas = renderer.domElement;
  paintCanvas.addEventListener("pointerdown", onPaintPointerDown);
  paintCanvas.addEventListener("pointermove", onPaintPointerMove);
  paintCanvas.addEventListener("pointerup", onPaintPointerUp);
  paintCanvas.addEventListener("pointerleave", onPaintPointerUp);
}

function patchPaintColors(changed: Set<number>): void {
  if (
    !changed.size ||
    !terrainMeshRef ||
    !props.result?.crop ||
    !props.result.heightPreview ||
    !props.sprayEnabled ||
    !props.sprayPlan
  ) {
    return;
  }
  patchSprayVertexColorsForCells(
    terrainMeshRef.geometry as THREE.BufferGeometry,
    props.result.crop,
    props.sprayPlan.cellRegions,
    props.sprayPlan.gridCols,
    props.sprayPlan.gridRows,
    props.sprayPlan.colors,
    props.result.heightPreview.bottomZ,
    changed,
  );
}

function paintAtClientImpl(clientX: number, clientY: number): void {
  if (
    !renderer ||
    !camera ||
    !terrainMeshRef ||
    !terrainRoot ||
    !props.result?.crop ||
    !props.result.heightPreview ||
    props.sprayPaintRegionId == null
  ) {
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  paintPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  paintPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(paintPointer, camera);
  terrainRoot.updateMatrixWorld(true);
  terrainLocalMatrix.copy(terrainRoot.matrixWorld);
  const hit = rayPickHeightfieldLocalMm(
    raycaster.ray,
    terrainLocalMatrix,
    props.result.crop,
    props.result.heightPreview,
  );
  if (!hit) return;
  const changed = paintAtMm(
    props.result.crop,
    hit.xMm,
    hit.yMm,
    props.sprayPaintRegionId,
  );
  patchPaintColors(changed);
}

/** 每帧合并多次 pointermove，跟显示刷新对齐且不丢最后一帧位置 */
function paintAtClient(clientX: number, clientY: number, immediate = false): void {
  if (immediate) {
    pendingPaintX = null;
    pendingPaintY = null;
    if (paintFrameRaf) {
      cancelAnimationFrame(paintFrameRaf);
      paintFrameRaf = 0;
    }
    paintAtClientImpl(clientX, clientY);
    return;
  }
  pendingPaintX = clientX;
  pendingPaintY = clientY;
  if (!paintFrameRaf) {
    paintFrameRaf = requestAnimationFrame(() => {
      paintFrameRaf = 0;
      if (pendingPaintX == null || pendingPaintY == null) return;
      const x = pendingPaintX;
      const y = pendingPaintY;
      pendingPaintX = null;
      pendingPaintY = null;
      paintAtClientImpl(x, y);
    });
  }
}

function onPaintPointerDown(e: PointerEvent): void {
  if (!props.sprayPaintMode || props.sprayPaintRegionId == null) return;
  if (e.button !== 0) return;
  e.preventDefault();
  isPainting = true;
  if (controls) controls.enabled = false;
  renderer?.domElement.setPointerCapture(e.pointerId);
  paintAtClient(e.clientX, e.clientY, true);
}

function onPaintPointerMove(e: PointerEvent): void {
  if (!isPainting || !props.sprayPaintMode) return;
  e.preventDefault();
  paintAtClient(e.clientX, e.clientY);
}

function onPaintPointerUp(e: PointerEvent): void {
  if (!isPainting) return;
  isPainting = false;
  if (renderer?.domElement.hasPointerCapture(e.pointerId)) {
    renderer.domElement.releasePointerCapture(e.pointerId);
  }
  if (controls) controls.enabled = !props.sprayPaintMode;
  if (pendingPaintX != null && pendingPaintY != null) {
    if (paintFrameRaf) {
      cancelAnimationFrame(paintFrameRaf);
      paintFrameRaf = 0;
    }
    paintAtClientImpl(pendingPaintX, pendingPaintY);
    pendingPaintX = null;
    pendingPaintY = null;
  }
  endPaintStroke();
}

function detachPaintListeners(): void {
  if (!paintCanvas) return;
  paintCanvas.removeEventListener("pointerdown", onPaintPointerDown);
  paintCanvas.removeEventListener("pointermove", onPaintPointerMove);
  paintCanvas.removeEventListener("pointerup", onPaintPointerUp);
  paintCanvas.removeEventListener("pointerleave", onPaintPointerUp);
  paintCanvas = null;
}

function disposeThree(): void {
  detachPaintListeners();
  if (paintFrameRaf) {
    cancelAnimationFrame(paintFrameRaf);
    paintFrameRaf = 0;
  }
  pendingPaintX = null;
  pendingPaintY = null;
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
  if (maskRoot) {
    disposeMeshGeometries(maskRoot);
    disposeObjectMaterials(maskRoot);
    maskRoot.clear();
  }
  if (overlayRoot) {
    disposeMeshGeometries(overlayRoot);
    overlayRoot.clear();
  }
  trayRoot = null;
  terrainRoot = null;
  maskRoot = null;
  overlayRoot = null;
  terrainMeshRef = null;
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
  () => [props.sprayMasks, props.sprayPlan?.colors] as const,
  () => {
    if (!maskRoot || !props.result?.crop) return;
    const assemblyOffsetZ = computeTerrainAssemblyOffsetZMm(config.value);
    rebuildMaskMeshes(assemblyOffsetZ);
  },
  { deep: true },
);

watch(
  () => props.sprayUiState,
  () => {
    applyMaskViewState();
  },
  { deep: true },
);

watch(
  () => props.sprayPaintMode,
  (on) => {
    if (controls) {
      controls.enabled = !on;
      controls.autoRotate = !on;
    }
  },
);

watch(
  () => props.sprayPlan?.colors,
  () => {
    if (
      !terrainMeshRef ||
      !props.result?.crop ||
      !props.result.heightPreview ||
      !props.sprayEnabled ||
      !props.sprayPlan
    ) {
      return;
    }
    applySprayColorsToTerrain(
      terrainMeshRef,
      props.result.crop,
      props.result.heightPreview,
    );
  },
  { deep: true },
);

watch(
  () => [props.sprayEnabled, props.sprayPlan, props.sprayPlan?.colors] as const,
  () => {
    if (!terrainMeshRef || !props.result?.crop || !props.result.heightPreview) {
      return;
    }
    if (props.sprayEnabled && props.sprayPlan) {
      applySprayColorsToTerrain(
        terrainMeshRef,
        props.result.crop,
        props.result.heightPreview,
      );
    } else {
      resetTerrainMaterial(terrainMeshRef);
    }
  },
  { deep: true },
);

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

function refreshSprayColors(): void {
  if (
    !terrainMeshRef ||
    !props.result?.crop ||
    !props.result.heightPreview ||
    !props.sprayEnabled ||
    !props.sprayPlan
  ) {
    return;
  }
  applySprayColorsToTerrain(
    terrainMeshRef,
    props.result.crop,
    props.result.heightPreview,
  );
}

defineExpose({ imageryLoading, sceneBuilding, refreshSprayColors });
</script>

<template>
  <div
    class="terrain-preview"
    :class="{ 'terrain-preview--paint': sprayPaintMode }"
  >
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

.terrain-preview--paint .terrain-preview__viewport {
  cursor: crosshair;
}

.terrain-preview--paint .terrain-preview__viewport :deep(canvas) {
  cursor: crosshair;
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
