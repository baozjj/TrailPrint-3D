# 🏔️ TrailPrint 3D

**English | [中文](README.md)**

**Turn hiking GPX tracks into 3D-printable terrain models · GPX to STL**

### 🎁 Custom printed models

If you don't have a 3D printer or prefer a finished physical terrain model based on your GPX track, contact the author on WeChat for custom printing.

- **WeChat ID:** `YOUR_WECHAT_ID`
- **WeChat QR code:**

![WeChat QR code](docs/images/readme/wechat-qr.webp)

<!-- TODO: Replace YOUR_WECHAT_ID with your WeChat ID; save the QR code image as docs/images/readme/wechat-qr.webp -->

---

TrailPrint 3D is an open-source desktop app that combines GPX activity tracks with real-world elevation data (DEM) to generate multi-part STL models ready for multi-color FDM 3D printing. Import a `.gpx` file, frame the area on a map, tune print size and terrain settings, and export split parts — no manual 3D modeling required.

### Use cases

- **Hiking & trail-running keepsakes:** Turn routes like West Lake Heart Trail, Wugong Mountain, MacLehose Trail, or Tiger Leaping Gorge into a displayable terrain model
- **GPX to STL:** Import a track and get `Terrain_Main.stl` (terrain), `Trail_Line.stl` (trail), and `Tray_Base.stl` (tray base) automatically
- **Multi-color 3D printing:** Split exports for Bambu Lab and other multi-color FDM printers — trail grooves plus a separate line part for color swaps, magnet holes for glue-free assembly
- **Terrain relief display pieces:** Adjustable elevation exaggeration, surface smoothing, and a picture-frame base to make subtle real-world relief readable at desk scale

> If this project helps you, consider giving it a **Star** ⭐ — it helps you follow updates and helps others discover the repo.

---

## 🛠️ Workflow

### 0. Get a GPX file

Export your target track as a `.gpx` file from your GPS app or platform of choice (e.g. Garmin, Strava, AllTrails, or [2bulu](https://www.2bulu.com/) for Chinese hiking communities).

<!-- Screenshot: export GPX from track app -->

![Export GPX](docs/images/readme/00-gpx-export-2bulu.webp)

### 1. Import the track

Launch the app and upload the `.gpx` file from the previous step.

<!-- Screenshot: upload GPX -->

![Import GPX track](docs/images/readme/01-import-gpx.webp)

### 2. Frame the scene and tune parameters

Choose a base shape, drag and scale the track on the map, and adjust terrain height, surface smoothing, tray base, assembly tolerances, and magnet holes in the sidebar.

<!-- Screenshot: map framing + sidebar -->

![Frame and tune parameters](docs/images/readme/02-compose-framing.webp)

### 3. Export the model

When the preview looks good, generate and download the bundled 3D model archive.

<!-- Screenshot: export and download -->

![Export model](docs/images/readme/03-export-model.webp)

### 4. Import into Bambu Studio and assign colors

Unzip the download and drag `Terrain_Main.stl`, `Trail_Line.stl`, and `Tray_Base.stl` into [Bambu Studio](https://bambulab.com/en/download/studio). Assign filament colors to terrain, trail, and base, preview the multi-color assembly, then slice and print.

<!-- Screenshot: import three STLs in Bambu Studio -->

![Import models in Bambu Studio](docs/images/readme/04-bambu-studio-import.webp)

<!-- Screenshot: colored preview in Bambu Studio -->

![Colored preview in Bambu Studio](docs/images/readme/05-bambu-studio-colored.webp)

### 5. Print and assemble

After printing, assemble the terrain, trail, and base parts into the finished physical model.

<!-- Photo: printed result -->

![3D printed result](docs/images/readme/06-printed-result.webp)

![3D printed result](docs/images/readme/07-printed-result-2.webp)

---

## 🚀 Quick start

This project is an **Electron + Vue 3** desktop app managed with npm.

### Requirements

- [Node.js](https://nodejs.org/) 18 or later
- npm (bundled with Node.js)

### Install and run

```bash
# Clone the repo and enter the project directory
cd TrailPrint-3D

# Install dependencies
npm install

# Start dev mode (opens an Electron window)
npm run dev
```

### OpenTopography API Key

Elevation data comes from [OpenTopography](https://portal.opentopography.org/requestService?service=api). After launching the app, enter your key in the **OpenTopography API Key** card at the top of the sidebar ([free registration](https://portal.opentopography.org/requestService?service=api)). Keys are stored locally only and are not shipped with the repo.

### Optional environment variables

Copy `.env.example` to `.env` for development options. You can also pre-fill the API key via environment variables (optional):

```bash
OPENTOPOGRAPHY_API_KEY=your_key_here
VITE_OPENTOPOGRAPHY_API_KEY=your_key_here
```

For high-resolution exports or large custom resolutions, you can raise the V8 heap limit (MB, default 8192):

```bash
TRAILPRINT_HEAP_MB=8192
```

### Other commands

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev mode with hot reload                 |
| `npm run build`     | Build production output to `out/`        |
| `npm run preview`   | Preview the built app                    |
| `npm run package`   | Build and package installers to `release/` |
| `npm run typecheck` | Run TypeScript type checking             |

---

## ✨ Core features

### 🗺️ 1. Framing and map crop

- **Base shape:** Circular, rectangular, or regular polygon crop regions.
- **Print size:** Scale the model to your actual print dimensions (e.g. 150mm × 150mm).
- **Map framing:** Pan and zoom on the map to select the trail and terrain area to keep.

### ⛰️ 2. Terrain generation and trail processing

- **Height multiplier:** Exaggerate Z-axis elevation so subtle real-world relief reads at desk scale.
- **Surface smoothing:** Low, medium, and high smoothing levels to reduce noise and stair-stepping for cleaner prints.
- **Trail filtering:** Filters GPS drift and noise in GPX data for smoother trail lines.

### 🖼️ 3. Tray base

- **Inset frame structure:** Automatically generates a picture-frame base that wraps the main terrain mesh.
- **Adjustable parameters:** Set total thickness, inset depth, and border width for different print and display needs.

### 🧩 4. Split printing and assembly

Built for multi-color printing and post-print assembly:

- **Print tolerances:** Separate clearance settings for trail grooves and base slots (e.g. 0.15mm) to compensate for filament expansion.
- **Magnet holes:** Enter magnet diameter and thickness to auto-generate aligned holes in terrain and base for snap-together assembly without glue.
- **Fridge-magnet mode:** Optionally add magnet holes on the bottom of the base so the model can stick to ferrous surfaces.

---

## 📦 Output files

After generation, you get a zip archive containing these 3 `.stl` files:

- **`Terrain_Main.stl`:** Main terrain mesh with base thickness and trail grooves cut into the surface.
- **`Trail_Line.stl`:** Separate trail line mesh with shrink tolerance applied for color-swap printing.
- **`Tray_Base.stl`:** Tray base with inset groove and magnet holes.

Import all three into your slicer, assign colors and print settings, and start printing.

---

## ⭐ Support the project

TrailPrint 3D is maintained by an individual developer. If you find it useful, please star the repo. Feedback and suggestions are welcome via [Issues](https://github.com/baozjj/TrailPrint-3D/issues).
