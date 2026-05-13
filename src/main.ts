import "./styles.css";
import { defaultParams } from "./model/constants";
import type { AbpType } from "./model/types";
import { CanvasRenderer } from "./render/canvasRenderer";
import { computeForces, kick, step } from "./simulation/forces";
import { createMathRng } from "./simulation/random";
import { runMonteCarlo, scoreRegistries } from "./simulation/registry";
import { createSimulationState } from "./simulation/state";
import { applyPerturbationConstraints, assignRegistries, buildCrosslinks, resetSystem } from "./simulation/topology";
import { sweepBend } from "./simulation/sweep";
import {
  applyAbpPresetToControls,
  getDomRefs,
  readParams,
  readStructuralParams,
  setActinDefaultBending,
  updateLabels,
} from "./ui/dom";
import { renderLegend, renderReadout, renderSweepTable } from "./ui/readout";
import { ensureAppShell } from "./ui/template";

ensureAppShell();

const refs = getDomRefs();
const params = defaultParams();
const state = createSimulationState();
const rng = createMathRng();
const renderer = new CanvasRenderer(refs.canvas, state, params);

function refreshLabels(): void {
  updateLabels(params, refs.controls, refs.values);
}

function commitLiveParams(): void {
  readParams(params, refs);
  refreshLabels();
}

function rebuildCrosslinkTopology(): void {
  buildCrosslinks(state, params, rng);
  renderer.rebuildTopology();
  renderer.markColorsDirty();
}

function reset(randomize = false): void {
  readStructuralParams(params, refs.controls);
  commitLiveParams();
  resetSystem(state, params, rng, randomize);
  renderer.rebuildTopology();
  renderer.fitView(true);
}

function animate(): void {
  commitLiveParams();
  if (state.running) {
    for (let i = 0; i < params.steps; i++) step(state, params, rng);
  } else {
    computeForces(state, params);
  }
  renderer.draw();
  renderLegend(refs.legend, state, params);
  renderReadout(refs.readout, state, params);
  requestAnimationFrame(animate);
}

function downloadCsv(csv: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "actin_bundle_3pb.csv";
  a.click();
  URL.revokeObjectURL(url);
}

for (const id of ["rings", "monomers", "b", "a"] as const) {
  refs.controls[id].addEventListener("change", () => reset(false));
}

refs.controls.sat.addEventListener("change", () => {
  commitLiveParams();
  rebuildCrosslinkTopology();
});
refs.controls.clDist.addEventListener("change", () => {
  commitLiveParams();
  rebuildCrosslinkTopology();
});
refs.controls.bendLayers.addEventListener("change", () => {
  commitLiveParams();
  applyPerturbationConstraints(state, params);
});
refs.controls.helicityAngleThresholdDeg.addEventListener("change", () => {
  commitLiveParams();
  rebuildCrosslinkTopology();
});
refs.controls.compatibilitySharpness.addEventListener("change", () => {
  commitLiveParams();
  rebuildCrosslinkTopology();
});

for (const id of [
  "actinTwistDeg",
  "helicityPhaseOffsetDeg",
] as const) {
  refs.controls[id].addEventListener("change", () => reset(false));
}

refs.selects.helicityMode.addEventListener("change", () => reset(false));
refs.selects.helicityHandedness.addEventListener("change", () => reset(false));

refs.selects.registryMode.addEventListener("change", () => {
  commitLiveParams();
  assignRegistries(state, params, rng);
  rebuildCrosslinkTopology();
});

refs.selects.abpType.addEventListener("change", () => {
  if (refs.selects.abpType.value !== "custom") {
    applyAbpPresetToControls(refs.selects.abpType.value as AbpType, params, refs);
    reset(false);
  } else {
    commitLiveParams();
    rebuildCrosslinkTopology();
  }
});

refs.selects.perturbMode.addEventListener("change", () => {
  commitLiveParams();
  applyPerturbationConstraints(state, params);
});

document.getElementById("rebuildBtn")?.addEventListener("click", () => rebuildCrosslinkTopology());

let mcRunning = false;
document.getElementById("mcBtn")?.addEventListener("click", async () => {
  if (mcRunning) {
    console.warn("MC already running.");
    return;
  }
  const btn = document.getElementById("mcBtn") as HTMLButtonElement;
  const beforeText = btn.textContent ?? "Optimize registries (Monte Carlo)";
  mcRunning = true;
  btn.disabled = true;
  btn.textContent = "Optimizing...";
  try {
    const before = scoreRegistries(state, params);
    const after = await runMonteCarlo(state, params, rng, { onProgress: (msg) => console.log(msg) });
    refs.selects.registryMode.value = "custom";
    renderer.rebuildTopology();
    renderer.markColorsDirty();
    console.log(`MC: ${before.total} -> ${after.total} compatible sites`);
  } finally {
    mcRunning = false;
    btn.disabled = false;
    btn.textContent = beforeText;
  }
});

document.getElementById("pauseBtn")?.addEventListener("click", () => {
  state.running = !state.running;
  const btn = document.getElementById("pauseBtn");
  if (btn) btn.textContent = state.running ? "Pause" : "Resume";
});
document.getElementById("kickBtn")?.addEventListener("click", () => kick(state, params, rng));
document.getElementById("straightBtn")?.addEventListener("click", () => reset(false));
document.getElementById("randomBtn")?.addEventListener("click", () => reset(true));
document.getElementById("fitBtn")?.addEventListener("click", () => renderer.fitView(false));
document.getElementById("sweepBtn")?.addEventListener("click", () => {
  refs.selects.perturbMode.value = "bend3";
  commitLiveParams();
  applyPerturbationConstraints(state, params);
  const result = sweepBend(state, params, 0, 16, 1500);
  downloadCsv(result.csv);
  renderSweepTable(refs.sweepTable, result.samples, { eiSlope: result.EI, L: result.L });
});
document.getElementById("resetForcesBtn")?.addEventListener("click", () => {
  refs.controls.bendAngleDeg.value = "180";
  commitLiveParams();
  applyPerturbationConstraints(state, params);
});
document.getElementById("clearCsvBtn")?.addEventListener("click", () => {
  state.perturb.samples = [];
  renderSweepTable(refs.sweepTable, []);
});

function toggleBtn(id: string, key: keyof typeof state.display): void {
  const btn = document.getElementById(id);
  btn?.addEventListener("click", () => {
    state.display[key] = !state.display[key];
    btn.classList.toggle("on", state.display[key]);
    renderer.markColorsDirty();
  });
}
toggleBtn("faceToggle", "showFaces");
toggleBtn("registryToggle", "showRegistry");
toggleBtn("ghostToggle", "showFilaments");

let dragging = false;
let lastX = 0;
let lastY = 0;
let activePointerId: number | null = null;
let touchGrabTimer: number | null = null;
let touchStartX = 0;
let touchStartY = 0;
const TOUCH_GRAB_DELAY_MS = 280;
const TOUCH_MOVE_TOLERANCE_PX = 8;
const PICK_RADIUS_PX = 36;
const TOUCH_PICK_RADIUS_PX = 42;

function clearTouchGrabTimer(): void {
  if (touchGrabTimer !== null) {
    window.clearTimeout(touchGrabTimer);
    touchGrabTimer = null;
  }
}

function pickBeadAt(mx: number, my: number, radiusPx = PICK_RADIUS_PX): number {
  const projected = state.beads.map((p) => renderer.project(p));
  let best = -1;
  let bestD2 = radiusPx * radiusPx;
  for (let i = 0; i < projected.length; i++) {
    const dx = projected[i].x - mx;
    const dy = projected[i].y - my;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = i;
      bestD2 = d2;
    }
  }
  return best;
}

function beginGrabAt(mx: number, my: number, radiusPx = PICK_RADIUS_PX): boolean {
  const best = pickBeadAt(mx, my, radiusPx);
  state.grabbedBead = best;
  if (best < 0) {
    refs.canvas.classList.remove("grabbing");
    return false;
  }
  const b = state.beads[best];
  state.grabTarget = { x: b.x, y: b.y, z: b.z };
  refs.canvas.classList.add("grabbing");
  return true;
}

function releaseInteraction(ev: PointerEvent): void {
  if (activePointerId !== null && ev.pointerId !== activePointerId) return;
  clearTouchGrabTimer();
  dragging = false;
  activePointerId = null;
  state.grabbedBead = -1;
  refs.canvas.classList.remove("dragging");
  refs.canvas.classList.remove("grabbing");
  if (refs.canvas.hasPointerCapture(ev.pointerId)) refs.canvas.releasePointerCapture(ev.pointerId);
}

refs.canvas.addEventListener("pointerdown", (ev) => {
  const rect = refs.canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  activePointerId = ev.pointerId;
  refs.canvas.setPointerCapture(ev.pointerId);
  if (ev.pointerType === "touch") {
    ev.preventDefault();
    dragging = true;
    refs.canvas.classList.add("dragging");
    lastX = ev.clientX;
    lastY = ev.clientY;
    touchStartX = ev.clientX;
    touchStartY = ev.clientY;
    clearTouchGrabTimer();
    // Slightly delayed so normal touch rotation does not accidentally trigger grab.
    touchGrabTimer = window.setTimeout(() => {
      if (!dragging || activePointerId !== ev.pointerId) return;
      const moved = Math.hypot(lastX - touchStartX, lastY - touchStartY) > TOUCH_MOVE_TOLERANCE_PX;
      if (moved) return;
      const picked = beginGrabAt(mx, my, TOUCH_PICK_RADIUS_PX);
      if (picked) {
        dragging = false;
        refs.canvas.classList.remove("dragging");
      }
    }, TOUCH_GRAB_DELAY_MS);
    return;
  }
  if (ev.ctrlKey) {
    beginGrabAt(mx, my, PICK_RADIUS_PX);
  } else {
    dragging = true;
    refs.canvas.classList.add("dragging");
    lastX = ev.clientX;
    lastY = ev.clientY;
  }
});

refs.canvas.addEventListener("pointermove", (ev) => {
  if (activePointerId !== null && ev.pointerId !== activePointerId) return;
  if (ev.pointerType === "touch") ev.preventDefault();
  if (state.grabbedBead >= 0) {
    const rect = refs.canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const scale = state.view.zoom;
    const rx = (mx - rect.width / 2 - state.view.panX) / scale;
    const ry = (rect.height / 2 + state.view.panY - my) / scale;
    const b = state.beads[state.grabbedBead];
    const rb = renderer.rotatePoint(b.x, b.y, b.z);
    const z1 = rb.z;
    const cx = Math.cos(state.view.rotX);
    const sx = Math.sin(state.view.rotX);
    const cy = Math.cos(state.view.rotY);
    const sy = Math.sin(state.view.rotY);
    const y1 = cx * ry + sx * z1;
    const z0 = -sx * ry + cx * z1;
    const x = cy * rx - sy * z0;
    const z = sy * rx + cy * z0;
    state.grabTarget = { x, y: y1, z };
  } else if (dragging) {
    if (
      ev.pointerType === "touch" &&
      Math.hypot(ev.clientX - touchStartX, ev.clientY - touchStartY) > TOUCH_MOVE_TOLERANCE_PX
    ) {
      clearTouchGrabTimer();
    }
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (ev.shiftKey) {
      state.view.panX += dx;
      state.view.panY += dy;
    } else {
      state.view.rotY += dx * 0.01;
      state.view.rotX += dy * 0.01;
      state.view.rotX = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, state.view.rotX));
    }
  }
});

refs.canvas.addEventListener("pointerup", releaseInteraction);
refs.canvas.addEventListener("pointercancel", releaseInteraction);

refs.canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.001);
    state.view.zoom = Math.max(0.4, Math.min(28.0, state.view.zoom * factor));
  },
  { passive: false },
);

window.addEventListener("resize", () => {
  renderer.resize();
  renderer.fitView(false);
});

readStructuralParams(params, refs.controls);
readParams(params, refs);
setActinDefaultBending(params, refs.controls);
applyAbpPresetToControls(refs.selects.abpType.value as AbpType, params, refs);

renderer.init();
reset(false);
animate();
