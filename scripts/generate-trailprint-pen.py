#!/usr/bin/env python3
"""Generate 迹印 TrailPrint 3D main UI .pen file from UI文档.md spec."""

import json
import random
import string
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "迹印-TrailPrint-3D.pen"

SCREEN_W = 1440
SCREEN_H = 900
SIDEBAR_W = 400
PAGE_PADDING = 24  # 页面四周边距 [上, 右, 下, 左]
COLUMN_GAP = 20  # 配置栏与地图预览栏间距
PANEL_RADIUS = 16  # 左右模块圆角
PREVIEW_W = SCREEN_W - PAGE_PADDING * 2 - SIDEBAR_W - COLUMN_GAP
PREVIEW_H = SCREEN_H - PAGE_PADDING * 2
VIEW_TOGGLE_W = 400
VIEW_TOGGLE_X = (PREVIEW_W - VIEW_TOGGLE_W) // 2
VIEW_TOGGLE_Y = 24

_used_ids: set[str] = set()


def nid(prefix: str = "") -> str:
    while True:
        s = "".join(random.choices(string.ascii_letters + string.digits, k=5))
        if s not in _used_ids:
            _used_ids.add(s)
            return s


def text_node(content: str, *, size=14, weight="normal", fill="#1D1D1F", growth=None, width=None):
    n = {
        "type": "text",
        "id": nid(),
        "fill": fill,
        "content": content,
        "fontFamily": "Inter",
        "fontSize": size,
        "fontWeight": weight,
    }
    if growth:
        n["textGrowth"] = growth
    if width:
        n["width"] = width
    return n


def icon_node(name: str, *, size=16, fill="#86868B"):
    return {
        "type": "icon_font",
        "id": nid(),
        "iconFontName": name,
        "iconFontFamily": "lucide",
        "width": size,
        "height": size,
        "fill": fill,
    }


def glass_effect():
    return [
        {"type": "background_blur", "radius": 24},
        {
            "type": "shadow",
            "shadowType": "outer",
            "color": "#0000001A",
            "offset": {"x": 0, "y": 8},
            "blur": 32,
            "spread": -4,
        },
    ]


def segmented_control(labels: list[str], active_index: int = 0):
    seg = {
        "type": "frame",
        "id": nid(),
        "name": "SegmentedControl",
        "layout": "horizontal",
        "width": "fill_container",
        "height": 36,
        "fill": "#E8E8ED",
        "cornerRadius": 10,
        "padding": 3,
        "gap": 2,
        "children": [],
    }
    for i, label in enumerate(labels):
        active = i == active_index
        pill = {
            "type": "frame",
            "id": nid(),
            "layout": "horizontal",
            "width": "fill_container",
            "height": "fill_container",
            "cornerRadius": 8,
            "justifyContent": "center",
            "alignItems": "center",
            "fill": "#FFFFFF" if active else "transparent",
            "children": [
                text_node(
                    label,
                    size=13,
                    weight="600" if active else "normal",
                    fill="#1D1D1F" if active else "#86868B",
                )
            ],
        }
        if active:
            pill["effect"] = [
                {
                    "type": "shadow",
                    "shadowType": "outer",
                    "color": "#00000014",
                    "offset": {"x": 0, "y": 1},
                    "blur": 3,
                }
            ]
        seg["children"].append(pill)
    return seg


def toggle_row(label: str, on: bool = True):
    track_fill = "#34C759" if on else "#E5E5EA"
    thumb_x = 14 if on else 2
    return {
        "type": "frame",
        "id": nid(),
        "name": "ToggleRow",
        "layout": "horizontal",
        "width": "fill_container",
        "justifyContent": "space_between",
        "alignItems": "center",
        "children": [
            text_node(label, size=14, fill="#1D1D1F"),
            {
                "type": "frame",
                "id": nid(),
                "width": 44,
                "height": 26,
                "cornerRadius": 13,
                "fill": track_fill,
                "layout": "none",
                "children": [
                    {
                        "type": "ellipse",
                        "id": nid(),
                        "x": thumb_x,
                        "y": 3,
                        "width": 20,
                        "height": 20,
                        "fill": "#FFFFFF",
                        "effect": [
                            {
                                "type": "shadow",
                                "shadowType": "outer",
                                "color": "#00000026",
                                "offset": {"x": 0, "y": 2},
                                "blur": 4,
                            }
                        ],
                    }
                ],
            },
        ],
    }


def input_field(label: str, value: str, suffix: str = "mm", width_half=False):
    field_w = "fill_container"
    row = {
        "type": "frame",
        "id": nid(),
        "layout": "vertical",
        "width": field_w,
        "gap": 6,
        "children": [
            text_node(label, size=12, fill="#86868B"),
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "height": 40,
                "fill": "#F2F2F7",
                "cornerRadius": 10,
                "padding": [0, 12],
                "alignItems": "center",
                "justifyContent": "space_between",
                "children": [
                    text_node(value, size=15, weight="500"),
                    text_node(suffix, size=13, fill="#86868B") if suffix else None,
                ],
            },
        ],
    }
    row["children"][1]["children"] = [c for c in row["children"][1]["children"] if c]
    if width_half:
        row["width"] = "fill_container"
    return row


def slider_row(label: str, value: str = "2.5x"):
    return {
        "type": "frame",
        "id": nid(),
        "layout": "vertical",
        "width": "fill_container",
        "gap": 8,
        "children": [
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "justifyContent": "space_between",
                "children": [
                    text_node(label, size=12, fill="#86868B"),
                    text_node(value, size=13, weight="600", fill="#007AFF"),
                ],
            },
            {
                "type": "frame",
                "id": nid(),
                "layout": "none",
                "width": "fill_container",
                "height": 24,
                "children": [
                    {
                        "type": "rectangle",
                        "id": nid(),
                        "x": 0,
                        "y": 10,
                        "width": 320,
                        "height": 4,
                        "fill": "#E5E5EA",
                        "cornerRadius": 2,
                    },
                    {
                        "type": "rectangle",
                        "id": nid(),
                        "x": 0,
                        "y": 10,
                        "width": 180,
                        "height": 4,
                        "fill": "#007AFF",
                        "cornerRadius": 2,
                    },
                    {
                        "type": "ellipse",
                        "id": nid(),
                        "x": 168,
                        "y": 4,
                        "width": 16,
                        "height": 16,
                        "fill": "#FFFFFF",
                        "stroke": {"align": "outside", "thickness": 0.5, "fill": "#0000001A"},
                        "effect": [
                            {
                                "type": "shadow",
                                "shadowType": "outer",
                                "color": "#00000033",
                                "offset": {"x": 0, "y": 2},
                                "blur": 6,
                            }
                        ],
                    },
                ],
            },
        ],
    }


def accordion_section(title: str, children_nodes: list, *, expanded: bool = True, badge: str = None):
    chevron = "chevron-down" if expanded else "chevron-right"
    header_children = [
        text_node(title, size=15, weight="600"),
    ]
    if badge:
        header_children.append(
            {
                "type": "frame",
                "id": nid(),
                "fill": "#F2F2F7",
                "cornerRadius": 6,
                "padding": [4, 8],
                "children": [text_node(badge, size=11, fill="#86868B")],
            }
        )
    header_children.append(icon_node(chevron, size=18, fill="#86868B"))

    section = {
        "type": "frame",
        "id": nid(),
        "name": title,
        "layout": "vertical",
        "width": "fill_container",
        "fill": "#FFFFFF",
        "cornerRadius": 16,
        "stroke": {"align": "inside", "thickness": 1, "fill": "#0000000F"},
        "children": [
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "padding": [14, 16],
                "justifyContent": "space_between",
                "alignItems": "center",
                "children": header_children,
            }
        ],
    }
    if expanded and children_nodes:
        body = {
            "type": "frame",
            "id": nid(),
            "layout": "vertical",
            "width": "fill_container",
            "gap": 14,
            "padding": [0, 16, 16, 16],
            "children": children_nodes,
        }
        section["children"].append(body)
    return section


def checkbox_row(label: str, checked: bool = False):
    box_fill = "#007AFF" if checked else "transparent"
    box_stroke = "#007AFF" if checked else "#C7C7CC"
    box_children = []
    if checked:
        box_children.append(icon_node("check", size=12, fill="#FFFFFF"))
    return {
        "type": "frame",
        "id": nid(),
        "layout": "horizontal",
        "width": "fill_container",
        "gap": 10,
        "alignItems": "center",
        "children": [
            {
                "type": "frame",
                "id": nid(),
                "width": 20,
                "height": 20,
                "cornerRadius": 6,
                "fill": box_fill,
                "stroke": {"align": "inside", "thickness": 1.5, "fill": box_stroke},
                "justifyContent": "center",
                "alignItems": "center",
                "children": box_children,
            },
            text_node(label, size=14, fill="#1D1D1F"),
        ],
    }


def build_document() -> dict:
    # --- Section 1 content ---
    sec1 = accordion_section(
        "1. 地图与尺寸",
        [
            {
                "type": "frame",
                "id": nid(),
                "layout": "vertical",
                "width": "fill_container",
                "gap": 8,
                "children": [
                    text_node("形状", size=12, fill="#86868B"),
                    segmented_control(["圆形", "矩形", "多边形"], 0),
                ],
            },
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "gap": 12,
                "children": [
                    input_field("半径", "75"),
                    input_field("边数", "6", suffix=""),
                ],
            },
        ],
    )

    sec2 = accordion_section(
        "2. 地形塑造",
        [
            input_field("模型基础厚度", "3.0"),
            slider_row("Z轴高程夸张", "2.5x"),
            {
                "type": "frame",
                "id": nid(),
                "layout": "vertical",
                "width": "fill_container",
                "gap": 8,
                "children": [
                    text_node("地形平滑度", size=12, fill="#86868B"),
                    segmented_control(["原始", "轻度", "中度", "高度"], 1),
                ],
            },
        ],
    )

    sec3 = accordion_section(
        "3. 轨迹设置",
        [
            toggle_row("过滤噪点，平滑轨迹", True),
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "gap": 12,
                "children": [
                    input_field("轨迹宽度", "2.0"),
                    input_field("轨迹深度", "1.5"),
                ],
            },
        ],
    )

    sec4 = accordion_section(
        "4. 托盘底座与刻字",
        [
            input_field("总厚度", "4.0"),
            input_field("下陷深度", "2.0"),
            input_field("边框宽度", "8.0"),
            toggle_row("启用边框刻字", True),
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "gap": 8,
                "children": [
                    input_field("上", "2024.05.22", suffix=""),
                    input_field("下", "华山论剑", suffix=""),
                ],
            },
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "gap": 8,
                "children": [
                    input_field("左", "15.2 km", suffix=""),
                    input_field("右", "海拔 2154m", suffix=""),
                ],
            },
            segmented_control(["阴刻(凹)", "阳刻(凸)"], 0),
            text_node("仅支持矩形与多边形", size=11, fill="#86868B", growth="fixed-width", width="fill_container"),
        ],
    )

    sec5 = accordion_section(
        "5. 装配与磁铁",
        [
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "gap": 12,
                "children": [
                    input_field("轨迹槽公差", "0.15"),
                    input_field("底座槽公差", "0.20"),
                ],
            },
            toggle_row("启用免胶水磁吸装配", False),
        ],
        expanded=False,
        badge="高级",
    )

    sidebar_content = {
        "type": "frame",
        "id": nid(),
        "name": "SidebarScroll",
        "layout": "vertical",
        "width": "fill_container",
        "height": "fill_container",
        "gap": 12,
        "children": [sec1, sec2, sec3, sec4, sec5],
    }

    import_btn = {
        "type": "frame",
        "id": nid(),
        "name": "ImportGPX",
        "layout": "horizontal",
        "height": 36,
        "cornerRadius": 18,
        "fill": "#F2F2F7",
        "padding": [0, 14],
        "gap": 6,
        "alignItems": "center",
        "children": [
            icon_node("upload", size=16, fill="#007AFF"),
            text_node("导入 GPX", size=14, weight="600", fill="#007AFF"),
        ],
    }

    export_btn = {
        "type": "frame",
        "id": nid(),
        "name": "ExportSTL",
        "layout": "horizontal",
        "width": "fill_container",
        "height": 52,
        "cornerRadius": 26,
        "fill": "#1D1D1F",
        "justifyContent": "center",
        "alignItems": "center",
        "effect": [
            {
                "type": "shadow",
                "shadowType": "outer",
                "color": "#00000033",
                "offset": {"x": 0, "y": 4},
                "blur": 16,
            }
        ],
        "children": [
            text_node("生成并下载 STL", size=16, weight="600", fill="#FFFFFF"),
        ],
    }

    sidebar = {
        "type": "frame",
        "id": nid(),
        "name": "ControlSidebar",
        "width": SIDEBAR_W,
        "height": "fill_container",
        "clip": True,
        "fill": "#FFFFFF",
        "cornerRadius": PANEL_RADIUS,
        "stroke": {"align": "inside", "thickness": 1, "fill": "#0000000F"},
        "effect": [
            {
                "type": "shadow",
                "shadowType": "outer",
                "color": "#0000000A",
                "offset": {"x": 0, "y": 2},
                "blur": 12,
            }
        ],
        "layout": "vertical",
        "children": [
            {
                "type": "frame",
                "id": nid(),
                "name": "SidebarHeader",
                "layout": "vertical",
                "width": "fill_container",
                "gap": 12,
                "padding": [20, 20, 12, 20],
                "children": [
                    {
                        "type": "frame",
                        "id": nid(),
                        "layout": "horizontal",
                        "width": "fill_container",
                        "justifyContent": "space_between",
                        "alignItems": "center",
                        "children": [
                            {
                                "type": "frame",
                                "id": nid(),
                                "layout": "vertical",
                                "gap": 2,
                                "children": [
                                    text_node("迹印", size=22, weight="700"),
                                    text_node("TrailPrint 3D", size=12, fill="#86868B"),
                                ],
                            },
                            import_btn,
                        ],
                    },
                    {
                        "type": "rectangle",
                        "id": nid(),
                        "width": "fill_container",
                        "height": 1,
                        "fill": "#0000000F",
                    },
                ],
            },
            {
                "type": "frame",
                "id": nid(),
                "name": "SidebarBody",
                "layout": "vertical",
                "width": "fill_container",
                "height": "fill_container",
                "padding": [0, 16],
                "children": [sidebar_content],
            },
            {
                "type": "frame",
                "id": nid(),
                "name": "SidebarFooter",
                "layout": "vertical",
                "width": "fill_container",
                "padding": [12, 20, 20, 20],
                "fill": "#FAFAFA",
                "stroke": {
                    "thickness": {"top": 1},
                    "fill": "#0000000F",
                },
                "children": [
                    {
                        "type": "rectangle",
                        "id": nid(),
                        "width": "fill_container",
                        "height": 1,
                        "fill": "#0000000F",
                    },
                    export_btn,
                ],
            },
        ],
    }

    view_toggle = {
        "type": "frame",
        "id": nid(),
        "name": "ViewToggle",
        "width": VIEW_TOGGLE_W,
        "layout": "horizontal",
        "fill": "#FFFFFFCC",
        "cornerRadius": 12,
        "padding": 4,
        "gap": 2,
        "stroke": {"align": "inside", "thickness": 1, "fill": "#00000014"},
        "effect": [
            {"type": "background_blur", "radius": 20},
            {
                "type": "shadow",
                "shadowType": "outer",
                "color": "#00000014",
                "offset": {"x": 0, "y": 2},
                "blur": 8,
            },
        ],
        "children": [],
    }
    for i, label in enumerate(["2D 地图视图", "3D 模型预览"]):
        active = i == 0
        view_toggle["children"].append(
            {
                "type": "frame",
                "id": nid(),
                "layout": "horizontal",
                "width": "fill_container",
                "height": 32,
                "cornerRadius": 8,
                "fill": "#1D1D1F" if active else "transparent",
                "justifyContent": "center",
                "alignItems": "center",
                "children": [
                    text_node(
                        label,
                        size=13,
                        weight="600" if active else "normal",
                        fill="#FFFFFF" if active else "#86868B",
                    )
                ],
            }
        )

    preview_top_bar = {
        "type": "frame",
        "id": nid(),
        "name": "PreviewTopBar",
        "x": VIEW_TOGGLE_X,
        "y": VIEW_TOGGLE_Y,
        "width": VIEW_TOGGLE_W,
        "height": 40,
        "layout": "horizontal",
        "justifyContent": "center",
        "alignItems": "center",
        "fill": "transparent",
        "children": [view_toggle],
    }

    preview_placeholder = {
        "type": "frame",
        "id": nid(),
        "name": "PreviewPlaceholder",
        "x": 0,
        "y": 0,
        "width": PREVIEW_W,
        "height": PREVIEW_H,
        "layout": "vertical",
        "justifyContent": "center",
        "alignItems": "center",
        "gap": 8,
        "children": [
            icon_node("map", size=48, fill="#86868B55"),
            text_node("地图与 3D 预览区", size=18, fill="#86868B"),
            text_node("拖动地图取景 · 缩放查看轨迹", size=13, fill="#86868B"),
        ],
    }

    preview_content = {
        "type": "frame",
        "id": nid(),
        "name": "PreviewContent",
        "x": 0,
        "y": 0,
        "width": PREVIEW_W,
        "height": PREVIEW_H,
        "clip": True,
        "fill": {
            "type": "gradient",
            "gradientType": "linear",
            "rotation": 180,
            "size": {"height": 1},
            "colors": [
                {"color": "#E8F4FC", "position": 0},
                {"color": "#D4E8D4", "position": 0.5},
                {"color": "#C8DCC8", "position": 1},
            ],
        },
        "layout": "none",
        "children": [preview_placeholder, preview_top_bar],
    }

    preview = {
        "type": "frame",
        "id": nid(),
        "name": "PreviewArea",
        "width": "fill_container",
        "height": "fill_container",
        "clip": True,
        "fill": "transparent",
        "cornerRadius": PANEL_RADIUS,
        "stroke": {"align": "inside", "thickness": 1, "fill": "#0000000F"},
        "effect": [
            {
                "type": "shadow",
                "shadowType": "outer",
                "color": "#0000000A",
                "offset": {"x": 0, "y": 2},
                "blur": 12,
            }
        ],
        "layout": "none",
        "children": [preview_content],
    }

    screen = {
        "type": "frame",
        "id": nid(),
        "x": 0,
        "y": 0,
        "name": "迹印 TrailPrint 3D — 主界面",
        "clip": True,
        "width": SCREEN_W,
        "height": SCREEN_H,
        "fill": "#F5F5F7",
        "layout": "horizontal",
        "padding": [PAGE_PADDING, PAGE_PADDING, PAGE_PADDING, PAGE_PADDING],
        "gap": COLUMN_GAP,
        "children": [sidebar, preview],
    }

    return {
        "version": "2.6",
        "variables": {
            "color/bg/page": {"type": "color", "value": "#F5F5F7"},
            "color/bg/glass": {"type": "color", "value": "#FFFFFFCC"},
            "color/text/primary": {"type": "color", "value": "#1D1D1F"},
            "color/text/secondary": {"type": "color", "value": "#86868B"},
            "color/accent": {"type": "color", "value": "#007AFF"},
            "color/cta": {"type": "color", "value": "#1D1D1F"},
            "radius/panel": {"type": "number", "value": 24},
            "radius/control": {"type": "number", "value": 10},
        },
        "children": [screen],
    }


def main():
    doc = build_document()
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
