import { MIN_CROSSLINK_SPACING_MONOMERS } from "../model/constants";
import {
  angularDistanceDeg,
  exposedK,
  hexDirectionDeg,
  monomerExposedAngleDeg,
  softAngularScore,
} from "../model/hex";
import type { Params, RegistryScore, Rng, SimulationState } from "../model/types";

export interface CrosslinkCandidate {
  fi: number;
  fj: number;
  k: number;
  m: number;
  score: number;
}

export interface SiteCensus {
  compatibleSites: number;
  incompatibleSites: number;
}

export function compatibilityScore(
  state: SimulationState,
  params: Params,
  fi: number,
  fj: number,
  k: number,
  m: number,
): number {
  const fi0 = state.filaments[fi];
  const fj0 = state.filaments[fj];
  if (!fi0 || !fj0) return 0;
  const oppK = (k + 3) % 6;

  if (params.helicityMode !== "continuous") {
    return exposedK(m, fi0.s) === k && exposedK(m, fj0.s) === oppK ? 1 : 0;
  }

  const iAngle = monomerExposedAngleDeg(m, fi0.phaseDeg, params);
  const jAngle = monomerExposedAngleDeg(m, fj0.phaseDeg, params);
  const iMismatch = angularDistanceDeg(iAngle, hexDirectionDeg(k));
  const jMismatch = angularDistanceDeg(jAngle, hexDirectionDeg(oppK));
  const threshold = params.helicityAngleThresholdDeg;
  const sharp = params.compatibilitySharpness;
  const si = softAngularScore(iMismatch, threshold, sharp);
  if (si <= 0) return 0;
  const sj = softAngularScore(jMismatch, threshold, sharp);
  return si * sj;
}

export function compatibleAt(
  state: SimulationState,
  params: Params,
  fi: number,
  fj: number,
  k: number,
  m: number,
): boolean {
  return compatibilityScore(state, params, fi, fj, k, m) > 0;
}

export interface SelectCrosslinkOptions {
  /** When true, apply a per-candidate Bernoulli filter using `params.sat` and `rng`. */
  applySaturation?: boolean;
  /** Required when `applySaturation` is true. */
  rng?: Rng;
}

/**
 * Resolve the set of crosslinks that should exist given the current registry.
 *
 * The same algorithm gates both `buildCrosslinks` and `scoreRegistries` so the
 * upper bound the optimizer maximizes equals the count `buildCrosslinks` will
 * actually realize. Steps:
 *   1. Enumerate (fi, fj, k, m) candidates with soft compatibility score > 0.
 *   2. (Optional) drop each candidate independently with probability 1 - sat.
 *   3. Sort candidates by descending score (geometry-weighted).
 *   4. Greedy claim: skip a candidate if either bead is already in another
 *      crosslink, or if the candidate's monomer is within
 *      MIN_CROSSLINK_SPACING_MONOMERS of an already-accepted monomer on the
 *      same filament pair.
 *
 * Returns the accepted candidates plus a census of how many sites had non-zero
 * vs zero compatibility (used by `state.helicity` readouts).
 */
export function selectCrosslinkSites(
  state: SimulationState,
  params: Params,
  options: SelectCrosslinkOptions = {},
): { selected: CrosslinkCandidate[]; census: SiteCensus } {
  const { applySaturation = false, rng } = options;
  if (applySaturation && !rng) throw new Error("selectCrosslinkSites requires rng when applySaturation is true");

  const candidates: CrosslinkCandidate[] = [];
  let compatibleSites = 0;
  let incompatibleSites = 0;

  for (const [fi, fj, k] of state.neighborPairs) {
    for (let m = 0; m < params.monomers; m++) {
      const score = compatibilityScore(state, params, fi, fj, k, m);
      if (score > 0) {
        compatibleSites++;
        if (applySaturation && rng!.random() > params.sat) continue;
        candidates.push({ fi, fj, k, m, score });
      } else {
        incompatibleSites++;
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const claimed = new Set<number>();
  const pairOccupied = new Map<string, number[]>();
  const monomers = params.monomers;
  const selected: CrosslinkCandidate[] = [];

  for (const c of candidates) {
    const ia = c.fi * monomers + c.m;
    const ib = c.fj * monomers + c.m;
    if (claimed.has(ia) || claimed.has(ib)) continue;
    const pairKey = `${c.fi}-${c.fj}`;
    const occupied = pairOccupied.get(pairKey);
    if (occupied) {
      let tooClose = false;
      for (const m of occupied) {
        if (Math.abs(m - c.m) < MIN_CROSSLINK_SPACING_MONOMERS) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      occupied.push(c.m);
    } else {
      pairOccupied.set(pairKey, [c.m]);
    }
    claimed.add(ia);
    claimed.add(ib);
    selected.push(c);
  }

  return { selected, census: { compatibleSites, incompatibleSites } };
}

/**
 * Upper-bound registry score (sat=1). Both `runMonteCarlo` and the live readout
 * read this; `buildCrosslinks` caches the result on `state.helicity.score`.
 *
 * `total` is the sum of geometry-weighted soft scores across the same greedy
 * crosslink selection that `buildCrosslinks` would realize. `count` is the
 * crosslink count under that selection.
 */
export function scoreRegistries(state: SimulationState, params: Params): RegistryScore {
  const { selected } = selectCrosslinkSites(state, params, { applySaturation: false });
  const pairTotals = new Map<string, number>();
  for (const [fi, fj] of state.neighborPairs) pairTotals.set(`${fi}-${fj}`, 0);
  for (const c of selected) {
    const key = `${c.fi}-${c.fj}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + c.score);
  }

  const counts = Array.from(pairTotals.values());
  const total = counts.reduce((sum, value) => sum + value, 0);
  const count = selected.length;
  const avg = counts.length ? total / counts.length : 0;
  let varSum = 0;
  let zero = 0;
  let hot = 0;
  const lim = avg * 2.0;
  for (const n of counts) {
    varSum += (n - avg) ** 2;
    if (n <= 0) zero++;
    if (n > lim) hot++;
  }
  const std = counts.length ? Math.sqrt(varSum / counts.length) : 0;
  return { total, counts, avg, std, zero, hot, pairs: counts.length, count };
}
