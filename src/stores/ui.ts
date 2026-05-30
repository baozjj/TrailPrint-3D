import { defineStore } from "pinia";
import { ref } from "vue";
import type { EngraveStyle } from "@shared/types";

export const useUiStore = defineStore("ui", () => {
  const openSections = ref<Record<string, boolean>>({
    map: true,
    terrain: true,
    trail: true,
    tray: true,
    assembly: false,
  });
  const borderTextEnabled = ref(false);
  const globalEngraveStyle = ref<EngraveStyle>("intaglio");
  const generating = ref(false);
  const statusMessage = ref<string | null>(null);
  /** 预览区像素尺寸，供 STL 导出裁剪与预览一致 */
  const previewViewport = ref({ w: 800, h: 600 });
  /** 每次成功导入 GPX 后递增，驱动 2D 地图自动居中并缩放到遮罩内 */
  const gpxMapFitNonce = ref(0);
  const exportProgress = ref(0);
  /** 最近一次成功导出的 ZIP 绝对路径 */
  const lastExportZipPath = ref<string | null>(null);

  const prepareExportHooks: Array<() => void> = [];

  function registerPrepareExportHook(fn: () => void): () => void {
    prepareExportHooks.push(fn);
    return () => {
      const i = prepareExportHooks.indexOf(fn);
      if (i >= 0) prepareExportHooks.splice(i, 1);
    };
  }

  /** 导出前同步地图中心/缩放与预览视窗像素尺寸 */
  function runPrepareExport(): void {
    for (const fn of prepareExportHooks) fn();
  }

  function toggleSection(key: string): void {
    openSections.value[key] = !openSections.value[key];
  }

  function requestGpxMapFit(): void {
    gpxMapFitNonce.value += 1;
  }

  return {
    openSections,
    borderTextEnabled,
    globalEngraveStyle,
    generating,
    statusMessage,
    previewViewport,
    gpxMapFitNonce,
    requestGpxMapFit,
    exportProgress,
    lastExportZipPath,
    registerPrepareExportHook,
    runPrepareExport,
    toggleSection,
  };
});
