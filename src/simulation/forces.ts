import { currentAbpEffective } from "../model/abp";
import type { Params, Rng, SimulationState, Vec3 } from "../model/types";
import { emptyEnergy } from "./state";
import { selectionCom, syncTypedToBeads } from "./topology";

export function zeroForces(state: SimulationState): void {
  state.frc.fill(0);
  state.energy = emptyEnergy();
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function distributeCenterForce(state: SimulationState, group: number[], force: Vec3): void {
  if (!group.length) return;
  const share = 1 / group.length;
  for (const idx of group) {
    const i3 = idx * 3;
    state.frc[i3] += force.x * share;
    state.frc[i3 + 1] += force.y * share;
    state.frc[i3 + 2] += force.z * share;
  }
}

function resetAngleBendReadout(state: SimulationState): void {
  state.perturb.angleMoment = 0;
  state.bend.targetAngleDeg = 180;
  state.bend.actualAngleDeg = 180;
  state.bend.angleErrorDeg = 0;
  state.bend.angleEnergy = 0;
  state.bend.angleMoment = 0;
}

function applySingularAngleRegularization(
  state: SimulationState,
  delta: number,
  dEdTheta: number,
  armLength: number,
): void {
  if (Math.abs(delta) < 1e-10) return;
  const dir = state.bend.bendDir;
  const dirNorm = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const sign = delta > 0 ? 1 : -1;
  const mag = Math.abs(dEdTheta) / Math.max(1, armLength);
  const bx = (sign * mag * dir.x) / dirNorm;
  const by = (sign * mag * dir.y) / dirNorm;
  const bz = (sign * mag * dir.z) / dirNorm;
  distributeCenterForce(state, state.bend.leftBeads, { x: -0.5 * bx, y: -0.5 * by, z: -0.5 * bz });
  distributeCenterForce(state, state.bend.centerBeads, { x: bx, y: by, z: bz });
  distributeCenterForce(state, state.bend.rightBeads, { x: -0.5 * bx, y: -0.5 * by, z: -0.5 * bz });
}

function applyComAngleForce(state: SimulationState, params: Params): void {
  const left = state.bend.leftBeads;
  const center = state.bend.centerBeads;
  const right = state.bend.rightBeads;
  if (!left.length || !center.length || !right.length) {
    resetAngleBendReadout(state);
    return;
  }

  const RA = selectionCom(state, left);
  const RB = selectionCom(state, center);
  const RC = selectionCom(state, right);
  const ux = RA.x - RB.x;
  const uy = RA.y - RB.y;
  const uz = RA.z - RB.z;
  const vx = RC.x - RB.x;
  const vy = RC.y - RB.y;
  const vz = RC.z - RB.z;
  const a = Math.hypot(ux, uy, uz);
  const b = Math.hypot(vx, vy, vz);
  if (a < 1e-9 || b < 1e-9) {
    resetAngleBendReadout(state);
    return;
  }

  const uhat = { x: ux / a, y: uy / a, z: uz / a };
  const vhat = { x: vx / b, y: vy / b, z: vz / b };
  const cosTheta = clamp(uhat.x * vhat.x + uhat.y * vhat.y + uhat.z * vhat.z, -1, 1);
  const theta = Math.acos(cosTheta);
  const targetDeg = clamp(params.bendAngleDeg, 0, 180);
  const theta0 = (targetDeg * Math.PI) / 180;
  const delta = theta - theta0;
  const energy = 0.5 * params.bendKAngle * delta * delta;
  const dEdTheta = params.bendKAngle * delta;

  state.bend.targetAngleDeg = targetDeg;
  state.bend.actualAngleDeg = (theta * 180) / Math.PI;
  state.bend.angleErrorDeg = (delta * 180) / Math.PI;
  state.bend.angleEnergy = energy;
  state.bend.angleMoment = -dEdTheta;
  state.perturb.angleMoment = state.bend.angleMoment;
  state.energy.perturb += energy;

  if (Math.abs(delta) < 1e-10) return;

  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  if (sinTheta < 1e-4) {
    applySingularAngleRegularization(state, delta, dEdTheta, 0.5 * (a + b));
    return;
  }

  const invA = 1 / (a * sinTheta);
  const invB = 1 / (b * sinTheta);
  const gradA = {
    x: (cosTheta * uhat.x - vhat.x) * invA,
    y: (cosTheta * uhat.y - vhat.y) * invA,
    z: (cosTheta * uhat.z - vhat.z) * invA,
  };
  const gradC = {
    x: (cosTheta * vhat.x - uhat.x) * invB,
    y: (cosTheta * vhat.y - uhat.y) * invB,
    z: (cosTheta * vhat.z - uhat.z) * invB,
  };
  const gradB = {
    x: -(gradA.x + gradC.x),
    y: -(gradA.y + gradC.y),
    z: -(gradA.z + gradC.z),
  };

  distributeCenterForce(state, left, {
    x: -dEdTheta * gradA.x,
    y: -dEdTheta * gradA.y,
    z: -dEdTheta * gradA.z,
  });
  distributeCenterForce(state, center, {
    x: -dEdTheta * gradB.x,
    y: -dEdTheta * gradB.y,
    z: -dEdTheta * gradB.z,
  });
  distributeCenterForce(state, right, {
    x: -dEdTheta * gradC.x,
    y: -dEdTheta * gradC.y,
    z: -dEdTheta * gradC.z,
  });
}

export function computeForces(state: SimulationState, params: Params): void {
  zeroForces(state);
  const pos = state.pos;
  const frc = state.frc;
  const beads = state.beads;

  for (const bond of state.bonds) {
    const [ia, ib, rest] = bond;
    const stiff = bond[3] ?? params.kb;
    const a3 = ia * 3;
    const b3 = ib * 3;
    const dx = pos[b3] - pos[a3];
    const dy = pos[b3 + 1] - pos[a3 + 1];
    const dz = pos[b3 + 2] - pos[a3 + 2];
    const r = Math.hypot(dx, dy, dz) + 1e-12;
    const stretch = r - rest;
    const fmag = (stiff * stretch) / r;
    const fx = fmag * dx;
    const fy = fmag * dy;
    const fz = fmag * dz;
    frc[a3] += fx;
    frc[a3 + 1] += fy;
    frc[a3 + 2] += fz;
    frc[b3] -= fx;
    frc[b3 + 1] -= fy;
    frc[b3 + 2] -= fz;
    state.energy.bond += 0.5 * stiff * stretch * stretch;
  }

  for (const bend of state.bends) {
    const [ia, ib, ic] = bend;
    const kappa = bend[3] ?? params.ktheta;
    const a3 = ia * 3;
    const b3 = ib * 3;
    const c3 = ic * 3;
    const b1x = pos[b3] - pos[a3];
    const b1y = pos[b3 + 1] - pos[a3 + 1];
    const b1z = pos[b3 + 2] - pos[a3 + 2];
    const b2x = pos[c3] - pos[b3];
    const b2y = pos[c3 + 1] - pos[b3 + 1];
    const b2z = pos[c3 + 2] - pos[b3 + 2];
    const r1 = Math.hypot(b1x, b1y, b1z) + 1e-12;
    const r2 = Math.hypot(b2x, b2y, b2z) + 1e-12;
    const e1x = b1x / r1;
    const e1y = b1y / r1;
    const e1z = b1z / r1;
    const e2x = b2x / r2;
    const e2y = b2y / r2;
    const e2z = b2z / r2;
    let cosT = e1x * e2x + e1y * e2y + e1z * e2z;
    cosT = Math.max(-1, Math.min(1, cosT));

    const inv1 = kappa / r1;
    const inv2 = kappa / r2;
    const fAx = -inv1 * (e2x - cosT * e1x);
    const fAy = -inv1 * (e2y - cosT * e1y);
    const fAz = -inv1 * (e2z - cosT * e1z);
    const fCx = inv2 * (e1x - cosT * e2x);
    const fCy = inv2 * (e1y - cosT * e2y);
    const fCz = inv2 * (e1z - cosT * e2z);
    frc[a3] += fAx;
    frc[a3 + 1] += fAy;
    frc[a3 + 2] += fAz;
    frc[c3] += fCx;
    frc[c3 + 1] += fCy;
    frc[c3 + 2] += fCz;
    frc[b3] -= fAx + fCx;
    frc[b3 + 1] -= fAy + fCy;
    frc[b3 + 2] -= fAz + fCz;
    state.energy.bend += kappa * (1 - cosT);
  }

  const abp = currentAbpEffective(params);
  const kperp = abp.usePerp === false ? 0 : params.kperp;
  const kcl = params.kcl;
  const Mmax = params.monomers - 1;
  const nMon = params.monomers;

  for (const [ia, ib, rest] of state.crosslinks) {
    const a3 = ia * 3;
    const b3 = ib * 3;
    const dx = pos[b3] - pos[a3];
    const dy = pos[b3 + 1] - pos[a3 + 1];
    const dz = pos[b3 + 2] - pos[a3 + 2];

    const aF = beads[ia].f;
    const aM = beads[ia].m;
    const bF = beads[ib].f;
    const bM = beads[ib].m;
    const apI = aM > 0 ? aF * nMon + (aM - 1) : ia;
    const anI = aM < Mmax ? aF * nMon + (aM + 1) : ia;
    const bpI = bM > 0 ? bF * nMon + (bM - 1) : ib;
    const bnI = bM < Mmax ? bF * nMon + (bM + 1) : ib;
    const ap3 = apI * 3;
    const an3 = anI * 3;
    const bp3 = bpI * 3;
    const bn3 = bnI * 3;
    let tx = 0.5 * (pos[an3] - pos[ap3] + pos[bn3] - pos[bp3]);
    let ty = 0.5 * (pos[an3 + 1] - pos[ap3 + 1] + pos[bn3 + 1] - pos[bp3 + 1]);
    let tz = 0.5 * (pos[an3 + 2] - pos[ap3 + 2] + pos[bn3 + 2] - pos[bp3 + 2]);
    const tn = Math.hypot(tx, ty, tz) + 1e-9;
    tx /= tn;
    ty /= tn;
    tz /= tn;

    const s = dx * tx + dy * ty + dz * tz;
    const px = dx - s * tx;
    const py = dy - s * ty;
    const pz = dz - s * tz;
    const rho = Math.hypot(px, py, pz) + 1e-12;
    const stretch = rho - rest;
    const fmag = (kcl * stretch) / rho;
    const fx = fmag * px;
    const fy = fmag * py;
    const fz = fmag * pz;
    frc[a3] += fx;
    frc[a3 + 1] += fy;
    frc[a3 + 2] += fz;
    frc[b3] -= fx;
    frc[b3 + 1] -= fy;
    frc[b3 + 2] -= fz;
    state.energy.crosslink += 0.5 * kcl * stretch * stretch;

    if (kperp > 0) {
      const fpMag = kperp * s;
      frc[a3] += fpMag * tx;
      frc[a3 + 1] += fpMag * ty;
      frc[a3 + 2] += fpMag * tz;
      frc[b3] -= fpMag * tx;
      frc[b3 + 1] -= fpMag * ty;
      frc[b3 + 2] -= fpMag * tz;
      state.energy.orthogonal += 0.5 * kperp * s * s;
    }
  }

  const cutoff = params.sigma;
  const cutoff2 = cutoff * cutoff;
  const repK = params.rep;
  for (const [fi, fj] of state.neighborPairs) {
    const fiOff = fi * nMon;
    const fjOff = fj * nMon;
    for (let m = 0; m < nMon; m++) {
      const aIdx = fiOff + m;
      const a3 = aIdx * 3;
      for (let dm = -1; dm <= 1; dm++) {
        const n = m + dm;
        if (n < 0 || n >= nMon) continue;
        const bIdx = fjOff + n;
        const b3 = bIdx * 3;
        const dx = pos[b3] - pos[a3];
        const dy = pos[b3 + 1] - pos[a3 + 1];
        const dz = pos[b3 + 2] - pos[a3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz + 1e-12;
        if (r2 >= cutoff2) continue;
        const r = Math.sqrt(r2);
        const overlap = cutoff - r;
        const fmag = (repK * overlap) / r;
        const fx = -fmag * dx;
        const fy = -fmag * dy;
        const fz = -fmag * dz;
        frc[a3] += fx;
        frc[a3 + 1] += fy;
        frc[a3 + 2] += fz;
        frc[b3] -= fx;
        frc[b3 + 1] -= fy;
        frc[b3 + 2] -= fz;
        state.energy.repulsion += 0.5 * repK * overlap * overlap;
      }
    }
  }

  if (params.perturbMode === "bend3") {
    const kPin = 5000;
    for (let i = 0; i < beads.length; i++) {
      const p = beads[i];
      if (!p.pinned) continue;
      const i3 = i * 3;
      const ex = pos[i3] - p.x0;
      const ey = pos[i3 + 1] - p.y0;
      const ez = pos[i3 + 2] - p.z0;
      frc[i3] -= kPin * ex;
      frc[i3 + 1] -= kPin * ey;
      frc[i3 + 2] -= kPin * ez;
      state.energy.perturb += 0.5 * kPin * (ex * ex + ey * ey + ez * ez);
    }

    applyComAngleForce(state, params);
  } else {
    resetAngleBendReadout(state);
  }

  if (state.grabbedBead >= 0) {
    const i3 = state.grabbedBead * 3;
    const ex = pos[i3] - state.grabTarget.x;
    const ey = pos[i3 + 1] - state.grabTarget.y;
    const ez = pos[i3 + 2] - state.grabTarget.z;
    const k = state.grabKspring;
    frc[i3] -= k * ex;
    frc[i3 + 1] -= k * ey;
    frc[i3 + 2] -= k * ez;
    state.energy.grab += 0.5 * k * (ex * ex + ey * ey + ez * ez);
  }
}

export function step(state: SimulationState, params: Params, rng: Rng): void {
  computeForces(state, params);
  const dt = params.dt;
  const drag = params.drag;
  const noiseScale = Math.sqrt(Math.max(0, params.temp) * dt) * 2.0;
  const pos = state.pos;
  const vel = state.vel;
  const frc = state.frc;
  const vmax = 50.0;
  const vmax2 = vmax * vmax;

  for (let i = 0; i < pos.length; i += 3) {
    let vx = drag * (vel[i] + dt * frc[i]) + noiseScale * rng.normal();
    let vy = drag * (vel[i + 1] + dt * frc[i + 1]) + noiseScale * rng.normal();
    let vz = drag * (vel[i + 2] + dt * frc[i + 2]) + noiseScale * rng.normal();
    const v2 = vx * vx + vy * vy + vz * vz;
    if (v2 > vmax2) {
      const s = vmax / Math.sqrt(v2);
      vx *= s;
      vy *= s;
      vz *= s;
    }
    vel[i] = vx;
    vel[i + 1] = vy;
    vel[i + 2] = vz;
    pos[i] += dt * vx;
    pos[i + 1] += dt * vy;
    pos[i + 2] += dt * vz;
  }
  syncTypedToBeads(state);
  state.frame++;
}

export function kick(state: SimulationState, params: Params, rng: Rng): void {
  const Nm = Math.max(1, params.monomers - 1);
  for (let i = 0; i < state.beads.length; i++) {
    const m = state.beads[i].m;
    const taper = m >= 0 ? Math.sin((Math.PI * m) / Nm) : 0;
    const i3 = i * 3;
    state.vel[i3] += 8 * taper * rng.normal();
    state.vel[i3 + 1] += 8 * taper * rng.normal();
    state.vel[i3 + 2] += 1.5 * taper * rng.normal();
  }
}
