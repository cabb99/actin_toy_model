import { PHASE_LEN, PHASE_TO_K } from "./constants";
import type { Filament, LatticeGeometry, Params, Vec2 } from "./types";

export function axialToXY(q: number, r: number, a: number): Vec2 {
  return {
    x: a * (q + 0.5 * r),
    y: a * (Math.sqrt(3) * 0.5 * r),
  };
}

export function exposedK(m: number, s: number): number | null {
  const p = ((m + s) % PHASE_LEN + PHASE_LEN) % PHASE_LEN;
  return PHASE_TO_K[p];
}

export function defaultRegistry(q: number, r: number): number {
  return ((q + 2 * r) % PHASE_LEN + PHASE_LEN) % PHASE_LEN;
}

export function defaultLatticeRegistry(q: number, r: number, lattice: LatticeGeometry): number {
  if (lattice === "square") return ((q + r) % PHASE_LEN + PHASE_LEN) % PHASE_LEN;
  return defaultRegistry(q, r);
}

export function filamentCountForLattice(lattice: LatticeGeometry, rings: number): number {
  const R = Math.max(0, Math.round(rings));
  if (lattice === "square") return (2 * R + 1) ** 2;
  return 1 + 3 * R * (R + 1);
}

export function wrapDeg360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function angularDistanceDeg(a: number, b: number): number {
  const d = ((a - b + 180) % 360 + 360) % 360 - 180;
  return Math.abs(d);
}

export function clampAngleThresholdDeg(thresholdDeg: number): number {
  return Math.max(0, Math.min(180, thresholdDeg));
}

export function withinAngleThresholdDeg(mismatchDeg: number, thresholdDeg: number): boolean {
  return mismatchDeg <= clampAngleThresholdDeg(thresholdDeg);
}

export function hexDirectionDeg(k: number): number {
  return wrapDeg360(k * 60);
}

export function nearestHexDirectionK(angleDeg: number): number {
  return Math.round(wrapDeg360(angleDeg) / 60) % 6;
}

export function latticeDirectionDeg(lattice: LatticeGeometry, k: number): number {
  if (lattice === "square") return wrapDeg360(k * 90);
  return hexDirectionDeg(k);
}

export function oppositeLatticeDirectionDeg(lattice: LatticeGeometry, k: number): number {
  return wrapDeg360(latticeDirectionDeg(lattice, k) + 180);
}

export function latticeDirectionFaceK(lattice: LatticeGeometry, k: number): number {
  return nearestHexDirectionK(latticeDirectionDeg(lattice, k));
}

export function oppositeLatticeDirectionFaceK(lattice: LatticeGeometry, k: number): number {
  return nearestHexDirectionK(oppositeLatticeDirectionDeg(lattice, k));
}

export function monomerExposedAngleDeg(m: number, phaseDeg: number, params: Pick<
  Params,
  "actinTwistDeg" | "helicityHandedness" | "helicityPhaseOffsetDeg"
>): number {
  const phaseFromMonomer = params.helicityHandedness * params.actinTwistDeg * m;
  return wrapDeg360(params.helicityPhaseOffsetDeg + phaseDeg + phaseFromMonomer);
}

export function displayedFaceK(
  m: number,
  filament: Filament,
  params: Pick<
    Params,
    "helicityMode" | "actinTwistDeg" | "helicityHandedness" | "helicityPhaseOffsetDeg"
  >,
): number | null {
  if (params.helicityMode === "continuous") {
    return nearestHexDirectionK(monomerExposedAngleDeg(m, filament.phaseDeg, params));
  }
  return exposedK(m, filament.s);
}

export function displayedFaceAngleDeg(
  m: number,
  filament: Filament,
  params: Pick<
    Params,
    "helicityMode" | "actinTwistDeg" | "helicityHandedness" | "helicityPhaseOffsetDeg"
  >,
): number | null {
  if (params.helicityMode === "continuous") {
    return monomerExposedAngleDeg(m, filament.phaseDeg, params);
  }
  const k = exposedK(m, filament.s);
  return k === null ? null : hexDirectionDeg(k);
}

export function softAngularScore(
  mismatchDeg: number,
  thresholdDeg: number,
  sharpness: number,
): number {
  const t = clampAngleThresholdDeg(thresholdDeg);
  if (t <= 0) return mismatchDeg <= 0 ? 1 : 0;
  if (mismatchDeg > t) return 0;
  const k = Math.max(0, sharpness);
  if (k === 0) return 1;
  const x = mismatchDeg / t;
  return Math.pow(Math.cos((x * Math.PI) / 2), k);
}
