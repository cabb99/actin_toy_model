import "./styles.css";
import { defaultParams } from "./model/constants";
import { displayedFaceAngleDeg } from "./model/hex";
import type { AbpType } from "./model/types";
import { CanvasRenderer } from "./render/canvasRenderer";
import { angleCssColor } from "./render/color";
import { computeForces, kick, step } from "./simulation/forces";
import { createMathRng } from "./simulation/random";
import { runMonteCarlo, scoreRegistries, type MonteCarloSample } from "./simulation/registry";
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
const mcGraph = document.getElementById("mcGraph");

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

function renderMcGraph(samples: MonteCarloSample[], status = "Run Monte Carlo to plot connections vs temperature."): void {
  if (!mcGraph) return;
  const plotted = samples.filter((s) => s.iteration > 0);
  if (!plotted.length) {
    mcGraph.innerHTML = `<div class="mc-graph-empty">${status}</div>`;
    return;
  }

  const width = 320;
  const height = 150;
  const pad = { left: 42, right: 14, top: 18, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const temps = plotted.map((s) => Math.max(1e-9, s.temperature));
  const minLogT = Math.log(Math.min(...temps));
  const maxLogT = Math.log(Math.max(...temps));
  const maxConnections = Math.max(1, ...plotted.map((s) => s.connections));
  const latest = plotted[plotted.length - 1];
  const best = plotted.reduce((m, s) => Math.max(m, s.bestConnections), 0);
  const xFor = (temperature: number): number => {
    if (Math.abs(maxLogT - minLogT) < 1e-12) return pad.left;
    const t = (maxLogT - Math.log(Math.max(1e-9, temperature))) / (maxLogT - minLogT);
    return pad.left + t * plotW;
  };
  const yFor = (connections: number): number => pad.top + plotH - (connections / maxConnections) * plotH;
  const points = plotted.map((s) => `${xFor(s.temperature).toFixed(1)},${yFor(s.connections).toFixed(1)}`).join(" ");
  const bestPoints = plotted
    .map((s) => `${xFor(s.temperature).toFixed(1)},${yFor(s.bestConnections).toFixed(1)}`)
    .join(" ");
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);

  mcGraph.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monte Carlo connections versus temperature">
      <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(13,17,23,0.20)" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="rgba(157,167,179,0.65)" />
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="rgba(157,167,179,0.65)" />
      <polyline points="${bestPoints}" fill="none" stroke="rgba(86,211,100,0.65)" stroke-width="1.4" stroke-dasharray="4 3" />
      <polyline points="${points}" fill="none" stroke="rgba(88,166,255,0.95)" stroke-width="2" />
      <circle cx="${xFor(latest.temperature).toFixed(1)}" cy="${yFor(latest.connections).toFixed(1)}" r="2.8" fill="rgba(88,166,255,1)" />
      <text x="${pad.left}" y="12" fill="rgba(230,237,243,0.92)" font-size="10.5">${status}</text>
      <text x="${pad.left + 3}" y="${pad.top + 10}" fill="rgba(157,167,179,0.9)" font-size="9">${maxConnections}</text>
      <text x="${pad.left + 3}" y="${pad.top + plotH - 3}" fill="rgba(157,167,179,0.9)" font-size="9">0</text>
      <text x="${pad.left}" y="${height - 9}" fill="rgba(157,167,179,0.9)" font-size="9">T ${maxT.toPrecision(2)}</text>
      <text x="${pad.left + plotW}" y="${height - 9}" fill="rgba(157,167,179,0.9)" font-size="9" text-anchor="end">T ${minT.toPrecision(2)}</text>
      <text x="${pad.left + plotW / 2}" y="${height - 9}" fill="rgba(201,215,231,0.9)" font-size="10" text-anchor="middle">Temperature</text>
      <text x="12" y="${pad.top + plotH / 2}" fill="rgba(201,215,231,0.9)" font-size="10" transform="rotate(-90 12 ${pad.top + plotH / 2})" text-anchor="middle">Connections</text>
      <text x="${pad.left}" y="${height - 21}" fill="rgba(88,166,255,0.95)" font-size="9">current ${latest.connections}</text>
      <text x="${pad.left + plotW}" y="${height - 21}" fill="rgba(86,211,100,0.85)" font-size="9" text-anchor="end">best ${best}</text>
    </svg>
  `;
}

function mcRunStatus(label: string): string {
  return `${label}: T ${params.mcT0.toFixed(2)} to ${params.mcT1.toFixed(3)}, ` +
    `iters ${Math.round(params.mcIters)}, skew ${params.mcSkew.toFixed(2)}, sigma ${params.mcPhaseSigma0.toFixed(1)}`;
}

function syncFilamentSelect(): void {
  const selected = state.filaments.some((f) => f.id === state.display.highlightedFilamentId)
    ? state.display.highlightedFilamentId
    : -1;
  state.display.highlightedFilamentId = selected;

  const none = document.createElement("option");
  none.value = "-1";
  none.textContent = "None";
  const options = [none];
  for (const f of state.filaments) {
    const option = document.createElement("option");
    option.value = f.id.toString();
    option.textContent = `Filament ${f.id} (q=${f.q}, r=${f.r})`;
    options.push(option);
  }
  refs.filamentSelect.replaceChildren(...options);
  refs.filamentSelect.value = selected.toString();
}

function reset(randomize = false): void {
  readStructuralParams(params, refs.controls);
  commitLiveParams();
  resetSystem(state, params, rng, randomize);
  renderMcGraph([]);
  syncFilamentSelect();
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

refs.selects.latticeGeometry.addEventListener("change", () => reset(false));
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

refs.selects.scoringMode.addEventListener("change", () => {
  commitLiveParams();
});

refs.filamentSelect.addEventListener("change", () => {
  state.display.highlightedFilamentId = Number(refs.filamentSelect.value);
  renderer.markColorsDirty();
});

document.getElementById("rebuildBtn")?.addEventListener("click", () => rebuildCrosslinkTopology());

let mcRunning = false;
document.getElementById("mcBtn")?.addEventListener("click", async () => {
  if (mcRunning) {
    console.warn("MC already running.");
    return;
  }
  const btn = document.getElementById("mcBtn") as HTMLButtonElement;
  commitLiveParams();
  const beforeText = btn.textContent ?? "Optimize registries (Monte Carlo)";
  const samples: MonteCarloSample[] = [];
  renderMcGraph(samples, mcRunStatus("Optimizing"));
  mcRunning = true;
  btn.disabled = true;
  btn.textContent = "Optimizing...";
  try {
    const before = scoreRegistries(state, params);
    const after = await runMonteCarlo(state, params, rng, {
      onProgress: (msg) => console.log(msg),
      onSample: (sample) => {
        samples.push(sample);
        renderMcGraph(samples, mcRunStatus("Optimizing"));
      },
    });
    refs.selects.registryMode.value = "custom";
    renderMcGraph(samples, mcRunStatus("Monte Carlo"));
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
document.getElementById("sideViewBtn")?.addEventListener("click", () => {
  state.view.rotX = 0;
  state.view.rotY = Math.PI / 2;
  renderer.fitView(false);
});
document.getElementById("topViewBtn")?.addEventListener("click", () => {
  state.view.rotX = 0;
  state.view.rotY = 0;
  renderer.fitView(false);
});
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

type DisplayToggleKey = "showFaces" | "showFaceArrows" | "showRegistry" | "showFilaments";

function toggleBtn(id: string, key: DisplayToggleKey): void {
  const btn = document.getElementById(id);
  btn?.addEventListener("click", () => {
    state.display[key] = !state.display[key];
    btn.classList.toggle("on", state.display[key]);
    renderer.markColorsDirty();
  });
}
toggleBtn("faceToggle", "showFaces");
toggleBtn("faceArrowToggle", "showFaceArrows");
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
refs.canvas.addEventListener("pointermove", updateHoverTooltip);
refs.canvas.addEventListener("pointerleave", hideHoverTooltip);

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

document.querySelectorAll<HTMLButtonElement>(".panel-collapse").forEach((btn) => {
  btn.addEventListener("click", () => {
    const frame = btn.closest<HTMLElement>(".panel-frame");
    if (!frame) return;
    const collapsed = frame.classList.toggle("collapsed");
    btn.textContent = collapsed ? "+" : "−";
    btn.setAttribute("aria-label", collapsed ? "Expand panel" : "Collapse panel");
    btn.title = collapsed ? "Expand" : "Collapse";
  });
});

const hoverInfo = document.getElementById("hoverInfo") as HTMLElement | null;
const HOVER_PICK_RADIUS_PX = 18;

function updateHoverTooltip(ev: PointerEvent): void {
  if (!hoverInfo) return;
  if (ev.pointerType !== "mouse" || dragging || state.grabbedBead >= 0) {
    hoverInfo.hidden = true;
    return;
  }
  const rect = refs.canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  const idx = pickBeadAt(mx, my, HOVER_PICK_RADIUS_PX);
  if (idx < 0) {
    hoverInfo.hidden = true;
    return;
  }
  const bead = state.beads[idx];
  if (bead.f < 0 || bead.isInternal) {
    // ABP-internal bead — no registry angle to show.
    hoverInfo.hidden = true;
    return;
  }
  const filament = state.filaments[bead.f];
  const angle = displayedFaceAngleDeg(bead.m, filament, params);
  const filamentRegistry = params.helicityMode === "continuous"
    ? `φ ${filament.phaseDeg.toFixed(1)}°`
    : `s ${filament.s}`;
  const filamentSwatch = angleCssColor(
    params.helicityMode === "continuous" ? filament.phaseDeg : (filament.s * 360) / 12,
  );
  const angleStr = angle === null ? "—" : `${angle.toFixed(1)}°`;
  const monomerSwatch = angle === null ? "transparent" : angleCssColor(angle);
  const polarityStr = filament.polarity === 1 ? "+" : "−";
  const displacementNm = (filament.axialOffsetMonomers * params.b).toFixed(1);
  hoverInfo.innerHTML =
    `<div><span class="swatch" style="background:${filamentSwatch}"></span>` +
    `<strong>filament ${bead.f}</strong> · ${filamentRegistry} · displacement ${displacementNm} nm · polarity ${polarityStr}</div>` +
    `<div><span class="swatch" style="background:${monomerSwatch}"></span>` +
    `<strong>m ${bead.m}</strong> · θ ${angleStr}</div>`;
  hoverInfo.style.left = `${mx}px`;
  hoverInfo.style.top = `${my}px`;
  hoverInfo.hidden = false;
}

function hideHoverTooltip(): void {
  if (hoverInfo) hoverInfo.hidden = true;
}

const tabButtons = document.querySelectorAll<HTMLButtonElement>(".tabs .tab");
const tabPanels = document.querySelectorAll<HTMLElement>(".tab-panel");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    if (!target) return;
    tabButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    tabPanels.forEach((p) => {
      p.hidden = p.dataset.panel !== target;
    });
  });
});

readStructuralParams(params, refs.controls);
readParams(params, refs);
setActinDefaultBending(params, refs.controls);
applyAbpPresetToControls(refs.selects.abpType.value as AbpType, params, refs);

renderer.init();
reset(false);
animate();
