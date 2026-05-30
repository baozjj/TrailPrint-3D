/** OpenTopography Global DEM API 数据集（与 portal 参数 demtype 一致） */
export type OpenTopoDemType =
  | "COP30"
  | "COP90"
  | "NASADEM"
  | "SRTMGL1"
  | "SRTMGL3";

export interface OpenTopoDemOption {
  value: OpenTopoDemType;
  label: string;
  /** 下拉框下方一行摘要 */
  hint: string;
  /** 水平分辨率说明 */
  resolution: string;
  /** 详细说明（用于 tooltip） */
  summary: string;
  /** 推荐使用场景 */
  bestFor: string;
}

export const OPEN_TOPO_DEM_OPTIONS: ReadonlyArray<OpenTopoDemOption> = [
  {
    value: "COP30",
    label: "COP30 (30m)",
    hint: "默认推荐 · 全球 30m，细节与速度平衡最好",
    resolution: "约 30 m",
    summary:
      "欧空局 Copernicus 全球 30 m 地形产品（GLO-30）。覆盖范围广、现势性较好，是多数 3D 打印地形的首选。",
    bestFor: "一般纪念模型、需要较细山脊与河谷时优先选此项。",
  },
  {
    value: "COP90",
    label: "COP90 (90m)",
    hint: "下载更快 · 细节较少",
    resolution: "约 90 m",
    summary:
      "Copernicus 全球 90 m 版本。每个网格点代表更大范围的海拔平均，山体更「钝」、小细节会被抹平。",
    bestFor: "只关心大致山势、想缩短 DEM 下载与生成时间时。",
  },
  {
    value: "NASADEM",
    label: "NASADEM (30m)",
    hint: "NASA 重处理 SRTM · 空洞修补较好",
    resolution: "约 30 m",
    summary:
      "基于 SRTM 的 NASA 再处理产品，对原始 SRTM 的空洞、噪声做了改进，高程与 SRTM 接近但通常更干净。",
    bestFor: "COP30 不可用或想对比另一套 30 m 数据源时。",
  },
  {
    value: "SRTMGL1",
    label: "SRTM 30m",
    hint: "经典全球 30 m · 部分山区可能有数据空洞",
    resolution: "约 30 m（1 角秒）",
    summary:
      "航天飞机雷达测高的经典全球 DEM，使用广泛。陡峭植被区历史上偶有空洞，OpenTopography 会按区域返回拼接结果。",
    bestFor: "熟悉 SRTM、或需要与其它 SRTM 流程对齐时。",
  },
  {
    value: "SRTMGL3",
    label: "SRTM 90m",
    hint: "低分辨率 · 仅适合大体轮廓",
    resolution: "约 90 m（3 角秒）",
    summary:
      "SRTM 的粗分辨率版本，与 COP90 类似，难以表现细微地形起伏。",
    bestFor: "快速试看、对细节要求很低时。",
  },
] as const;

/** DEM 数据源说明（侧边栏 tooltip 全文） */
export function openTopoDemTooltipText(): string {
  const lines = [
    "数字高程模型 (DEM) 决定山体的高度数据。本应用通过 OpenTopography 按地图范围下载栅格，再采样到 3D 网格。",
    "",
    "主要差别：",
    "· 分辨率（30 m vs 90 m）：数值越小，山脊、沟壑越细腻；90 m 更平滑、更快。",
    "· 数据来源与修补：不同卫星/算法，在山区、海岸的空洞与噪声处理不同。",
    "· 与「网格精度」的关系：DEM 是原料精度；网格精度再高，也无法超过 DEM 本身（例如 90 m DEM 无法变出 30 m 细节）。",
    "",
    ...OPEN_TOPO_DEM_OPTIONS.flatMap((o) => [
      `【${o.label}】${o.resolution}`,
      o.summary,
      `适合：${o.bestFor}`,
      "",
    ]),
    "建议：打印纪念模型优先 COP30；侧边栏「网格精度」选高精/超高。",
  ];
  return lines.join("\n").trim();
}

export interface DemFetchOptions {
  dataset: OpenTopoDemType;
  /** OpenTopography API Key */
  openTopographyApiKey: string;
}
