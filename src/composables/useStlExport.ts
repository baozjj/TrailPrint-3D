import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { useConfigStore } from "@/stores/config";
import { formatIpcError, ipcGenerateExport } from "@/ipc/client";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
import { physicalFootprintMm } from "@shared/utils/crop-region";
import { ensureMapZoomFitsTrail } from "@shared/utils/trail-fit";
import { computeTrayBottomMagnetHoles } from "@shared/utils/magnet-hole-layout";
import { logMagnetDebug } from "@shared/utils/magnet-debug-log";
import { computeTrayFootprint } from "@shared/utils/tray-footprint";

function exportFileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

export function useStlExport() {
  const ui = useUiStore();
  const configStore = useConfigStore();
  const { generating, statusMessage } = storeToRefs(ui);

  async function generateAndSave(): Promise<void> {
    if (!configStore.config.gpx.imported) {
      statusMessage.value = "请先导入 GPX 轨迹文件";
      return;
    }
    const trayCheck = validateTrayFromAppConfig(configStore.config);
    if (!trayCheck.valid) {
      statusMessage.value = trayCheck.message ?? "请修正托盘参数";
      return;
    }
    generating.value = true;
    ui.exportProgress = 0;
    statusMessage.value = "准备生成…";
    ui.runPrepareExport();
    const { w, h } = ui.previewViewport;
    const vw = Math.round(w);
    const vh = Math.round(h);
    const snapshot = configStore.toSnapshot();
    const exportConfig = ensureMapZoomFitsTrail(snapshot, vw, vh);
    if (exportConfig.mapCrop.mapZoom !== snapshot.mapCrop.mapZoom) {
      configStore.config.mapCrop.mapCenterLat = exportConfig.mapCrop.mapCenterLat;
      configStore.config.mapCrop.mapCenterLon = exportConfig.mapCrop.mapCenterLon;
      configStore.config.mapCrop.mapZoom = exportConfig.mapCrop.mapZoom;
    }

    const exportFootprint = computeTrayFootprint(exportConfig);
    const exportHoles = computeTrayBottomMagnetHoles(exportConfig, exportFootprint);
    logMagnetDebug({
      phase: "renderer-export",
      mapCropShape: exportConfig.mapCrop.shape,
      polygonSides: exportConfig.mapCrop.polygonSides,
      footprintShape: exportFootprint.shape,
      outerVertCount: exportFootprint.outer.length,
      magnetEnabled: exportConfig.assembly.magnet.enabled,
      circleCount: exportConfig.assembly.magnet.circleCount,
      holeCount: exportHoles.length,
      holes: exportHoles,
      note: "渲染进程导出前快照；请与终端主进程 TrailPrint:Magnet 日志对照",
    });

    try {
      const res = await ipcGenerateExport({
        config: exportConfig,
        viewportWidth: vw,
        viewportHeight: vh,
      });
      if (res.cancelled) {
        statusMessage.value =
          "未生成文件：已在保存对话框中取消。再次点击下载并选择保存位置即可。";
      } else if (res.savedPath) {
        ui.lastExportZipPath = res.savedPath;
        const name = exportFileName(res.savedPath);
        const foot = physicalFootprintMm(configStore.config.mapCrop);
        const sizeHint =
          configStore.config.mapCrop.shape === "circle"
            ? `直径 ${(foot.radiusMm ?? 0) * 2}mm`
            : `${foot.widthMm}×${foot.heightMm}mm`;
        statusMessage.value = `已保存 ${name}（打印区域 ${sizeHint}，${Math.round(res.generationMs / 1000)} 秒）`;
      }
    } catch (err) {
      statusMessage.value = formatIpcError(err);
    } finally {
      generating.value = false;
      ui.exportProgress = 0;
    }
  }

  return { generateAndSave, generating };
}
