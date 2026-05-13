import type { AbpPreset, AbpType, Params } from "./types";

export const PHASE_TO_K = [
  0,
  3,
  null,
  null,
  1,
  4,
  null,
  null,
  2,
  5,
  null,
  null,
] as const;

export const PHASE_LEN = 12;

export const HEX_DIRS = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
] as const;

export const ABP_PRESETS: Record<Exclude<AbpType, "custom">, AbpPreset> = {
  fascin: {
    model: "single",
    length: 11.0,
    latticeA: 11.0,
    kCl: 200,
    kPerp: 80,
    usePerp: true,
    label: "fascin",
  },
  actinin: {
    model: "linker4",
    length: 36.0,
    latticeA: 36.0,
    kCl: 8,
    kPerp: 0,
    usePerp: false,
    kInternal: 200,
    kBendInternal: 25,
    label: "α-actinin",
  },
  camkii: {
    model: "linker2",
    length: 22.0,
    latticeA: 22.0,
    kCl: 30,
    kPerp: 0,
    usePerp: false,
    kInternal: 200,
    kBendInternal: 40,
    label: "CaMKII",
  },
};

export const KBT_PN_NM = 4.114;
export const ACTIN_LP_NM = 10000;
export const ACTIN_KAPPA = ACTIN_LP_NM * KBT_PN_NM;
export const ACTIN_TWIST_DEG = 166.15;
export const ACTIN_ANGLE_THRESHOLD_DEG = 30;

// Two crosslinkers on the same filament pair cannot be closer than this many
// monomers along the bundle axis. Conflicts resolve by keeping the highest-
// scoring (lowest-energy) candidate.
export const MIN_CROSSLINK_SPACING_MONOMERS = 5;

export function actinKtheta(b: number): number {
  return ACTIN_KAPPA / b;
}

export function persistenceLengthMicrons(eiPnNm2: number): number {
  return eiPnNm2 / KBT_PN_NM / 1000;
}

export function defaultParams(): Params {
  const b = 2.75;
  const a = 11.0;
  const bendKAngle = 5000;
  return {
    rings: 2,
    monomers: 96,
    b,
    a,
    kb: 2000,
    clDist: 11.0,
    ktheta: Math.round(actinKtheta(b)),
    kcl: 200,
    kperp: 80,
    rep: 20,
    temp: 0,
    dt: 0.002,
    steps: 6,
    sat: 1,
    bendAngleDeg: 180,
    bendLayers: 3,
    bendKAngleLog10: Math.log10(bendKAngle),
    bendKAngle,
    mcT0: 8,
    mcT1: 0.05,
    mcIters: 4000,
    mcSkew: 0.15,
    sigma: Math.max(2.0, a * 0.55),
    drag: 0.96,
    helicityMode: "discrete12",
    actinTwistDeg: ACTIN_TWIST_DEG,
    helicityHandedness: 1,
    helicityPhaseOffsetDeg: 0,
    helicityAngleThresholdDeg: ACTIN_ANGLE_THRESHOLD_DEG,
    compatibilitySharpness: 1,
    mcPhaseSigma0: 30,
    registryMode: "perfect",
    abpType: "fascin",
    perturbMode: "none",
  };
}
