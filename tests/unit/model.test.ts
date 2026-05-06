import { describe, expect, it } from "vitest";
import { HEX_DIRS, PHASE_LEN } from "../../src/model/constants";
import {
  angularDistanceDeg,
  axialToXY,
  clampAngleThresholdDeg,
  defaultRegistry,
  exposedK,
  withinAngleThresholdDeg,
  wrapDeg360,
} from "../../src/model/hex";

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
    expect(defaultRegistry(0, 0, 14)).toBe(2);
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
});
