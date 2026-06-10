# Role & Task

You are an expert Frontend Engineer and UI/UX Designer specializing in the Apple Human Interface Guidelines (HIG). Your task is to generate the UI for a web application named "印迹 TrailPrint 3D" based on my instructions.

# Language Requirement ⚠️

**CRITICAL:** All UI text, labels, buttons, and placeholders MUST be in Simplified Chinese (简体中文). The code and comments can be in English.

# App Concept

"印迹 TrailPrint 3D" is a premium tool that converts GPX trail data into a 3D-printable terrain monument. The UI must feel like a native macOS or iPadOS app: minimalist, elegant, professional, and intuitive.

# Design System & Styling (Apple Style)

- **Typography:** Use `Inter` or `San Francisco` font. Clean hierarchy, using subtle grays for secondary text (`text-gray-500`).
- **Layout Model:** Full-bleed immersive design. The background is a large interactive Map/3D Preview area. Overlay a floating, scrollable Control Sidebar on the left.
- **Surfaces & Materials:** Use glassmorphism for the sidebar and floating panels (`backdrop-blur-xl`, `bg-white/80` in light mode, or `bg-neutral-900/80` in dark mode).
- **Corners & Borders:** Use large rounded corners (`rounded-2xl` or `rounded-3xl` for panels, `rounded-lg` for inputs). Extremely subtle borders (`border-white/20` or `border-gray-200/50`).
- **Components:**
  - Replace standard radio buttons with **iOS-style Segmented Controls** (animated pill background).
  - Use **iOS-style Toggle Switches** for boolean options.
  - Inputs should have a clean, light gray background without heavy borders, showing a subtle focus ring on active.
  - Use **Sliders** with a sleek, thin track and a clean circular thumb.
- **Primary Action:** The "导出 STL 文件" (Export) button should look like an Apple Pay button (Solid Black or Solid sleek Accent Color, pill-shaped `rounded-full`, bold text).

# UI Layout Structure

Please build a layout with two main areas:

## Area 1: The Immersive Preview (Right / Background)

- A large, full-height container representing the interactive map/3D viewer.
- Add a subtle placeholder text or grid background indicating "地图与 3D 预览区".
- Floating at the top center, add a minimalist segmented control to toggle between "2D 地图视图" and "3D 模型预览".

## Area 2: The Control Sidebar (Left, Floating)

- A floating panel with a subtle shadow (`shadow-2xl`), glassmorphism, and scrollable content (`overflow-y-auto`).
- Include a sleek header with the title "印迹 TrailPrint 3D" and an "导入 GPX" button.
- Organize the configuration into an **Accordion (Collapsible Panels)**.

### Sidebar Content (Map to these 5 modules in Chinese):

**1. 地图与尺寸 (Section 1)**

- 形状: Segmented Control [圆形 | 矩形 | 多边形].
- 尺寸输入: Dynamic inputs based on shape (半径 / 长度 / 宽度 / 边数 / 边长). Display them cleanly with "mm" as suffix.

**2. 地形塑造 (Section 2)**

- 模型基础厚度: Numerical input with "mm".
- Z轴山体倍数: A sleek slider from 1.0x to 5.0x.
- 地形平滑度: Segmented Control [原始 | 轻度 | 中度 | 高度].

**3. 轨迹设置 (Section 3)**

- GPX 数据优化: iOS Toggle switch with label "过滤噪点，平滑轨迹".
- 轨迹宽度 & 轨迹深度: Two side-by-side numerical inputs with "mm" suffix.

**4. 托盘底座 (Section 4)**

- 底座尺寸: Stacked inputs for "总厚度", "下陷深度", and "边框宽度".

**5. 装配与磁铁 (Section 5 - Advanced, default collapsed)**

- 打印公差: Inputs for "轨迹槽公差" (default 0.15mm) and "底座槽公差" (default 0.20mm).
- 磁铁组件: Toggle "启用免胶水磁吸装配". If ON, show inputs for "磁铁直径" and "磁铁厚度", and checkboxes for "底面展示孔(如冰箱贴)" and "模型拼接定位孔".

### Sidebar Footer (Sticky Bottom)

- A frosted glass footer stuck to the bottom of the sidebar.
- Contains the large, prominent "生成并下载 STL" (Generate & Download) button.

# Execution

Generate the React/Tailwind code. Ensure the code is modular, uses modern React hooks for state (e.g., handling the dynamic shape switching logic), and strictly adheres to the Apple minimalist aesthetic.
