import type { EnergyBreakdown, SimulationState } from "../model/types";

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
    running: true,
    frame: 0,
    energy: emptyEnergy(),
    grabbedBead: -1,
    grabTarget: { x: 0, y: 0, z: 0 },
    grabKspring: 60,
    perturb: { ramForceX: 0, actualDef: 0, samples: [] },
    bend: { com0: { x: 0, y: 0, z: 0 }, centerBeads: [], kRam: 5000 },
    view: { ...defaultView, zoom: 4.2, panX: 0, panY: 0 },
    display: { showFaces: false, showRegistry: false, showFilaments: true },
    nFilamentBeads: 0,
    nBackboneBonds: 0,
    nBackboneBends: 0,
  };
}
