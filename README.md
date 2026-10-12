# TX2-60 Pendant Trainer — Scientific Solutions

A WebXR training simulation of a six-axis TX2-60-class arm moving SLAS-format microplates from a dispenser nest to a plate-reader tray. It is built for the Meta Quest 3 browser and also works on a desktop with keyboard and mouse.

> **Status: Stage 4 of 6.** Done so far: the lab, the robot, the gripper, the deadman, Joint/Frame/Tool jogging with IK, the speed cap, E-stop and the beacon, the pendant panel, the right-hand ray, the controller map and the guided tutorial. Points, programming and challenges come in later stages.

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

## Controls

Every input path runs through the same pendant logic (`src/input/PendantLogic.ts`), so the keyboard behaves exactly like the controllers. **All motion requires the enabling device**, held in its middle position. Releasing it stops the arm. Squeezing it fully is a panic stop that stays latched until you let go completely.

### The pendant panel

- **In VR** the panel sits on your left controller, tilted toward your face. Press its keys with the right-hand ray and the trigger.
- **On desktop** it is docked bottom-left. Click its keys with the mouse.

It shows:
- the working mode, jog mode and speed
- the state of the enabling device
- joint values with range bars, and the TCP pose (X Y Z mm, Rx Ry Rz °)
- the selected point
- a context strip with hints, warnings and E-stop instructions

| Key | Action |
|---|---|
| MODE | Cycle working mode: Manual → Manual test → Local. Leaving Manual stops any jog. |
| JOG | Cycle jog mode (same as left X) |
| ROTATE | Translate / rotate in Frame and Tool (same as a B tap) |
| CLOSE GRIP / OPEN GRIP | Toggle the gripper (Manual only) |
| SPEED − / SPEED + | Speed override step |
| TCP | Show or hide the TCP triad |
| MAP | Show or hide the controller map for the current jog mode |
| **E-STOP** | Emergency stop (latching) |
| RESET | Clear the E-stop. Works only with the enabling device released. |

### Controllers and keyboard

| Function | Quest Touch Plus | Desktop |
|---|---|---|
| Enabling device (deadman) | Left grip, half squeeze | Hold **Space** (Shift+Space = panic squeeze) |
| Cycle jog mode: Joint → Frame → Tool → Point | Left **X** | **Tab** |
| Speed override (1/5/10/25/50/75/100 %) | Hold left **Y** + right stick up/down | Hold **Q** + **↑ / ↓** |
| Joint: select axis | Left stick up/down | **W / S** |
| Joint: Move− / Move+ | Right stick left/right | **← / →** |
| Frame/Tool: X / Y | Left stick up-down / left-right | **W/S** / **A/D** |
| Frame/Tool: Z | Right stick up/down | **↑ / ↓** |
| Frame/Tool: translate ↔ rotate (Rx Ry / Rz) | Right **B** tap | **B** tap |
| Emergency stop | Hold right **B** for 1 s, or the panel E-STOP | Hold **B** for 1 s, **Esc**, or click E-STOP |
| Reset E-stop | Panel **RESET** (enabling device released) | Click RESET, or **R** |
| Select / press | Right trigger with the ray | Mouse click |
| Gripper open / close (Manual) | Point the ray at the gripper (it glows) + trigger | Click the gripper, the panel key, or **G** |
| Record point / move to point | Right **A** (Stage 5) | **Enter** (Stage 5) |
| Tutorial on / off | Whiteboard buttons | Whiteboard buttons or **H** |

The Frame axes are the robot base frame. **+X** points away from you, **+Y** to your left, and **+Z** up. The Tool axes follow the gripper, with **+Z** along the approach direction.

Two departures from the brief:
- The Y button and the left thumbstick both sit under the left thumb, so the speed modifier pairs with the **right** stick.
- The gripper is toggled by pointing the ray at it and pulling the trigger, as agreed. The trigger never toggles the gripper when the ray is pointing elsewhere.

Beacon: **amber** = Manual or Manual test, **green** = Local, **red** (flashing) = E-stop or fault.

### Guided tutorial

On first run, a step-by-step tutorial appears. Each callout has a leader line and a pulsing marker on the control it describes. In VR the marker sits on the real controller button; on desktop it sits on the panel element. Each step advances only when you actually do the action; there is no timer. Every callout also has a Skip button. Progress is saved in `localStorage`, and the whiteboard has **Tutorial: ON/OFF** and **Restart tutorial** buttons.

Steps so far:
1. Enabling device
2. Jog mode
3. Jog an axis
4. Speed override
5. Gripper
6. E-stop and reset

Stage 5 adds recording a point, moving to a point, building a program and running it.

## Project layout

```
src/
  config/      robot spec, cell layout, plate dimensions, brand tokens
  core/        simulation state and logic, no scene objects (Stage 2+)
  input/       desktop camera; XR and desktop pendant adapters (Stage 3+)
  scene/       procedural lab, instruments, boards, lighting, static batcher
  ui/          SDF text, panel kit (instanced rects + batched text), pendant, controller map, tutorial
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
- Joint jog runs at 10 % of each joint's maximum speed at 100 % override. In Manual, every joint is also held to 25 % of its maximum speed, and the TCP's linear speed is capped at **250 mm/s** (`MANUAL_TCP_CAP_MMPS`).
- Frame and Tool jogging go up to 250 mm/s and 45 °/s at 100 % override.
- IK is damped least squares on the 6×6 geometric Jacobian. Angular rows are scaled by 0.25 m. Damping rises as the manipulability √det(JJᵀ) drops below 1.2×10⁻⁴, which is J5 at about 15°, and jog speed is reduced in proportion. Jogging through J5 = 0 slows the arm and does not flip J4 or J6; this is covered by the tests.
- Joints that reach a limit during Cartesian jogging are frozen out of the solve, so the TCP may leave the commanded line. The panel reports which joint is at its limit.
- The gripper is a generic parallel-jaw plate gripper. Its TCP sits 128 mm from the flange face, at the centre between the fingertips.
