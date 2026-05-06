import type { Filament, HelicityMode } from "../model/types";
import { PHASE_LEN } from "../model/constants";
import { hexDirectionDeg, wrapDeg360 } from "../model/hex";

export const ANGLE_COLOR_SATURATION = 70;
export const ANGLE_COLOR_LIGHTNESS = 65;
export const FACE_DIRECTIONS = [0, 1, 2, 3, 4, 5] as const;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function angleHue(angleDeg: number): number {
  return wrapDeg360(angleDeg);
}

export function angleCssColor(angleDeg: number): string {
  const hue = angleHue(angleDeg);
  return `hsl(${hue.toFixed(0)}, ${ANGLE_COLOR_SATURATION}%, ${ANGLE_COLOR_LIGHTNESS}%)`;
}

export function faceAngleDeg(faceIndex: number): number {
  return hexDirectionDeg(faceIndex);
}

export function faceCssColor(faceIndex: number): string {
  return angleCssColor(faceAngleDeg(faceIndex));
}

export function angleLegendStops(): Array<{ angleDeg: number; color: string }> {
  return FACE_DIRECTIONS.map((faceIndex) => {
    const angleDeg = faceAngleDeg(faceIndex);
    return { angleDeg, color: faceCssColor(faceIndex) };
  });
}

export function registryHue(filament: Filament, helicityMode: HelicityMode, phaseLen = PHASE_LEN): number {
  if (helicityMode === "continuous") return wrapDeg360(filament.phaseDeg);
  return (filament.s / phaseLen) * 360;
}

export function registryCssColor(filament: Filament, helicityMode: HelicityMode, phaseLen = PHASE_LEN): string {
  return angleCssColor(registryHue(filament, helicityMode, phaseLen));
}

export function hslToRGB(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t0: number) => {
    let t = ((t0 % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [conv(h + 1 / 3), conv(h), conv(h - 1 / 3)];
}
