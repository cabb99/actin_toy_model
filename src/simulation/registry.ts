import { PHASE_LEN } from "../model/constants";
import { wrapAxialOffsetMonomers, wrapDeg360 } from "../model/hex";
import type {
  Params,
  RegistryScore,
  Rng,
  ScoringOverrides,
  SimulationState,
} from "../model/types";
import { scoreRegistries } from "./compatibility";
import { applyAxialOffsetsToBeads, buildCrosslinks } from "./topology";

export { scoreRegistries } from "./compatibility";

export function mcEnergy(score: RegistryScore, skewPenalty: number): number {
  return -score.total + skewPenalty * score.std * score.pairs;
}

export interface MonteCarloOptions {
  iters?: number;
  T0?: number;
  T1?: number;
  skew?: number;
  yieldEvery?: number;
  onProgress?(message: string): void;
  onSample?(sample: MonteCarloSample): void;
}

export interface MonteCarloSample {
  iteration: number;
  temperature: number;
  connections: number;
  bestConnections: number;
  score: number;
  bestScore: number;
  acceptRate: number;
}

export async function runMonteCarlo(
  state: SimulationState,
  params: Params,
  rng: Rng,
  opts: MonteCarloOptions = {},
): Promise<RegistryScore> {
  const iters = Math.round(opts.iters ?? params.mcIters ?? 12000);
  const T0 = opts.T0 ?? params.mcT0 ?? 4;
  const T1 = opts.T1 ?? params.mcT1 ?? 0.005;
  const skewPenalty = opts.skew ?? params.mcSkew ?? 0.15;
  const yieldEvery = opts.yieldEvery ?? 1000;
  const logEvery = Math.max(1, Math.floor(iters / 8));
  const N = state.filaments.length;

  const continuous = params.helicityMode === "continuous";
  const sigma0 = Math.max(0.1, params.mcPhaseSigma0 ?? 30);
  const axialSigma0 = Math.max(0.001, params.mcAxialSigma0 ?? 0.15);
  const polarityFlipProb = Math.max(0, Math.min(1, params.mcPolarityFlipProb ?? 0.1));
  const axialSlideProb = Math.max(0, Math.min(1, params.mcAxialSlideProb ?? 0.2));
  // Remaining probability is split 70/30 between single-filament phase mutation
  // and two-filament phase swap, preserving the historical ratio.
  const phaseBudget = Math.max(0, 1 - polarityFlipProb - axialSlideProb);
  const polarityThresh = polarityFlipProb;
  const axialThresh = polarityFlipProb + axialSlideProb;
  const singleThresh = axialThresh + 0.7 * phaseBudget;

  // Gaussian σ annealing schedule: same geometric shape as the T schedule, so
  // σ_eff hits σ_max at T=T0 and σ_min at T=T1. `logRatioT` is precomputed for
  // the per-iter loop. The scratch overrides object is reused each iteration
  // to avoid allocations on the hot path.
  const gaussianScoring = params.scoringMode === "gaussian";
  const angleSigmaMin = Math.max(1e-3, params.mcAngleSigmaMinDeg);
  const angleSigmaMax = Math.max(angleSigmaMin, params.mcAngleSigmaMaxDeg);
  const axialSigmaMin = Math.max(1e-3, params.mcAxialSigmaMinMonomers);
  const axialSigmaMax = Math.max(axialSigmaMin, params.mcAxialSigmaMaxMonomers);
  const logAngleRatio = Math.log(angleSigmaMax / angleSigmaMin);
  const logAxialRatio = Math.log(axialSigmaMax / axialSigmaMin);
  const logTRatio = T0 > T1 ? Math.log(T0 / T1) : 0;
  const scratchOverrides: ScoringOverrides = {};

  function annealedOverrides(T: number): ScoringOverrides | undefined {
    if (!gaussianScoring) return undefined;
    const progress = logTRatio > 0 ? Math.log(T / T1) / logTRatio : 0;
    const p = Math.max(0, Math.min(1, progress));
    scratchOverrides.angleSigmaDeg = angleSigmaMin * Math.exp(logAngleRatio * p);
    scratchOverrides.axialSigmaMonomers = axialSigmaMin * Math.exp(logAxialRatio * p);
    return scratchOverrides;
  }

  // `cur`/`curE` track the score at σ_eff(T) so the Metropolis test is
  // consistent within an iter. `best`, in contrast, is always evaluated at
  // σ_min (no overrides) so the optimum survives the σ schedule — score totals
  // at σ_eff shrink as σ narrows, which would otherwise lock `best` to
  // whatever was seen at σ_max.
  let cur = scoreRegistries(state, params, annealedOverrides(T0));
  let curE = mcEnergy(cur, skewPenalty);
  let best = scoreRegistries(state, params);
  const bestS = state.filaments.map((f) => f.s);
  const bestPhase = state.filaments.map((f) => f.phaseDeg);
  const bestPolarity = state.filaments.map((f) => f.polarity);
  const bestAxial = state.filaments.map((f) => f.axialOffsetMonomers);
  let accepts = 0;

  opts.onProgress?.(
    `MC start: iters=${iters} T0=${T0} T1=${T1} skew=${skewPenalty.toFixed(2)} ` +
      `mode=${continuous ? "continuous" : "discrete12"} sigma0=${sigma0.toFixed(1)}° ` +
      `init score=${cur.total.toFixed(2)}`,
  );
  opts.onSample?.({
    iteration: 0,
    temperature: T0,
    connections: cur.count,
    bestConnections: best.count,
    score: cur.total,
    bestScore: best.total,
    acceptRate: 0,
  });

  for (let it = 0; it < iters; it++) {
    const T = T0 * Math.pow(T1 / T0, it / iters);
    const sigma = sigma0 * Math.sqrt(T / T0);
    const axialSigma = axialSigma0 * Math.sqrt(T / T0);
    // Re-score the unchanged pre-move state at this iter's σ so the Metropolis
    // dE compares apples to apples across the annealing schedule. Skipped when
    // σ is constant (legacy mode) — `cur`/`curE` already reflect the current
    // state at the fixed σ.
    if (gaussianScoring) {
      cur = scoreRegistries(state, params, annealedOverrides(T));
      curE = mcEnergy(cur, skewPenalty);
    }
    let undo: () => void;
    const u = rng.random();

    if (u < polarityThresh) {
      // Polarity flip on one filament.
      const i = Math.floor(rng.random() * N);
      const oldPolarity = state.filaments[i].polarity;
      state.filaments[i].polarity = oldPolarity === 1 ? -1 : 1;
      undo = () => {
        state.filaments[i].polarity = oldPolarity;
      };
    } else if (u < axialThresh) {
      // Axial slide: shift one filament along z by a small dz (monomer units).
      // Wrap to [-0.5, 0.5) and absorb the integer carry into s (or phaseDeg)
      // so the move is energy-neutral when no other filament moves.
      const i = Math.floor(rng.random() * N);
      const f = state.filaments[i];
      const oldOffset = f.axialOffsetMonomers;
      const oldS = f.s;
      const oldPhase = f.phaseDeg;
      const dz = axialSigma * rng.normal();
      const { wrapped, carry } = wrapAxialOffsetMonomers(oldOffset + dz);
      f.axialOffsetMonomers = wrapped;
      // Physical continuity: when axialOffset drops by `carry` monomers during
      // the wrap, the bead at any fixed physical z gets a label that's `carry`
      // higher (since m + axialOff is invariant for a given physical bead). To
      // keep the exposed face at that physical z unchanged, s must decrease by
      // `carry` (or phaseDeg by `carry * h * twist`). This makes the wrap a
      // pure bookkeeping change with no scoreRegistries delta on its own.
      if (continuous) {
        const dPhase = -carry * params.actinTwistDeg * params.helicityHandedness;
        f.phaseDeg = wrapDeg360(oldPhase + dPhase);
      } else {
        f.s = (((oldS - carry) % PHASE_LEN) + PHASE_LEN) % PHASE_LEN;
      }
      undo = () => {
        f.axialOffsetMonomers = oldOffset;
        f.s = oldS;
        f.phaseDeg = oldPhase;
      };
    } else if (u < singleThresh) {
      // Single-filament phase mutation (existing move).
      const i = Math.floor(rng.random() * N);
      if (continuous) {
        const oldPhase = state.filaments[i].phaseDeg;
        const dphi = sigma * rng.normal();
        state.filaments[i].phaseDeg = wrapDeg360(oldPhase + dphi);
        undo = () => {
          state.filaments[i].phaseDeg = oldPhase;
        };
      } else {
        const oldS = state.filaments[i].s;
        const ds = 1 + Math.floor(rng.random() * (PHASE_LEN - 1));
        state.filaments[i].s = (oldS + ds) % PHASE_LEN;
        undo = () => {
          state.filaments[i].s = oldS;
        };
      }
    } else {
      // Two-filament phase swap (existing move).
      const i = Math.floor(rng.random() * N);
      let j = Math.floor(rng.random() * N);
      if (j === i) j = (j + 1) % N;
      if (continuous) {
        const pi = state.filaments[i].phaseDeg;
        const pj = state.filaments[j].phaseDeg;
        state.filaments[i].phaseDeg = pj;
        state.filaments[j].phaseDeg = pi;
        undo = () => {
          state.filaments[i].phaseDeg = pi;
          state.filaments[j].phaseDeg = pj;
        };
      } else {
        const a = state.filaments[i].s;
        const b = state.filaments[j].s;
        state.filaments[i].s = b;
        state.filaments[j].s = a;
        undo = () => {
          state.filaments[i].s = a;
          state.filaments[j].s = b;
        };
      }
    }

    const overrides = annealedOverrides(T);
    const trial = scoreRegistries(state, params, overrides);
    const trialE = mcEnergy(trial, skewPenalty);
    const dE = trialE - curE;
    if (dE <= 0 || rng.random() < Math.exp(-dE / T)) {
      curE = trialE;
      cur = trial;
      accepts++;
      // Track the last-accepted state. Under annealing σ_eff(T) shrinks across
      // iterations, so comparing scores from different σ is incoherent — the
      // standard simulated-annealing convention is to use the converged
      // (last-accepted) state directly. At low T the Metropolis chain is
      // effectively greedy, so this *is* the local optimum.
      best = { ...cur };
      for (let k = 0; k < N; k++) {
        bestS[k] = state.filaments[k].s;
        bestPhase[k] = state.filaments[k].phaseDeg;
        bestPolarity[k] = state.filaments[k].polarity;
        bestAxial[k] = state.filaments[k].axialOffsetMonomers;
      }
    } else {
      undo();
    }

    if ((it + 1) % logEvery === 0) {
      opts.onProgress?.(
        `it ${it + 1}/${iters} T=${T.toFixed(3)} σ=${sigma.toFixed(2)}° ` +
          `cur=${cur.total.toFixed(2)} best=${best.total.toFixed(2)} ` +
          `acc=${((accepts / (it + 1)) * 100).toFixed(1)}%`,
      );
      opts.onSample?.({
        iteration: it + 1,
        temperature: T,
        connections: cur.count,
        bestConnections: best.count,
        score: cur.total,
        bestScore: best.total,
        acceptRate: accepts / (it + 1),
      });
    }
    if ((it + 1) % yieldEvery === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  for (let k = 0; k < N; k++) {
    state.filaments[k].s = bestS[k];
    state.filaments[k].phaseDeg = bestPhase[k];
    state.filaments[k].polarity = bestPolarity[k];
    state.filaments[k].axialOffsetMonomers = bestAxial[k];
  }
  params.registryMode = "custom";
  applyAxialOffsetsToBeads(state, params);
  buildCrosslinks(state, params, rng);

  // Re-score the best configuration at σ_min (no overrides) so the returned
  // RegistryScore and the readout reflect the tight, post-anneal width — the
  // same score the live readout shows.
  const finalBest = scoreRegistries(state, params);

  opts.onProgress?.(
    `MC done - best score ${finalBest.total.toFixed(2)} (${finalBest.count} sites), ` +
      `empty pairs ${finalBest.zero}/${finalBest.pairs}, accept rate ${((accepts / iters) * 100).toFixed(1)}%`,
  );
  opts.onSample?.({
    iteration: iters,
    temperature: T1,
    connections: finalBest.count,
    bestConnections: finalBest.count,
    score: finalBest.total,
    bestScore: finalBest.total,
    acceptRate: accepts / iters,
  });

  return finalBest;
}
