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

export const SQUARE_DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

export const ABP_PRESETS: Record<Exclude<AbpType, "custom">, AbpPreset> = {
  fascin: {
    model: "single",
    // latticeA = 12 nm is the published center-to-center fascin interfilament
    // spacing. `length` here is a fallback; buildCrosslinks computes the actual
    // diagonal rest length per crosslink from latticeA and the axial offset.
    length: 12.21,
    latticeA: 12.0,
    kCl: 200,
    kPerp: 80,
    usePerp: true,
    label: "fascin",
    requireParallel: true,
    // Fascin's axial stagger between bound binding sites is ~0.84 actin
    // monomers per the literature (≈2.3 nm at b=2.75 nm). With integer mj the
    // simulation snaps to mj = mi + 1, but the preferred offset stays at 0.84
    // so the gaussian axial score correctly biases the optimizer toward states
    // where the per-filament axialOffsetMonomers slides close the residual gap.
    abpAxialOffsetMonomers: 1,
    abpAxialOffsetTolMonomers: 0.2,
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
    requireParallel: false,
    abpAxialOffsetMonomers: 0,
    abpAxialOffsetTolMonomers: 0,
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
    requireParallel: false,
    abpAxialOffsetMonomers: 0,
    abpAxialOffsetTolMonomers: 0,
  },
};

export const KBT_PN_NM = 4.114;
export const ACTIN_LP_NM = 10000;
export const ACTIN_KAPPA = ACTIN_LP_NM * KBT_PN_NM;
export const ACTIN_TWIST_DEG = 166.15;
export const ACTIN_ANGLE_THRESHOLD_DEG = 10;

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
  const a = 12.0;
  const bendKAngle = 5000;
  return {
    latticeGeometry: "hex",
    rings: 2,
    monomers: 96,
    b,
    a,
    kb: 2000,
    clDist: 12.21,
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
    mcT0: 4,
    mcT1: 0.005,
    mcIters: 12000,
    mcSkew: 0.15,
    sigma: Math.max(2.0, a * 0.55),
    drag: 0.96,
    helicityMode: "continuous",
    actinTwistDeg: ACTIN_TWIST_DEG,
    helicityHandedness: -1,
    helicityPhaseOffsetDeg: 0,
    helicityAngleThresholdDeg: ACTIN_ANGLE_THRESHOLD_DEG,
    compatibilitySharpness: 1,
    mcPhaseSigma0: 30,
    mcAxialSigma0: 0.15,
    mcPolarityFlipProb: 0.1,
    mcAxialSlideProb: 0.2,
    scoringMode: "gaussian",
    mcAngleSigmaMaxDeg: 30,
    mcAngleSigmaMinDeg: 3,
    mcAxialSigmaMaxMonomers: 0.5,
    // 0.15 keeps the gate within reach of integer-mj fascin sites at default
    // axial-offset 0 (forced mismatch ~0.16 → score ~0.57). MC's axial-slide
    // moves drive that mismatch toward 0 → score → 1 as the chain converges.
    mcAxialSigmaMinMonomers: 0.15,
    registryMode: "perfect",
    abpType: "fascin",
    perturbMode: "none",
  };
}
