# 印迹 TrailPrint 3D · UI 设计稿说明

## 设计文件

| 文件 | 说明 |
|------|------|
| [`印迹-TrailPrint-3D.pen`](../印迹-TrailPrint-3D.pen) | Pencil 主界面设计稿（1440×900） |
| [`scripts/generate-trailprint-pen.py`](../scripts/generate-trailprint-pen.py) | 设计稿生成脚本，可按 UI 文档迭代后重新运行 |

## 打开方式

1. 在 Cursor / VS Code 中安装 **Pencil** 扩展（`highagency.pencildev`）
2. 打开项目根目录下的 `印迹-TrailPrint-3D.pen`
3. 若需在对话中用 MCP 自动改稿，请在 Cursor **Settings → MCP** 中启用 Pencil 服务并保持扩展运行

## 设计对照（`UI文档.md`）

- **布局**：左右分栏（左 400px 配置栏 + 右侧预览区），页面四周 24px 内边距，两栏间距 20px，模块圆角 16px
- **预览区**：渐变地形背景、网格占位、「地图与 3D 预览区」文案、顶部「2D 地图视图 / 3D 模型预览」分段控件
- **侧栏**：标题「印迹 / TrailPrint 3D」、导入 GPX、五个手风琴配置区（第 5 项默认折叠并标「高级」）、底部磨砂底栏 +「生成并下载 STL」主按钮
- **组件风格**：iOS 分段控件、开关、细轨道滑块、圆角输入框（mm 后缀）、Apple 风格黑底胶囊主按钮
- **文案**：全部为简体中文

## 后续建议

- 在 Pencil 中微调间距、阴影与模糊强度以贴近实机 macOS 效果
- 可另建画板展示「3D 模型预览」选中态、「装配与磁铁」展开态
- 设计确认后可用 `opt-pencil-to-code` 或按 `UI文档.md` 生成 React/Tailwind 实现
