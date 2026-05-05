import { PHASE_LEN } from "../model/constants";
import type { Params, RegistryScore, Rng, SimulationState } from "../model/types";
import { buildCrosslinks, compatibleAt } from "./topology";

export function scoreRegistries(state: SimulationState, params: Params): RegistryScore {
  let total = 0;
  const counts: number[] = [];
  for (const [fi, fj, k] of state.neighborPairs) {
    let n = 0;
    for (let m = 0; m < params.monomers; m++) {
      if (compatibleAt(state, params, fi, fj, k, m)) n++;
    }
    counts.push(n);
    total += n;
  }
  const avg = counts.length ? total / counts.length : 0;
  let varSum = 0;
  let zero = 0;
  let hot = 0;
  const lim = avg * 2.0;
  for (const n of counts) {
    varSum += (n - avg) ** 2;
    if (n === 0) zero++;
    if (n > lim) hot++;
  }
  const std = counts.length ? Math.sqrt(varSum / counts.length) : 0;
  return { total, counts, avg, std, zero, hot, pairs: counts.length };
}

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
}

export async function runMonteCarlo(
  state: SimulationState,
  params: Params,
  rng: Rng,
  opts: MonteCarloOptions = {},
): Promise<RegistryScore> {
  const iters = Math.round(opts.iters ?? params.mcIters ?? 4000);
  const T0 = opts.T0 ?? params.mcT0 ?? 8;
  const T1 = opts.T1 ?? params.mcT1 ?? 0.05;
  const skewPenalty = opts.skew ?? params.mcSkew ?? 0.15;
  const yieldEvery = opts.yieldEvery ?? 1000;
  const logEvery = Math.max(1, Math.floor(iters / 8));
  const N = state.filaments.length;

  let cur = scoreRegistries(state, params);
  let curE = mcEnergy(cur, skewPenalty);
  let best = { ...cur };
  const bestS = state.filaments.map((f) => f.s);
  let accepts = 0;

  opts.onProgress?.(
    `MC start: iters=${iters} T0=${T0} T1=${T1} skew=${skewPenalty.toFixed(2)} init score=${cur.total}`,
  );

  for (let it = 0; it < iters; it++) {
    const T = T0 * Math.pow(T1 / T0, it / iters);
    let undo: () => void;

    if (rng.random() < 0.7) {
      const i = Math.floor(rng.random() * N);
      const oldS = state.filaments[i].s;
      const ds = 1 + Math.floor(rng.random() * (PHASE_LEN - 1));
      state.filaments[i].s = (oldS + ds) % PHASE_LEN;
      undo = () => {
        state.filaments[i].s = oldS;
      };
    } else {
      const i = Math.floor(rng.random() * N);
      let j = Math.floor(rng.random() * N);
      if (j === i) j = (j + 1) % N;
      const a = state.filaments[i].s;
      const b = state.filaments[j].s;
      state.filaments[i].s = b;
      state.filaments[j].s = a;
      undo = () => {
        state.filaments[i].s = a;
        state.filaments[j].s = b;
      };
    }

    const trial = scoreRegistries(state, params);
    const trialE = mcEnergy(trial, skewPenalty);
    const dE = trialE - curE;
    if (dE <= 0 || rng.random() < Math.exp(-dE / T)) {
      curE = trialE;
      cur = trial;
      accepts++;
      if (cur.total > best.total || (cur.total === best.total && cur.std < best.std)) {
        best = { ...cur };
        for (let k = 0; k < N; k++) bestS[k] = state.filaments[k].s;
      }
    } else {
      undo();
    }

    if ((it + 1) % logEvery === 0) {
      opts.onProgress?.(
        `it ${it + 1}/${iters} T=${T.toFixed(3)} cur=${cur.total} best=${best.total} acc=${(
          (accepts / (it + 1)) *
          100
        ).toFixed(1)}%`,
      );
    }
    if ((it + 1) % yieldEvery === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  for (let k = 0; k < N; k++) state.filaments[k].s = bestS[k];
  params.registryMode = "custom";
  buildCrosslinks(state, params, rng);

  opts.onProgress?.(
    `MC done - best score ${best.total}, empty pairs ${best.zero}/${best.pairs}, accept rate ${(
      (accepts / iters) *
      100
    ).toFixed(1)}%`,
  );

  return best;
}
