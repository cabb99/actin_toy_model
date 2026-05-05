import { describe, expect, it } from "vitest";
import { defaultParams } from "../../src/model/constants";
import type { Params, SimulationState } from "../../src/model/types";
import { computeForces } from "../../src/simulation/forces";
import { createSeededRng } from "../../src/simulation/random";
import { scoreRegistries } from "../../src/simulation/registry";
import { createSimulationState } from "../../src/simulation/state";
import { buildCrosslinks, compatibleAt, resetSystem, syncBeadsToTyped } from "../../src/simulation/topology";

function smallParams(overrides: Partial<Params> = {}): Params {
  return {
    ...defaultParams(),
    rings: 1,
    monomers: 24,
    sat: 1,
    temp: 0,
    steps: 1,
    ...overrides,
  };
}

function preparedTwoFilamentState(params: Params): SimulationState {
  const state = createSimulationState();
  resetSystem(state, params, createSeededRng(1), false);
  state.neighborPairs = [[0, 1, 0]];
  state.filaments[0].s = 0;
  state.filaments[1].s = 1;
  state.nFilamentBeads = state.filaments.length * params.monomers;
  state.nBackboneBonds = state.bonds.length;
  state.nBackboneBends = state.bends.length;
  return state;
}

describe("topology", () => {
  it("builds expected filament and neighbor counts for one hex ring", () => {
    const params = smallParams();
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(42), false);
    expect(state.filaments).toHaveLength(7);
    expect(state.neighborPairs).toHaveLength(12);
  });

  it("scores compatible registry sites and respects saturation zero", () => {
    const params = smallParams({ sat: 0 });
    const state = preparedTwoFilamentState(params);
    expect(compatibleAt(state, params, 0, 1, 0, 0)).toBe(true);
    expect(scoreRegistries(state, params).total).toBe(2);
    buildCrosslinks(state, params, createSeededRng(2));
    expect(state.crosslinks).toHaveLength(0);
  });

  it("creates single-spring crosslinks for compatible sites", () => {
    const params = smallParams({ abpType: "fascin", sat: 1 });
    const state = preparedTwoFilamentState(params);
    buildCrosslinks(state, params, createSeededRng(3));
    expect(state.crosslinks).toHaveLength(2);
    expect(state.beads.filter((b) => b.isInternal)).toHaveLength(0);
  });

  it("creates linker2 internal topology for CaMKII", () => {
    const params = smallParams({ abpType: "camkii", clDist: 22, sat: 1 });
    const state = preparedTwoFilamentState(params);
    const bondsBefore = state.bonds.length;
    const bendsBefore = state.bends.length;
    buildCrosslinks(state, params, createSeededRng(4));
    expect(state.crosslinks).toHaveLength(0);
    expect(state.beads.filter((b) => b.isInternal)).toHaveLength(2);
    expect(state.bonds.length - bondsBefore).toBe(4);
    expect(state.bends.length - bendsBefore).toBe(2);
  });

  it("creates linker4 internal topology for actinin", () => {
    const params = smallParams({ abpType: "actinin", clDist: 36, sat: 1 });
    const state = preparedTwoFilamentState(params);
    const bondsBefore = state.bonds.length;
    const bendsBefore = state.bends.length;
    buildCrosslinks(state, params, createSeededRng(5));
    expect(state.beads.filter((b) => b.isInternal)).toHaveLength(4);
    expect(state.bonds.length - bondsBefore).toBe(6);
    expect(state.bends.length - bendsBefore).toBe(4);
  });
});

describe("force kernel characterization", () => {
  it("applies harmonic bond forces along the stretched bond", () => {
    const params = smallParams({ monomers: 1, kb: 10, rep: 0 });
    const state = createSimulationState();
    state.beads = [
      { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 0, x0: 0, y0: 0, z0: 0, pinned: false },
      { x: 2, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 0, x0: 2, y0: 0, z0: 0, pinned: false },
    ];
    state.bonds = [[0, 1, 1]];
    syncBeadsToTyped(state);
    computeForces(state, params);
    expect(state.frc[0]).toBeCloseTo(10);
    expect(state.frc[3]).toBeCloseTo(-10);
    expect(state.energy.bond).toBeCloseTo(5);
  });

  it("keeps straight three-bead bends at zero bend energy", () => {
    const params = smallParams({ monomers: 3, rep: 0 });
    const state = createSimulationState();
    state.beads = [0, 1, 2].map((z) => ({
      x: 0,
      y: 0,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      fx: 0,
      fy: 0,
      fz: 0,
      f: 0,
      m: z,
      x0: 0,
      y0: 0,
      z0: z,
      pinned: false,
    }));
    state.bends = [[0, 1, 2]];
    syncBeadsToTyped(state);
    computeForces(state, params);
    expect(state.energy.bend).toBeCloseTo(0);
  });
});
