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

## 装配公差（任务-06 入口）

- `config.assembly.trailToleranceMm` 仅扩大凹槽宽度，不改变轨迹实体宽度
