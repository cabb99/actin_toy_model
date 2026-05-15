import { MIN_CROSSLINK_SPACING_MONOMERS } from "../model/constants";
import { currentAbpEffective } from "../model/abp";
import {
  angularDistanceDeg,
  effectiveMonomerIndex,
  exposedK,
  gaussianScore,
  latticeDirectionDeg,
  latticeDirectionFaceK,
  monomerExposedAngleDeg,
  oppositeLatticeDirectionDeg,
  oppositeLatticeDirectionFaceK,
  softAngularScore,
} from "../model/hex";
import type {
  EffectiveAbp,
  Params,
  RegistryScore,
  Rng,
  ScoringOverrides,
  SimulationState,
} from "../model/types";

export interface CrosslinkCandidate {
  fi: number;
  fj: number;
  k: number;
  /** Monomer index on filament fi. */
  m: number;
  /** Monomer index on filament fj. With axial offset this differs from m. */
  mj: number;
  score: number;
}

export interface SiteCensus {
  compatibleSites: number;
  incompatibleSites: number;
}

const MIN_SIGMA = 1e-3;

/** Effective angle sigma used by the gaussian face score. Overrides win;
 * otherwise we use params.mcAngleSigmaMinDeg (the tight final-state width). */
function effectiveAngleSigma(params: Params, overrides?: ScoringOverrides): number {
  const s = overrides?.angleSigmaDeg ?? params.mcAngleSigmaMinDeg;
  return Math.max(MIN_SIGMA, s);
}

/** Effective axial sigma used by the gaussian axial score. */
function effectiveAxialSigma(params: Params, overrides?: ScoringOverrides): number {
  const s = overrides?.axialSigmaMonomers ?? params.mcAxialSigmaMinMonomers;
  return Math.max(MIN_SIGMA, s);
}

function faceScoreI(
  state: SimulationState,
  params: Params,
  fi: number,
  m: number,
  k: number,
  overrides?: ScoringOverrides,
): number {
  const f0 = state.filaments[fi];
  if (!f0) return 0;
  const eM = effectiveMonomerIndex(m, f0.polarity, params.monomers);
  const lattice = params.latticeGeometry;
  if (params.helicityMode !== "continuous") {
    const faceK = latticeDirectionFaceK(lattice, k);
    return exposedK(eM, f0.s) === faceK ? 1 : 0;
  }
  const angle = monomerExposedAngleDeg(eM, f0.phaseDeg, params);
  const mismatch = angularDistanceDeg(angle, latticeDirectionDeg(lattice, k));
  if (params.scoringMode === "gaussian") {
    return gaussianScore(mismatch, effectiveAngleSigma(params, overrides));
  }
  return softAngularScore(mismatch, params.helicityAngleThresholdDeg, params.compatibilitySharpness);
}

function faceScoreJ(
  state: SimulationState,
  params: Params,
  fj: number,
  m: number,
  k: number,
  overrides?: ScoringOverrides,
): number {
  const f0 = state.filaments[fj];
  if (!f0) return 0;
  const eM = effectiveMonomerIndex(m, f0.polarity, params.monomers);
  const lattice = params.latticeGeometry;
  if (params.helicityMode !== "continuous") {
    const oppFaceK = oppositeLatticeDirectionFaceK(lattice, k);
    return exposedK(eM, f0.s) === oppFaceK ? 1 : 0;
  }
  const angle = monomerExposedAngleDeg(eM, f0.phaseDeg, params);
  const mismatch = angularDistanceDeg(angle, oppositeLatticeDirectionDeg(lattice, k));
  if (params.scoringMode === "gaussian") {
    return gaussianScore(mismatch, effectiveAngleSigma(params, overrides));
  }
  return softAngularScore(mismatch, params.helicityAngleThresholdDeg, params.compatibilitySharpness);
}

/**
 * Multiplicative axial-mismatch factor. In gaussian mode this is a Gaussian on
 * the monomer-unit deviation from the ABP's preferred stagger. In legacy mode
 * it's a 1/0 hard window matching the pre-Stage-3 behavior. The caller has
 * already constrained `mj` to a feasible iteration range, but the score itself
 * still needs the multiplicative factor so the optimizer sees a smooth
 * landscape in gaussian mode.
 */
function axialScore(
  mismatchMonomers: number,
  params: Params,
  abp: EffectiveAbp,
  overrides?: ScoringOverrides,
): number {
  if (params.scoringMode === "gaussian") {
    return gaussianScore(mismatchMonomers, effectiveAxialSigma(params, overrides));
  }
  // legacy: hard window
  return Math.abs(mismatchMonomers) <= abp.abpAxialOffsetTolMonomers + 1e-9 ? 1 : 0;
}

/**
 * Helical+polarity+axial compatibility score at a single binding site
 * (mi, mj) on filaments fi and fj across hex direction k.
 *
 * Polarity flips the effective monomer index used in face computation
 * (m -> N-1-m); the helix chirality is unchanged. requireParallel (per ABP
 * preset) zeroes the score when polarities differ.
 *
 * When `scoringMode === "gaussian"` (the default) the face and axial terms
 * are Gaussian falloffs with widths set by `overrides` (T-annealed) or by
 * `params.mcAngleSigmaMinDeg` / `params.mcAxialSigmaMinMonomers` (the tight
 * post-MC width). When `scoringMode === "legacy"` the face term reverts to
 * `softAngularScore` (cosine over threshold) and the axial term is a 1/0
 * hard window.
 */
export function compatibilityScoreAt(
  state: SimulationState,
  params: Params,
  fi: number,
  fj: number,
  k: number,
  mi: number,
  mj: number,
  overrides?: ScoringOverrides,
): number {
  const fi0 = state.filaments[fi];
  const fj0 = state.filaments[fj];
  if (!fi0 || !fj0) return 0;
  const abp = currentAbpEffective(params);
  if (abp.requireParallel && fi0.polarity !== fj0.polarity) return 0;
  const si = faceScoreI(state, params, fi, mi, k, overrides);
  if (si <= 0) return 0;
  const sj = faceScoreJ(state, params, fj, mj, k, overrides);
  if (sj <= 0) return 0;
  const desired = abp.abpAxialOffsetMonomers + (fi0.axialOffsetMonomers - fj0.axialOffsetMonomers);
  const axialMismatch = (mj - mi) - desired;
  const ax = axialScore(axialMismatch, params, abp, overrides);
  return si * sj * ax;
}

/** Per-site compatibility score; mj defaults to mi (same-monomer) for callers
 * that don't care about the axial offset (e.g. non-staggered ABPs or
 * debug/test code that wants the historical signature).
 *
 * IMPORTANT: this function evaluates the face + polarity + axial score in one
 * shot via `compatibilityScoreAt`. For non-staggered ABPs (offset=0, tol=0 in
 * legacy mode; small Gaussian widths in gaussian mode) passing only `mi`
 * exercises the same-monomer path; for staggered ABPs the caller must pass the
 * desired `mj`. */
export function compatibilityScore(
  state: SimulationState,
  params: Params,
  fi: number,
  fj: number,
  k: number,
  mi: number,
  mj: number = mi,
  overrides?: ScoringOverrides,
): number {
  return compatibilityScoreAt(state, params, fi, fj, k, mi, mj, overrides);
}

export function compatibleAt(
  state: SimulationState,
  params: Params,
  fi: number,
  fj: number,
  k: number,
  mi: number,
  mj: number = mi,
  overrides?: ScoringOverrides,
): boolean {
  return compatibilityScore(state, params, fi, fj, k, mi, mj, overrides) > 0;
}

export interface SelectCrosslinkOptions {
  /** When true, apply a per-candidate Bernoulli filter using `params.sat` and `rng`. */
  applySaturation?: boolean;
  /** Required when `applySaturation` is true. */
  rng?: Rng;
  /** T-annealed scoring widths. Omit to use the tight `params.*Min*` widths. */
  overrides?: ScoringOverrides;
}

function axialDesiredOffsetMonomers(abp: EffectiveAbp, fi0Off: number, fj0Off: number): number {
  // We want: (mj + fj.axialOffset) - (mi + fi.axialOffset) ≈ abp.offset
  //          mj - mi ≈ abp.offset + (fi.axialOffset - fj.axialOffset)
  return abp.abpAxialOffsetMonomers + (fi0Off - fj0Off);
}

/**
 * Resolve the set of crosslinks that should exist given the current registry.
 *
 * The same algorithm gates both `buildCrosslinks` and `scoreRegistries` so the
 * upper bound the optimizer maximizes equals the count `buildCrosslinks` will
 * actually realize. Steps:
 *   1. For each neighbor pair (fi, fj, k), iterate mi over filament-i monomers.
 *   2. For each mi, determine the set of feasible mj values. In legacy mode
 *      this is the hard `[ceil(desired - tol), floor(desired + tol)]` window;
 *      in gaussian mode it widens to `±3σ_axial` around the preferred offset.
 *   3. Evaluate `compatibilityScoreAt(fi, fj, k, mi, mj, overrides)` — face +
 *      polarity + axial. Keep the best-scoring mj for each mi.
 *   4. (Optional) drop each surviving candidate with probability 1 - sat.
 *   5. Sort candidates by descending score (geometry-weighted).
 *   6. Greedy claim: skip a candidate if either bead is already in another
 *      crosslink, or if the candidate's mi is within
 *      MIN_CROSSLINK_SPACING_MONOMERS of an already-accepted mi on the same
 *      filament pair.
 *
 * Returns the accepted candidates plus a census of how many sites had non-zero
 * vs zero compatibility (used by `state.helicity` readouts).
 */
export function selectCrosslinkSites(
  state: SimulationState,
  params: Params,
  options: SelectCrosslinkOptions = {},
): { selected: CrosslinkCandidate[]; census: SiteCensus } {
  const { applySaturation = false, rng, overrides } = options;
  if (applySaturation && !rng) throw new Error("selectCrosslinkSites requires rng when applySaturation is true");

  const abp = currentAbpEffective(params);
  const candidates: CrosslinkCandidate[] = [];
  let compatibleSites = 0;
  let incompatibleSites = 0;
  const monomers = params.monomers;
  const gaussian = params.scoringMode === "gaussian";
  const tolLegacy = Math.max(0, abp.abpAxialOffsetTolMonomers);
  const sigmaAxial = effectiveAxialSigma(params, overrides);
  const halfWidth = gaussian ? 3 * sigmaAxial : tolLegacy;

  for (const [fi, fj, k] of state.neighborPairs) {
    const fi0 = state.filaments[fi];
    const fj0 = state.filaments[fj];
    if (!fi0 || !fj0) continue;

    const desired = axialDesiredOffsetMonomers(abp, fi0.axialOffsetMonomers, fj0.axialOffsetMonomers);
    const lo = desired - halfWidth;
    const hi = desired + halfWidth;
    const mjMin = Math.ceil(lo - 1e-9);
    const mjMax = Math.floor(hi + 1e-9);

    for (let mi = 0; mi < monomers; mi++) {
      let bestScore = 0;
      let bestMj = -1;
      const mjStart = mi + mjMin;
      const mjEnd = mi + mjMax;
      for (let mj = mjStart; mj <= mjEnd; mj++) {
        if (mj < 0 || mj >= monomers) continue;
        const score = compatibilityScoreAt(state, params, fi, fj, k, mi, mj, overrides);
        if (score > bestScore) {
          bestScore = score;
          bestMj = mj;
        }
      }
      if (bestScore > 0) {
        compatibleSites++;
        if (applySaturation && rng!.random() > params.sat) continue;
        candidates.push({ fi, fj, k, m: mi, mj: bestMj, score: bestScore });
      } else {
        incompatibleSites++;
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const claimed = new Set<number>();
  const pairOccupied = new Map<string, number[]>();
  const selected: CrosslinkCandidate[] = [];

  for (const c of candidates) {
    const ia = c.fi * monomers + c.m;
    const ib = c.fj * monomers + c.mj;
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
 *
 * Pass `overrides` to score against an annealed σ (used by the MC loop); omit
 * for the tight final-state score (used by the live readout and buildCrosslinks).
 */
export function scoreRegistries(
  state: SimulationState,
  params: Params,
  overrides?: ScoringOverrides,
): RegistryScore {
  const { selected } = selectCrosslinkSites(state, params, { applySaturation: false, overrides });
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
