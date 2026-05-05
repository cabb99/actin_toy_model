# Developer Guide

This guide is the practical map for working in the codebase: how to run the app,
where things live, and where to make common changes. For the deeper design
background and roadmap, see `docs/ARCHITECTURE.md`.

## Quick Start

```bash
conda activate actin_toy_model
npm install
npm run dev
```

Open the Vite URL printed by `npm run dev`. The normal app entry is
`index.html`; `toy_model.html` is kept as a compatibility entry and loads the
same TypeScript app.

If the environment does not exist yet:

```bash
conda env create -f environment.yml
conda activate actin_toy_model
npm install
npx playwright install chromium
```

## Useful Commands

```bash
npm run dev       # start local Vite dev server
npm test          # run Vitest unit tests
npm run build     # TypeScript check + production Vite build
npm run test:e2e  # run Playwright browser tests
npm run check     # TypeScript check only
```

Recommended before committing a physics or topology change:

```bash
npm test
npm run build
npm run test:e2e
```

## File Map

| Path | What lives there |
| --- | --- |
| `src/main.ts` | App bootstrap, state creation, event wiring, animation loop |
| `src/model/types.ts` | Core TypeScript types and interfaces |
| `src/model/constants.ts` | Phase map, hex directions, ABP presets, actin constants, default params |
| `src/model/hex.ts` | Hex geometry and helical phase helpers |
| `src/model/abp.ts` | ABP preset-to-runtime parameter conversion |
| `src/simulation/topology.ts` | Filaments, beads, bonds, bends, neighbor pairs, crosslinks, perturbation selections |
| `src/simulation/forces.ts` | Force calculation, integration, kicks, perturbation forces |
| `src/simulation/registry.ts` | Registry scoring and Monte Carlo registry optimization |
| `src/simulation/fire.ts` | FIRE minimizer for static relaxation |
| `src/simulation/sweep.ts` | 3-point-bend sweep and CSV data generation |
| `src/render/canvasRenderer.ts` | Current Canvas 2D renderer implementation |
| `src/render/color.ts` | Small rendering color/math helpers |
| `src/ui/template.ts` | HTML app shell injected by the TypeScript entry |
| `src/ui/dom.ts` | DOM lookup, control reading, label updates, ABP preset control updates |
| `src/ui/readout.ts` | Legend, readout, and sweep-table rendering |
| `src/styles.css` | App styling |
| `tests/unit/` | Deterministic model and simulation tests |
| `tests/e2e/` | Browser workflow tests |

## Implemented Capabilities

Use this as the quick “is it already here?” checklist.

| Capability | Main place to look |
| --- | --- |
| Hexagonal filament lattice | `src/simulation/topology.ts`, `src/model/hex.ts` |
| 12-state helical face labels | `src/model/constants.ts`, `src/model/hex.ts` |
| Face-compatible crosslink gating | `compatibleAt` and `buildCrosslinks` in `src/simulation/topology.ts` |
| Registry modes | `assignRegistries` in `src/simulation/topology.ts` |
| Monte Carlo registry optimization | `src/simulation/registry.ts` |
| Fascin / alpha-actinin / CaMKII presets | `ABP_PRESETS` in `src/model/constants.ts` |
| ABP linker topology | `buildCrosslinks` in `src/simulation/topology.ts` |
| Harmonic backbone bonds | `src/simulation/forces.ts` |
| Angle-form filament bending | `src/simulation/forces.ts` |
| Direct crosslink spring and tangent orthogonality | `src/simulation/forces.ts` |
| Steric repulsion | `src/simulation/forces.ts` |
| Damped/noisy integration and kick | `step` and `kick` in `src/simulation/forces.ts` |
| FIRE minimization | `src/simulation/fire.ts` |
| Current angle-controlled 3-point bend and log-scale stiffness | `src/simulation/topology.ts`, `src/simulation/forces.ts`, `src/simulation/sweep.ts`, `src/ui/dom.ts` |
| CSV export data | `src/simulation/sweep.ts`, `src/main.ts` |
| Canvas rendering | `src/render/canvasRenderer.ts` |
| Live readout and sweep table | `src/ui/readout.ts` |
| UI controls and labels | `src/ui/template.ts`, `src/ui/dom.ts`, `src/main.ts` |

## Future Code Homes

This is the “where should I put it?” map for features that are not fully built
yet.

| Future feature | Recommended home |
| --- | --- |
| Continuous 13-ish helicity | Types/defaults in `src/model/`; phase math in `src/model/hex.ts`; compatibility in `src/simulation/topology.ts` |
| Angular compatibility threshold | Evaluation helper near `compatibleAt`; display details in `src/ui/readout.ts` and renderer overlays |
| Actin polarity flips | Type metadata in `src/model/types.ts`; filament setup in `src/simulation/topology.ts`; compatibility logic near helicity helpers |
| Axial offsets between filaments | Params/types in `src/model/`; bead placement and compatible monomer matching in `src/simulation/topology.ts` |
| Bundle twist or pre-strain | Initial bead placement in `resetSystem`; possible force terms in `src/simulation/forces.ts` |
| Additional bend/twist perturbation terms | Selection setup in `topology.ts`; force terms in `forces.ts`; sweep output in `sweep.ts`; UI in `src/ui/` |
| Multi-layer endpoint/center selections | Selection helper module under `src/simulation/`, then called from perturbation setup |
| Parameter sweeps | Start in `src/simulation/sweep.ts`; split to `src/simulation/experiments/` if it grows |
| Saved JSON metadata | Serialization helpers under `src/simulation/` or `src/model/`; download UI in `src/ui/` |
| ABP binding kinetics/lifetimes | New simulation module for stochastic events; topology update helpers in `topology.ts` |
| WebGL2 rendering | New `src/render/webglRenderer.ts` implementing `Renderer` |
| Web Workers | `src/worker/` for worker entry and message types; simulation modules should remain browser-free |
| WebGPU/Wasm kernels | Only after profiling; keep public input/output compatible with current typed-array state |

## Mental Model

The app has three main layers:

1. **Model layer**: physical constants, type definitions, and pure helpers.
2. **Simulation layer**: mutable state, topology construction, forces, minimizers,
   sweeps, and registry optimization.
3. **Adapter layer**: DOM controls, readouts, and rendering.

Keep physics out of `src/ui/` and rendering out of `src/simulation/`. If a
feature needs both, put the physics/data logic in `src/simulation/` first and
then expose it through `src/main.ts` and `src/ui/`.

## Important Data Structures

`SimulationState` is mutable by design. The hot path uses typed arrays:

- `state.pos`: interleaved bead positions, `[x0, y0, z0, x1, y1, z1, ...]`
- `state.vel`: interleaved bead velocities
- `state.frc`: interleaved bead forces

`state.beads` stores metadata such as filament id, monomer index, rest position,
pinning, and whether a bead is an ABP-internal bead. Its `x/y/z` fields are a
snapshot used by UI/topology code.

When topology changes, call `syncBeadsToTyped`. When integration or minimization
changes positions, call `syncTypedToBeads`.

## Where To Change Common Things

### Add A New Simulation Parameter

1. Add it to `Params` in `src/model/types.ts`.
2. Add its default in `defaultParams` in `src/model/constants.ts`.
3. If it is user-controlled, add markup in `src/ui/template.ts`, add the id to
   `controlIds` in `src/ui/dom.ts`, and update `updateLabels`.
4. Decide whether changes are live-force changes or topology changes. Live-force
   parameters can be read each frame. Topology parameters should trigger
   `resetSystem` or `buildCrosslinks`.
5. Add a unit test if the parameter changes simulation behavior.

### Add Or Change A Slider

1. Add the control markup in `src/ui/template.ts`.
2. Add the control id to `controlIds` in `src/ui/dom.ts`.
3. Add the parameter to `Params` in `src/model/types.ts`.
4. Add the default value in `defaultParams` in `src/model/constants.ts`.
5. Update `updateLabels` in `src/ui/dom.ts` if the slider has a readout label.
6. Wire behavior in `src/main.ts`.

If the slider changes topology, rebuild through `resetSystem` or
`buildCrosslinks`. If it only changes forces, reading it each frame is enough.

### Add Or Change An ABP Preset

1. Edit `ABP_PRESETS` in `src/model/constants.ts`.
2. If the ABP needs a new topology shape, extend `AbpModel` in
   `src/model/types.ts`.
3. Implement the topology in `buildCrosslinks` in `src/simulation/topology.ts`.
4. Update `currentAbpEffective` in `src/model/abp.ts` if the runtime parameters
   need different defaults.
5. Add unit tests in `tests/unit/simulation.test.ts`.

### Change Crosslink Compatibility

The central function is `compatibleAt` in `src/simulation/topology.ts`.

Also check:

- `scoreRegistries` in `src/simulation/registry.ts`, because scoring must match
  crosslink construction.
- `buildCrosslinks` in `src/simulation/topology.ts`, because this is where
  compatible sites become springs or linker beads.
- `src/render/canvasRenderer.ts` and `src/ui/readout.ts`, if the debug display
  or readout needs to expose compatibility details.

For future work, consider splitting compatibility into its own module once both
the current discrete 12-state model and the continuous angular-threshold model
exist. A good target shape would be:

```ts
evaluateCompatibility(state, params, site): CompatibilityResult
```

where `CompatibilityResult` includes `allowed`, angular mismatch, axial mismatch,
and any debug labels needed by the renderer.

### Change Filament Mechanics

Use `src/simulation/forces.ts`.

Current force groups:

- harmonic bonds
- angle-form filament bending
- direct crosslink springs plus optional tangent-orthogonality penalty
- steric repulsion
- harmonic COM-angle 3-point-bend perturbation, controlled by `bendKAngle`
- mouse grab spring

Add a small deterministic unit test before changing force formulas.

If `forces.ts` grows too large, split it by force term:

- `src/simulation/forces/bonds.ts`
- `src/simulation/forces/bending.ts`
- `src/simulation/forces/crosslinks.ts`
- `src/simulation/forces/sterics.ts`
- `src/simulation/forces/perturbations.ts`

Keep `computeForces` as the orchestrator that calls those terms in a predictable
order.

### Change The 3-Point Bend Experiment

Use these files:

- `src/simulation/topology.ts`: choose endpoint/center bead selections.
- `src/simulation/forces.ts`: apply perturbation forces and compute reaction
  quantities.
- `src/simulation/sweep.ts`: run the sweep and produce CSV rows.
- `src/ui/readout.ts`: show live bending values.
- `src/ui/template.ts` and `src/ui/dom.ts`: add controls and labels.

The current angle-controlled mode keeps selection construction separate from
force application. The split is:

- topology builds left/center/right cross-section selections;
- forces computes the three current COMs, evaluates the harmonic A-B-C angle
  energy, distributes center forces back to selected beads, and records the
  reaction moment;
- UI stores the stiffness slider as `bendKAngleLog10` and derives
  `bendKAngle = 10^bendKAngleLog10` for the force kernel;
- sweep records target angle, actual angle, angle error, reaction moment, angle
  energy, and derived modulus.

A useful future refactor is to introduce explicit perturbation data structures:

```ts
interface CrossSectionSelection {
  label: "left" | "center" | "right";
  beadIndices: number[];
  restCom: Vec3;
}

interface BendExperimentState {
  selections: CrossSectionSelection[];
  targetAngleRad: number;
  actualAngleRad: number;
  reactionMoment: number;
}
```

That would make the current angle-force bend and future twist or endpoint
rotation constraints modes of one experiment system rather than separate
special cases.

### Add More Realistic Actin Helicity

Use these files:

- `src/model/types.ts`: add helicity mode and params.
- `src/model/hex.ts`: add continuous phase/angle helpers.
- `src/simulation/topology.ts`: update compatibility evaluation.
- `src/simulation/registry.ts`: score the same compatibility rule.
- `src/render/canvasRenderer.ts`: visualize face/angle state.
- `src/ui/readout.ts`: report angular mismatch or threshold counts.

Keep the current 12-state model intact until the continuous model has tests.
The first tests should cover angle wrapping, threshold boundaries, and agreement
between registry scoring and crosslink creation.

Suggested implementation order:

1. Add pure angle helpers: wrap degrees/radians, phase angle for monomer `m`,
   angular distance, and threshold comparison.
2. Add a `helicityMode` param with `"discrete12"` as the default.
3. Add continuous compatibility tests without touching the UI.
4. Route `compatibleAt` through the selected helicity mode.
5. Add UI controls for twist angle and threshold.
6. Update face/debug rendering after the physics behavior is tested.

### Change Rendering

The renderer contract is `Renderer` in `src/model/types.ts`.

The current renderer is `CanvasRenderer` in `src/render/canvasRenderer.ts`.
Future WebGL2 or WebGPU renderers should implement the same methods:

- `init`
- `resize`
- `fitView`
- `draw`
- `rebuildTopology`
- `markColorsDirty`
- `rotatePoint`
- `project`

Keep renderer-specific buffers, shaders, and color caches inside `src/render/`.
Do not make simulation modules depend on a renderer.

### Add A New Experiment Or Analysis Panel

Examples: parameter sweeps, ABP comparison, registry heatmaps, force/angle
plots, or persistence-length calibration.

Recommended split:

1. Put pure experiment logic in `src/simulation/`.
2. Put export formatting next to the experiment logic if it is simulation data.
3. Put buttons, tables, charts, and downloads in `src/ui/`.
4. Wire the workflow in `src/main.ts`.
5. Cover the core logic with Vitest and the browser workflow with Playwright.

## Testing Workflow

Use Vitest for deterministic model/simulation behavior:

```bash
npm test
```

Use Playwright for app behavior:

```bash
npm run test:e2e
```

Use deterministic RNG in unit tests:

```ts
import { createSeededRng } from "../../src/simulation/random";
```

Good unit tests for this codebase usually assert:

- counts: filaments, neighbor pairs, crosslinks, internal linker beads;
- invariants: no force at rest, equal/opposite forces, energy sign;
- agreement: registry score equals crosslinkable site count;
- boundary behavior: angular thresholds, periodic wrapping, saturation 0/1.

## Development Conventions

- Prefer behavior-preserving refactors with tests around the behavior first.
- Keep mutable performance state in `SimulationState`; avoid hidden module-level
  simulation state.
- Pass `state`, `params`, and `rng` explicitly into simulation functions.
- Keep browser APIs out of `src/model/` and `src/simulation/`.
- Use `createSeededRng` in tests and `createMathRng` in the app.
- Add comments only where the physics or data-flow is not obvious.
- When a feature touches model, simulation, rendering, and UI, implement it from
  the inside out: types and pure helpers first, then simulation behavior, then
  rendering/readouts, then controls.

## Refactoring Roadmap

The current structure is intentionally simple. It should evolve when features
create real pressure, not just because a file has become mildly long.

Near-term refactors:

- Move compatibility evaluation out of `topology.ts` once continuous helicity is
  added.
- Introduce explicit perturbation/experiment state before adding endpoint
  rotation tracking, twist metrics, and multiple bend/twist modes.
- Split `forces.ts` by force term if new bending, twist, or ABP kinetics make it
  hard to scan.
- Add a renderer factory when there is more than one renderer.

Medium-term refactors:

- Create `src/simulation/experiments/` for sweeps, calibration, and batch runs.
- Create `src/worker/` for worker entry points and typed message contracts.
- Add serialization helpers for reproducible run metadata and saved parameter
  sets.

Longer-term possibilities:

- Share typed arrays with workers for long sweeps.
- Benchmark force kernels before considering Wasm/WebGPU.
- Add a small state-management layer only if UI complexity grows beyond simple
  DOM controls and readouts.

## Troubleshooting

If `node` is missing:

```bash
conda activate actin_toy_model
```

If Playwright says the browser is missing:

```bash
npx playwright install chromium
```

If the app starts but the canvas is blank, first run:

```bash
npm run build
npm run test:e2e
```

Then inspect `src/main.ts` wiring and `src/render/canvasRenderer.ts`.
