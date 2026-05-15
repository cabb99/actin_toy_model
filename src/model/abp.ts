import { ABP_PRESETS } from "./constants";
import type { AbpType, EffectiveAbp, Params } from "./types";

export function currentAbpEffective(params: Params): EffectiveAbp {
  if (params.abpType !== "custom") {
    const preset = ABP_PRESETS[params.abpType];
    return {
      length: params.clDist,
      latticeA: preset.latticeA,
      kCl: params.kcl,
      kPerp: params.kperp,
      usePerp: preset.usePerp,
      model: preset.model,
      kInternal: preset.kInternal ?? 200,
      kBendInternal: preset.kBendInternal ?? 25,
      label: preset.label,
      requireParallel: preset.requireParallel,
      abpAxialOffsetMonomers: preset.abpAxialOffsetMonomers,
      abpAxialOffsetTolMonomers: preset.abpAxialOffsetTolMonomers,
    };
  }
  return {
    length: params.clDist,
    latticeA: params.a,
    kCl: params.kcl,
    kPerp: params.kperp,
    usePerp: params.kperp > 0,
    model: "single",
    kInternal: 200,
    kBendInternal: 25,
    label: "custom",
    requireParallel: false,
    abpAxialOffsetMonomers: 0,
    abpAxialOffsetTolMonomers: 0,
  };
}

export function presetFor(type: Exclude<AbpType, "custom">) {
  return ABP_PRESETS[type];
}
