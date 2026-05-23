/**
 * 边框刻字开源字体清单（OFL / Apache-2.0）。
 * 主进程从 assets/fonts/{file} 加载；缺失时回退内置笔画字模。
 */
export interface TrayFontEntry {
  id: string;
  label: string;
  file: string;
  license: string;
}

export const TRAY_FONT_CATALOG: TrayFontEntry[] = [
  {
    id: "inter",
    label: "Inter",
    file: "Inter-Regular.ttf",
    license: "OFL-1.1",
  },
  {
    id: "roboto-slab",
    label: "Roboto Slab",
    file: "RobotoSlab-Regular.ttf",
    license: "Apache-2.0",
  },
  {
    id: "noto-sans-sc",
    label: "Noto Sans SC",
    file: "NotoSansSC-Regular.otf",
    license: "OFL-1.1",
  },
  {
    id: "source-sans",
    label: "Source Sans 3",
    file: "SourceSans3-Regular.otf",
    license: "OFL-1.1",
  },
  {
    id: "literata",
    label: "Literata",
    file: "Literata-Regular.ttf",
    license: "OFL-1.1",
  },
];

export const DEFAULT_TRAY_FONT_ID = "inter";

export function getTrayFontById(id: string): TrayFontEntry | undefined {
  return TRAY_FONT_CATALOG.find((f) => f.id === id);
}
