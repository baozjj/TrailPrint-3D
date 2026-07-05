# 🏔️ 印迹 TrailPrint 3D

**[English](README.en.md) | 中文**

**将徒步轨迹（GPX）导出为可 3D 打印的地形模型 · GPX to 3D printable terrain**

### 🎁 定制 3D 模型实物

如果你没有 3D 打印机，或希望直接拿到基于 GPX 轨迹的地形模型成品，欢迎微信联系作者定制打印。

- **微信号：** `gg_0328_bao`
- **微信二维码：**

![微信二维码](wechat-qr.JPG)

---

「印迹 TrailPrint 3D」是一款开源桌面工具，用于把 GPX 运动轨迹与真实地形高程（DEM）结合，生成可直接用于 3D 打印的 STL 模型。支持从 [两步路](https://www.2bulu.com/) 等平台导出的 `.gpx` 文件；上传轨迹后，可在地图上调整取景范围与朝向，设置打印尺寸与地形参数，并导出分件模型——无需手动 3D 建模。

### 适用场景

- **徒步 / 越野跑纪念品**：走完西湖爱心线、武功山、麦理浩径、虎跳峡等路线，把轨迹「印」成一座可摆放的地形模型
- **GPX 转 STL**：导入轨迹文件，自动生成 `Terrain_Main.stl`（山体）、`Trail_Line.stl`（路线）、`Tray_Base.stl`（托盘底座）
- **多色 FDM 打印**：分件导出，适配拓竹（Bambu Lab）等多色打印机；轨迹凹槽 + 独立线条换色，磁吸孔位免胶水拼装
- **地形浮雕摆件**：可调山体高度、表面平滑、画框式底座，弥补缩放到桌面尺寸后地形起伏不明显的问题

> 如果这个项目对你有帮助，欢迎在页面右上角点个 **Star** ⭐ —— 方便你跟进后续更新，也能让更多人发现它。

---

## 🛠️ 操作流程

### 0. 获取 GPX 文件（两步路）

在 [两步路](https://www.2bulu.com/) 中打开目标轨迹，导出为 `.gpx` 文件，供后续导入使用。

![两步路导出 GPX](docs/images/readme/00-gpx-export-2bulu.webp)

### 1. 导入轨迹

启动应用后，上传上一步导出的 `.gpx` 文件。

![导入 GPX 轨迹](docs/images/readme/01-import-gpx.webp)

### 2. 构图取景与调整参数

选择底座形状（圆形 / 矩形 / 正多边形），在地图上拖动、缩放轨迹位置；按住 **Alt / Option** 拖拽可旋转地图朝向。侧栏可设置打印尺寸、外轮廓 R 角、山体高度、表面平滑、托盘底座，以及拼装公差与磁吸孔位等参数。

![构图取景与调整参数](docs/images/readme/02-compose-framing.webp)

### 3. 预览与导出模型

在 3D 预览中检查山体、轨迹与托盘效果，确认无误后生成并下载打包好的 3D 模型压缩包。

![导出模型](docs/images/readme/03-export-model.webp)

### 4. 导入 Bambu Studio 并上色

解压下载的压缩包，将 `Terrain_Main.stl`、`Trail_Line.stl`、`Tray_Base.stl` 三个文件拖入 [Bambu Studio](https://bambulab.com/zh/download/studio)，为山体、轨迹与底座分别指定耗材颜色，预览多色拼装效果后即可切片打印。

![Bambu Studio 导入模型](docs/images/readme/04-bambu-studio-import.webp)

![Bambu Studio 上色效果](docs/images/readme/05-bambu-studio-colored.webp)

### 5. 打印成品

切片发送打印后，将山体、轨迹与底座拼装完成，即可得到实体地形模型。

![3D 打印成品](docs/images/readme/06-printed-result.webp)

![3D 打印成品](docs/images/readme/07-printed-result-2.webp)

---

## 🚀 快速开始

本项目为 **Electron + Vue 3** 桌面应用，使用 npm 管理依赖。

### 环境要求

- [Node.js](https://nodejs.org/) 18 或更高版本
- npm（随 Node.js 安装）

### 安装与启动

```bash
# 克隆仓库后进入项目目录
cd TrailPrint-3D

# 安装依赖
npm install

# 启动开发模式（会打开 Electron 窗口）
npm run dev
```

### OpenTopography API Key

地形高程数据来自 [OpenTopography](https://portal.opentopography.org/requestService?service=api)。启动应用后，在侧栏顶部的 **OpenTopography API Key** 卡片中填写你的 Key（[免费注册申请](https://portal.opentopography.org/requestService?service=api)）。Key 仅保存在本机，不会随仓库分发。

### 可选环境变量

复制 `.env.example` 为 `.env` 可配置开发用选项。API Key 也可通过环境变量预填（非必需）：

```bash
OPENTOPOGRAPHY_API_KEY=你的密钥
VITE_OPENTOPOGRAPHY_API_KEY=你的密钥
```

高精度制版或自定义分辨率较大时，可提高 V8 堆内存上限（单位 MB，默认 8192）：

```bash
TRAILPRINT_HEAP_MB=8192
```

### 其他命令

| 命令                | 说明                                    |
| ------------------- | --------------------------------------- |
| `npm run dev`       | 开发模式，热更新                        |
| `npm run build`     | 构建生产产物到 `out/`                   |
| `npm run preview`   | 预览构建后的应用                        |
| `npm run package`   | 构建并打包为安装包（输出到 `release/`） |
| `npm run typecheck` | TypeScript 类型检查                     |

---

## ✨ 核心功能

### 🗺️ 1. 构图与地图裁剪

- **底座形状：** 支持圆形、矩形或正多边形裁剪范围。
- **打印尺寸：** 按实际打印尺寸（如 150mm × 150mm）等比缩放模型。
- **地图取景：** 在地图上平移、缩放，框选需要保留的轨迹与地形区域。
- **地图旋转：** Alt / Option + 拖拽旋转地图朝向，遮罩选区保持固定。
- **外轮廓 R 角：** 矩形与正多边形支持圆角外轮廓，0 为直角。

### ⛰️ 2. 地形生成与轨迹处理

- **高度倍数：** 可按需拉高 Z 轴山体高度，弥补真实地形缩放后起伏不明显的问题。
- **网格精度：** 标准 / 高精 / 超高 / 极致 / 制版 / 自定义多档，控制 DEM 采样密度与 STL 细节。
- **DEM 数据源：** 可选 OpenTopography 数据集（如 COP30 30m），按区域与精度需求切换。
- **表面平滑：** 原始、轻度、中度、高度四档，减少地形毛刺与阶梯感，便于打印。
- **轨迹过滤：** 可选 GPX 简化，过滤 GPS 漂移与噪点，使路线线条更连贯。

### 🖼️ 3. 托盘底座

- **内嵌式结构：** 自动生成包裹山体主模型的画框式底座。
- **可调参数：** 可设置总厚度、下陷深度与边框宽度，以适配不同打印与摆放需求。
- **NFC 与 LED：** 可在凹槽顶面预留 NFC 芯片槽与 0805 LED 指示灯位，并导出配套 `Tray_Cover.stl` 盖片。

### 🧩 4. 分件打印与组装

面向多色打印与后期拼装，提供以下能力：

- **打印公差：** 可分别设置轨迹槽与底座槽的预留公差（如 0.15mm），补偿耗材膨胀带来的尺寸偏差。
- **磁铁孔位：** 输入磁铁直径与厚度后，自动在托盘底面生成对齐孔位（圆形可设 2～12 孔，矩形四角各 1 孔，正多边形顶点各 1 孔），便于磁吸固定与展示。

---

## 📦 交付物说明

点击生成后，将获得包含以下文件的压缩包：

| 文件 | 说明 | 条件 |
| --- | --- | --- |
| `Terrain_Main.stl` | 带基础厚度的山体主模型，表面已挖出轨迹凹槽 | 始终包含 |
| `Trail_Line.stl` | 独立轨迹线条模型，用于换色打印 | 始终包含 |
| `Tray_Base.stl` | 托盘底座，含内嵌凹槽与磁铁孔位 | 始终包含 |
| `Tray_Cover.stl` | NFC / LED 装配盖片 | 启用 NFC 时 |

将 STL 文件分别导入切片软件，按需要设置颜色与打印参数后即可开始制作。

---

## 📋 TODO

以下能力尚在开发中，暂未对用户开放：

- **喷漆分色：** 单色打印白模后，基于地图颜色规则分色，生成可套合的 3D 遮挡罩（`Mask_Color_XX.stl`）与分色清单，供分区喷漆还原地表颜色。详见 [PRD-spray-paint-masks.md](./PRD-spray-paint-masks.md)。

---

## ⭐ 支持项目

印迹 TrailPrint 3D 由个人维护。若你觉得它好用，欢迎给仓库点个 Star；有建议或问题，也欢迎通过 [Issues](https://github.com/baozjj/TrailPrint-3D/issues) 反馈。
