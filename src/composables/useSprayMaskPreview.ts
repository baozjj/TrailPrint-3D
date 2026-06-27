import { computed, ref } from "vue";
import type {
  SprayMaskUiState,
  SprayMaskViewMode,
} from "@shared/types/spray-paint";

export function useSprayMaskPreview() {
  const viewMode = ref<SprayMaskViewMode>("terrain-colors");
  const activeMaskIndex = ref<number | null>(null);
  const fitMaskIndex = ref<number | null>(null);
  const showAllMasks = ref(false);

  const uiState = computed<SprayMaskUiState>(() => ({
    viewMode: viewMode.value,
    activeMaskIndex: activeMaskIndex.value,
    showAllMasks: showAllMasks.value,
    fitMaskIndex: fitMaskIndex.value,
  }));

  function selectMask(colorIndex: number): void {
    activeMaskIndex.value = colorIndex;
    fitMaskIndex.value = colorIndex;
    showAllMasks.value = false;
    if (viewMode.value === "terrain-colors") {
      viewMode.value = "terrain-plus-mask";
    }
  }

  function selectColorSlot(colorIndex: number): void {
    selectMask(colorIndex);
  }

  function toggleFitMask(colorIndex: number): void {
    if (
      fitMaskIndex.value === colorIndex &&
      viewMode.value !== "terrain-colors"
    ) {
      hideAllMasks();
      return;
    }
    selectMask(colorIndex);
  }

  function setViewMode(mode: SprayMaskViewMode): void {
    if (mode === "terrain-colors") {
      viewMode.value = mode;
      fitMaskIndex.value = null;
      showAllMasks.value = false;
      return;
    }

    viewMode.value = mode;
    if (fitMaskIndex.value == null && activeMaskIndex.value != null) {
      fitMaskIndex.value = activeMaskIndex.value;
    }
  }

  function hideAllMasks(): void {
    showAllMasks.value = false;
    fitMaskIndex.value = null;
    activeMaskIndex.value = null;
    viewMode.value = "terrain-colors";
  }

  function showAllMasksToggle(): void {
    showAllMasks.value = true;
    if (viewMode.value === "terrain-colors") {
      viewMode.value = "terrain-plus-mask";
    }
  }

  function reset(): void {
    viewMode.value = "terrain-colors";
    activeMaskIndex.value = null;
    fitMaskIndex.value = null;
    showAllMasks.value = false;
  }

  function onMasksGenerated(masks: { colorIndex: number }[]): void {
    reset();
    if (masks.length > 0) {
      selectMask(masks[0].colorIndex);
    }
  }

  return {
    uiState,
    viewMode,
    activeMaskIndex,
    fitMaskIndex,
    showAllMasks,
    selectMask,
    selectColorSlot,
    toggleFitMask,
    setViewMode,
    hideAllMasks,
    showAllMasksToggle,
    reset,
    onMasksGenerated,
  };
}
