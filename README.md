# TX2-60 Pendant Trainer — Scientific Solutions

A WebXR training simulation of a six-axis TX2-60-class arm moving SLAS-format microplates from a dispenser nest to a plate-reader tray. It is built for the Meta Quest 3 browser and also works on a desktop with keyboard and mouse.

> **Status: Stage 2 of 6.** Done so far: the lab, the robot (joint tree, forward kinematics, joint jogging) and the gripper. Cartesian jogging, the deadman and E-stop, the pendant, programming and the challenges come in later stages.

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

## Controls (Stage 2, temporary)

These are stop-gap mappings until the pendant arrives in Stage 4. **There is no enabling device (deadman) yet**, so motion is not gated until Stage 3.

### Desktop

| Input | Action |
|---|---|
| `↑` `↓` | Select joint |
| Hold `←` / `→` | Move− / Move+ on the selected joint |
| `[` `]` | Speed override down / up (1, 5, 10, 25, 50, 75, 100 %) |
| `G` | Open or close the gripper |
| `T` | Toggle the TCP triad |
| `1`–`5` | Operator, overview, cell, boards and robot views |
| Left-drag, right-drag, scroll | Orbit, pan, zoom |
| `P` | Performance readout |

### Quest controllers

| Input | Action |
|---|---|
| Left thumbstick up / down | Select joint |
| Right thumbstick left / right | Move− / Move+ |
| Hold left **Y** + **right** thumbstick up / down | Speed override (no jogging while Y is held) |
| Right **A** | Open or close the gripper |

A small readout of joint values is attached to the left controller.

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

Primary source: Stäubli, *TX2-60 Range* product data sheet, **V17, © 02/2026** (doc. D181.636.04), downloaded from staubli.com on 12 Oct 2026.

| Value | Used in the sim | Source | Status |
|---|---|---|---|
| Reach, axis 1 to axis 6 | 670 mm | Datasheet | ✅ Verified |
| Load capacity | 4.5 kg | Datasheet (a single figure, "load capacity") | ✅ Verified (see note 1) |
| Repeatability (ISO 9283) | ±0.02 mm | Datasheet | ✅ Verified |
| J1 range | ±180° | Datasheet | ✅ Verified |
| J2 range | ±127.5° | Datasheet | ✅ Verified |
| J3 range | **±142.5°** | Datasheet | ✅ Verified. The brief said ±152.5°, which is the TX2-60**L** value. |
| J4 range | ±270° | Datasheet | ✅ Verified |
| J5 range | **+132.5° / −121°** | Datasheet | ✅ Verified. The brief said +133.5° / −122.5°. |
| J6 range | ±270° | Datasheet (software-configurable to ±11 250°) | ✅ Verified |
| Max joint speeds J1–J6 | 435 / 410 / 540 / 995 / 1065 / 1445 °/s | Datasheet | ✅ Verified |
| Upper arm + forearm (J2→J5) | 290 + 310 = 600 mm | Datasheet: max reach axis 1–5 = 600 mm; axis 3–5 = 310 mm | ✅ Derived from datasheet |
| Flange (J5→J6 face) | 70 mm | 670 − 600 | ✅ Derived from datasheet |
| Base height (mount face → J2) | 375 mm | TX60-family dimension drawings | ⚠️ Not on the datasheet, not verified |
| Elbow lateral offset | 20 mm | TX60-family DH tables | ⚠️ Not on the datasheet, not verified |
| Zero position | All joints 0 = arm vertical | Stäubli convention | ⚠️ Convention, not on the datasheet |

1. Some resellers, and the French edition of an earlier datasheet, quote **3.5 kg nominal / 4.5 kg maximum**. V17 gives only "load capacity 4.5 kg", so the spec plate reads "Load capacity 4.5 kg" rather than "nominal payload".

### Known approximations

- The visual model is procedural. Its proportions follow the kinematic dimensions, but the casting shapes are approximate.
- Manual jogging runs at 10 % of each joint's maximum speed at 100 % override. The 250 mm/s manual TCP speed cap is enforced from Stage 3.
- The gripper is a generic parallel-jaw plate gripper. Its TCP sits 128 mm from the flange face, at the centre between the fingertips.
