import type { BeadMeta, Params, ProjectedPoint, Renderer, SimulationState, Vec3 } from "../model/types";
import { displayedFaceAngleDeg, displayedFaceK } from "../model/hex";
import { defaultView } from "../simulation/state";
import { clamp, faceCssColor, registryCssColor, registryHue } from "./color";

const FACE_ARROW_LENGTH_NM = 2;

type DrawObject =
  | { type: "crosslink"; z: number; a: ProjectedPoint; b: ProjectedPoint; highlighted: boolean }
  | { type: "bond"; z: number; a: ProjectedPoint; b: ProjectedPoint; color: string; width: number }
  | { type: "faceArrow"; z: number; a: ProjectedPoint; b: ProjectedPoint; color: string }
  | { type: "polarityArrow"; z: number; a: ProjectedPoint; b: ProjectedPoint; color: string }
  | { type: "bead"; z: number; p: ProjectedPoint; bead: BeadMeta; idx: number };

interface HighlightTopology {
  active: boolean;
  filamentId: number;
  crosslinkBeads: Set<number>;
  crosslinkBonds: Set<number>;
}

export class CanvasRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: SimulationState,
    private readonly params: Params,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D renderer unavailable.");
    this.ctx = ctx;
    console.log("Using canvas-2D renderer.");
  }

  init(): void {
    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  rebuildTopology(): void {
    // Canvas rendering reads topology arrays directly each frame.
  }

  markColorsDirty(): void {
    // Canvas colors are calculated during draw.
  }

  fitView(resetOrientation = false): void {
    if (!this.state.beads.length) return;
    if (resetOrientation) {
      this.state.view.rotX = defaultView.rotX;
      this.state.view.rotY = defaultView.rotY;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of this.state.beads) {
      const r = this.rotatePoint(p.x, p.y, p.z);
      if (r.x < minX) minX = r.x;
      if (r.x > maxX) maxX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.y > maxY) maxY = r.y;
    }

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const padX = Math.max(38, rect.width * 0.1);
    const padY = Math.max(38, rect.height * 0.12);
    const zoomX = (rect.width - 2 * padX) / spanX;
    const zoomY = (rect.height - 2 * padY) / spanY;
    this.state.view.zoom = clamp(Math.min(zoomX, zoomY), 0.4, 24.0);

    const midX = 0.5 * (minX + maxX);
    const midY = 0.5 * (minY + maxY);
    this.state.view.panX = -this.state.view.zoom * midX - Math.min(84, rect.width * 0.08);
    this.state.view.panY = this.state.view.zoom * midY;
  }

  rotatePoint(x: number, y: number, z: number): Vec3 {
    const cx = Math.cos(this.state.view.rotX);
    const sx = Math.sin(this.state.view.rotX);
    const cy = Math.cos(this.state.view.rotY);
    const sy = Math.sin(this.state.view.rotY);
    const x1 = cy * x + sy * z;
    const z1 = -sy * x + cy * z;
    const y2 = cx * y - sx * z1;
    const z2 = sx * y + cx * z1;
    return { x: x1, y: y2, z: z2 };
  }

  project(p: Vec3): ProjectedPoint {
    const r = this.rotatePoint(p.x, p.y, p.z);
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.state.view.zoom;
    return {
      x: rect.width / 2 + this.state.view.panX + scale * r.x,
      y: rect.height / 2 + this.state.view.panY - scale * r.y,
      z: r.z,
    };
  }

  draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    const bg = this.ctx.createLinearGradient(0, 0, rect.width, rect.height);
    bg.addColorStop(0, "#0d1117");
    bg.addColorStop(1, "#111827");
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, rect.width, rect.height);

    const projected = this.state.beads.map((p) => this.project(p));
    const objects: DrawObject[] = [];
    const highlight = this.highlightTopology();

    for (const [ia, ib] of this.state.crosslinks) {
      const a = projected[ia];
      const b = projected[ib];
      const highlighted = this.beadOnHighlightedFilament(ia, highlight) || this.beadOnHighlightedFilament(ib, highlight);
      if (highlighted) {
        highlight.crosslinkBeads.add(ia);
        highlight.crosslinkBeads.add(ib);
      }
      objects.push({ type: "crosslink", z: 0.5 * (a.z + b.z), a, b, highlighted });
    }

    if (this.state.display.showFilaments) {
      for (let i = 0; i < this.state.bonds.length; i++) {
        const [ia, ib] = this.state.bonds[i];
        const a = projected[ia];
        const b = projected[ib];
        const ba = this.state.beads[ia];
        const bb = this.state.beads[ib];
        const isSelectedBackbone =
          i < this.state.nBackboneBonds && ba.f === highlight.filamentId && bb.f === highlight.filamentId;
        const isSelectedCrosslinker = highlight.crosslinkBonds.has(i);
        const color = isSelectedCrosslinker
          ? "rgba(255, 221, 118, 0.98)"
          : ba.isInternal || bb.isInternal
            ? this.dimIfUnselected("rgba(242, 204, 96, 0.65)", highlight, false)
            : this.bondColor(ba, highlight, isSelectedBackbone);
        const width = isSelectedCrosslinker ? 2.8 : isSelectedBackbone ? 2.5 : highlight.active ? 1.0 : 1.6;
        objects.push({ type: "bond", z: 0.5 * (a.z + b.z), a, b, color, width });
      }
    }

    if (this.state.display.showFilaments) {
      const monomers = this.params.monomers;
      for (const filament of this.state.filaments) {
        // Pick the two beads farthest along the +m direction so the arrow head
        // sits at the filament's "+ end" (where polarity = 1 points).
        const lastIdx = filament.id * monomers + (monomers - 1);
        const prevIdx = filament.id * monomers + Math.max(0, monomers - 2);
        const lastBead = this.state.beads[lastIdx];
        const prevBead = this.state.beads[prevIdx];
        if (!lastBead || !prevBead) continue;
        const headBead = filament.polarity === 1 ? lastBead : this.state.beads[filament.id * monomers];
        const tailBead = filament.polarity === 1
          ? prevBead
          : this.state.beads[filament.id * monomers + Math.min(1, monomers - 1)];
        if (!headBead || !tailBead) continue;
        const tail = this.project(tailBead);
        const head = this.project(headBead);
        objects.push({
          type: "polarityArrow",
          z: 0.5 * (tail.z + head.z),
          a: tail,
          b: head,
          color: filament.polarity === 1
            ? "rgba(118, 229, 255, 0.85)"
            : "rgba(255, 153, 153, 0.85)",
        });
      }
    }

    if (this.state.display.showFaceArrows) {
      for (const bead of this.state.beads) {
        if (bead.isInternal) continue;
        const filament = this.state.filaments[bead.f];
        const angleDeg = displayedFaceAngleDeg(bead.m, filament, this.params);
        if (angleDeg === null) continue;
        const angleRad = (angleDeg * Math.PI) / 180;
        const a = this.project(bead);
        const b = this.project({
          x: bead.x + FACE_ARROW_LENGTH_NM * Math.cos(angleRad),
          y: bead.y + FACE_ARROW_LENGTH_NM * Math.sin(angleRad),
          z: bead.z,
        });
        objects.push({
          type: "faceArrow",
          z: 0.5 * (a.z + b.z),
          a,
          b,
          color: `hsla(${angleDeg.toFixed(0)}, 78%, 70%, 0.9)`,
        });
      }
    }

    for (let i = 0; i < projected.length; i++) {
      objects.push({ type: "bead", z: projected[i].z, p: projected[i], bead: this.state.beads[i], idx: i });
    }
    objects.sort((u, v) => u.z - v.z);

    for (const obj of objects) {
      if (obj.type === "crosslink") {
        const alpha = obj.highlighted ? 0.95 : clamp(0.3 + 0.0025 * (obj.z + 120), 0.08, 0.7);
        this.ctx.strokeStyle = obj.highlighted
          ? `rgba(255, 237, 164, ${alpha})`
          : `rgba(242, 204, 96, ${highlight.active ? Math.min(alpha, 0.16) : alpha})`;
        this.ctx.lineWidth = obj.highlighted ? 2.8 : highlight.active ? 0.8 : 1.4;
        this.line(obj.a, obj.b);
      } else if (obj.type === "bond") {
        this.ctx.strokeStyle = obj.color;
        this.ctx.lineWidth = obj.width;
        this.line(obj.a, obj.b);
      } else if (obj.type === "faceArrow") {
        this.ctx.strokeStyle = obj.color;
        this.ctx.fillStyle = obj.color;
        this.ctx.lineWidth = 1.15;
        this.arrow(obj.a, obj.b);
      } else if (obj.type === "polarityArrow") {
        this.ctx.strokeStyle = obj.color;
        this.ctx.fillStyle = obj.color;
        this.ctx.lineWidth = 1.5;
        this.arrow(obj.a, obj.b);
      } else {
        const selected = obj.bead.f === highlight.filamentId;
        const crosslinker = highlight.crosslinkBeads.has(obj.idx);
        const radius =
          obj.idx === this.state.grabbedBead ? 5.2 : selected ? 4.5 : crosslinker ? 4.0 : 2.7;
        this.ctx.fillStyle = this.beadColor(obj.bead, highlight, crosslinker);
        this.ctx.beginPath();
        this.ctx.arc(obj.p.x, obj.p.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.drawAxes(rect);
  }

  private line(a: ProjectedPoint, b: ProjectedPoint): void {
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(b.x, b.y);
    this.ctx.stroke();
  }

  private arrow(a: ProjectedPoint, b: ProjectedPoint): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    this.line(a, b);
    if (len < 1) return;

    const headLength = clamp(len * 0.45, 2.2, 5.0);
    const angle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;
    this.ctx.beginPath();
    this.ctx.moveTo(b.x, b.y);
    this.ctx.lineTo(b.x - headLength * Math.cos(angle - spread), b.y - headLength * Math.sin(angle - spread));
    this.ctx.lineTo(b.x - headLength * Math.cos(angle + spread), b.y - headLength * Math.sin(angle + spread));
    this.ctx.closePath();
    this.ctx.fill();
  }

  private highlightTopology(): HighlightTopology {
    const filamentId = this.state.display.highlightedFilamentId;
    const highlight: HighlightTopology = {
      active: filamentId >= 0,
      filamentId,
      crosslinkBeads: new Set<number>(),
      crosslinkBonds: new Set<number>(),
    };
    if (!highlight.active) return highlight;

    const linkerAdj = new Map<number, { other: number; bondIndex: number }[]>();
    for (let i = this.state.nBackboneBonds; i < this.state.bonds.length; i++) {
      const [ia, ib] = this.state.bonds[i];
      const aEdges = linkerAdj.get(ia) ?? [];
      aEdges.push({ other: ib, bondIndex: i });
      linkerAdj.set(ia, aEdges);
      const bEdges = linkerAdj.get(ib) ?? [];
      bEdges.push({ other: ia, bondIndex: i });
      linkerAdj.set(ib, bEdges);
    }

    const queue: number[] = [];
    for (let i = 0; i < this.state.nFilamentBeads; i++) {
      if (this.state.beads[i]?.f === filamentId) queue.push(i);
    }

    const seen = new Set(queue);
    while (queue.length) {
      const beadIdx = queue.shift() ?? -1;
      const edges = linkerAdj.get(beadIdx) ?? [];
      for (const { other, bondIndex } of edges) {
        const [ia, ib] = this.state.bonds[bondIndex];
        highlight.crosslinkBonds.add(bondIndex);
        highlight.crosslinkBeads.add(ia);
        highlight.crosslinkBeads.add(ib);
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    return highlight;
  }

  private beadOnHighlightedFilament(idx: number, highlight: HighlightTopology): boolean {
    return highlight.active && this.state.beads[idx]?.f === highlight.filamentId;
  }

  private dimIfUnselected(color: string, highlight: HighlightTopology, selected: boolean): string {
    return highlight.active && !selected ? "rgba(106, 116, 128, 0.22)" : color;
  }

  private beadColor(p: BeadMeta, highlight: HighlightTopology, crosslinker: boolean): string {
    if (p.isInternal) {
      return crosslinker ? "rgba(255, 221, 118, 0.98)" : this.dimIfUnselected("rgba(242, 204, 96, 0.92)", highlight, false);
    }
    const selected = p.f === highlight.filamentId;
    if (selected) return "rgba(118, 229, 255, 0.98)";
    if (crosslinker) return "rgba(255, 221, 118, 0.98)";
    if (highlight.active) return "rgba(105, 116, 129, 0.32)";
    const f = this.state.filaments[p.f];
    if (this.state.display.showFaces) {
      const k = displayedFaceK(p.m, f, this.params);
      if (k === null) return "rgba(120, 130, 142, 0.55)";
      return faceCssColor(k);
    }
    if (this.state.display.showRegistry) {
      return registryCssColor(f, this.params.helicityMode);
    }
    return "rgba(201, 215, 231, 0.85)";
  }

  private bondColor(p: BeadMeta, highlight: HighlightTopology, selected: boolean): string {
    if (p.isInternal) return "rgba(242, 204, 96, 0.65)";
    if (selected) return "rgba(118, 229, 255, 0.92)";
    if (highlight.active) return "rgba(88, 166, 255, 0.18)";
    if (this.state.display.showRegistry) {
      const filament = this.state.filaments[p.f];
      const hue = registryHue(filament, this.params.helicityMode);
      return `hsla(${hue.toFixed(0)}, 50%, 60%, 0.55)`;
    }
    return "rgba(88, 166, 255, 0.55)";
  }

  private drawAxes(rect: DOMRect): void {
    const origin = { x: 56, y: rect.height - 58, z: 0 };
    const axes: [string, number, number, number][] = [
      ["x", 30, 0, 0],
      ["y", 0, 30, 0],
      ["z", 0, 0, 30],
    ];
    this.ctx.font = "12px ui-sans-serif, system-ui";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    for (const [label, x, y, z] of axes) {
      const r = this.rotatePoint(x, y, z);
      this.ctx.strokeStyle = "rgba(157, 167, 179, 0.75)";
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(origin.x, origin.y);
      this.ctx.lineTo(origin.x + r.x, origin.y - r.y);
      this.ctx.stroke();
      this.ctx.fillStyle = "rgba(230, 237, 243, 0.85)";
      this.ctx.fillText(label, origin.x + r.x * 1.18, origin.y - r.y * 1.18);
    }
  }
}
