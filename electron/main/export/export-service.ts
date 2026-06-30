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
import { computeTrayBottomMagnetHoles } from "@shared/utils/magnet-hole-layout";
import {
  logMagnetDebug,
  magnetDebugSummary,
} from "@shared/utils/magnet-debug-log";
import { computeTrayFootprint } from "@shared/utils/tray-footprint";
import {
  computeTerrainPrintPolygon,
  computeTrayCoverPolygon,
  computeTrayNfcLayout,
} from "@shared/utils/tray-nfc-layout";
import { IpcException } from "@shared/ipc/types";
import { hydrateGpxConfig } from "../gpx/hydrate-gpx-config";
import { generateTerrainMain } from "../terrain/terrain-main-service";
import { generateTrayBase } from "../tray/tray-service";
import { buildTrayCoverMesh } from "../tray/tray-cover-mesh";
import { assertTrailLineMesh, assertWatertightMesh } from "@shared/utils/mesh-manifold";
import { writeBinaryStl } from "./stl-writer";
import { packZip, type ZipEntry } from "./zip-packager";
import { segmentSprayPaint } from "../spray-paint/segment-service";
import { generateSprayMasks } from "../spray-paint/mask-generate-service";
import {
  SPRAY_MANIFEST_FILE_NAME,
  writeSprayPaintManifest,
} from "../spray-paint/manifest-writer";

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
    stlExport: true,
    trailLineWidthMm: trailLineWidthMmForPrint(config),
  });

  onProgress({
    phase: "tray",
    progress: 0.45,
    message: "正在生成托盘底座…",
  });

  const trayFootprint = computeTrayFootprint(config);
  if (config.assembly.magnet.enabled) {
    const previewHoles = computeTrayBottomMagnetHoles(config, trayFootprint);
    const summary = magnetDebugSummary({
      phase: "export-preview",
      mapCropShape: config.mapCrop.shape,
      polygonSides: config.mapCrop.polygonSides,
      footprintShape: trayFootprint.shape,
      outerVertCount: trayFootprint.outer.length,
      holeCount: previewHoles.length,
    });
    logMagnetDebug({
      phase: "export",
      mapCropShape: config.mapCrop.shape,
      polygonSides: config.mapCrop.polygonSides,
      footprintShape: trayFootprint.shape,
      outerVertCount: trayFootprint.outer.length,
      magnetEnabled: true,
      circleCount: config.assembly.magnet.circleCount,
      holeCount: previewHoles.length,
      holes: previewHoles,
      note: summary,
    });
  }

  const trayRes = await generateTrayBase({
    config,
    viewportWidth,
    viewportHeight,
  });

  const trailPoints = config.gpx.points.length || config.gpx.rawPoints.length;
  const trailPolylinePts = terrainWithGroove.trailPolylineMm?.length ?? 0;
  if (!terrainWithGroove.trailMesh) {
    throw new IpcException(
      "TRAIL_EMPTY",
      trailPoints < 2
        ? "GPX 轨迹点不足，请重新导入有效的 GPX 文件"
        : trailPolylinePts < 2
          ? `无法生成轨迹模型（已读取 ${trailPoints} 个轨迹点，但投影进打印区的有效折线不足）。请在 2D 地图中将红色轨迹拖入中心白框内后再导出`
          : `无法生成轨迹网格（打印区折线 ${trailPolylinePts} 点）。请尝试略增大轨迹宽度，或重置地图视图后重新导出`,
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

    assertWatertightMesh(terrainWithGroove.mesh, "Terrain_Main");
    assertWatertightMesh(trayRes.mesh, "Tray_Base");
    if (terrainWithGroove.trailMesh) {
      assertTrailLineMesh(terrainWithGroove.trailMesh, "Trail_Line");
    }

    await writeBinaryStl(terrainStl, terrainWithGroove.mesh, "Terrain_Main");
    await writeBinaryStl(trailStl, terrainWithGroove.trailMesh, "Trail_Line");
    await writeBinaryStl(trayStl, trayRes.mesh, "Tray_Base");

    const zipEntries: ZipEntry[] = [
      { name: STL_FILE_NAMES.terrainMain, filePath: terrainStl },
      { name: STL_FILE_NAMES.trailLine, filePath: trailStl },
      { name: STL_FILE_NAMES.trayBase, filePath: trayStl },
    ];

    if (config.tray.nfc.enabled) {
      const nfcLayout = computeTrayNfcLayout(
        config,
        trayFootprint,
        viewportWidth,
        viewportHeight,
      );
      const coverVerts = computeTrayCoverPolygon(
        config,
        config.tray.nfc.coverInsetMm,
      );
      if (!coverVerts) {
        throw new IpcException(
          "TRAY_COVER_INVALID",
          "盖片内缩过大，请减小内缩距离或增大打印尺寸",
        );
      }
      const coverMesh = buildTrayCoverMesh({
        outerVerts: coverVerts,
        ledPockets: nfcLayout.ledPockets,
        ledPocketLengthMm: config.tray.nfc.ledPocketLengthMm,
        ledPocketWidthMm: config.tray.nfc.ledPocketWidthMm,
        thicknessMm: config.tray.nfc.coverThicknessMm,
      });
      assertWatertightMesh(coverMesh, "Tray_Cover");
      const coverStl = join(workDir, STL_FILE_NAMES.trayCover);
      await writeBinaryStl(coverStl, coverMesh, "Tray_Cover");
      zipEntries.push({ name: STL_FILE_NAMES.trayCover, filePath: coverStl });
    }

    if (config.sprayPaint.enabled) {
      if (!terrainWithGroove.heightPreview || !terrainWithGroove.crop) {
        throw new IpcException(
          "SPRAY_NO_TERRAIN",
          "地形预览数据缺失，无法生成喷漆遮挡罩",
        );
      }

      onProgress({
        phase: "masks",
        progress: 0.62,
        message: "正在生成喷漆遮挡罩…",
      });

      let plan = req.sprayPaintPlan ?? null;
      try {
        if (!plan) {
          onProgress({
            phase: "masks",
            progress: 0.64,
            message: "正在规则分色…",
          });
          const segRes = await segmentSprayPaint(
            {
              config,
              heightPreview: terrainWithGroove.heightPreview,
              crop: terrainWithGroove.crop,
              viewportWidth,
              viewportHeight,
            },
            (p) => {
              onProgress({
                phase: "masks",
                progress: 0.64 + p.progress * 0.04,
                message: p.message,
              });
            },
          );
          plan = segRes.plan;
        } else {
          onProgress({
            phase: "masks",
            progress: 0.66,
            message: "复用预览分色方案…",
          });
        }

        const maskRes = await generateSprayMasks(
          {
            config,
            plan,
            heightPreview: terrainWithGroove.heightPreview,
            crop: terrainWithGroove.crop,
          },
          (p) => {
            onProgress({
              phase: "masks",
              progress: 0.68 + p.progress * 0.08,
              message: p.message,
            });
          },
        );

        if (maskRes.masks.length === 0) {
          throw new IpcException(
            "SPRAY_MASK_EMPTY",
            "未生成任何遮挡罩，请检查分色结果后重试",
          );
        }

        for (const mask of maskRes.masks) {
          if (!mask.indices?.length || mask.indices.length < 3) continue;
          const maskPath = join(workDir, mask.fileName);
          await writeBinaryStl(maskPath, mask, mask.fileName);
          zipEntries.push({ name: mask.fileName, filePath: maskPath });
        }

        if (zipEntries.length <= 3) {
          throw new IpcException(
            "SPRAY_MASK_EMPTY",
            "遮挡罩网格为空，无法导出",
          );
        }

        const manifestPath = join(workDir, SPRAY_MANIFEST_FILE_NAME);
        await writeSprayPaintManifest(manifestPath, config, plan);
        zipEntries.push({
          name: SPRAY_MANIFEST_FILE_NAME,
          filePath: manifestPath,
        });
      } catch (err) {
        if (err instanceof IpcException) throw err;
        const msg =
          err instanceof Error ? err.message : "喷漆遮挡罩生成失败，请重试";
        throw new IpcException("SPRAY_MASK_FAILED", msg);
      }
    }

    onProgress({
      phase: "zip",
      progress: 0.78,
      message: "正在打包 ZIP…",
    });

    await packZip(zipTempPath, zipEntries);

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
