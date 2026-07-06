# 🏔️ TrailPrint 3D

**English | [中文](README.md)**

**Turn hiking GPX tracks into 3D-printable terrain models · GPX to STL**

### 🎁 Custom printed models

If you don't have a 3D printer or prefer a finished physical terrain model based on your GPX track, contact the author on WeChat for custom printing.

- **WeChat ID:** `gg_0328_bao`
- **WeChat QR code:**

![WeChat QR code](wechat-qr-new.JPG)

---

TrailPrint 3D is an open-source desktop app that combines GPX activity tracks with real-world elevation data (DEM) to generate STL models ready for 3D printing. Import a `.gpx` file from platforms like [2bulu](https://www.2bulu.com/), frame the area on a map, tune print size and terrain settings, and export split parts — no manual 3D modeling required.

### Use cases

- **Hiking & trail-running keepsakes:** Turn routes like West Lake Heart Trail, Wugong Mountain, MacLehose Trail, or Tiger Leaping Gorge into a displayable terrain model
- **GPX to STL:** Import a track and get `Terrain_Main.stl` (terrain), `Trail_Line.stl` (trail), and `Tray_Base.stl` (tray base) automatically
- **Multi-color FDM printing:** Split exports for Bambu Lab and other multi-color FDM printers — trail grooves plus a separate line part for color swaps, magnet holes for glue-free assembly
- **Terrain relief display pieces:** Adjustable elevation exaggeration, surface smoothing, and a picture-frame base to make subtle real-world relief readable at desk scale

> If this project helps you, consider giving it a **Star** ⭐ — it helps you follow updates and helps others discover the repo.

---

## 🛠️ Workflow

### 0. Get a GPX file

Export your target track as a `.gpx` file from your GPS app or platform of choice (e.g. Garmin, Strava, AllTrails, or [2bulu](https://www.2bulu.com/) for Chinese hiking communities).

![Export GPX](docs/images/readme/00-gpx-export-2bulu.webp)

### 1. Import the track

Launch the app and upload the `.gpx` file from the previous step.

![Import GPX track](docs/images/readme/01-import-gpx.webp)

### 2. Frame and tune parameters

Choose a base shape (circle, rectangle, or regular polygon), then pan and zoom the map to position your track. Hold **Alt / Option** and drag to rotate map bearing. Use the sidebar to set print dimensions, corner radius, elevation exaggeration, surface smoothing, tray base, and assembly tolerances.

![Frame and tune parameters](docs/images/readme/02-compose-framing.webp)

### 3. Preview and export

Check the terrain, trail, and tray in the 3D preview, then generate and download the model archive.

![Export model](docs/images/readme/03-export-model.webp)

### 4. Import into Bambu Studio and assign colors

Unzip the archive and drag `Terrain_Main.stl`, `Trail_Line.stl`, and `Tray_Base.stl` into [Bambu Studio](https://bambulab.com/en/download/studio). Assign filament colors to terrain, trail, and base, preview the multi-color assembly, then slice and print.

![Import into Bambu Studio](docs/images/readme/04-bambu-studio-import.webp)

![Colored preview in Bambu Studio](docs/images/readme/05-bambu-studio-colored.webp)

### 5. Print and assemble

After printing, assemble the terrain, trail, and tray parts into the finished physical model.

![Printed result](docs/images/readme/06-printed-result.webp)

![Printed result](docs/images/readme/07-printed-result-2.webp)

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

Elevation data comes from [OpenTopography](https://portal.opentopography.org/requestService?service=api). After launching the app, enter your API key in the **OpenTopography API Key** card at the top of the sidebar ([free registration](https://portal.opentopography.org/requestService?service=api)). The key is stored locally only and is not distributed with the repo.

### Optional environment variables

Copy `.env.example` to `.env` for development options. You can also pre-fill the API key via environment variables (not required):

```bash
OPENTOPOGRAPHY_API_KEY=your_key_here
VITE_OPENTOPOGRAPHY_API_KEY=your_key_here
```

For high-resolution studio exports or large custom grids, you can raise the V8 heap limit (MB, default 8192):

```bash
TRAILPRINT_HEAP_MB=8192
```

### Other commands

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev mode with hot reload                   |
| `npm run build`     | Build production output to `out/`          |
| `npm run preview`   | Preview the built app                      |
| `npm run package`   | Build and package installers to `release/` |
| `npm run typecheck` | Run TypeScript type checking               |

---

## ✨ Core features

### 🗺️ 1. Framing and map crop

- **Base shape:** Circular, rectangular, or regular polygon crop regions.
- **Print size:** Scale the model to your actual print dimensions (e.g. 150mm × 150mm).
- **Map framing:** Pan and zoom on the map to select the trail and terrain area to keep.
- **Map rotation:** Alt / Option + drag to rotate map bearing while the crop mask stays fixed.
- **Corner radius:** Rounded outer contours for rectangles and polygons (0 = sharp corners).

### ⛰️ 2. Terrain generation and trail processing

- **Height multiplier:** Exaggerate Z-axis elevation so subtle real-world relief reads at desk scale.
- **Mesh quality:** Standard / high / ultra / extreme / studio / custom tiers to control DEM sampling density and STL detail.
- **DEM dataset:** Choose OpenTopography datasets (e.g. COP30 30m) based on region and resolution needs.
- **Surface smoothing:** Raw, light, medium, and heavy levels to reduce noise and stair-stepping for cleaner prints.
- **Trail filtering:** Optional GPX simplification to filter GPS drift and noise for smoother trail lines.

### 🖼️ 3. Tray base

- **Inset frame structure:** Automatically generates a picture-frame base that wraps the main terrain mesh.
- **Adjustable parameters:** Set total thickness, inset depth, and border width for different print and display needs.
- **NFC & LED:** Reserve NFC chip pockets and 0805 LED indicator slots in the tray recess, with an optional `Tray_Cover.stl` cover plate.

### 🧩 4. Split printing and assembly

Built for multi-color printing and post-print assembly:

- **Print tolerances:** Separate clearance settings for trail grooves and base slots (e.g. 0.15mm) to compensate for filament expansion.
- **Magnet holes:** Enter magnet diameter and thickness to auto-generate aligned holes on the tray bottom (2–12 for circles, 4 corners for rectangles, 1 per vertex for polygons) for snap-together assembly and display.

---

## 📦 Output files

After generation, you get a zip archive containing:

| File               | Description                                             | Condition           |
| ------------------ | ------------------------------------------------------- | ------------------- |
| `Terrain_Main.stl` | Main terrain mesh with base thickness and trail grooves | Always              |
| `Trail_Line.stl`   | Separate trail line mesh for color-swap printing        | Always              |
| `Tray_Base.stl`    | Tray base with inset groove and magnet holes            | Always              |
| `Tray_Cover.stl`   | NFC / LED cover plate                                   | When NFC is enabled |

Import the STL files into your slicer, assign colors and print settings, and start making.

---

## 📋 TODO

The following capabilities are still in development and not yet available to users:

- **Spray-paint segmentation:** After printing a single-color white model, apply rule-based surface coloring and generate fit-checked 3D stencil shells (`Mask_Color_XX.stl`) plus a color manifest for partitioned spray painting. See [PRD-spray-paint-masks.md](./PRD-spray-paint-masks.md).

---

## ⭐ Support the project

TrailPrint 3D is maintained by an individual developer. If you find it useful, please star the repo. Feedback and suggestions are welcome via [Issues](https://github.com/baozjj/TrailPrint-3D/issues).
