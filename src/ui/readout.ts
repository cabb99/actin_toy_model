import { currentAbpEffective } from "../model/abp";
import { KBT_PN_NM } from "../model/constants";
import { displayedFaceK } from "../model/hex";
import type { Params, SimulationState, SweepSample } from "../model/types";
import { angleCssColor, angleLegendStops, faceCssColor, registryCssColor } from "../render/color";
import { scoreRegistries } from "../simulation/registry";

export function renderLegend(legend: HTMLElement, state: SimulationState, params: Params): void {
  if (!state.display.showFaces && !state.display.showRegistry) {
    legend.innerHTML = "";
    legend.style.display = "none";
    return;
  }
  legend.style.display = "block";
  const labels = angleLegendStops()
    .map(({ angleDeg, color }) => `<span class="swatch" style="background:${color}"></span>${angleDeg.toFixed(0)}°`)
    .join("<br>");
  const rampStops = [0, 60, 120, 180, 240, 300, 360]
    .map((angleDeg) => `${angleCssColor(angleDeg)} ${(angleDeg / 360) * 100}%`)
    .join(", ");
  const faceCopy =
    params.helicityMode === "continuous"
      ? "Faces snap each monomer to the nearest 60° face direction."
      : "Faces use the active 12-state face schedule.";
  const registryCopy =
    params.helicityMode === "continuous"
      ? "Registry color follows the continuous phase angle."
      : "Registry color follows the 12-state phase angle.";
  let html = "<strong>Angle color</strong><br>";
  html += `<div class="angle-ramp" style="background:linear-gradient(90deg, ${rampStops})"></div>`;
  html += '<div class="angle-labels"><span>0°</span><span>120°</span><span>240°</span><span>360°</span></div>';
  html += `<div class="legend-section"><strong>Directions</strong><br>${labels}</div>`;
  if (state.display.showRegistry) html += `<div class="legend-note">${registryCopy}</div>`;
  if (state.display.showFaces) html += `<div class="legend-note">${faceCopy}</div>`;
  legend.innerHTML = html;
}

export function renderReadout(readout: HTMLElement, state: SimulationState, params: Params): void {
  const e = state.energy;
  const total = Object.values(e).reduce((a, b) => a + b, 0);
  const sc = scoreRegistries(state, params);
  const zeroPairs = sc.zero;
  const status = state.running ? "running" : "paused";

  const grabF = (() => {
    if (state.grabbedBead < 0) return null;
    const p = state.beads[state.grabbedBead];
    const fx = -state.grabKspring * (p.x - state.grabTarget.x);
    const fy = -state.grabKspring * (p.y - state.grabTarget.y);
    const fz = -state.grabKspring * (p.z - state.grabTarget.z);
    return Math.hypot(fx, fy, fz);
  })();

  const bendInfo =
    params.perturbMode === "bend3"
      ? `<br>3-pt bend: θ tgt=${params.bendAngleDeg.toFixed(1)}° · θ ABC=${state.bend.actualAngleDeg.toFixed(
          1,
        )}° · err=${state.bend.angleErrorDeg.toFixed(2)}° · layers=${params.bendLayers.toFixed(0)} · k=${params.bendKAngle.toExponential(2)} · M=${state.bend.angleMoment.toFixed(2)} pN·nm`
      : "";

  const eiInfo =
    params.perturbMode === "bend3" && Math.abs(180 - state.bend.actualAngleDeg) > 0.05
      ? (() => {
          const L = (params.monomers - 1) * params.b;
          const foldAngle = (Math.abs(180 - state.bend.actualAngleDeg) * Math.PI) / 180;
          const EI = (Math.abs(state.bend.angleMoment) * L) / foldAngle;
          const Lp = EI / KBT_PN_NM / 1000;
          return `<br>EI ≈ ${EI.toFixed(0)} pN·nm² (Lp ≈ ${Lp.toFixed(2)} µm)`;
        })()
      : "";

  readout.innerHTML = `
    <strong>${status}</strong> · frame ${state.frame}<br>
    beads ${state.beads.length.toLocaleString()} · filaments ${state.filaments.length}
    · pairs ${state.neighborPairs.length}<br>
    crosslinks: <strong>${state.crosslinks.length.toLocaleString()}</strong>
    (sat=${(params.sat * 100).toFixed(0)}%)<br>
    compat. sites/pair: avg ${sc.avg.toFixed(2)} ± ${sc.std.toFixed(2)},
    <span class="${zeroPairs > 0 ? "warn" : "good"}">empty pairs ${zeroPairs}/${sc.pairs}</span><br>
    ABP: ${currentAbpEffective(params).label} · L₀=${params.clDist.toFixed(1)} nm · k<sub>cl</sub>=${params.kcl.toFixed(0)} pN/nm<br>
    contour ${((params.monomers - 1) * params.b).toFixed(0)} nm
    · 12-pitch ${(12 * params.b).toFixed(1)} nm
    ${bendInfo}${eiInfo}
    ${grabF !== null ? `<br>grab F: ${grabF.toFixed(2)} pN` : ""}
    <br><span style="color:${total > 1e6 ? "var(--bad)" : "var(--muted)"}">U = ${total.toFixed(0)} pN·nm</span>
    · bond ${e.bond.toFixed(0)} bend ${e.bend.toFixed(0)} cl ${e.crosslink.toFixed(0)} ⊥ ${e.orthogonal.toFixed(0)} rep ${e.repulsion.toFixed(0)}
  `;
}

export function renderSweepTable(
  el: HTMLElement,
  samples: SweepSample[],
  result: { eiSlope?: number; L?: number } = {},
): void {
  if (!samples.length) {
    el.innerHTML = '<em>No data - click "Sweep angle → CSV" to generate.</em>';
    return;
  }

  const eiSlope = result.eiSlope ?? NaN;
  const L = result.L ?? 0;
  const lpStr = Number.isFinite(eiSlope) ? `${(eiSlope / KBT_PN_NM / 1000).toFixed(2)} µm` : "—";
  const eiStr = Number.isFinite(eiSlope) ? `${eiSlope.toFixed(0)} pN·nm²` : "—";
  const rows = samples
    .map((s) => {
      const lpRow = Number.isFinite(s.ei) ? (s.ei / KBT_PN_NM / 1000).toFixed(2) : "";
      return `<tr>
        <td style="text-align:right">${s.angleTargetDeg.toFixed(1)}</td>
        <td style="text-align:right">${s.actualAngleDeg.toFixed(1)}</td>
        <td style="text-align:right">${s.angleErrorDeg.toFixed(2)}</td>
        <td style="text-align:right">${s.moment.toFixed(2)}</td>
        <td style="text-align:right">${s.energy.toFixed(0)}</td>
        <td style="text-align:right">${Number.isFinite(s.ei) ? s.ei.toFixed(0) : ""}</td>
        <td style="text-align:right">${lpRow}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <div style="margin-bottom:6px">
      L = ${L.toFixed(0)} nm · fit EI ≈ <strong>${eiStr}</strong> · Lp ≈ <strong>${lpStr}</strong>
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:11px">
      <thead>
        <tr style="color:var(--text); border-bottom:1px solid var(--line)">
          <th style="text-align:right; padding:2px 4px">θ tgt (°)</th>
          <th style="text-align:right; padding:2px 4px">θ ABC (°)</th>
          <th style="text-align:right; padding:2px 4px">err (°)</th>
          <th style="text-align:right; padding:2px 4px">M (pN·nm)</th>
          <th style="text-align:right; padding:2px 4px">U (pN·nm)</th>
          <th style="text-align:right; padding:2px 4px">EI (pN·nm²)</th>
          <th style="text-align:right; padding:2px 4px">Lp (µm)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function beadCssColor(
  state: SimulationState,
  params: Pick<
    Params,
    "helicityMode" | "actinTwistDeg" | "helicityHandedness" | "helicityPhaseOffsetDeg"
  >,
  p: { isInternal?: boolean; f: number; m: number },
): string {
  if (p.isInternal) return "rgba(242, 204, 96, 0.92)";
  const f = state.filaments[p.f];
  if (state.display.showFaces) {
    const k = displayedFaceK(p.m, f, params);
    return k === null ? "rgba(120, 130, 142, 0.55)" : faceCssColor(k);
  }
  if (state.display.showRegistry) {
    return registryCssColor(f, params.helicityMode);
  }
  return "rgba(201, 215, 231, 0.85)";
}
