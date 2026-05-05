# Developer Architecture

## Purpose

This app is an interactive actin-bundle mechanical toy model. It simulates
semiflexible actin bead-chain filaments on a hexagonal lattice, gates ABP
crosslink formation through filament helical phase compatibility, and visualizes
bundle geometry plus mechanical readouts such as force response, effective
bending modulus, and persistence-length consistency.

The project began as a single-file Canvas/JavaScript prototype. The current
codebase keeps that behavior but separates the model into a typed simulation
core, browser UI adapters, and tests.

## Runtime Flow

`src/main.ts` is the app bootstrap. It creates the mutable `SimulationState`,
loads `Params` from the DOM controls, wires UI events, advances the simulation
loop, and asks the renderer/readout modules to display the current state.

Per animation frame:

1. `src/ui/dom.ts` reads live control values into `Params`.
2. `src/simulation/forces.ts` computes forces and integrates steps, or only
   computes forces if the app is paused.
3. `src/render/canvasRenderer.ts` projects and draws beads, bonds, crosslinks,
   overlays, and axes.
4. `src/ui/readout.ts` updates the registry, energy, ABP, and bending readouts.

Structural controls such as ring count, monomer count, bead spacing, and lattice
spacing rebuild topology through `src/simulation/topology.ts`. Live controls
such as stiffnesses, timestep, and temperature are read each frame.

## Module Map

- `src/model/types.ts` contains the public shape of the simulation: `Params`,
  `SimulationState`, `Filament`, `BeadMeta`, `EnergyBreakdown`, ABP types, and
  renderer contracts.
- `src/model/constants.ts` contains the 12-state face map, hex directions, ABP
  presets for fascin, alpha-actinin, and CaMKII, and actin persistence-length
  constants.
- `src/model/hex.ts` contains geometry and phase helpers: axial-to-Cartesian
  conversion, exposed face lookup, and default registry assignment.
- `src/model/abp.ts` turns UI ABP selections into effective spring/linker
  parameters.
- `src/simulation/topology.ts` owns filaments, neighbor pairs, bead metadata,
  backbone bonds/bends, ABP internal beads, crosslinks, typed-array sync, and
  perturbation selection setup.
- `src/simulation/forces.ts` owns harmonic bond forces, angle bending forces,
  crosslink/perpendicular forces, steric repulsion, perturbation springs, mouse
  grab force, timestep integration, and kicks.
- `src/simulation/registry.ts` owns registry scoring and Monte Carlo registry
  optimization.
- `src/simulation/fire.ts` owns the FIRE minimizer used by static bending
  sweeps.
- `src/simulation/sweep.ts` owns the current 3-point-bend sweep and CSV data.
- `src/render/` owns render adapters. The current adapter is Canvas 2D. A
  future `WebGlRenderer` should implement the same `Renderer` interface.
- `src/ui/` owns DOM lookup, app shell HTML, label/readout rendering, and table
  rendering. It should not implement physics.

## Data Model

`SimulationState` is intentionally mutable for performance. Hot-path positions,
velocities, and forces live in `Float32Array`s:

- `state.pos`: interleaved bead coordinates `[x0, y0, z0, x1, ...]`
- `state.vel`: interleaved velocities
- `state.frc`: interleaved forces

`state.beads` stores metadata and a synced coordinate snapshot for UI and
topology code. Call `syncBeadsToTyped` after topology changes and
`syncTypedToBeads` after integration/minimization updates.

Backbone and ABP internal links share `state.bonds` and `state.bends`; direct
single-spring ABPs use `state.crosslinks`. This is why ABP model changes are
topology changes, not only parameter changes.

## Testing Strategy

Use tests as characterization before changing behavior:

- Unit tests in `tests/unit/` cover hex math, phase exposure, registry scoring,
  topology construction, ABP linker topology, and force-kernel sanity checks.
- Playwright tests in `tests/e2e/` cover app loading, canvas rendering,
  controls, registry optimization, and bend-sweep CSV generation.

Recommended command sequence:

```bash
conda activate actin_toy_model
npm test
npm run build
npm run test:e2e
```

For physics changes, add a small deterministic unit test first using
`createSeededRng`. For UI/rendering changes, add or update a Playwright test.

## Current Physics Features

- Hexagonal bundle lattice with configurable ring count and spacing.
- Bead-chain filaments with harmonic bonds and angle-form bending energy.
- 12-state helical face labels with compatible crosslink gating.
- Registry modes: perfect, zero, random, and custom after Monte Carlo.
- ABP presets:
  - fascin: direct short single spring with tangent-orthogonality term.
  - alpha-actinin: four-bead linker with two internal neck joints.
  - CaMKII: three-bead linker with one internal hinge.
- Saturation control over compatible sites.
- Steric repulsion between neighboring filaments.
- Mouse grab perturbation.
- Current 3-point-bend mode using center-section displacement and FIRE
  minimization, with CSV export.

## Roadmap And Where To Add Things

### Angle-Based 3-Point Bending

Goal: replace or supplement center distance displacement with a prescribed bend
angle between three selected bundle cross-sections.

Where to work:

- Add new perturbation params and types in `src/model/types.ts`, for example an
  angle target, endpoint layer count, and section radius/layer count.
- Change selection construction in `src/simulation/topology.ts`. Instead of only
  clamping one bead layer at each end and pushing the middle layer, build three
  cross-section selections: left, center, and right. Each selection should use
  the center of mass of beads around the target axial layer, with a configurable
  axial half-width up to about 10 layers.
- Change perturbation forces in `src/simulation/forces.ts`. Compute COMs for the
  three selections, derive the current angle at the center COM, and apply forces
  from an angle penalty rather than an x-displacement ram. Keep reaction-force
  bookkeeping separate from energy bookkeeping.
- Change sweep/readout naming in `src/simulation/sweep.ts` and
  `src/ui/readout.ts` so the CSV reports target angle, actual angle, moment or
  equivalent force, and the derived bending modulus consistently.
- Add unit tests for selection membership and angle response before changing the
  UI.

### More Realistic 13-ish Actin Helicity

Goal: support a non-perfect actin helical phase model instead of only the
current 12-state face labels. The UI should allow a selectable rotation angle,
roughly in the -150° to -170° range, and ABP binding should depend on an angular
threshold between exposed binding directions.

Where to work:

- Add a helicity model type in `src/model/types.ts`, for example discrete
  12-state versus continuous angle mode.
- Add continuous phase helpers in `src/model/hex.ts`, keeping the existing
  `exposedK` path intact for characterization tests.
- Add params for actin twist angle, phase offset, angular compatibility
  threshold, and optionally axial offset tolerance.
- Update `compatibleAt` in `src/simulation/topology.ts` so it can evaluate
  either the current discrete rule or the continuous angular-threshold rule.
  The function should return enough detail for debugging later, not just a
  boolean, if the UI needs to show angle mismatch.
- Extend registry scoring in `src/simulation/registry.ts` to score continuous
  compatibility consistently with crosslink construction.
- Update face/debug visualization in `src/render/` and `src/ui/readout.ts` to
  show angular mismatch or compatible/incompatible sites when continuous mode is
  active.
- Add deterministic tests for threshold boundaries, periodic angle wrapping,
  and consistency between `scoreRegistries` and `buildCrosslinks`.

### Performance Extensions

- Reintroduce WebGL2 as `src/render/webglRenderer.ts` implementing `Renderer`.
- Move `computeForces`, `step`, FIRE, and sweeps into a Web Worker once the
  public message shape is stable.
- Keep typed arrays as the worker/render exchange format.
- Consider WebGPU or Wasm only after the TypeScript force kernels have clear
  benchmarks and correctness tests.

### Later Model Extensions

- 13/6 helicity variants and polarity flips.
- Axial offsets between neighboring filaments.
- Bundle twist or pre-strain.
- Batch parameter sweeps with saved JSON metadata plus CSV outputs.
- Comparative ABP scans for fascin, alpha-actinin, and CaMKII.
