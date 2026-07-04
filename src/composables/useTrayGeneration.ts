import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";
import { ipcGenerateTray, formatIpcError } from "@/ipc/client";
import { validateModelGeneration } from "@shared/utils/model-validation";
import { computeTrayBottomMagnetHoles } from "@shared/utils/magnet-hole-layout";
import { logMagnetDebug } from "@shared/utils/magnet-debug-log";
import { computeTrayFootprint } from "@shared/utils/tray-footprint";
import type { TrayMeshPayload } from "@shared/types/tray";

const DEBOUNCE_MS = 400;

export function useTrayGeneration() {
  const configStore = useConfigStore();
  const ui = useUiStore();
  const { config } = storeToRefs(configStore);
  const { previewViewport } = storeToRefs(ui);

  const generating = ref(false);
  const error = ref<string | null>(null);
  const mesh = ref<TrayMeshPayload | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;

  async function runGeneration(): Promise<void> {
    if (!config.value.gpx.imported) {
      mesh.value = null;
      error.value = null;
      return;
    }

    const validation = validateModelGeneration(config.value, {
      viewportWidth: previewViewport.value.w,
      viewportHeight: previewViewport.value.h,
      requireGpx: true,
    });
    if (!validation.valid) {
      error.value = validation.message ?? "参数冲突，请检查左侧设置";
      mesh.value = null;
      return;
    }

    const id = ++requestId;
    generating.value = true;
    error.value = null;

    try {
      const snapshot = configStore.toSnapshot();
      const footprint = computeTrayFootprint(snapshot);
      const holes = computeTrayBottomMagnetHoles(snapshot, footprint);
      logMagnetDebug({
        phase: "renderer-tray-ipc",
        mapCropShape: snapshot.mapCrop.shape,
        polygonSides: snapshot.mapCrop.polygonSides,
        footprintShape: footprint.shape,
        outerVertCount: footprint.outer.length,
        magnetEnabled: snapshot.assembly.magnet.enabled,
        circleCount: snapshot.assembly.magnet.circleCount,
        holeCount: holes.length,
      });

      const res = await ipcGenerateTray({
        config: snapshot,
        viewportWidth: previewViewport.value.w,
        viewportHeight: previewViewport.value.h,
      });
      if (id !== requestId) return;
      mesh.value = res.mesh;
    } catch (err) {
      if (id !== requestId) return;
      error.value = formatIpcError(err);
      mesh.value = null;
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
      config.value.tray.totalThicknessMm,
      config.value.tray.recessDepthMm,
      config.value.tray.rimWidthMm,
      config.value.tray.nfc.enabled,
      config.value.tray.nfc.wallClearanceMm,
      config.value.tray.nfc.recessDepthMm,
      config.value.tray.nfc.ledExtraRecessDepthMm,
      config.value.tray.nfc.ledPocketLengthMm,
      config.value.tray.nfc.ledPocketWidthMm,
      config.value.gpx.points.length,
      config.value.gpx.rawPoints.length,
      config.value.trail.gpxSimplify,
      config.value.mapCrop.mapCenterLat,
      config.value.mapCrop.mapCenterLon,
      config.value.mapCrop.mapZoom,
      config.value.mapCrop.mapBearingDeg,
      config.value.mapCrop.shape,
      config.value.mapCrop.radiusMm,
      config.value.mapCrop.lengthMm,
      config.value.mapCrop.widthMm,
      config.value.mapCrop.polygonSides,
      config.value.mapCrop.polygonSideLengthMm,
      config.value.mapCrop.cornerRadiusMm,
      config.value.assembly.trayToleranceMm,
      config.value.assembly.magnet.enabled,
      config.value.assembly.magnet.diameterMm,
      config.value.assembly.magnet.thicknessMm,
      config.value.assembly.magnet.toleranceMm,
      config.value.assembly.magnet.circleCount,
      previewViewport.value.w,
      previewViewport.value.h,
    ],
    () => scheduleGeneration(),
    { immediate: true },
  );

  return {
    generating,
    error,
    mesh,
    regenerate: runGeneration,
  };
}
