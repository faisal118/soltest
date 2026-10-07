# Kabul Recon

A browser-based, single-player Three.js FPS set in a detailed **fictionalized modern Kabul-inspired district**. The procedural layout is not a geographically accurate or independently verified recreation of present-day Kabul.

## Run

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 3000
```

```sh
npm run typecheck
npm test
npm run build
```

Built with Three.js, TypeScript, and Vite. No external game assets or API keys are required. Fonts are served locally.

## Play

Click **Deploy to Kabul** to capture your cursor. A desktop keyboard and mouse and WebGL 2 are required for gameplay. Embedded browsers may need the preview opened in a separate tab to permit pointer lock.

- **WASD** — Move
- **Mouse** — Look
- **Left click / hold** — Fire
- **Right click / hold** — Aim
- **Shift** — Sprint
- **Space** — Jump
- **R** — Reload
- **M** — Tactical map (pauses the operation)
- **E** — Resupply within 5 meters of insertion
- **Escape** — Pause and release cursor

**Operation:** destroy six rogue drones, evade their projectiles, then return to insertion to extract. Health regenerates after six seconds without damage. **Free roam:** explore without hostile drones. Audio is off by default; enable it using the header toggle or settings. Graphics quality, mouse sensitivity, field of view, and audio volume are configurable.

## Environment

Procedural apartment blocks, a glass-fronted tower, balconies and window details, AC units, rooftop tanks and solar panels, Dari-language shop signs, market stalls and produce, taxis, street lighting, overhead cables, planted trees, road markings, airborne dust, hillside housing, and layered mountain ridgelines. The detail upgrade adds stocked shop shelves and bread displays, striped awnings, drainpipes, façade wear, balcony plants and curtains, roof ladders and satellite dishes, wind-animated laundry and woven carpets, bicycles and motorcycles, bus shelters, benches, tiled sidewalks and street drains, patched asphalt, a café courtyard with animated fountain spray, a distant tiled dome and minarets, soft clouds, circling birds, and volumetric mountain ridges. Glass and metal use a locally generated reflection environment; the shadow frustum follows the player. Static details share instanced meshes and per-instance colors where their physical material properties match.

## Verification

`npm test` covers actual city geometry and street accessibility, drone and environmental animation, landmark presence, vehicle ray occlusion, decorative effect exclusion, side-street accessibility, finite geometry, collision, boundary clamping, deterministic random generation, compass headings, ammunition, reload accounting, resupply, damage and regeneration, reset, and extraction rules. Browser rendering, pointer lock, input, audio, and a complete mission should additionally be tested interactively in the live preview.
