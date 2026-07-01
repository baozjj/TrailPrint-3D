# 轨迹与地形贴合规则（任务-04）

## 平面坐标

GPX 点 `(lat, lon)` 映射到与 `Terrain_Main` 相同的模型平面 (mm)：

- 使用任务-02 输出的 `TerrainCropRegion` 外接经纬度矩形做线性插值
- `xMm = -width/2 + width × (lon - minLon) / (maxLon - minLon)`
- `yMm = -height/2 + height × (lat - minLat) / (maxLat - minLat)`

遮罩旋转已体现在 `minLat/maxLat/minLon/maxLon` 四角采样中，无需再单独乘 bearing 矩阵。

## 表面高度 Z

- Z=0：全图最低海拔（基础顶面基准）；基础厚度在 Z=0 以下（如 2 mm 基础 → Z∈[-2,0]）
- **平底槽底** `floorZ = -trailDepthMm`（如深度 1.5 mm → 槽底 -0.5 mm）；走廊内槽底以上至原地表为空腔
- 轨迹顶面 Z：沿路径在挖槽前地表双线性采样，再加 `trail.heightAboveMainMm`
- 轨迹底面 Z：与主模型平底槽相同 `floorZ`
- 主模型挖槽：走廊内格点统一设为 `floorZ`

## 装配公差（任务-06）

- `config.assembly.trailToleranceMm` 仅扩大凹槽宽度：`trailWidth + 2×tolerance`
- `Trail_Line` 实体宽度（预览与 STL 一致）：`trailWidth`（不受公差影响）
- 地图遮罩像素大小随侧栏物理尺寸（半径/长宽/边长 mm）同比缩放，与 STL 外轮廓一致
- `config.assembly.trayToleranceMm` 扩大托盘凹槽相对主模型外轮廓

## 磁铁孔（任务-06）

- `config.assembly.magnet.enabled === false` 时不生成任何孔
- **拼接孔**（`snapFitHole`）：`computeMagnetHoleLayout` 在模型平面给出 4 个配对 XY；主模型自 `bottomZ` 向上、托盘凹槽底自 `floorZ` 向下各挖 `thicknessMm` 深
- **冰箱贴孔**（`fridgeMagnetHole`）：托盘最底面 `z=0` 向上浅孔，孔心沿外轮廓内缩布置
- 孔径/孔深公差：`magnet.toleranceMm` 仅扩大六边形孔内切圆直径（+2×）与孔深（+1×），便于嵌入
