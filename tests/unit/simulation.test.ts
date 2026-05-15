import { describe, expect, it } from "vitest";
import { ABP_PRESETS, defaultParams, MIN_CROSSLINK_SPACING_MONOMERS, PHASE_LEN } from "../../src/model/constants";
import type { Params, SimulationState } from "../../src/model/types";
import { effectiveMonomerIndex, gaussianScore, wrapAxialOffsetMonomers } from "../../src/model/hex";
import { computeForces } from "../../src/simulation/forces";
import { createSeededRng } from "../../src/simulation/random";
import { runMonteCarlo, scoreRegistries } from "../../src/simulation/registry";
import { createSimulationState } from "../../src/simulation/state";
import { crosslinkerCount, filamentCrosslinkMonomers } from "../../src/ui/readout";
import {
  angleDegAtB,
  applyPerturbationConstraints,
  buildCrosslinks,
  compatibilityScore,
  compatibilityScoreAt,
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
    helicityMode: "discrete12",
    helicityHandedness: 1,
    ...overrides,
  };
}

function preparedTwoFilamentState(params: Params, sj = 1): SimulationState {
  const state = createSimulationState();
  resetSystem(state, params, createSeededRng(1), false);
  state.neighborPairs = [[0, 1, 0]];
  state.filaments[0].s = 0;
  state.filaments[1].s = sj;
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
    // Use legacy hard-threshold scoring so this test exercises the
    // threshold/sharpness path it was written against. Custom ABP avoids the
    // fascin axial stagger which otherwise zeroes the score at mi=mj=0.
    const params = smallParams({
      latticeGeometry: "square",
      helicityMode: "continuous",
      actinTwistDeg: 0,
      helicityAngleThresholdDeg: 0,
      compatibilitySharpness: 0,
      scoringMode: "legacy",
      abpType: "custom",
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
    // Use `custom` ABP so the same-monomer compatibility semantics being
    // characterized here are not changed by fascin's 0.84-monomer axial stagger.
    const params = smallParams({ sat: 0, abpType: "custom" });
    const state = preparedTwoFilamentState(params);
    expect(compatibleAt(state, params, 0, 1, 0, 0)).toBe(true);
    expect(scoreRegistries(state, params).total).toBe(2);
    buildCrosslinks(state, params, createSeededRng(2));
    expect(state.crosslinks).toHaveLength(0);
  });

  it("creates single-spring crosslinks for compatible sites (fascin staggered)", () => {
    // Fascin requires mj = mi + 1 (0.84-monomer axial stagger). With s0=s1=0,
    // every 12 monomers the (mi, mi+1) pair has compatible faces at k=0, so we
    // expect 2 crosslinks in a 24-monomer filament pair.
    const params = smallParams({ abpType: "fascin", sat: 1 });
    const state = preparedTwoFilamentState(params, 0);
    buildCrosslinks(state, params, createSeededRng(3));
    expect(state.crosslinks).toHaveLength(2);
    expect(crosslinkerCount(state)).toBe(2);
    expect(state.beads.filter((b) => b.isInternal)).toHaveLength(0);
  });

  it("reports crosslink monomers attached to a selected filament", () => {
    const params = smallParams({ abpType: "fascin", sat: 1 });
    const state = preparedTwoFilamentState(params, 0);
    buildCrosslinks(state, params, createSeededRng(32));

    const monomers = filamentCrosslinkMonomers(state, 0);
    expect(monomers).toHaveLength(2);
    expect(monomers[1] - monomers[0]).toBeGreaterThanOrEqual(MIN_CROSSLINK_SPACING_MONOMERS);
  });

  it("creates linker2 internal topology for CaMKII", () => {
    const params = smallParams({ abpType: "camkii", clDist: 22, sat: 1 });
    const state = preparedTwoFilamentState(params);
    const bondsBefore = state.bonds.length;
    const bendsBefore = state.bends.length;
    buildCrosslinks(state, params, createSeededRng(4));
    expect(state.crosslinks).toHaveLength(0);
    expect(state.beads.filter((b) => b.isInternal)).toHaveLength(2);
    expect(crosslinkerCount(state)).toBe(2);
    expect(state.bonds.length - bondsBefore).toBe(4);
    expect(state.bends.length - bendsBefore).toBe(2);
    expect(filamentCrosslinkMonomers(state, 0)).toHaveLength(2);
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
      scoringMode: "legacy",
      abpType: "custom",
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
      scoringMode: "legacy",
      abpType: "custom",
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
      scoringMode: "legacy",
      abpType: "custom",
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

describe("polarity & axial-offset compatibility", () => {
  it("effectiveMonomerIndex flips around the midpoint when polarity is -1", () => {
    expect(effectiveMonomerIndex(0, 1, 13)).toBe(0);
    expect(effectiveMonomerIndex(12, 1, 13)).toBe(12);
    expect(effectiveMonomerIndex(0, -1, 13)).toBe(12);
    expect(effectiveMonomerIndex(12, -1, 13)).toBe(0);
    expect(effectiveMonomerIndex(6, -1, 13)).toBe(6);
  });

  it("wrapAxialOffsetMonomers wraps to [-0.5, +0.5) and reports the integer carry", () => {
    expect(wrapAxialOffsetMonomers(0)).toEqual({ wrapped: 0, carry: 0 });
    expect(wrapAxialOffsetMonomers(0.3)).toEqual({ wrapped: 0.3, carry: 0 });
    expect(wrapAxialOffsetMonomers(-0.3)).toEqual({ wrapped: -0.3, carry: 0 });
    const a = wrapAxialOffsetMonomers(0.6);
    expect(a.carry).toBe(1);
    expect(a.wrapped).toBeCloseTo(-0.4, 12);
    const b = wrapAxialOffsetMonomers(-0.7);
    expect(b.carry).toBe(-1);
    expect(b.wrapped).toBeCloseTo(0.3, 12);
    // +0.5 sits on the boundary; we use the half-open [-0.5, +0.5) convention,
    // so it wraps to -0.5 + 1 carry.
    const c = wrapAxialOffsetMonomers(0.5);
    expect(c.carry).toBe(1);
    expect(c.wrapped).toBeCloseTo(-0.5, 12);
  });

  it("requireParallel zeroes compatibility for antiparallel filaments", () => {
    const params = smallParams({ abpType: "fascin" });
    const state = preparedTwoFilamentState(params, 0);
    // Polarity +1 / +1 (default): fascin (mi=0, mj=1) should be compatible since
    // s_i=s_j=0 puts the (m=0) face at k=0 and (m=1) face at the opposite of k=0.
    expect(compatibilityScoreAt(state, params, 0, 1, 0, 0, 1)).toBeGreaterThan(0);
    // Flip one polarity; with fascin's requireParallel=true, the score collapses.
    state.filaments[1].polarity = -1;
    expect(compatibilityScoreAt(state, params, 0, 1, 0, 0, 1)).toBe(0);
  });

  it("axial-offset window accepts only mj near mi + abp offset", () => {
    expect(ABP_PRESETS.fascin.abpAxialOffsetMonomers).toBeCloseTo(0.84);
    expect(ABP_PRESETS.fascin.abpAxialOffsetTolMonomers).toBeCloseTo(0.2);
    const params = smallParams({ abpType: "fascin" });
    const state = preparedTwoFilamentState(params, 0);
    // The window check lives in selectCrosslinkSites, not in compatibilityScore.
    // Run scoreRegistries with a one-pair setup and verify mj = mi+1 wins.
    state.helicity.score = scoreRegistries(state, params);
    expect(state.helicity.score.count).toBeGreaterThan(0);
    buildCrosslinks(state, params, createSeededRng(60));
    for (const [ia, ib] of state.crosslinks) {
      const a = state.beads[ia];
      const b = state.beads[ib];
      // mj - mi should equal +1 with fascin's 0.84 ± 0.2 window.
      expect(b.m - a.m).toBe(1);
    }
    // Per-site face score (no axial gate) at (mi=0, mj=0) is the same as at
    // (mi=0, mj=1) only if both pairs have a face match — they don't, so we
    // expect compatibilityScoreAt to differ across mj values.
    expect(compatibilityScoreAt(state, params, 0, 1, 0, 0, 0)).toBe(0);
    expect(compatibilityScoreAt(state, params, 0, 1, 0, 0, 1)).toBeGreaterThan(0);
  });

  it("non-staggered ABPs collapse to same-monomer compatibility", () => {
    const params = smallParams({ abpType: "camkii" });
    const state = preparedTwoFilamentState(params);
    // With camkii (offset=0, tol=0) the iteration loop only considers mj = mi.
    // The face score at (mi=0, mj=0) is compatible (s=0/1 lines up at k=0),
    // and any non-same-monomer probe returns the per-site face score for that
    // off-diagonal mj, which here is zero by the s=0/1 helical pattern.
    expect(compatibleAt(state, params, 0, 1, 0, 0)).toBe(true);
    expect(compatibilityScoreAt(state, params, 0, 1, 0, 0, 1)).toBe(0);
  });

  it("fascin crosslink rest length is the geometric diagonal", () => {
    const params = smallParams({ abpType: "fascin" });
    const state = preparedTwoFilamentState(params);
    state.filaments[0].s = 0;
    state.filaments[1].s = 0;
    buildCrosslinks(state, params, createSeededRng(101));
    expect(state.crosslinks.length).toBeGreaterThan(0);
    const [ia, ib, rest] = state.crosslinks[0];
    const a = state.beads[ia];
    const b = state.beads[ib];
    const expected = Math.hypot(b.x0 - a.x0, b.y0 - a.y0, b.z0 - a.z0);
    expect(rest).toBeCloseTo(expected, 6);
    // Bead axial spacing here = 1 * b (since mj - mi = 1, no per-filament shift).
    const axialNm = params.b;
    const perpNm = params.a;
    const diag = Math.hypot(perpNm, axialNm);
    expect(rest).toBeCloseTo(diag, 6);
  });

  it("MC slide+polarity moves keep filament state finite and bounded", async () => {
    // Mixed slide + polarity moves at low T. We don't assert on final-state
    // equality (energy-neutral slides ARE accepted under the Metropolis rule
    // because dE = 0 → accept always, which mutates the best snapshot via the
    // std tiebreaker). What we DO assert: nothing leaves the legal ranges.
    const params: Params = {
      ...smallParams({ abpType: "fascin", helicityMode: "continuous" }),
      mcIters: 100,
      mcAxialSlideProb: 0.5,
      mcPolarityFlipProb: 0.5,
      mcT0: 1e-12,
      mcT1: 1e-12,
      mcSkew: 0,
    };
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(50), false);
    await runMonteCarlo(state, params, createSeededRng(51), { iters: 100 });
    for (const f of state.filaments) {
      expect(Number.isFinite(f.axialOffsetMonomers)).toBe(true);
      expect(f.axialOffsetMonomers).toBeGreaterThanOrEqual(-0.5 - 1e-9);
      expect(f.axialOffsetMonomers).toBeLessThan(0.5 + 1e-9);
      expect(Number.isFinite(f.phaseDeg)).toBe(true);
      expect(f.phaseDeg).toBeGreaterThanOrEqual(0);
      expect(f.phaseDeg).toBeLessThan(360 + 1e-9);
      expect(f.polarity === 1 || f.polarity === -1).toBe(true);
    }
  });

  it("axial-offset wrap is energy-neutral (continuous mode)", () => {
    // The wrap shifts axialOffsetMonomers by -carry and phaseDeg by
    // -carry*h*twist. The combined transform is the identity on the physical
    // helix, so scoreRegistries should be invariant under it.
    const params: Params = {
      ...smallParams({ abpType: "fascin", helicityMode: "continuous" }),
      helicityHandedness: 1,
      registryMode: "zero",
    };
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(70), false);
    // Stage a near-wrap-boundary state on filament 0.
    state.filaments[0].axialOffsetMonomers = 0.49;
    state.filaments[0].phaseDeg = 137;
    const baseline = scoreRegistries(state, params).total;
    // Apply a manual wrap: axialOff += -1 (carry=+1), phaseDeg -= 1*h*twist.
    state.filaments[0].axialOffsetMonomers -= 1;
    state.filaments[0].phaseDeg =
      ((state.filaments[0].phaseDeg - 1 * params.helicityHandedness * params.actinTwistDeg) % 360 + 360) % 360;
    const wrapped = scoreRegistries(state, params).total;
    expect(wrapped).toBeCloseTo(baseline, 9);
  });

  it("axial-offset wrap is energy-neutral (discrete-12 mode)", () => {
    // Discrete: s -= carry exactly recovers the score under the bookkeeping wrap.
    const params: Params = {
      ...smallParams({ abpType: "fascin", helicityMode: "discrete12" }),
      registryMode: "zero",
    };
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(71), false);
    state.filaments[0].axialOffsetMonomers = 0.49;
    state.filaments[0].s = 4;
    const baseline = scoreRegistries(state, params).total;
    state.filaments[0].axialOffsetMonomers -= 1;
    state.filaments[0].s = ((state.filaments[0].s - 1) % PHASE_LEN + PHASE_LEN) % PHASE_LEN;
    const wrapped = scoreRegistries(state, params).total;
    expect(wrapped).toBeCloseTo(baseline, 9);
  });
});

describe("gaussian scoring & annealing", () => {
  it("gaussianScore peaks at zero mismatch and decays smoothly", () => {
    expect(gaussianScore(0, 10)).toBeCloseTo(1, 12);
    expect(gaussianScore(10, 10)).toBeCloseTo(Math.exp(-0.5), 12);
    expect(gaussianScore(-10, 10)).toBeCloseTo(Math.exp(-0.5), 12);
    expect(gaussianScore(30, 10)).toBeCloseTo(Math.exp(-4.5), 12); // 3σ → ~0.011
    // σ → 0 collapses to a Kronecker delta.
    expect(gaussianScore(0, 0)).toBe(1);
    expect(gaussianScore(0.01, 0)).toBe(0);
  });

  it("axial-window picks integer mj nearest to abp.offset under gaussian mode", () => {
    // Fascin: preferred axial offset 0.84 monomers. With σ_min=0.15 the
    // iteration range is ±0.45, so only mj = mi+1 is in window (mismatch 0.16,
    // score ~0.566). mj = mi+0 has mismatch 0.84 → outside 3σ → not even
    // considered; mj = mi+2 has mismatch 1.16 → also outside.
    const params = smallParams({ abpType: "fascin", helicityMode: "discrete12" });
    const state = preparedTwoFilamentState(params, 0);
    buildCrosslinks(state, params, createSeededRng(80));
    expect(state.crosslinks.length).toBeGreaterThan(0);
    for (const [ia, ib] of state.crosslinks) {
      const a = state.beads[ia];
      const b = state.beads[ib];
      expect(b.m - a.m).toBe(1);
    }
  });

  it("scoreRegistries.total is higher at σ_max than σ_min (broader well admits more weight)", () => {
    // Same configuration scored at two widths. Broader σ_axial accepts a
    // larger range of mj and the per-site Gaussian assigns more weight to
    // off-peak mismatches, so the sum is monotone in σ.
    const params = smallParams({ abpType: "fascin", helicityMode: "discrete12" });
    const state = preparedTwoFilamentState(params, 0);
    const sigmaMin = params.mcAxialSigmaMinMonomers;
    const sigmaMax = params.mcAxialSigmaMaxMonomers;
    const atMin = scoreRegistries(state, params, { axialSigmaMonomers: sigmaMin });
    const atMax = scoreRegistries(state, params, { axialSigmaMonomers: sigmaMax });
    expect(atMax.total).toBeGreaterThanOrEqual(atMin.total);
  });

  it("legacy scoring mode reproduces hard-window behavior", () => {
    // Under scoringMode: 'legacy' with abpType: 'custom' (offset=0, tol=0) the
    // same-monomer compatibility semantics from Stages 1–2 hold: face score is
    // cosine/binary, axial gate is a 1/0 hard step.
    const params = smallParams({
      sat: 0,
      abpType: "custom",
      scoringMode: "legacy",
    });
    const state = preparedTwoFilamentState(params);
    expect(compatibleAt(state, params, 0, 1, 0, 0)).toBe(true);
    expect(scoreRegistries(state, params).total).toBe(2);
  });

  it("scoreRegistries.count after MC equals state.crosslinks.length at σ_min", async () => {
    // The CLAUDE.md-mandated invariant: scoreRegistries and buildCrosslinks
    // agree on count. Re-checks under the new defaults (gaussian, σ_min=0.15).
    const params: Params = {
      ...defaultParams(),
      rings: 1,
      monomers: 24,
      mcIters: 80,
      mcT0: 4,
      mcT1: 0.01,
      mcSkew: 0,
      sat: 1,
    };
    const state = createSimulationState();
    resetSystem(state, params, createSeededRng(81), false);
    await runMonteCarlo(state, params, createSeededRng(82), { iters: 80 });
    const score = scoreRegistries(state, params);
    expect(score.count).toBe(state.crosslinks.length);
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
      // Disable the new polarity/slide moves for this test — its intent is
      // "phaseDeg mutates in continuous mode", independent of the new DOFs.
      mcPolarityFlipProb: 0,
      mcAxialSlideProb: 0,
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
