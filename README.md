# TX2-60 Pendant Trainer — Scientific Solutions

A WebXR training simulation of a six-axis TX2-60-class arm moving SLAS-format microplates from a dispenser nest to a plate-reader tray. It is built for the Meta Quest 3 browser and also works on a desktop with keyboard and mouse.

> **Status: Stage 1 of 6.** Done so far: the lab, lighting, XR entry, the desktop camera and a performance readout. The robot, pendant, programming and challenges come in later stages.

## Live build

**https://jammydav.github.io/VR_Robot_Training/** — open in the Quest 3 browser and press **Enter VR**.
Every push to `main` rebuilds and redeploys via GitHub Actions (`.github/workflows/deploy.yml`).

## Setup

Requires Node 20+ (developed on Node 24).

```bash
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | HTTPS dev server on the LAN (port 5173), for the headset |
| `npm run dev:desktop` | Plain-HTTP dev server on localhost (port 5174), for desktop testing |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm test` | Unit tests (kinematics, codegen and so on, from Stage 2) |

### Opening it on the Quest 3 over the LAN

1. Run `npm run dev`. Vite prints a `Network:` URL, for example `https://192.168.1.50:5173/`.
2. The PC and the headset must be on the same network. On Windows, allow Node.js through the firewall for **Private** networks when prompted.
3. In the Quest browser, open that URL. The certificate is self-signed, so tap **Advanced → Proceed** once.
4. Press **Enter VR**.

### Alternative: ADB reverse over USB (no certificate warning)

`localhost` counts as a secure context, so WebXR works over plain HTTP when the headset reaches the PC through USB port forwarding.

1. Enable developer mode on the headset and connect it by USB. Accept the debugging prompt.
2. Run these commands:
   ```bash
   npm run dev:desktop
   adb reverse tcp:5174 tcp:5174
   ```
3. In the Quest browser, open `http://localhost:5174/`.

### Measuring performance on the headset

- Press **P** on desktop, or add `?perf` to the URL, to toggle the readout: fps, worst frame time, draw calls and triangles. In VR the same line shows just below your view.
- For authoritative numbers, use Meta's **OVR Metrics Tool** overlay (fps, GPU and CPU levels).
- Targets: 72 fps minimum, 90 preferred, and under about 150 draw calls in the main view.

## Desktop controls (Stage 1)

| Input | Action |
|---|---|
| Left-drag | Orbit |
| Right-drag | Pan |
| Scroll | Zoom |
| `1` `2` `3` `4` | Operator, overview, cell close-up and boards views |
| `P` | Performance readout |

## Project layout

```
src/
  config/      robot spec, cell layout, plate dimensions, brand tokens
  core/        simulation state and logic, no scene objects (Stage 2+)
  input/       desktop camera; XR and desktop pendant adapters (Stage 3+)
  scene/       procedural lab, instruments, boards, lighting, static batcher
  ui/          SDF text (troika) and panel kit
  xr/          WebXR session, rig and controllers
  debug/       performance readout
```

### Rendering approach

- All geometry is procedural, with no external models.
- Static furniture is composed as ordinary Three.js object trees. `StaticBatcher` then merges it into one mesh per material, which brings the whole lab to about 60 draw calls.
- Lighting is a hemisphere light, one shadowed directional key over the bench, a weak fill light and a prefiltered `RoomEnvironment` for reflections. The ceiling panels are emissive. There are no post-processing passes.
- Foveation is set to level 1.
- All text is SDF text via `troika-three-text`, batched per font for each panel.

## Credits and licences

- [three.js](https://threejs.org) (MIT) and [troika-three-text](https://github.com/protectwise/troika) (MIT).
- Fonts (SIL Open Font License, served via Fontsource):
  - Inter, standing in for Calibre
  - Space Mono
  - Kalam, for the whiteboard marker writing
- Calibre and Financier Display are licensed desktop fonts and are not bundled. If web-licensed copies become available, change the URLs in `src/config/brand.ts`.
- The instruments are generic, and no manufacturer logos appear anywhere. "TX2-60" appears only as a plain nameplate.

## Robot specification verification

To be completed in Stage 2. The table will record each value used, its source and whether it has been verified.
