import { computed, watch } from "vue";
import type { BaseShape, BorderTextEdge, EngraveStyle } from "@shared/types";
import {
  DEFAULT_BORDER_CENTER_OFFSET_MM,
  DEFAULT_BORDER_FONT_ID,
  DEFAULT_BORDER_FONT_SIZE_MM,
} from "@shared/tray/border-text-defaults";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";

const RECT_LABELS = ["上", "下", "左", "右"] as const;

function makeEdge(_label: string, style: EngraveStyle): BorderTextEdge {
  return {
    content: "",
    align: "center",
    style,
    fontId: DEFAULT_BORDER_FONT_ID,
    fontSizeMm: DEFAULT_BORDER_FONT_SIZE_MM,
    facing: "outward",
    centerOffsetMm: DEFAULT_BORDER_CENTER_OFFSET_MM,
  };
}

function normalizeEdge(
  prev: BorderTextEdge | undefined,
  style: EngraveStyle,
): BorderTextEdge {
  if (!prev) return makeEdge("", style);
  return {
    content: prev.content ?? "",
    align: prev.align ?? "center",
    style,
    fontId: prev.fontId ?? DEFAULT_BORDER_FONT_ID,
    fontSizeMm: prev.fontSizeMm ?? DEFAULT_BORDER_FONT_SIZE_MM,
    facing: prev.facing ?? "outward",
    centerOffsetMm: prev.centerOffsetMm ?? DEFAULT_BORDER_CENTER_OFFSET_MM,
  };
}

export function useBorderText() {
  const configStore = useConfigStore();
  const ui = useUiStore();

  const shape = computed(() => configStore.config.mapCrop.shape);
  const supportsBorderText = computed(
    () => shape.value === "rectangle" || shape.value === "polygon",
  );

  const edgeLabels = computed(() => {
    if (shape.value === "rectangle") return [...RECT_LABELS];
    const n = configStore.config.mapCrop.polygonSides;
    return Array.from({ length: n }, (_, i) => `边 ${i + 1}`);
  });

  function syncEdges(): void {
    if (!ui.borderTextEnabled || !supportsBorderText.value) {
      configStore.config.tray.borderTextByEdge = [];
      return;
    }
    const style = ui.globalEngraveStyle;
    const existing = configStore.config.tray.borderTextByEdge;
    configStore.config.tray.borderTextByEdge = edgeLabels.value.map(
      (_label, i) => normalizeEdge(existing[i], style),
    );
  }

  watch([() => ui.borderTextEnabled, shape, edgeLabels], syncEdges, {
    immediate: true,
  });

  watch(
    () => ui.globalEngraveStyle,
    (style) => {
      configStore.config.tray.borderTextByEdge.forEach((e) => {
        e.style = style;
      });
    },
  );

  watch(shape, () => {
    if (shape.value === "circle") {
      ui.borderTextEnabled = false;
    }
  });

  return {
    supportsBorderText,
    edgeLabels,
    syncEdges,
  };
}
