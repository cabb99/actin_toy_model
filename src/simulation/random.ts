import { PHASE_LEN } from "../model/constants";
import type { Rng } from "../model/types";

export function createMathRng(): Rng {
  return {
    random: Math.random,
    normal: randn,
  };
}

export function createSeededRng(seed = 1): Rng {
  let s = seed >>> 0;
  const random = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  return {
    random,
    normal: () => randnFrom(random),
  };
}

export function randomRegistry(rng: Rng): number {
  return Math.floor(rng.random() * PHASE_LEN);
}

export function randn(): number {
  return randnFrom(Math.random);
}

function randnFrom(random: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
