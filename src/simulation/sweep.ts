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
  minAngleDeg = 0,
  steps = 16,
  equilIters = 600,
): SweepResult {
  const samples: SweepSample[] = [];
  const originalAngle = params.bendAngleDeg;
  params.perturbMode = "bend3";
  applyPerturbationConstraints(state, params);

  const L = (params.monomers - 1) * params.b;
  for (let s = 0; s <= steps; s++) {
    const angleTargetDeg = 180 - (s / steps) * (180 - minAngleDeg);
    params.bendAngleDeg = angleTargetDeg;
    const fTol = Math.max(0.05, 0.001 * params.kcl);
    const res = fireMinimize(state, params, equilIters, fTol);
    computeForces(state, params);
    const actualAngleDeg = state.bend.actualAngleDeg;
    const actualTheta = (actualAngleDeg * Math.PI) / 180;
    const foldAngle = Math.abs(Math.PI - actualTheta);
    const moment = state.bend.angleMoment;
    const energy = state.bend.angleEnergy;
    const ei = foldAngle > 1e-6 ? (Math.abs(moment) * L) / foldAngle : NaN;
    samples.push({
      angleTargetDeg,
      actualAngleDeg,
      angleErrorDeg: state.bend.angleErrorDeg,
      moment,
      energy,
      ei,
      converged: res.converged,
      iters: res.iters,
    });
  }

  params.bendAngleDeg = originalAngle;
  state.perturb.samples = samples;

  const finiteEi = samples
    .filter((sample) => sample.angleTargetDeg < 179 && Number.isFinite(sample.ei))
    .map((sample) => sample.ei);
  const EI = finiteEi.length ? finiteEi.reduce((sum, value) => sum + value, 0) / finiteEi.length : NaN;

  const csv = [
    "angleTarget_deg,angleActual_deg,angleError_deg,moment_pN_nm,energy_pN_nm,EI_pN_nm2",
    ...samples.map((s) =>
      [
        s.angleTargetDeg.toFixed(3),
        s.actualAngleDeg.toFixed(3),
        s.angleErrorDeg.toFixed(3),
        s.moment.toFixed(3),
        s.energy.toFixed(3),
        Number.isFinite(s.ei) ? s.ei.toFixed(1) : "",
      ].join(","),
    ),
  ].join("\n");

  return { samples, EI, L, csv };
}
