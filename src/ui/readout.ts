import { currentAbpEffective } from "../model/abp";
import { persistenceLengthMicrons } from "../model/constants";
import { displayedFaceK } from "../model/hex";
import type { Params, SimulationState, SweepSample } from "../model/types";
import { angleCssColor, angleLegendStops, faceCssColor, registryCssColor } from "../render/color";
import { scoreRegistries } from "../simulation/registry";

export function crosslinkerCount(state: SimulationState): number {
  if (state.pairLinkCount.size > 0) {
    let count = 0;
    for (const n of state.pairLinkCount.values()) count += n;
    return count;
  }
  return state.crosslinks.length;
}

export function filamentCrosslinkMonomers(state: SimulationState, filamentId: number): number[] {
  if (filamentId < 0) return [];
  const monomers = new Set<number>();

  for (const [ia, ib] of state.crosslinks) {
    const a = state.beads[ia];
    const b = state.beads[ib];
    if (a?.f === filamentId && a.m >= 0) monomers.add(a.m);
    if (b?.f === filamentId && b.m >= 0) monomers.add(b.m);
  }

  for (let i = state.nBackboneBonds; i < state.bonds.length; i++) {
    const [ia, ib] = state.bonds[i];
    const a = state.beads[ia];
    const b = state.beads[ib];
    if (a?.f === filamentId && a.m >= 0) monomers.add(a.m);
    if (b?.f === filamentId && b.m >= 0) monomers.add(b.m);
  }

  return [...monomers].sort((a, b) => a - b);
}

function compactNumberList(values: number[], maxItems = 24): string {
  if (values.length <= maxItems) return values.join(", ");
  const head = values.slice(0, maxItems).join(", ");
  return `${head}, ...`;
}

function selectedFilamentInfo(state: SimulationState, params: Params): string {
  const filamentId = state.display.highlightedFilamentId;
  if (filamentId < 0) return "";
  const filament = state.filaments[filamentId];
  if (!filament) return "";

  const monomers = filamentCrosslinkMonomers(state, filamentId);
  if (!monomers.length) {
    return `<br>selected filament ${filamentId} (q=${filament.q}, r=${filament.r}): no crosslinks`;
  }

  const spacingMonomers = monomers.slice(1).map((m, i) => m - monomers[i]);
  const spacingNm = spacingMonomers.map((dm) => dm * params.b);
  const spacingCopy = spacingMonomers.length
    ? ` · spacing Δm=${compactNumberList(spacingMonomers)} (${compactNumberList(
        spacingNm.map((v) => Number(v.toFixed(1))),
      )} nm)`
    : "";

  return `<br>selected filament ${filamentId} (q=${filament.q}, r=${filament.r}): ${
    monomers.length
  } crosslink site${monomers.length === 1 ? "" : "s"} · m=${compactNumberList(monomers)}${spacingCopy}`;
}

export function renderLegend(legend: HTMLElement, state: SimulationState, params: Params): void {
  const frame = legend.closest<HTMLElement>(".legend-frame") ?? legend;
  if (!state.display.showFaces && !state.display.showFaceArrows && !state.display.showRegistry) {
    legend.innerHTML = "";
    frame.style.display = "none";
    return;
  }
  frame.style.display = "";
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
  const arrowCopy =
    params.helicityMode === "continuous"
      ? "Face arrows are 2 nm markers at the exact helical face angle."
      : "Face arrows are 2 nm markers on active 12-state faces.";
  let html = "<strong>Angle color</strong><br>";
  html += `<div class="angle-ramp" style="background:linear-gradient(90deg, ${rampStops})"></div>`;
  html += '<div class="angle-labels"><span>0°</span><span>120°</span><span>240°</span><span>360°</span></div>';
  html += `<div class="legend-section"><strong>Directions</strong><br>${labels}</div>`;
  if (state.display.showRegistry) html += `<div class="legend-note">${registryCopy}</div>`;
  if (state.display.showFaces) html += `<div class="legend-note">${faceCopy}</div>`;
  if (state.display.showFaceArrows) html += `<div class="legend-note">${arrowCopy}</div>`;
  legend.innerHTML = html;
}

export function renderReadout(readout: HTMLElement, state: SimulationState, params: Params): void {
  const e = state.energy;
  const total = Object.values(e).reduce((a, b) => a + b, 0);
  const sc = scoreRegistries(state, params);
  const zeroPairs = sc.zero;
  const status = state.running ? "running" : "paused";
  const filamentInfo = selectedFilamentInfo(state, params);
  const nCrosslinkers = crosslinkerCount(state);
  const nActinMonomers = Math.max(0, state.nFilamentBeads);
  const crosslinkerActinRatio = nActinMonomers > 0 ? nCrosslinkers / nActinMonomers : 0;

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
          return `<br>EI ≈ ${EI.toFixed(0)} pN·nm² (Lp ≈ ${persistenceLengthMicrons(EI).toFixed(2)} µm)`;
        })()
      : "";

  readout.innerHTML = `
    <strong>${status}</strong> · frame ${state.frame}<br>
    beads ${state.beads.length.toLocaleString()} · filaments ${state.filaments.length}
    · pairs ${state.neighborPairs.length}<br>
    crosslinkers: <strong>${nCrosslinkers.toLocaleString()}</strong>
    (sat=${(params.sat * 100).toFixed(0)}%) · crosslinker/actin=${crosslinkerActinRatio.toFixed(4)}
    (${(crosslinkerActinRatio * 100).toFixed(2)}%)<br>
    compat. sites/pair: avg ${sc.avg.toFixed(2)} ± ${sc.std.toFixed(2)},
    <span class="${zeroPairs > 0 ? "warn" : "good"}">empty pairs ${zeroPairs}/${sc.pairs}</span><br>
    ABP: ${currentAbpEffective(params).label} · L₀=${params.clDist.toFixed(1)} nm · k<sub>cl</sub>=${params.kcl.toFixed(0)} pN/nm<br>
    contour ${((params.monomers - 1) * params.b).toFixed(0)} nm
    · 12-pitch ${(12 * params.b).toFixed(1)} nm
    ${filamentInfo}
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
  const lpStr = Number.isFinite(eiSlope) ? `${persistenceLengthMicrons(eiSlope).toFixed(2)} µm` : "—";
  const eiStr = Number.isFinite(eiSlope) ? `${eiSlope.toFixed(0)} pN·nm²` : "—";
  const rows = samples
    .map((s) => {
      const lpRow = Number.isFinite(s.ei) ? persistenceLengthMicrons(s.ei).toFixed(2) : "";
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
