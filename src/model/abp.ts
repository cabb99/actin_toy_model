import { ABP_PRESETS } from "./constants";
import type { AbpType, EffectiveAbp, Params } from "./types";

export function currentAbpEffective(params: Params): EffectiveAbp {
  if (params.abpType !== "custom") {
    const preset = ABP_PRESETS[params.abpType];
    return {
      length: params.clDist,
      kCl: params.kcl,
      kPerp: params.kperp,
      usePerp: preset.usePerp,
      model: preset.model,
      kInternal: preset.kInternal ?? 200,
      kBendInternal: preset.kBendInternal ?? 25,
      label: preset.label,
    };
  }
  return {
    length: params.clDist,
    kCl: params.kcl,
    kPerp: params.kperp,
    usePerp: params.kperp > 0,
    model: "single",
    kInternal: 200,
    kBendInternal: 25,
    label: "custom",
  };
}

export function presetFor(type: Exclude<AbpType, "custom">) {
  return ABP_PRESETS[type];
}
