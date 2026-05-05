import { PHASE_LEN, PHASE_TO_K } from "./constants";
import type { Vec2 } from "./types";

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

export function defaultRegistry(q: number, r: number, s0 = 0): number {
  return ((s0 + q + 2 * r) % PHASE_LEN + PHASE_LEN) % PHASE_LEN;
}
