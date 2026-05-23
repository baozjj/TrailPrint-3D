# TrailPrint 3D · 架构说明（任务-00）

## 进程职责

| 进程 | 职责 |
| --- | --- |
| **渲染进程** (`src/`) | 界面展示、Pinia 参数状态、地图交互、轻量 3D 预览 |
| **主进程** (`electron/main/`) | GPX 解析、DEM 采样、网格布尔/挖槽、STL 写出、文件系统、ZIP 打包 |

UI 线程不执行上述重度计算；耗时工作通过 `task:enqueue` 进入主进程任务队列。

## 目录结构

```
electron/main/     主进程入口、IPC handlers、任务队列
electron/preload/  contextBridge 暴露 trailPrint API
shared/            IPC 通道名、类型、五模块 AppConfig
src/               Vue 3 渲染进程、stores、ipc 客户端
```

## IPC 约定

- 通道命名：`domain:action`（见 `shared/ipc/channels.ts`）
- 错误：主进程 `IpcException` → preload 序列化为 `{ code, message }`
- 渲染端：`src/ipc/client.ts` 封装 `window.trailPrint`

## 脚本

- `npm run dev` — 开发模式启动 Electron + Vite HMR
- `npm run build` — 构建到 `out/`
- `npm run package` — 构建并 electron-builder 打包

## 后续任务接入点

- GPX 解析：主进程 handler + `TaskKind 'gpx-parse'`
- 配置快照：`useConfigStore().toSnapshot()` 经 IPC 传给主进程
- Terrain_Main / Trail_Line：`terrain:generate` IPC + `electron/main/terrain/`；挖槽与轨迹见 `trail-groove.ts`、`trail-line-mesh.ts`；贴合规则见 `docs/trail-projection.md`
- Tray_Base：`tray:generate` IPC + `electron/main/tray/`；字体清单见 `shared/tray/font-catalog.ts`、`assets/fonts/README.md`
- STL/ZIP：`stl-export`、`zip-pack` 任务种类已预留
