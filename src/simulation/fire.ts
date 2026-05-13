import type { Params, SimulationState } from "../model/types";
import { computeForces } from "./forces";
import { syncTypedToBeads } from "./topology";

export interface FireState {
  dt: number;
  dtMax: number;
  dtMin: number;
  alphaStart: number;
  fAlpha: number;
  fInc: number;
  fDec: number;
  Nmin: number;
  alpha: number;
  Npos: number;
}

export function createFireState(): FireState {
  return {
    dt: 1e-3,
    dtMax: 5e-3,
    dtMin: 1e-7,
    alphaStart: 0.1,
    fAlpha: 0.99,
    fInc: 1.1,
    fDec: 0.5,
    Nmin: 5,
    alpha: 0.1,
    Npos: 0,
  };
}

export function fireReset(state: SimulationState, fire: FireState): void {
  fire.dt = 1e-3;
  fire.alpha = fire.alphaStart;
  fire.Npos = 0;
  state.vel.fill(0);
}

export function fireStep(state: SimulationState, params: Params, fire: FireState): void {
  computeForces(state, params);
  const beads = state.beads;
  const pos = state.pos;
  const vel = state.vel;
  const frc = state.frc;

  let P = 0;
  let vNorm2 = 0;
  let fNorm2 = 0;
  for (let i = 0; i < beads.length; i++) {
    const i3 = i * 3;
    P += frc[i3] * vel[i3] + frc[i3 + 1] * vel[i3 + 1] + frc[i3 + 2] * vel[i3 + 2];
    vNorm2 += vel[i3] ** 2 + vel[i3 + 1] ** 2 + vel[i3 + 2] ** 2;
    fNorm2 += frc[i3] ** 2 + frc[i3 + 1] ** 2 + frc[i3 + 2] ** 2;
  }

  const vNorm = Math.sqrt(vNorm2);
  const fNorm = Math.sqrt(fNorm2) + 1e-12;
  if (P > 0) {
    const beta = (fire.alpha * vNorm) / fNorm;
    const oneMinusA = 1 - fire.alpha;
    for (let i = 0; i < beads.length; i++) {
      const i3 = i * 3;
      vel[i3] = oneMinusA * vel[i3] + beta * frc[i3];
      vel[i3 + 1] = oneMinusA * vel[i3 + 1] + beta * frc[i3 + 1];
      vel[i3 + 2] = oneMinusA * vel[i3 + 2] + beta * frc[i3 + 2];
    }
    if (fire.Npos > fire.Nmin) {
      fire.dt = Math.min(fire.dt * fire.fInc, fire.dtMax);
      fire.alpha *= fire.fAlpha;
    }
    fire.Npos++;
  } else {
    vel.fill(0);
    fire.dt = Math.max(fire.dt * fire.fDec, fire.dtMin);
    fire.alpha = fire.alphaStart;
    fire.Npos = 0;
  }

  const dt = fire.dt;
  const halfDt = 0.5 * dt;
  for (let i = 0; i < beads.length; i++) {
    const i3 = i * 3;
    vel[i3] += halfDt * frc[i3];
    vel[i3 + 1] += halfDt * frc[i3 + 1];
    vel[i3 + 2] += halfDt * frc[i3 + 2];
    pos[i3] += dt * vel[i3];
    pos[i3 + 1] += dt * vel[i3 + 1];
    pos[i3 + 2] += dt * vel[i3 + 2];
  }

  computeForces(state, params);
  for (let i = 0; i < beads.length; i++) {
    const i3 = i * 3;
    vel[i3] += halfDt * frc[i3];
    vel[i3 + 1] += halfDt * frc[i3 + 1];
    vel[i3 + 2] += halfDt * frc[i3 + 2];
  }
}

export function fireMinimize(
  state: SimulationState,
  params: Params,
  maxIters = 800,
  fTol = 0.05,
): { converged: boolean; iters: number; fMax?: number } {
  const fire = createFireState();
  fireReset(state, fire);
  for (let it = 0; it < maxIters; it++) {
    fireStep(state, params, fire);
    if (it % 20 === 19) {
      let fMaxSq = 0;
      for (let i = 0; i < state.beads.length; i++) {
        const i3 = i * 3;
        const f2 = state.frc[i3] ** 2 + state.frc[i3 + 1] ** 2 + state.frc[i3 + 2] ** 2;
        if (f2 > fMaxSq) fMaxSq = f2;
      }
      const fMax = Math.sqrt(fMaxSq);
      if (fMax < fTol) {
        syncTypedToBeads(state);
        return { converged: true, iters: it, fMax };
      }
    }
  }
  syncTypedToBeads(state);
  return { converged: false, iters: maxIters };
}
