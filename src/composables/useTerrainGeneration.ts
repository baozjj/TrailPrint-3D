import { ref, watch, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { ipcGenerateTerrain, formatIpcError } from "@/ipc/client";
import type {
  TerrainGenerateResponse,
  TerrainMeshPayload,
} from "@shared/types/terrain";

const DEBOUNCE_MS = 450;

export function useTerrainGeneration(viewport: Ref<{ w: number; h: number }>) {
  const configStore = useConfigStore();
  const { config } = storeToRefs(configStore);

  const generating = ref(false);
  const error = ref<string | null>(null);
  const lastResult = ref<TerrainGenerateResponse | null>(null);
  const mesh = ref<TerrainMeshPayload | null>(null);
  const trailMesh = ref<TerrainMeshPayload | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;

  async function runGeneration(): Promise<void> {
    const { w, h } = viewport.value;
    if (w < 64 || h < 64) return;

    if (!config.value.gpx.imported) {
      mesh.value = null;
      trailMesh.value = null;
      lastResult.value = null;
      error.value = null;
      return;
    }

    const id = ++requestId;
    generating.value = true;
    error.value = null;

    try {
      const res = await ipcGenerateTerrain({
        config: configStore.toSnapshot(),
        viewportWidth: Math.round(w),
        viewportHeight: Math.round(h),
      });
      if (id !== requestId) return;
      lastResult.value = res;
      mesh.value = res.mesh;
      trailMesh.value = res.trailMesh;
    } catch (err) {
      if (id !== requestId) return;
      error.value = formatIpcError(err);
      mesh.value = null;
      trailMesh.value = null;
    } finally {
      if (id === requestId) generating.value = false;
    }
  }

  function scheduleGeneration(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runGeneration();
    }, DEBOUNCE_MS);
  }

  watch(
    () => [
      config.value.terrain.baseSolidThicknessMm,
      config.value.terrain.zExaggeration,
      config.value.terrain.smoothing,
      config.value.terrain.demDataset,
      config.value.terrain.openTopographyApiKey,
      config.value.mapCrop.shape,
      config.value.mapCrop.radiusMm,
      config.value.mapCrop.lengthMm,
      config.value.mapCrop.widthMm,
      config.value.mapCrop.polygonSides,
      config.value.mapCrop.polygonSideLengthMm,
      config.value.mapCrop.mapCenterLat,
      config.value.mapCrop.mapCenterLon,
      config.value.mapCrop.mapZoom,
      config.value.mapCrop.mapBearingDeg,
      config.value.gpx.imported,
      config.value.gpx.pointCount,
      config.value.trail.gpxSimplify,
      config.value.trail.trailWidthMm,
      config.value.trail.trailDepthMm,
      config.value.assembly.trailToleranceMm,
      config.value.assembly.magnet.enabled,
      config.value.assembly.magnet.diameterMm,
      config.value.assembly.magnet.thicknessMm,
      config.value.assembly.magnet.snapFitHole,
      viewport.value.w,
      viewport.value.h,
    ],
    () => scheduleGeneration(),
    { immediate: true },
  );

  return {
    generating,
    error,
    mesh,
    trailMesh,
    lastResult,
    regenerate: runGeneration,
  };
}
