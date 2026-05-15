import { describe, expect, it } from "vitest";
import { HEX_DIRS, PHASE_LEN } from "../../src/model/constants";
import {
  angularDistanceDeg,
  axialToXY,
  clampAngleThresholdDeg,
  defaultRegistry,
  displayedFaceAngleDeg,
  displayedFaceK,
  exposedK,
  nearestHexDirectionK,
  withinAngleThresholdDeg,
  wrapDeg360,
} from "../../src/model/hex";
import { faceCssColor, registryCssColor, registryHue } from "../../src/render/color";
import { beadCssColor } from "../../src/ui/readout";
import { createSimulationState } from "../../src/simulation/state";

const continuousParams = {
  helicityMode: "continuous" as const,
  actinTwistDeg: 166.15,
  helicityHandedness: 1 as const,
  helicityPhaseOffsetDeg: 0,
};

const discreteParams = {
  ...continuousParams,
  helicityMode: "discrete12" as const,
};

describe("hex and phase model", () => {
  it("maps axial directions to the expected hex orientation", () => {
    const a = 10;
    expect(axialToXY(1, 0, a)).toEqual({ x: 10, y: 0 });
    expect(axialToXY(0, 1, a).x).toBeCloseTo(5);
    expect(axialToXY(0, 1, a).y).toBeCloseTo((Math.sqrt(3) / 2) * a);
    expect(HEX_DIRS).toHaveLength(6);
  });

  it("exposes the documented 12-state active faces", () => {
    expect(Array.from({ length: PHASE_LEN }, (_, m) => exposedK(m, 0))).toEqual([
      0,
      3,
      null,
      null,
      1,
      4,
      null,
      null,
      2,
      5,
      null,
      null,
    ]);
  });

  it("wraps registries into the 12-state phase space", () => {
    expect(defaultRegistry(1, 2)).toBe(5);
    expect(defaultRegistry(-1, -2)).toBe(7);
    expect(defaultRegistry(7, 0)).toBe(7);
  });

  it("wraps and compares angles across the 0/360 seam", () => {
    expect(wrapDeg360(360)).toBe(0);
    expect(wrapDeg360(-30)).toBe(330);
    expect(angularDistanceDeg(359, 1)).toBeCloseTo(2);
  });

  it("clamps threshold bounds and applies inclusive threshold gating", () => {
    expect(clampAngleThresholdDeg(-2)).toBe(0);
    expect(clampAngleThresholdDeg(999)).toBe(180);
    expect(withinAngleThresholdDeg(10, 10)).toBe(true);
    expect(withinAngleThresholdDeg(10.001, 10)).toBe(false);
  });

  it("maps discrete registries to evenly spaced hues", () => {
    expect(registryHue({ id: 0, q: 0, r: 0, x: 0, y: 0, s: 0, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 0 }, "discrete12")).toBe(0);
    expect(registryHue({ id: 0, q: 0, r: 0, x: 0, y: 0, s: 3, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 0 }, "discrete12")).toBe(90);
    expect(registryHue({ id: 0, q: 0, r: 0, x: 0, y: 0, s: PHASE_LEN - 1, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 0 }, "discrete12")).toBe(
      330,
    );
  });

  it("wraps continuous phase angles onto the hue wheel", () => {
    expect(registryHue({ id: 0, q: 0, r: 0, x: 0, y: 0, s: 0, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 361 }, "continuous")).toBe(1);
    expect(registryHue({ id: 0, q: 0, r: 0, x: 0, y: 0, s: 0, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: -30 }, "continuous")).toBe(330);
    expect(registryCssColor({ id: 0, q: 0, r: 0, x: 0, y: 0, s: 0, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 359.6 }, "continuous")).toBe(
      "hsl(360, 70%, 65%)",
    );
  });

  it("keeps readout bead colors aligned with the shared registry color helper", () => {
    const state = createSimulationState();
    state.display.showRegistry = true;
    state.filaments = [{ id: 0, q: 0, r: 0, x: 0, y: 0, s: 4, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 123 }];

    expect(beadCssColor(state, discreteParams, { f: 0, m: 0 })).toBe(registryCssColor(state.filaments[0], "discrete12"));
    expect(beadCssColor(state, continuousParams, { f: 0, m: 0 })).toBe(registryCssColor(state.filaments[0], "continuous"));
  });

  it("maps displayed continuous faces to the nearest hex direction", () => {
    expect(nearestHexDirectionK(29.9)).toBe(0);
    expect(nearestHexDirectionK(30.1)).toBe(1);
    expect(nearestHexDirectionK(359)).toBe(0);

    const filament = { id: 0, q: 0, r: 0, x: 0, y: 0, s: 0, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 61 };
    expect(displayedFaceK(0, filament, continuousParams)).toBe(1);
  });

  it("exposes physical face angles for radial face markers", () => {
    const filament = { id: 0, q: 0, r: 0, x: 0, y: 0, s: 0, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 61 };

    expect(displayedFaceAngleDeg(4, filament, discreteParams)).toBe(60);
    expect(displayedFaceAngleDeg(2, filament, discreteParams)).toBeNull();
    expect(displayedFaceAngleDeg(1, filament, continuousParams)).toBeCloseTo(227.15);
  });

  it("keeps face colors on the same angular palette as the shared face helper", () => {
    const state = createSimulationState();
    state.display.showFaces = true;
    state.filaments = [{ id: 0, q: 0, r: 0, x: 0, y: 0, s: 0, polarity: 1 as const, axialOffsetMonomers: 0, phaseDeg: 61 }];

    const faceIndex = displayedFaceK(0, state.filaments[0], continuousParams);
    expect(faceIndex).toBe(1);
    expect(beadCssColor(state, continuousParams, { f: 0, m: 0 })).toBe(faceCssColor(faceIndex ?? 0));
  });
});
