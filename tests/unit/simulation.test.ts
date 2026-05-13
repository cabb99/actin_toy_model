import { describe, expect, it } from "vitest";
import { defaultParams, MIN_CROSSLINK_SPACING_MONOMERS } from "../../src/model/constants";
import type { Params, SimulationState } from "../../src/model/types";
import { computeForces } from "../../src/simulation/forces";
import { createSeededRng } from "../../src/simulation/random";
import { runMonteCarlo, scoreRegistries } from "../../src/simulation/registry";
import { createSimulationState } from "../../src/simulation/state";
import {
  angleDegAtB,
  applyPerturbationConstraints,
  buildCrosslinks,
  compatibilityScore,
  compatibleAt,
  resetSystem,
  syncBeadsToTyped,
} from "../../src/simulation/topology";

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

  it("builds a centered square lattice with cardinal neighbor pairs", () => {
    const params = smallParams({ latticeGeometry: "square", rings: 2, a: 10, sat: 0 });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(43), false);

    expect(state.filaments).toHaveLength(25);
    expect(state.neighborPairs).toHaveLength(40);
    expect(new Set(state.neighborPairs.map(([, , k]) => k))).toEqual(new Set([0, 1]));
    expect(state.filaments).toContainEqual(
      expect.objectContaining({ q: 2, r: 2, x: 20, y: 20 }),
    );
    for (const [fi, fj] of state.neighborPairs) {
      const a = state.filaments[fi];
      const b = state.filaments[fj];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(params.a, 9);
    }
  });

  it("uses cardinal square angles for continuous compatibility", () => {
    const params = smallParams({
      latticeGeometry: "square",
      helicityMode: "continuous",
      actinTwistDeg: 0,
      helicityAngleThresholdDeg: 0,
      compatibilitySharpness: 0,
    });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(44), false);
    state.neighborPairs = [[0, 1, 1]];
    state.filaments[0].phaseDeg = 90;
    state.filaments[1].phaseDeg = 270;

    expect(compatibleAt(state, params, 0, 1, 1, 0)).toBe(true);
    state.filaments[0].phaseDeg = 60;
    expect(compatibleAt(state, params, 0, 1, 1, 0)).toBe(false);
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

  it("selects configurable COM layers for angle-based 3-point bending", () => {
    const params = smallParams({ perturbMode: "bend3", bendLayers: 3 });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(6), false);
    expect(state.bend.leftBeads).toHaveLength(state.filaments.length * 3);
    expect(state.bend.centerBeads).toHaveLength(state.filaments.length * 3);
    expect(state.bend.rightBeads).toHaveLength(state.filaments.length * 3);
  });

  it("measures the ABC angle from the selected COM sections", () => {
    const params = smallParams({ perturbMode: "bend3", bendLayers: 3 });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(7), false);
    applyPerturbationConstraints(state, params);
    const angle = angleDegAtB(state.bend.leftCom0, state.bend.centerCom0, state.bend.rightCom0);
    expect(angle).toBeCloseTo(180, 4);
  });

  it("uses inclusive angular threshold boundaries in continuous mode (hard score)", () => {
    const params = smallParams({
      helicityMode: "continuous",
      helicityPhaseOffsetDeg: 1,
      helicityAngleThresholdDeg: 0,
      compatibilitySharpness: 0,
    });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(8), false);
    state.neighborPairs = [[0, 1, 0]];
    state.filaments[0].phaseDeg = 0;
    state.filaments[1].phaseDeg = 180;

    expect(compatibleAt(state, params, 0, 1, 0, 0)).toBe(false);
    params.helicityAngleThresholdDeg = 1;
    expect(compatibleAt(state, params, 0, 1, 0, 0)).toBe(true);
  });

  it("increasing threshold cannot reduce compatibility in continuous mode", () => {
    const state = createSimulationState();
    const strict = smallParams({
      helicityMode: "continuous",
      helicityPhaseOffsetDeg: 10,
      helicityAngleThresholdDeg: 5,
      compatibilitySharpness: 0,
    });
    const loose = { ...strict, helicityAngleThresholdDeg: 15 };
    resetSystem(state, strict, createSeededRng(9), false);
    state.neighborPairs = [[0, 1, 0]];
    state.filaments[0].phaseDeg = 0;
    state.filaments[1].phaseDeg = 180;

    const strictCompatible = compatibleAt(state, strict, 0, 1, 0, 0);
    const looseCompatible = compatibleAt(state, loose, 0, 1, 0, 0);
    expect(Number(looseCompatible)).toBeGreaterThanOrEqual(Number(strictCompatible));
  });

  it("soft score peaks at perfect alignment and falls to zero at the threshold", () => {
    const params = smallParams({
      helicityMode: "continuous",
      helicityPhaseOffsetDeg: 0,
      helicityAngleThresholdDeg: 30,
      compatibilitySharpness: 1,
    });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(10), false);
    state.neighborPairs = [[0, 1, 0]];
    state.filaments[0].phaseDeg = 0;
    state.filaments[1].phaseDeg = 180;

    const peak = compatibilityScore(state, params, 0, 1, 0, 0);
    expect(peak).toBeCloseTo(1, 6);

    state.filaments[0].phaseDeg = 30;
    const edge = compatibilityScore(state, params, 0, 1, 0, 0);
    expect(edge).toBeCloseTo(0, 6);

    state.filaments[0].phaseDeg = 15;
    const half = compatibilityScore(state, params, 0, 1, 0, 0);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });

  it("never builds two crosslinks on the same monomer when threshold is wide", () => {
    const params = smallParams({
      monomers: 12,
      helicityMode: "continuous",
      helicityAngleThresholdDeg: 90,
      compatibilitySharpness: 0,
      sat: 1,
      abpType: "fascin",
      actinTwistDeg: 0,
    });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(11), false);
    // Central filament at (0,0) plus 6 ring neighbors. Centre exposes 0°,
    // ring exposes 180°. Twist set to 0 so every monomer is identical, and the
    // 90° threshold lets the centre match k=0 AND k=1 simultaneously — exactly
    // the conflict the resolver must reject.
    for (const f of state.filaments) {
      f.phaseDeg = f.q === 0 && f.r === 0 ? 0 : 180;
    }
    buildCrosslinks(state, params, createSeededRng(12));

    const beadUseCount = new Map<number, number>();
    for (const [ia, ib] of state.crosslinks) {
      beadUseCount.set(ia, (beadUseCount.get(ia) ?? 0) + 1);
      beadUseCount.set(ib, (beadUseCount.get(ib) ?? 0) + 1);
    }
    expect(state.crosslinks.length).toBeGreaterThan(0);
    for (const n of beadUseCount.values()) expect(n).toBe(1);
  });

  it("enforces minimum crosslink spacing along each filament pair", () => {
    // Continuous mode + zero twist + wide threshold = every monomer is
    // compatible at k=0, so without the spacing rule we'd get one crosslink
    // per monomer. With the rule we must see gaps of >= MIN_CROSSLINK_SPACING.
    const params = smallParams({
      monomers: 24,
      helicityMode: "continuous",
      helicityAngleThresholdDeg: 90,
      compatibilitySharpness: 0,
      sat: 1,
      abpType: "fascin",
      actinTwistDeg: 0,
    });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(30), false);
    state.filaments[0].phaseDeg = 0;
    state.filaments[1].phaseDeg = 180;
    state.neighborPairs = [[0, 1, 0]];

    buildCrosslinks(state, params, createSeededRng(31));

    expect(state.crosslinks.length).toBeGreaterThan(0);
    const ms = state.crosslinks
      .map(([ia]) => state.beads[ia].m)
      .sort((a, b) => a - b);
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i] - ms[i - 1]).toBeGreaterThanOrEqual(MIN_CROSSLINK_SPACING_MONOMERS);
    }

    const score = scoreRegistries(state, params);
    const upperBound = Math.ceil(params.monomers / MIN_CROSSLINK_SPACING_MONOMERS);
    expect(score.count).toBeLessThanOrEqual(upperBound);
    expect(score.count).toBe(state.crosslinks.length);
  });

  it("preserves toy-model bead geometry under continuous helicity mode", () => {
    const params = smallParams({ helicityMode: "continuous" });
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(13), false);
    const f0 = state.filaments[0];
    for (let m = 0; m < params.monomers; m++) {
      const idx = f0.id * params.monomers + m;
      const bead = state.beads[idx];
      expect(bead.x0).toBeCloseTo(f0.x, 9);
      expect(bead.y0).toBeCloseTo(f0.y, 9);
    }
    for (const bond of state.bonds) {
      expect(bond[2]).toBeCloseTo(params.b, 9);
    }
  });
});

describe("registry MC", () => {
  it("mutates filament phaseDeg in continuous mode and leaves discrete s alone", async () => {
    const params: Params = {
      ...defaultParams(),
      rings: 1,
      monomers: 24,
      helicityMode: "continuous",
      registryMode: "zero",
      mcIters: 200,
      mcT0: 4,
      mcT1: 0.05,
      mcSkew: 0,
      mcPhaseSigma0: 30,
      sat: 1,
    };
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(20), false);
    const beforePhases = state.filaments.map((f) => f.phaseDeg);
    const beforeS = state.filaments.map((f) => f.s);
    await runMonteCarlo(state, params, createSeededRng(21), { iters: 200 });

    const afterPhases = state.filaments.map((f) => f.phaseDeg);
    const afterS = state.filaments.map((f) => f.s);
    const phasesChanged = afterPhases.some((p, i) => Math.abs(p - beforePhases[i]) > 1e-9);
    expect(phasesChanged).toBe(true);
    expect(afterS).toEqual(beforeS);
  });
});

describe("force kernel characterization", () => {
  it("applies harmonic bond forces along the stretched bond", () => {
    const params = smallParams({ monomers: 1, kb: 10, rep: 0 });
    const state = createSimulationState();
    state.beads = [
      { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 0, x0: 0, y0: 0, z0: 0 },
      { x: 2, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 0, x0: 2, y0: 0, z0: 0 },
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

  it("applies a harmonic angle force to the three selected COM groups", () => {
    const params = smallParams({
      monomers: 3,
      perturbMode: "bend3",
      bendAngleDeg: 60,
      bendKAngle: 100,
      bendKAngleLog10: 2,
      rep: 0,
    });
    const state = createSimulationState();
    state.beads = [
      { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 0, x0: 0, y0: 0, z0: 0 },
      { x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 1, x0: 1, y0: 0, z0: 0 },
      { x: 1, y: 1, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 2, x0: 1, y0: 1, z0: 0 },
    ];
    state.bend.leftBeads = [0];
    state.bend.centerBeads = [1];
    state.bend.rightBeads = [2];
    syncBeadsToTyped(state);

    computeForces(state, params);

    expect(state.bend.actualAngleDeg).toBeCloseTo(90);
    expect(state.bend.angleErrorDeg).toBeCloseTo(30);
    expect(state.energy.perturb).toBeCloseTo(0.5 * params.bendKAngle * (Math.PI / 6) ** 2);
    expect(state.bend.angleMoment).toBeCloseTo(-params.bendKAngle * (Math.PI / 6));
    expect(state.frc[0] + state.frc[3] + state.frc[6]).toBeCloseTo(0);
    expect(state.frc[1] + state.frc[4] + state.frc[7]).toBeCloseTo(0);
    expect(state.frc[2] + state.frc[5] + state.frc[8]).toBeCloseTo(0);
  });

  it("regularizes an exactly straight COM angle without pinning the tips", () => {
    const params = smallParams({ monomers: 3, perturbMode: "bend3", bendAngleDeg: 120, rep: 0 });
    const state = createSimulationState();
    state.beads = [
      { x: 0, y: 0, z: -1, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 0, x0: 0, y0: 0, z0: -1 },
      { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 1, x0: 0, y0: 0, z0: 0 },
      { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, f: 0, m: 2, x0: 0, y0: 0, z0: 1 },
    ];
    state.bend.leftBeads = [0];
    state.bend.centerBeads = [1];
    state.bend.rightBeads = [2];
    state.bend.bendDir = { x: 1, y: 0, z: 0 };
    syncBeadsToTyped(state);

    computeForces(state, params);

    expect(state.bend.actualAngleDeg).toBeCloseTo(180);
    expect(state.frc[3]).toBeGreaterThan(0);
    expect(state.frc[0] + state.frc[3] + state.frc[6]).toBeCloseTo(0);
  });
});
