# CLAUDE.md

Guidance for working in this repository.

## What this is

Personal portfolio of **Bastien Nieto** (`bibwann.github.io`) — fullstack & AI-integration developer.
It is a **static site** (no build step, no bundler, no package manager at the root). The signature
feature is an interactive **Three.js solar-system background** the visitor flies through while reading
the portfolio. Bilingual **FR (default) / EN**. Cyberpunk / space aesthetic.

## Run it

No build. Serve the repo root with any static server and open it:

```bash
python -m http.server 8000      # then open http://localhost:8000
# or VS Code "Live Server", or `npx serve`
```

Opening `index.html` directly via `file://` mostly works, but the `fetch()` of the i18n JSON
(`assets/lang/*.json`) needs an HTTP origin — always use a local server.

## Layout

- `index.html` — single page. All sections live here; each maps to a planet (see below). Translatable
  strings carry `data-i18n="key"`. The 3D canvas (`#webgl-bg`), the space labels overlay
  (`#space-labels`) and the cyberpunk HUD (`#stellar-hud`) are near the bottom.
- `assets/js/`
  - `solar-system.js` — **the big one**. Three.js scene: textured Sun + planets, orbit rings, asteroid
    & Kuiper belts, starfield/Milky Way, neighboring star systems (Alpha Centauri, Sirius, Barnard,
    TRAPPIST‑1), the camera navigation, raycast clicking, the HUD telemetry and the 2D labels.
  - `ai-console.js` — in‑browser local AI ("Nano", Qwen2.5‑0.5B via WebLLM/WebGPU). Holds a **fact
    sheet about Bastien** used as the system prompt + a scripted fallback. Keep this in sync with the
    site copy.
  - `lang.js` — i18n loader: reads `localStorage.lang` (default `fr`), fetches `assets/lang/<lang>.json`,
    swaps every `[data-i18n]` node.
  - `main.js`, `cyber.js` — page interactions / cosmetic effects.
- `assets/lang/fr.json`, `assets/lang/en.json` — **all UI/portfolio copy**. The two files must keep the
  **same key set**; edit them together.
- `assets/css/main.css` — all styles (HUD, labels, sections, cyberpunk theme).
- `assets/img/space/` — planet/sun/moon textures, `milkyway.png`, `stars.jpg`.
- `assets/img/portfolio/`, `assets/img/` — project shots, logos (mistral, ollama), portrait, flags.
- `assets/vendor/` — Bootstrap, AOS, Typed.js, Waypoints, PureCounter, Isotope, etc. Three.js r128 +
  OrbitControls are loaded from CDN in `index.html`.

## Section ↔ planet mapping

`Sun = Hero`, then Mercury→About, Venus→Resume, Earth→Services, Mars→Copilots, Jupiter→AI console,
Saturn→Stats/Projects, Uranus→Passions, Neptune→Contact, Pluto = non-visited. Defined by
`planetDefs`, `sectionSelectors`, `planetStationIndices` in `solar-system.js`.

## Solar-system model (important conventions)

- **Scale is deliberately NOT physically accurate.** Planet sizes and orbital distances (`r`, `d` in
  `planetDefs`) are compact/artistic so bodies stay visible and clickable. Don't "fix" this into true
  AU scale — it's a product decision.
- **Navigation contexts:** `voyage` (scroll-driven trip through the portfolio, one planet per section),
  `solar` (free explorer framing the whole solar system), `neighborhood` (the Sun as one star among
  neighbors placed at to-scale interstellar distances). Two HUD menu buttons switch contexts; a back
  button pops one level (inspect → system → context → voyage).
- **Camera = single eased tween.** Position, look-target and FOV are interpolated together with one
  eased `t` over a fixed duration. Orbital motion is paused while inspecting so the camera settles.
  This is what keeps it from being nauseating — do not reintroduce separate position/look lerp rates
  or per-frame retargeting against a still-orbiting planet.
- Neighbor systems are positioned from real `(RA, Dec, distance_ly)` so directions/distances are
  realistic relative to each other (not clustered, not coplanar).
- Respect `prefers-reduced-motion` (jump-cuts instead of long pans).

## Conventions

- Vanilla JS, no framework, no transpile. Match the existing IIFE + plain-DOM style.
- Any new user-facing string → add the key to **both** `fr.json` and `en.json` and reference via
  `data-i18n` (or via the JS that reads `localStorage.lang`).
- Keep facts consistent across three places: the HTML/JSON copy, the `ai-console.js` fact sheet, and
  the stats counters.
