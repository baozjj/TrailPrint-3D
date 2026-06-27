# 任务-12：喷漆分色 — ZIP 导出

| 字段 | 内容 |
| --- | --- |
| **状态** | 已完成 |
| **优先级** | P0 |
| **来源** | PRD §4.4、§9、§12 |
| **依赖** | [任务-07](./任务-07-STL导出与ZIP交付.md)、[任务-10](./任务-10-喷漆分色-遮罩壳生成与预览.md) |
| **阻塞** | —（喷漆 MVP 终点） |

## 目标

当 `sprayPaint.enabled === true` 时，在现有三件套 ZIP 基础上追加 N 个 `Mask_Color_XX.stl` 与 `spray_paint_manifest.json`；未启用时导出行为与现版 **完全一致**。

## 范围

### 包含

- 扩展 [`electron/main/export/export-service.ts`](./electron/main/export/export-service.ts)
- 导出前调用罩体生成（复用任务-10 服务，避免重复实现）
- `spray_paint_manifest.json` 规范
- 导出进度文案（「正在生成喷漆遮挡罩…」）
- `ControlSidebar` 喷漆高级参数：厚度、间隙、过渡宽度（可选）

### 不包含

- `spray_paint_preview.png` 俯视分色图（P1，后续迭代）
- 笔刷编辑、工程持久化

## 功能清单

| ID | 需求 | 优先级 |
| --- | --- | --- |
| F-04-1 | ZIP 增加 `Mask_Color_*.stl` | P0 |
| F-04-2 | 附带 `spray_paint_manifest.json` | P0 |
| F-04-3 | 附带 `spray_paint_preview.png` | P1（本任务可不实现） |
| F-04-4 | 未启用时与现版一致 | P0 |

## 技术要点

### 1. 导出流程扩展

在 `generateModelsZip` 现有流程末尾：

```
现有: Terrain_Main + Trail_Line + Tray_Base → ZIP
新增（enabled）:
  1. 若渲染进程未传 plan → 主进程执行 segment（任务-09）
  2. generateMasks（任务-10）
  3. writeBinaryStl × N
  4. 写 manifest.json
  5. packZip 追加文件
```

### 2. 请求扩展

```ts
// shared/types/export.ts
export interface ExportGenerateRequest {
  // ...existing
  sprayPaintPlan?: SprayPaintPlan | null;  // 预览已算好则传入，避免重复分色
}
```

### 3. manifest 规范（PRD §9）

`userData` 不写敏感信息；manifest 示例：

```json
{
  "version": 1,
  "colorCount": 4,
  "categoryRuleVersion": 1,
  "colors": [
    {
      "index": 1,
      "hex": "#5A8F4A",
      "label": "植被",
      "description": "森林与草地",
      "stl": "Mask_Color_01.stl",
      "regionId": 0
    }
  ],
  "maskShellThicknessMm": 1.0,
  "maskFitToleranceMm": 0.2,
  "bleedMarginMm": 0.5,
  "terrainStl": "Terrain_Main.stl",
  "maskMode": "negative",
  "generatedAt": 1719312000000
}
```

可选字段：`gridCols`、`gridRows`、`cellRegionsHash`（如对 `cellRegions` 做 SHA256 摘要，不嵌入完整数组以控制体积）。

### 4. 文件命名

| 文件 | 规则 |
| --- | --- |
| `Mask_Color_01.stl` … | `index` 两位零填充，与 `SprayColorSlot.index` 一致 |
| `spray_paint_manifest.json` | 固定文件名 |

### 5. STL 写出

复用 [`electron/main/export/stl-writer.ts`](./electron/main/export/stl-writer.ts) 与 `assertWatertightMesh`（任务-10 已校验，导出前可再抽样）。

### 6. UI

- 预览弹窗「生成并下载 STL」：若 `sprayPaint.enabled`，进度含罩体阶段
- `ControlSidebar` 折叠区「喷漆导出参数」绑定 `maskShellThicknessMm`、`maskFitToleranceMm`、`bleedMarginMm`

### 7. 兼容性

| `sprayPaint.enabled` | ZIP 内容 |
| --- | --- |
| `false` | 仅 3 个 STL，与任务-07 字节级流程一致 |
| `true` | 3 + N 个 Mask + manifest |

## 验收标准

- [x] `enabled=true`：ZIP 含 `Terrain_Main`、`Trail_Line`、`Tray_Base`、4×`Mask_Color_XX.stl`、`spray_paint_manifest.json`
- [x] `enabled=false`：ZIP 仅 3 个 STL，文件名与任务-07 一致
- [x] manifest 中 `colors` 与 STL 文件名、regionId 一致
- [x] 切片软件打开 Mask STL 无破面报错
- [x] 预览已生成 plan 时导出复用 plan，不重复分色（日志可区分）
- [x] 导出失败中文提示，不崩溃

## 测试建议

1. 完整流程：分色 → 套合检查 → 导出 → 解压核对 7 个文件
2. 未启用喷漆：与旧版 ZIP 对比文件列表
3. 修改 `maskShellThicknessMm` 后导出，STL 体积变化

## 交付物

- `export-service.ts` 扩展
- `shared/types/export.ts` 请求扩展
- manifest 生成器 `electron/main/spray-paint/manifest-writer.ts`
- `ControlSidebar.vue` 高级参数（可选）
- 导出进度 IPC 文案

## 参考

- [任务-07-STL导出与ZIP交付.md](./任务-07-STL导出与ZIP交付.md)
- [PRD-spray-paint-masks.md](./PRD-spray-paint-masks.md) §9
- [任务-10](./任务-10-喷漆分色-遮罩壳生成与预览.md)
