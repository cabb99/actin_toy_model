import type { EnergyBreakdown, RegistryScore, SimulationState } from "../model/types";

export const defaultView = { rotX: -0.78, rotY: 0.58 };

export function emptyEnergy(): EnergyBreakdown {
  return {
    bond: 0,
    bend: 0,
    crosslink: 0,
    orthogonal: 0,
    repulsion: 0,
    perturb: 0,
    grab: 0,
  };
}

export function emptyRegistryScore(): RegistryScore {
  return { total: 0, counts: [], avg: 0, std: 0, zero: 0, hot: 0, pairs: 0, count: 0 };
}

export function createSimulationState(): SimulationState {
  return {
    pos: new Float32Array(0),
    vel: new Float32Array(0),
    frc: new Float32Array(0),
    filaments: [],
    beads: [],
    bonds: [],
    bends: [],
    crosslinks: [],
    neighborPairs: [],
    pairLinkCount: new Map(),
    running: false,
    frame: 0,
    energy: emptyEnergy(),
    grabbedBead: -1,
    grabTarget: { x: 0, y: 0, z: 0 },
    grabKspring: 60,
    perturb: { angleMoment: 0, samples: [] },
    bend: {
      leftCom0: { x: 0, y: 0, z: 0 },
      centerCom0: { x: 0, y: 0, z: 0 },
      rightCom0: { x: 0, y: 0, z: 0 },
      leftBeads: [],
      centerBeads: [],
      rightBeads: [],
      targetAngleDeg: 180,
      actualAngleDeg: 180,
      angleErrorDeg: 0,
      angleEnergy: 0,
      angleMoment: 0,
      bendDir: { x: 1, y: 0, z: 0 },
    },
    view: { ...defaultView, zoom: 4.2, panX: 0, panY: 0 },
    display: {
      showFaces: false,
      showFaceArrows: false,
      showRegistry: false,
      showFilaments: true,
      highlightedFilamentId: -1,
    },
    helicity: {
      compatibleSites: 0,
      incompatibleSites: 0,
      score: emptyRegistryScore(),
    },
    nFilamentBeads: 0,
    nBackboneBonds: 0,
    nBackboneBends: 0,
  };
}
