import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";
import { ipcGenerateTray, formatIpcError } from "@/ipc/client";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
import { computeTrayBottomMagnetHoles } from "@shared/utils/magnet-hole-layout";
import { logMagnetDebug } from "@shared/utils/magnet-debug-log";
import { computeTrayFootprint } from "@shared/utils/tray-footprint";
import type { TrayMeshPayload } from "@shared/types/tray";

const DEBOUNCE_MS = 400;

export function useTrayGeneration() {
  const configStore = useConfigStore();
  const ui = useUiStore();
  const { config } = storeToRefs(configStore);
  const { borderTextEnabled } = storeToRefs(ui);

  const generating = ref(false);
  const error = ref<string | null>(null);
  const mesh = ref<TrayMeshPayload | null>(null);
  const hasBorderText = ref(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;

  async function runGeneration(): Promise<void> {
    if (!config.value.gpx.imported) {
      mesh.value = null;
      hasBorderText.value = false;
      error.value = null;
      return;
    }

    const validation = validateTrayFromAppConfig(config.value);
    if (!validation.valid) {
      error.value = validation.message ?? "托盘参数无效";
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
      });
      if (id !== requestId) return;
      mesh.value = res.mesh;
      hasBorderText.value = res.hasBorderText;
    } catch (err) {
      if (id !== requestId) return;
      error.value = formatIpcError(err);
      mesh.value = null;
      hasBorderText.value = false;
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
      config.value.mapCrop.shape,
      config.value.mapCrop.radiusMm,
      config.value.mapCrop.lengthMm,
      config.value.mapCrop.widthMm,
      config.value.mapCrop.polygonSides,
      config.value.mapCrop.polygonSideLengthMm,
      config.value.assembly.trayToleranceMm,
      config.value.assembly.magnet.enabled,
      config.value.assembly.magnet.diameterMm,
      config.value.assembly.magnet.thicknessMm,
      config.value.assembly.magnet.circleCount,
      config.value.mapCrop.shape,
      config.value.mapCrop.polygonSides,
      borderTextEnabled.value,
      JSON.stringify(config.value.tray.borderTextByEdge),
    ],
    () => scheduleGeneration(),
    { immediate: true },
  );

  return {
    generating,
    error,
    mesh,
    hasBorderText,
    regenerate: runGeneration,
  };
}
