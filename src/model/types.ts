export type RegistryMode = "perfect" | "zero" | "random" | "custom";
export type AbpType = "fascin" | "actinin" | "camkii" | "custom";
export type PerturbMode = "none" | "bend3";
export type AbpModel = "single" | "linker2" | "linker4";
export type HelicityMode = "discrete12" | "continuous";
export type LatticeGeometry = "hex" | "square";

export interface Params {
  latticeGeometry: LatticeGeometry;
  rings: number;
  monomers: number;
  b: number;
  a: number;
  kb: number;
  clDist: number;
  ktheta: number;
  kcl: number;
  kperp: number;
  rep: number;
  temp: number;
  dt: number;
  steps: number;
  sat: number;
  bendAngleDeg: number;
  bendLayers: number;
  bendKAngleLog10: number;
  bendKAngle: number;
  mcT0: number;
  mcT1: number;
  mcIters: number;
  mcSkew: number;
  sigma: number;
  drag: number;
  helicityMode: HelicityMode;
  actinTwistDeg: number;
  helicityHandedness: 1 | -1;
  helicityPhaseOffsetDeg: number;
  helicityAngleThresholdDeg: number;
  compatibilitySharpness: number;
  mcPhaseSigma0: number;
  registryMode: RegistryMode;
  abpType: AbpType;
  perturbMode: PerturbMode;
}

export interface AbpPreset {
  model: AbpModel;
  length: number;
  latticeA: number;
  kCl: number;
  kPerp: number;
  usePerp: boolean;
  kInternal?: number;
  kBendInternal?: number;
  label: string;
}

export interface EffectiveAbp {
  length: number;
  kCl: number;
  kPerp: number;
  usePerp: boolean;
  model: AbpModel;
  kInternal: number;
  kBendInternal: number;
  label: string;
}

export interface Filament {
  id: number;
  q: number;
  r: number;
  x: number;
  y: number;
  s: number;
  phaseDeg: number;
}

export interface BeadMeta {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fx: number;
  fy: number;
  fz: number;
  f: number;
  m: number;
  x0: number;
  y0: number;
  z0: number;
  isInternal?: boolean;
}

export type Bond = [ia: number, ib: number, rest: number, stiffness?: number];
export type Bend = [ia: number, ib: number, ic: number, kappa?: number];
export type Crosslink = [ia: number, ib: number, rest: number];
export type NeighborPair = [fi: number, fj: number, k: number];

export interface EnergyBreakdown {
  bond: number;
  bend: number;
  crosslink: number;
  orthogonal: number;
  repulsion: number;
  perturb: number;
  grab: number;
}

export interface SweepSample {
  angleTargetDeg: number;
  actualAngleDeg: number;
  angleErrorDeg: number;
  moment: number;
  energy: number;
  ei: number;
  converged?: boolean;
  iters?: number;
}

export interface SimulationState {
  pos: Float32Array;
  vel: Float32Array;
  frc: Float32Array;
  filaments: Filament[];
  beads: BeadMeta[];
  bonds: Bond[];
  bends: Bend[];
  crosslinks: Crosslink[];
  neighborPairs: NeighborPair[];
  pairLinkCount: Map<string, number>;
  running: boolean;
  frame: number;
  energy: EnergyBreakdown;
  grabbedBead: number;
  grabTarget: Vec3;
  grabKspring: number;
  perturb: {
    angleMoment: number;
    samples: SweepSample[];
  };
  bend: {
    leftCom0: Vec3;
    centerCom0: Vec3;
    rightCom0: Vec3;
    leftBeads: number[];
    centerBeads: number[];
    rightBeads: number[];
    targetAngleDeg: number;
    actualAngleDeg: number;
    angleErrorDeg: number;
    angleEnergy: number;
    angleMoment: number;
    bendDir: Vec3;
  };
  view: ViewState;
  display: DisplayState;
  helicity: {
    compatibleSites: number;
    incompatibleSites: number;
    /** Cached upper-bound score (sat=1) refreshed by `buildCrosslinks`. */
    score: RegistryScore;
  };
  nFilamentBeads: number;
  nBackboneBonds: number;
  nBackboneBends: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ProjectedPoint extends Vec3 {}

export interface ViewState {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface DisplayState {
  showFaces: boolean;
  showFaceArrows: boolean;
  showRegistry: boolean;
  showFilaments: boolean;
}

export interface RegistryScore {
  total: number;
  counts: number[];
  avg: number;
  std: number;
  zero: number;
  hot: number;
  pairs: number;
  count: number;
}

export interface Rng {
  random(): number;
  normal(): number;
}

export interface Renderer {
  init(): void;
  resize(): void;
  fitView(resetOrientation?: boolean): void;
  draw(): void;
  rebuildTopology(): void;
  markColorsDirty(): void;
  rotatePoint(x: number, y: number, z: number): Vec3;
  project(point: Vec3): ProjectedPoint;
}
