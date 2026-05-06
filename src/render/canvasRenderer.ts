import type { BeadMeta, Params, ProjectedPoint, Renderer, SimulationState, Vec3 } from "../model/types";
import { displayedFaceK } from "../model/hex";
import { defaultView } from "../simulation/state";
import { clamp, faceCssColor, registryCssColor, registryHue } from "./color";

type DrawObject =
  | { type: "crosslink"; z: number; a: ProjectedPoint; b: ProjectedPoint }
  | { type: "bond"; z: number; a: ProjectedPoint; b: ProjectedPoint; color: string }
  | { type: "bead"; z: number; p: ProjectedPoint; bead: BeadMeta; idx: number };

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

    for (const [ia, ib] of this.state.crosslinks) {
      const a = projected[ia];
      const b = projected[ib];
      objects.push({ type: "crosslink", z: 0.5 * (a.z + b.z), a, b });
    }

    if (this.state.display.showFilaments) {
      for (const [ia, ib] of this.state.bonds) {
        const a = projected[ia];
        const b = projected[ib];
        const ba = this.state.beads[ia];
        const bb = this.state.beads[ib];
        const color = ba.isInternal || bb.isInternal ? "rgba(242, 204, 96, 0.65)" : this.bondColor(ba);
        objects.push({ type: "bond", z: 0.5 * (a.z + b.z), a, b, color });
      }
    }

    for (let i = 0; i < projected.length; i++) {
      objects.push({ type: "bead", z: projected[i].z, p: projected[i], bead: this.state.beads[i], idx: i });
    }
    objects.sort((u, v) => u.z - v.z);

    for (const obj of objects) {
      if (obj.type === "crosslink") {
        const alpha = clamp(0.3 + 0.0025 * (obj.z + 120), 0.18, 0.7);
        this.ctx.strokeStyle = `rgba(242, 204, 96, ${alpha})`;
        this.ctx.lineWidth = 1.4;
        this.line(obj.a, obj.b);
      } else if (obj.type === "bond") {
        this.ctx.strokeStyle = obj.color;
        this.ctx.lineWidth = 1.6;
        this.line(obj.a, obj.b);
      } else {
        const radius = obj.idx === this.state.grabbedBead ? 5.2 : 2.7;
        this.ctx.fillStyle = this.beadColor(obj.bead);
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

  private beadColor(p: BeadMeta): string {
    if (p.isInternal) return "rgba(242, 204, 96, 0.92)";
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

  private bondColor(p: BeadMeta): string {
    if (p.isInternal) return "rgba(242, 204, 96, 0.65)";
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
