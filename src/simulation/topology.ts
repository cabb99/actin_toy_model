import { HEX_DIRS, PHASE_LEN } from "../model/constants";
import { currentAbpEffective } from "../model/abp";
import { axialToXY, defaultRegistry } from "../model/hex";
import type { BeadMeta, Params, Rng, SimulationState, Vec3 } from "../model/types";
import { scoreRegistries, selectCrosslinkSites } from "./compatibility";
import { randomRegistry } from "./random";

export { compatibilityScore, compatibleAt, scoreRegistries } from "./compatibility";

export function beadIndex(params: Pick<Params, "monomers">, filamentId: number, m: number): number {
  return filamentId * params.monomers + m;
}

export function buildFilaments(state: SimulationState, params: Params, rng: Rng): void {
  state.filaments = [];
  const byKey = new Map<string, number>();
  const R = params.rings;
  let id = 0;

  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= R) {
        const xy = axialToXY(q, r, params.a);
        state.filaments.push({ id, q, r, x: xy.x, y: xy.y, s: 0, phaseDeg: 0 });
        byKey.set(`${q},${r}`, id);
        id++;
      }
    }
  }

  state.neighborPairs = [];
  for (const f of state.filaments) {
    for (let k = 0; k < 3; k++) {
      const [dq, dr] = HEX_DIRS[k];
      const j = byKey.get(`${f.q + dq},${f.r + dr}`);
      if (j !== undefined) state.neighborPairs.push([f.id, j, k]);
    }
  }

  assignRegistries(state, params, rng);
}

export function assignRegistries(state: SimulationState, params: Params, rng: Rng): void {
  const phaseStep = 360 / PHASE_LEN;
  for (const f of state.filaments) {
    switch (params.registryMode) {
      case "zero":
        f.s = 0;
        f.phaseDeg = 0;
        break;
      case "random":
        f.s = randomRegistry(rng);
        f.phaseDeg = rng.random() * 360;
        break;
      case "custom":
        break;
      case "perfect":
      default:
        f.s = defaultRegistry(f.q, f.r);
        f.phaseDeg = phaseStep * f.s;
    }
  }
}

export function syncBeadsToTyped(state: SimulationState): void {
  const N = state.beads.length;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const frc = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const p = state.beads[i];
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
  }
  state.pos = pos;
  state.vel = vel;
  state.frc = frc;
}

export function syncTypedToBeads(state: SimulationState): void {
  const pos = state.pos;
  for (let i = 0; i < state.beads.length; i++) {
    const p = state.beads[i];
    p.x = pos[i * 3];
    p.y = pos[i * 3 + 1];
    p.z = pos[i * 3 + 2];
  }
}

export function addInternalBead(state: SimulationState, x: number, y: number, z: number): number {
  const idx = state.beads.length;
  state.beads.push({
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    fx: 0,
    fy: 0,
    fz: 0,
    f: -1,
    m: -1,
    x0: x,
    y0: y,
    z0: z,
    isInternal: true,
  });
  return idx;
}

export function buildCrosslinks(state: SimulationState, params: Params, rng: Rng): void {
  state.beads.length = state.nFilamentBeads;
  state.bonds.length = state.nBackboneBonds;
  state.bends.length = state.nBackboneBends;
  state.crosslinks = [];
  const counts = new Map<string, number>();
  for (const [fi, fj] of state.neighborPairs) counts.set(`${fi}-${fj}`, 0);

  const abp = currentAbpEffective(params);
  const restLen = abp.length;

  const { selected, census } = selectCrosslinkSites(state, params, { applySaturation: true, rng });
  state.helicity.compatibleSites = census.compatibleSites;
  state.helicity.incompatibleSites = census.incompatibleSites;

  for (const c of selected) {
    const ia = beadIndex(params, c.fi, c.m);
    const ib = beadIndex(params, c.fj, c.m);

    if (abp.model === "single") {
      state.crosslinks.push([ia, ib, restLen]);
    } else if (abp.model === "linker2") {
      const a = state.beads[ia];
      const b = state.beads[ib];
      const iInt = addInternalBead(
        state,
        0.5 * (a.x + b.x),
        0.5 * (a.y + b.y),
        0.5 * (a.z + b.z),
      );
      const segLen = restLen * 0.5;
      state.bonds.push([ia, iInt, segLen, abp.kInternal]);
      state.bonds.push([iInt, ib, segLen, abp.kInternal]);
      state.bends.push([ia, iInt, ib, abp.kBendInternal]);
    } else {
      const a = state.beads[ia];
      const b = state.beads[ib];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const i1 = addInternalBead(state, a.x + dx / 3, a.y + dy / 3, a.z + dz / 3);
      const i2 = addInternalBead(state, a.x + (2 * dx) / 3, a.y + (2 * dy) / 3, a.z + (2 * dz) / 3);
      const segLen = restLen / 3;
      state.bonds.push([ia, i1, segLen, abp.kInternal]);
      state.bonds.push([i1, i2, segLen, abp.kInternal]);
      state.bonds.push([i2, ib, segLen, abp.kInternal]);
      state.bends.push([ia, i1, i2, abp.kBendInternal]);
      state.bends.push([i1, i2, ib, abp.kBendInternal]);
    }
    counts.set(`${c.fi}-${c.fj}`, (counts.get(`${c.fi}-${c.fj}`) ?? 0) + 1);
  }

  state.pairLinkCount = counts;
  state.helicity.score = scoreRegistries(state, params);
  syncBeadsToTyped(state);
}

export function resetSystem(
  state: SimulationState,
  params: Params,
  rng: Rng,
  randomize = false,
): void {
  buildFilaments(state, params, rng);
  state.beads = [];
  state.bonds = [];
  state.bends = [];

  const zCenter = 0.5 * (params.monomers - 1) * params.b;
  const disorder = randomize ? params.a * 0.06 : 0;

  for (const f of state.filaments) {
    for (let m = 0; m < params.monomers; m++) {
      const taper = Math.sin(Math.PI * m / Math.max(1, params.monomers - 1));
      const baseX = f.x;
      const baseY = f.y;
      const baseZ = m * params.b - zCenter;
      const bead: BeadMeta = {
        x: baseX + disorder * taper * rng.normal(),
        y: baseY + disorder * taper * rng.normal(),
        z: baseZ + disorder * 0.25 * taper * rng.normal(),
        vx: 0,
        vy: 0,
        vz: 0,
        fx: 0,
        fy: 0,
        fz: 0,
        f: f.id,
        m,
        x0: baseX,
        y0: baseY,
        z0: baseZ,
      };
      state.beads.push(bead);
    }
  }

  for (const f of state.filaments) {
    for (let m = 0; m < params.monomers - 1; m++) {
      const ia = beadIndex(params, f.id, m);
      const ib = beadIndex(params, f.id, m + 1);
      state.bonds.push([ia, ib, params.b]);
    }
    for (let m = 1; m < params.monomers - 1; m++) {
      state.bends.push([
        beadIndex(params, f.id, m - 1),
        beadIndex(params, f.id, m),
        beadIndex(params, f.id, m + 1),
      ]);
    }
  }

  state.nFilamentBeads = state.beads.length;
  state.nBackboneBonds = state.bonds.length;
  state.nBackboneBends = state.bends.length;
  buildCrosslinks(state, params, rng);
  applyPerturbationConstraints(state, params);

  state.frame = 0;
  state.perturb.samples = [];
  state.grabbedBead = -1;
}

export function applyPerturbationConstraints(state: SimulationState, params: Params): void {
  state.bend.leftBeads = [];
  state.bend.centerBeads = [];
  state.bend.rightBeads = [];
  if (params.perturbMode !== "bend3") return;

  const last = params.monomers - 1;
  const mMid = Math.floor(last / 2);
  const layers = Math.max(1, Math.min(10, Math.round(params.bendLayers)));
  const half = Math.floor(layers / 2);
  const centerStart = Math.max(0, Math.min(last, mMid - half));
  const centerEnd = Math.min(last, centerStart + layers - 1);

  for (const f of state.filaments) {
    for (let dm = 0; dm < layers; dm++) {
      const leftIdx = beadIndex(params, f.id, Math.min(last, dm));
      const rightIdx = beadIndex(params, f.id, Math.max(0, last - dm));
      state.bend.leftBeads.push(leftIdx);
      state.bend.rightBeads.push(rightIdx);
    }
    for (let m = centerStart; m <= centerEnd; m++) {
      state.bend.centerBeads.push(beadIndex(params, f.id, m));
    }
  }

  state.bend.leftCom0 = selectionCom(state, state.bend.leftBeads, true);
  state.bend.centerCom0 = selectionCom(state, state.bend.centerBeads, true);
  state.bend.rightCom0 = selectionCom(state, state.bend.rightBeads, true);
  updateAngleBendReference(state, params);
}

export function selectionCom(state: SimulationState, indices: number[], rest = false): Vec3 {
  if (!indices.length) return { x: 0, y: 0, z: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const idx of indices) {
    const p = state.beads[idx];
    if (rest) {
      x += p.x0;
      y += p.y0;
      z += p.z0;
    } else {
      const i3 = idx * 3;
      x += state.pos[i3];
      y += state.pos[i3 + 1];
      z += state.pos[i3 + 2];
    }
  }
  return { x: x / indices.length, y: y / indices.length, z: z / indices.length };
}

export function angleDegAtB(A: Vec3, B: Vec3, C: Vec3): number {
  const bax = A.x - B.x;
  const bay = A.y - B.y;
  const baz = A.z - B.z;
  const bcx = C.x - B.x;
  const bcy = C.y - B.y;
  const bcz = C.z - B.z;
  const ba = Math.hypot(bax, bay, baz) + 1e-12;
  const bc = Math.hypot(bcx, bcy, bcz) + 1e-12;
  let cosT = (bax * bcx + bay * bcy + baz * bcz) / (ba * bc);
  cosT = Math.max(-1, Math.min(1, cosT));
  return (Math.acos(cosT) * 180) / Math.PI;
}

export function updateAngleBendReference(state: SimulationState, params: Params): void {
  const A = state.bend.leftCom0;
  const B = state.bend.centerCom0;
  const C = state.bend.rightCom0;
  const dx = C.x - A.x;
  const dy = C.y - A.y;
  const dz = C.z - A.z;
  const chord = Math.hypot(dx, dy, dz) + 1e-12;

  // Used only to regularize exactly straight/closed COM angles, where the
  // analytic angle gradient is singular. The regular perturbation force is
  // computed from the current A-B-C angle in the force kernel.
  let bx = 1;
  let by = 0;
  let bz = 0;
  const dot = (bx * dx + by * dy + bz * dz) / (chord * chord);
  bx -= dot * dx;
  by -= dot * dy;
  bz -= dot * dz;
  let bn = Math.hypot(bx, by, bz);
  if (bn < 1e-9) {
    bx = 0;
    by = 1;
    bz = 0;
    const dotY = (by * dy) / (chord * chord);
    bx -= dotY * dx;
    by -= dotY * dy;
    bz -= dotY * dz;
    bn = Math.hypot(bx, by, bz) || 1;
  }
  bx /= bn;
  by /= bn;
  bz /= bn;

  const targetDeg = Math.max(0, Math.min(180, params.bendAngleDeg));
  state.bend.bendDir = { x: bx, y: by, z: bz };
  state.bend.targetAngleDeg = targetDeg;
  state.bend.actualAngleDeg = angleDegAtB(A, B, C);
  state.bend.angleErrorDeg = state.bend.actualAngleDeg - targetDeg;
  const delta = (state.bend.angleErrorDeg * Math.PI) / 180;
  state.bend.angleEnergy = 0.5 * params.bendKAngle * delta * delta;
  state.bend.angleMoment = -params.bendKAngle * delta;
  state.perturb.angleMoment = state.bend.angleMoment;
}

