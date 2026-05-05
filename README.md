# [Actin Bundle Toy Model](https://cabb99.github.io/actin_toy_model/)
This project is a Vite + vanilla TypeScript app. 
The simulation core can be tested without the DOM.

## Create the environment

[x] `conda env create -n actin_toy_model -f environment.yml` recreates the Node-backed conda
  environment used for development.
[x] `npm install` installs the Vite, Vitest, TypeScript, and Playwright tooling.
[x] `npx playwright install chromium` installs the browser used by e2e tests.


## Commands to run the server
- `conda activate actin_toy_model` activates it.
- `npm run dev` starts the local app.
- `npm run build` runs TypeScript checking and builds both `index.html` and the compatibility `toy_model.html` entry.
- `npm run build:pages` builds the same app with the `/actin_toy_model/` base path used by GitHub Pages.
- `npm test` runs unit tests for model and simulation behavior.
- `npm run test:e2e` runs Playwright browser tests.

## Basic Structure

The codebase is organized as a small scientific simulation app: a typed model
layer, a mutable simulation layer, browser/rendering adapters, and tests.

- `src/model/` contains shared domain definitions: TypeScript types, default
  parameters, actin constants, ABP presets, hex geometry, and current 12-state
  helical face helpers. Future helicity models, ABP schemas, polarity metadata,
  parameter presets, and saved-run config types should start here.
- `src/simulation/` contains the executable mechanics: topology construction,
  bead/bond/linker creation, crosslink compatibility, registry scoring/Monte
  Carlo, force kernels, integration, FIRE minimization, and bending sweeps.
  Future twist/rotation perturbations, 13-ish helicity compatibility, axial
  offsets, bundle twist, polarity flips, ABP kinetics, parameter sweeps, and
  worker kernels should live here.
- `src/render/` contains renderer adapters. The current implementation is Canvas
  2D. Future WebGL2/WebGPU renderers should implement the same `Renderer`
  interface and keep graphics buffers, shaders, and render caches out of the
  simulation code.
- `src/ui/` contains DOM lookup, control binding helpers, readouts, tables, and
  the HTML app shell. Future controls, debug panels, preset editors, export
  panels, experiment dashboards, and visual analysis widgets should be added
  here after the underlying model/simulation behavior exists.
- `tests/unit/` contains deterministic characterization tests for model and
  simulation behavior. Future physics and topology changes should add tests
  here first.
- `tests/e2e/` contains browser-level Playwright smoke and workflow tests for
  rendering, controls, registry optimization, and CSV/export flows.

## Implemented Today

- Hexagonal actin-bundle lattice generation with configurable ring count,
  monomer count, lattice spacing, and axial bead spacing.
- Bead-chain filament mechanics: harmonic bonds, angle-form bending, steric
  repulsion, damping/noise integration, and manual kicks.
- Current 12-state helical face labels with compatibility-gated ABP crosslinks.
- Registry modes: perfect, zero, random, and Monte-Carlo optimized custom
  registries.
- ABP presets for fascin, alpha-actinin, and CaMKII, including direct
  single-spring and internal-linker topologies.
- Mouse grab perturbation, harmonic COM-angle 3-point bend using configurable
  multi-layer selections and log-scale angle stiffness, FIRE minimization,
  bending CSV export, and live mechanical readouts.
- Canvas rendering with face/registry overlays plus unit and browser tests.

## Likely Future Directions

- More realistic continuous actin helicity, including selectable twist angles
  around the -150 to -170 degree range and angular compatibility thresholds for
  ABP binding.
- More advanced bending constraints, such as endpoint rotation tracking, twist
  tracking, angle stiffness controls, and richer moment readouts.
- Better experiment infrastructure: parameter sweeps, reproducible seeds, saved
  JSON metadata, CSV/JSON export bundles, and comparison plots.
- Performance upgrades: WebGL2 rendering, Web Workers for force kernels and
  long sweeps, typed-array transfer, and later WebGPU or Wasm if profiling
  justifies it.
- Richer model options: 13/6 helicity variants, polarity flips, axial offsets,
  bundle twist/pre-strain, crosslink lifetime/kinetics, and ABP occupancy
  statistics.

## Future Refactoring Plan

- Split compatibility evaluation out of `src/simulation/topology.ts` once both
  discrete 12-state and continuous angular-threshold helicity exist.
- Introduce explicit perturbation/experiment data structures before adding
  endpoint rotation tracking, twist metrics, and multiple bend/twist modes.
- Split `src/simulation/forces.ts` by force term if new bending, twist, or ABP
  kinetics make it hard to scan.
- Add a renderer factory when WebGL2 is reintroduced.
- Move long-running minimization and sweeps into a Web Worker after the
  message/data shape is stable.

For day-to-day development, start with [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).
For a deeper code walkthrough and roadmap notes, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
