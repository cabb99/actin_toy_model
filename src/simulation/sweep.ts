import { KBT_PN_NM } from "../model/constants";
import type { Params, SimulationState, SweepSample } from "../model/types";
import { computeForces } from "./forces";
import { fireMinimize } from "./fire";
import { applyPerturbationConstraints } from "./topology";

export interface SweepResult {
  samples: SweepSample[];
  EI: number;
  L: number;
  csv: string;
}

export function sweepBend(
  state: SimulationState,
  params: Params,
  maxDef = 30,
  steps = 16,
  equilIters = 600,
): SweepResult {
  const samples: SweepSample[] = [];
  const originalDef = params.def;
  params.perturbMode = "bend3";
  applyPerturbationConstraints(state, params);

  const L = (params.monomers - 1) * params.b;
  for (let s = 0; s <= steps; s++) {
    const defTarget = (s / steps) * maxDef;
    params.def = defTarget;
    const fTol = Math.max(0.05, 0.001 * params.kcl);
    const res = fireMinimize(state, params, equilIters, fTol);
    computeForces(state, params);
    const force = state.perturb.ramForceX;
    const actualDef = state.perturb.actualDef;
    const ei = Math.abs(actualDef) > 1e-6 ? (force * L * L * L) / (48 * actualDef) : NaN;
    samples.push({ defTarget, actualDef, force, ei, converged: res.converged, iters: res.iters });
  }

  params.def = originalDef;
  state.perturb.samples = samples;

  let EI = NaN;
  if (samples.length >= 3) {
    const fit = samples.slice(0, Math.min(5, samples.length));
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const sample of fit) {
      sx += sample.actualDef;
      sy += sample.force;
      sxx += sample.actualDef * sample.actualDef;
      sxy += sample.actualDef * sample.force;
    }
    const nFit = fit.length;
    const slope = (nFit * sxy - sx * sy) / (nFit * sxx - sx * sx + 1e-12);
    EI = (slope * L * L * L) / 48;
  }

  const csv = [
    "defTarget_nm,defActual_nm,force_pN,EI_pN_nm2",
    ...samples.map((s) =>
      [
        s.defTarget.toFixed(3),
        s.actualDef.toFixed(3),
        s.force.toFixed(3),
        Number.isFinite(s.ei) ? s.ei.toFixed(1) : "",
      ].join(","),
    ),
  ].join("\n");

  return { samples, EI, L, csv };
}

export function persistenceLengthMicrons(EI: number): number {
  return EI / KBT_PN_NM / 1000;
}
