import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";
import { ipcGenerateTray, formatIpcError } from "@/ipc/client";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
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
      const res = await ipcGenerateTray({
        config: configStore.toSnapshot(),
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
      config.value.assembly.magnet.fridgeMagnetHole,
      config.value.assembly.magnet.snapFitHole,
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
