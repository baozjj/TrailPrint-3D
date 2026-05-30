import { copyFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import { dialog, shell, type BrowserWindow } from "electron";
import type { AppConfig } from "@shared/types";
import {
  STL_FILE_NAMES,
  type ExportGenerateRequest,
  type ExportGenerateResponse,
  type ExportProgress,
} from "@shared/types/export";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
import { trailLineWidthMmForPrint } from "@shared/utils/footprint";
import { ensureMapZoomFitsTrail } from "@shared/utils/trail-fit";
import { IpcException } from "@shared/ipc/types";
import { hydrateGpxConfig } from "../gpx/hydrate-gpx-config";
import { generateTerrainMain } from "../terrain/terrain-main-service";
import { generateTrayBase } from "../tray/tray-service";
import { writeBinaryStl } from "./stl-writer";
import { packZip } from "./zip-packager";

export type ExportProgressCallback = (progress: ExportProgress) => void;

/** 在系统文件管理器中定位已导出的 ZIP */
export function revealExportZip(zipPath: string): void {
  if (!zipPath.trim()) {
    throw new IpcException("INVALID_PATH", "文件路径无效");
  }
  shell.showItemInFolder(zipPath);
}

function defaultZipName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `TrailPrint-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}

export async function generateModelsZip(
  req: ExportGenerateRequest,
  onProgress: ExportProgressCallback,
  browserWindow?: BrowserWindow | null,
): Promise<ExportGenerateResponse> {
  const started = Date.now();
  let { config, viewportWidth, viewportHeight } = req;
  config = await hydrateGpxConfig(config);
  config = ensureMapZoomFitsTrail(config, viewportWidth, viewportHeight);

  onProgress({
    phase: "validate",
    progress: 0.02,
    message: "正在校验参数…",
  });

  if (!config.gpx.imported) {
    throw new IpcException("GPX_REQUIRED", "请先导入 GPX 轨迹文件");
  }
  if (config.gpx.points.length < 2) {
    throw new IpcException("GPX_INVALID", "轨迹点数不足，无法生成模型");
  }

  const trayCheck = validateTrayFromAppConfig(config);
  if (!trayCheck.valid) {
    throw new IpcException(
      "TRAY_INVALID",
      trayCheck.message ?? "托盘参数无效",
    );
  }

  if (viewportWidth < 64 || viewportHeight < 64) {
    throw new IpcException(
      "INVALID_VIEWPORT",
      "预览区域尺寸过小，请放大窗口后重试",
    );
  }

  onProgress({
    phase: "terrain",
    progress: 0.1,
    message: "正在生成地形主模型与轨迹…",
  });

  const terrainWithGroove = await generateTerrainMain({
    config,
    viewportWidth,
    viewportHeight,
    trailLineWidthMm: trailLineWidthMmForPrint(config),
  });

  onProgress({
    phase: "tray",
    progress: 0.45,
    message: "正在生成托盘底座…",
  });

  const trayRes = await generateTrayBase({ config });

  const trailPoints = config.gpx.points.length || config.gpx.rawPoints.length;
  if (!terrainWithGroove.trailMesh) {
    throw new IpcException(
      "TRAIL_EMPTY",
      trailPoints < 2
        ? "GPX 轨迹点不足，请重新导入有效的 GPX 文件"
        : `无法生成轨迹模型（已读取 ${trailPoints} 个轨迹点）。请在 2D 地图中将红色轨迹拖入中心圆/框内后再导出`,
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "trailprint-export-"));
  const zipTempPath = join(workDir, "bundle.zip");

  try {
    onProgress({
      phase: "stl",
      progress: 0.6,
      message: "正在写出 STL 文件…",
    });

    const terrainStl = join(workDir, STL_FILE_NAMES.terrainMain);
    const trailStl = join(workDir, STL_FILE_NAMES.trailLine);
    const trayStl = join(workDir, STL_FILE_NAMES.trayBase);

    await writeBinaryStl(terrainStl, terrainWithGroove.mesh, "Terrain_Main");
    await writeBinaryStl(trailStl, terrainWithGroove.trailMesh, "Trail_Line");
    await writeBinaryStl(trayStl, trayRes.mesh, "Tray_Base");

    onProgress({
      phase: "zip",
      progress: 0.78,
      message: "正在打包 ZIP…",
    });

    await packZip(zipTempPath, [
      { name: STL_FILE_NAMES.terrainMain, filePath: terrainStl },
      { name: STL_FILE_NAMES.trailLine, filePath: trailStl },
      { name: STL_FILE_NAMES.trayBase, filePath: trayStl },
    ]);

    onProgress({
      phase: "save",
      progress: 0.9,
      message: "请选择保存位置…",
    });

    const saveOptions = {
      title: "保存 TrailPrint STL 压缩包",
      defaultPath: defaultZipName(),
      filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
    };
    const { canceled, filePath } = browserWindow
      ? await dialog.showSaveDialog(browserWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions);

    if (canceled || !filePath) {
      onProgress({
        phase: "done",
        progress: 1,
        message: "已取消保存",
      });
      return {
        cancelled: true,
        generationMs: Date.now() - started,
      };
    }

    const dest = filePath.endsWith(".zip") ? filePath : `${filePath}.zip`;
    await copyFile(zipTempPath, dest);

    shell.showItemInFolder(dest);

    const fileName = basename(dest);
    onProgress({
      phase: "done",
      progress: 1,
      message: `已保存 ${fileName}，已在 Finder 中显示`,
    });

    return {
      savedPath: dest,
      cancelled: false,
      generationMs: Date.now() - started,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
