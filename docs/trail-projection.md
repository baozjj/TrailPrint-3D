# 轨迹与地形贴合规则（任务-04）

## 平面坐标

GPX 点 `(lat, lon)` 映射到与 `Terrain_Main` 相同的模型平面 (mm)：

- 使用任务-02 输出的 `TerrainCropRegion` 外接经纬度矩形做线性插值
- `xMm = -width/2 + width × (lon - minLon) / (maxLon - minLon)`
- `yMm = -height/2 + height × (lat - minLat) / (maxLat - minLat)`

遮罩旋转已体现在 `minLat/maxLat/minLon/maxLon` 四角采样中，无需再单独乘 bearing 矩阵。

## 表面高度 Z

- 轨迹顶面 Z：沿路径在挖槽前地表双线性采样，再加 `trail.heightAboveMainMm`（高出主模型）
- 轨迹底面 Z：与主模型平底槽同一水平面 `floorZ`
- 主模型挖槽：走廊内格点统一设为 `floorZ`；`floorZ = 走廊内地表最低点 − trailDepthMm`

## 装配公差（任务-06）

- `config.assembly.trailToleranceMm` 扩大凹槽宽度：`trailWidth + 2×tolerance`
- `Trail_Line` 实体宽度（预览与 STL 一致）：`trailWidth − 2×tolerance`
- 地图遮罩像素大小随侧栏物理尺寸（半径/长宽/边长 mm）同比缩放，与 STL 外轮廓一致
- `config.assembly.trayToleranceMm` 扩大托盘凹槽相对主模型外轮廓

## 磁铁孔（任务-06）

- `config.assembly.magnet.enabled === false` 时不生成任何孔
- **拼接孔**（`snapFitHole`）：`computeMagnetHoleLayout` 在模型平面给出 4 个配对 XY；主模型自 `bottomZ` 向上、托盘凹槽底自 `floorZ` 向下各挖 `thicknessMm` 深
- **冰箱贴孔**（`fridgeMagnetHole`）：托盘最底面 `z=0` 向上浅孔，孔心沿外轮廓内缩布置
