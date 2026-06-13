# Heightmapper (Electron Edition)

Interactive grayscale heightmap generator using Nextzen global terrain tiles. Electron-based desktop application with GUI and headless CLI modes.

Based on [Tangram Heightmapper](http://tangrams.github.io/heightmapper) by Mapzen.

## Features

- **Interactive GUI**: Browse real-world elevation data on an interactive map
- **Auto-exposure**: Automatically adjusts elevation range for optimal grayscale output
- **PNG Export**: Save heightmaps for use as displacement maps in 3D applications
- **High-res Render**: Multi-cell rendering up to 8x zoom multiplier
- **Headless CLI**: Automated heightmap export from command line
- **AI Agent JSON**: Programmatic metadata output for automated pipelines
- **Blender Pipeline**: Included script for direct import into Blender

## Quick Start

### Install

```bash
npm install
```

### Run (GUI Mode)

```bash
npm start
```

Or double-click `start.bat` on Windows.

### Build Distributable

```bash
npm run build
```

Or double-click `build.bat` on Windows.

## CLI / Headless Mode

For automated workflows and AI agent integration:

```bash
# Export Seoul heightmap
npx electron . --export --lat 37.5665 --lng 126.978 --zoom 10 -o seoul.png

# Get metadata as JSON (for AI agents)
npx electron . --json --lat 37.5665 --lng 126.978 --zoom 10

# Export + JSON together
npx electron . --export --json --lat 37.5665 --lng 126.978 --zoom 12 -o seoul_hd.png
```

Or use `run-cli.bat`:

```cmd
run-cli.bat --export --lat 37.5665 --lng 126.978 --zoom 10 -o seoul.png
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--export` | Export heightmap as PNG | - |
| `--json` | Output metadata as JSON to stdout | - |
| `--lat FLOAT` | Center latitude | 0 |
| `--lng FLOAT` | Center longitude | 0 |
| `--zoom FLOAT` | Zoom level (1-15) | 2 |
| `--min FLOAT` | Min elevation in meters | 0 |
| `--max FLOAT` | Max elevation in meters | 8848 |
| `-o, --output FILE` | Output filename | auto-generated |
| `--width INT` | Render width in pixels | 1280 |
| `--height INT` | Render height in pixels | 720 |
| `--timeout INT` | Timeout in milliseconds | 60000 |

### JSON Output Example

```json
{
  "status": "ok",
  "bounds": {
    "north": 37.601,
    "south": 37.532,
    "east": 127.024,
    "west": 126.932
  },
  "elevation": {
    "min": 0,
    "max": 342.5
  },
  "scaleFactor": "0.000087",
  "dimensions": {
    "width": 1280,
    "height": 720
  },
  "center": {
    "lat": 37.5665,
    "lng": 126.978
  },
  "zoom": 10
}
```

## AI Agent Integration

The headless JSON mode is designed for AI agent workflows:

1. Agent requests elevation metadata: `--json --lat X --lng Y --zoom Z`
2. Parse JSON output for bounds, elevation range, scale factor
3. Optionally export PNG: `--export --json --lat X --lng Y --zoom Z -o output.png`
4. Use the heightmap as displacement map in 3D pipelines

## GUI Usage

- **Auto-expose**: Automatically adjusts display range (on by default)
- **Export**: Click to save current view as PNG
- **Render**: High-resolution multi-cell render (set multiplier first)
- **h key**: Toggle UI visibility
- **ESC**: Close help dialog

## Using Heightmaps in 3D

See [exporting_to_blender.md](exporting_to_blender.md) for a Blender tutorial, or use the included `export_to_blender.py` script:

```bash
blender --python export_to_blender.py -- heightmap.png 0.000087
```

## Project Structure

```
├── main.js              # Electron main process (CLI parser + window management)
├── preload.js           # Electron preload (IPC bridge)
├── app.js               # Renderer: map, auto-exposure, Tangram integration
├── index.html           # Main HTML
├── scene.yaml           # Tangram scene config (data sources + shaders)
├── package.json         # Electron package
├── lib/
│   ├── tangram.min.js   # WebGL map renderer
│   ├── dat.gui.min.js   # GUI controls
│   ├── FileSaver.js     # File save utility
│   └── leaflet-hash.js  # URL hash state
├── export_to_blender.py # Blender import script
├── start.bat            # Windows: start GUI
├── build.bat            # Windows: build distributable
└── run-cli.bat          # Windows: CLI headless mode
```

## Environment Variables

No environment variables required. Uses free AWS S3 elevation tiles (no API key needed).

## Data Sources

- **Terrain tiles**: [AWS S3 Elevation Tiles](https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png) — free, no API key required
- **Elevation encoding**: Terrarium format — `height = (R*256 + G + B/256) * 255 - 32768` meters

## Tech Stack

- **Runtime**: Electron (Chromium)
- **Map**: Leaflet.js
- **Rendering**: Tangram (WebGL)
- **Data**: Nextzen terrain + vector tiles

## License

MIT License — Copyright (c) 2014 Mapzen. See [LICENSE](LICENSE).
