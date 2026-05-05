import { KBT_PN_NM, actinKtheta } from "../model/constants";
import { presetFor } from "../model/abp";
import type { AbpType, Params } from "../model/types";

export const controlIds = [
  "rings",
  "monomers",
  "b",
  "a",
  "kb",
  "clDist",
  "ktheta",
  "kcl",
  "kperp",
  "rep",
  "temp",
  "dt",
  "steps",
  "sat",
  "bendAngleDeg",
  "bendLayers",
  "bendKAngleLog10",
  "mcT0",
  "mcT1",
  "mcIters",
  "mcSkew",
] as const;

export const selectIds = ["registryMode", "abpType", "perturbMode"] as const;
export const structuralKeys = new Set<string>(["rings", "monomers", "b", "a"]);

export type ControlId = (typeof controlIds)[number];
export type SelectId = (typeof selectIds)[number];
export type Controls = Record<ControlId, HTMLInputElement>;
export type ValueLabels = Record<ControlId, HTMLElement>;
export type Selects = Record<SelectId, HTMLSelectElement>;

export interface DomRefs {
  canvas: HTMLCanvasElement;
  readout: HTMLElement;
  legend: HTMLElement;
  sweepTable: HTMLElement;
  controls: Controls;
  values: ValueLabels;
  selects: Selects;
}

function requireElement<T extends HTMLElement>(id: string, ctor: { new (): T }): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  if (!(el instanceof ctor)) throw new Error(`#${id} is not a ${ctor.name}`);
  return el;
}

export function getDomRefs(): DomRefs {
  const controls = Object.fromEntries(
    controlIds.map((id) => [id, requireElement(id, HTMLInputElement)]),
  ) as Controls;
  const values = Object.fromEntries(
    controlIds.map((id) => [id, requireElement(`${id}Val`, HTMLElement)]),
  ) as ValueLabels;
  const selects = Object.fromEntries(
    selectIds.map((id) => [id, requireElement(id, HTMLSelectElement)]),
  ) as Selects;

  return {
    canvas: requireElement("canvas", HTMLCanvasElement),
    readout: requireElement("readout", HTMLElement),
    legend: requireElement("legend", HTMLElement),
    sweepTable: requireElement("sweepTable", HTMLElement),
    controls,
    values,
    selects,
  };
}

export function readStructuralParams(params: Params, controls: Controls): void {
  params.rings = Math.round(Number(controls.rings.value));
  params.monomers = Math.round(Number(controls.monomers.value));
  params.b = Number(controls.b.value);
  params.a = Number(controls.a.value);
}

export function readParams(params: Params, refs: Pick<DomRefs, "controls" | "selects">): void {
  for (const [key, el] of Object.entries(refs.controls) as [ControlId, HTMLInputElement][]) {
    if (structuralKeys.has(key)) continue;
    (params as unknown as Record<string, number>)[key] = Number(el.value);
  }
  params.steps = Math.round(params.steps);
  params.bendLayers = Math.round(params.bendLayers);
  params.bendKAngle = 10 ** params.bendKAngleLog10;
  params.sigma = Math.max(2.0, (params.a || 1) * 0.55);
  params.drag = 0.96;
  params.registryMode = refs.selects.registryMode.value as Params["registryMode"];
  params.abpType = refs.selects.abpType.value as Params["abpType"];
  params.perturbMode = refs.selects.perturbMode.value as Params["perturbMode"];
}

export function updateLabels(params: Params, controls: Controls, values: ValueLabels): void {
  const ringsLive = Math.round(Number(controls.rings.value));
  const monomersLive = Math.round(Number(controls.monomers.value));
  const bLive = Number(controls.b.value);
  const aLive = Number(controls.a.value);

  values.rings.textContent = `${ringsLive} (${1 + 3 * ringsLive * (ringsLive + 1)} filaments)`;
  values.monomers.textContent = monomersLive.toString();
  values.b.textContent = bLive.toFixed(2);
  values.a.textContent = aLive.toFixed(1);
  values.kb.textContent = params.kb.toFixed(0);
  values.clDist.textContent = params.clDist.toFixed(1);
  values.ktheta.textContent = `${params.ktheta.toFixed(0)} (Lp ≈ ${(
    (params.ktheta * params.b) /
    KBT_PN_NM /
    1000
  ).toFixed(2)} µm)`;
  values.kcl.textContent = params.kcl.toFixed(1);
  values.kperp.textContent = params.kperp.toFixed(0);
  values.rep.textContent = params.rep.toFixed(0);
  values.temp.textContent = params.temp.toFixed(2);
  values.dt.textContent = params.dt.toFixed(4);
  values.steps.textContent = params.steps.toString();
  values.sat.textContent = params.sat.toFixed(2);
  values.bendAngleDeg.textContent = params.bendAngleDeg.toFixed(0);
  values.bendLayers.textContent = Math.round(params.bendLayers).toString();
  values.bendKAngleLog10.textContent = `${params.bendKAngle.toExponential(2)} (10^${params.bendKAngleLog10.toFixed(2)})`;
  values.mcT0.textContent = params.mcT0.toFixed(2);
  values.mcT1.textContent = params.mcT1.toFixed(3);
  values.mcIters.textContent = Math.round(params.mcIters).toString();
  values.mcSkew.textContent = params.mcSkew.toFixed(2);
}

export function applyAbpPresetToControls(type: AbpType, params: Params, refs: DomRefs, adjustLattice = true): void {
  if (type === "custom") return;
  const preset = presetFor(type);
  refs.controls.clDist.value = preset.length.toString();
  refs.controls.kcl.value = preset.kCl.toString();
  refs.controls.kperp.value = preset.kPerp.toString();
  if (adjustLattice) refs.controls.a.value = preset.latticeA.toString();
  readParams(params, refs);
  updateLabels(params, refs.controls, refs.values);
}

export function setActinDefaultBending(params: Params, controls: Controls): void {
  params.b = Number(controls.b.value);
  controls.ktheta.value = actinKtheta(params.b).toFixed(0);
}
