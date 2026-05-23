# 轨迹与地形贴合规则（任务-04）

## 平面坐标

GPX 点 `(lat, lon)` 映射到与 `Terrain_Main` 相同的模型平面 (mm)：

- 使用任务-02 输出的 `TerrainCropRegion` 外接经纬度矩形做线性插值
- `xMm = -width/2 + width × (lon - minLon) / (maxLon - minLon)`
- `yMm = -height/2 + height × (lat - minLat) / (maxLat - minLat)`

遮罩旋转已体现在 `minLat/maxLat/minLon/maxLon` 四角采样中，无需再单独乘 bearing 矩阵。

## 表面高度 Z

- 轨迹顶面 Z：在 DEM 高度场（挖槽前）上对 `(xMm, yMm)` 双线性采样
- 轨迹底面 Z：`zTop - trailDepthMm`
- 主模型挖槽：在高度场网格上，距折线水平距离 ≤ `(trailWidth + 2×trailTolerance) / 2` 的格点降低 `trailDepthMm`

## 装配公差（任务-06）

- `config.assembly.trailToleranceMm` 仅扩大凹槽宽度：`trailWidth + 2×tolerance`，不改变 `Trail_Line` 实体宽度
- `config.assembly.trayToleranceMm` 扩大托盘凹槽相对主模型外轮廓

## 磁铁孔（任务-06）

- `config.assembly.magnet.enabled === false` 时不生成任何孔
- **拼接孔**（`snapFitHole`）：`computeMagnetHoleLayout` 在模型平面给出 4 个配对 XY；主模型自 `bottomZ` 向上、托盘凹槽底自 `floorZ` 向下各挖 `thicknessMm` 深
- **冰箱贴孔**（`fridgeMagnetHole`）：托盘最底面 `z=0` 向上浅孔，孔心沿外轮廓内缩布置
