import { Rect } from './atlas';

/**
 * "Pelle" dell'auto 3D: le texture su cui si gioca, nello spazio dell'atlante
 * (vedi atlas.ts). Strati, dal basso: fondo grigio → vernice → polvere di
 * carteggiatura → carta della mascheratura con la vernice che ci è finita sopra.
 * Una seconda texture descrive il materiale di ogni punto:
 * R = trasparente lucido, G = ruvidità, B = quanto lo strato copre ciò che sta sotto.
 */

/** Chi c'è in ogni punto dell'atlante, visto da fuori (righe dall'alto verso il basso, RGBA). */
export interface SkinMasks {
  width: number;
  height: number;
  /** R = carrozzeria rivolta verso la proiezione, G = parte da mascherare, B = altro. */
  data: Uint8Array;
}

const PRIMER = 'rgb(104,109,115)';
const BASE_MAT = 'rgb(0,212,0)';
const PAINT_MAT = 'rgb(105,112,255)';
const WET_MAT = 'rgb(215,56,255)';
const GLOSS_MAT = 'rgb(255,20,255)';
const MATTE_MAT = 'rgb(0,246,255)';
const PAPER: [number, number, number] = [205, 187, 140];
const TAPE: [number, number, number] = [236, 223, 178];

/** Griglia grossolana per sapere quanta vernice, polvere e lucido c'è in giro. */
const GW = 128;
const GH = 192;

export interface SkinStats {
  /** Carrozzeria coperta dalla vernice, 0…1. */
  coverage: number;
  /** Vernice lucidata, 0…1 (rispetto a quella stesa). */
  gloss: number;
  /** Polvere rimasta sulla carrozzeria, 0…1. */
  dust: number;
  drips: number;
  grain: number;
  colors: number;
  /** Vetri, fari e cromature sporchi di vernice, 0…1. */
  glass: number;
}

interface Drip {
  u: number;
  v: number;
  /** Fin dove può scendere (bordo inferiore della proiezione). */
  floor: number;
  left: number;
  speed: number;
  r: number;
  color: string;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export class CarSkin {
  /** Texture del colore e del materiale, pronte per il renderer. */
  readonly map: HTMLCanvasElement;
  readonly mat: HTMLCanvasElement;
  /** Cambiate dall'ultimo `consume()`. */
  dirty = true;

  masking = true;

  private w: number;
  private h: number;
  private mctx: CanvasRenderingContext2D;
  private tctx: CanvasRenderingContext2D;
  private paper!: HTMLCanvasElement;
  private paperM!: HTMLCanvasElement;
  private paint: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private paintM: HTMLCanvasElement;
  private pmctx: CanvasRenderingContext2D;
  private dust: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private dustM: HTMLCanvasElement;
  private dmctx: CanvasRenderingContext2D;
  /** Vernice finita sulla carta: se ne va con la mascheratura. */
  private onPaper: HTMLCanvasElement;
  private opctx: CanvasRenderingContext2D;
  /** Vernice su vetri e fari, messa da parte mentre sono coperti dalla carta. */
  private glass: HTMLCanvasElement;
  private gctx: CanvasRenderingContext2D;
  private glassM: HTMLCanvasElement;
  private gmctx: CanvasRenderingContext2D;
  private scratch: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;

  private cov = new Float32Array(GW * GH);
  private wet = new Float32Array(GW * GH);
  private dusty = new Float32Array(GW * GH);
  private shiny = new Float32Array(GW * GH);
  private onGlass = new Float32Array(GW * GH);
  private isBody = new Uint8Array(GW * GH);
  private isMask = new Uint8Array(GW * GH);
  private bodyCells = 1;
  private maskCells = 1;
  private drips: Drip[] = [];
  private dripCount = 0;
  private grainCount = 0;
  private colors = new Set<string>();
  private pending: Box | null = null;
  /** Proiezione su cui si sta lavorando: le passate non escono dal suo rettangolo. */
  private bounds: Rect = { x: 0, y: 0, w: 1, h: 1 };

  /** Le texture hanno le stesse dimensioni delle maschere (larghezza e altezza pari). */
  constructor(masks: SkinMasks) {
    this.w = masks.width;
    this.h = masks.height;
    [this.map, this.mctx] = canvas(this.w, this.h);
    [this.mat, this.tctx] = canvas(this.w / 2, this.h / 2);
    [this.paint, this.pctx] = canvas(this.w, this.h);
    [this.paintM, this.pmctx] = canvas(this.w / 2, this.h / 2);
    [this.dust, this.dctx] = canvas(this.w, this.h);
    [this.dustM, this.dmctx] = canvas(this.w / 2, this.h / 2);
    [this.onPaper, this.opctx] = canvas(this.w, this.h);
    [this.glass, this.gctx] = canvas(this.w, this.h);
    [this.glassM, this.gmctx] = canvas(this.w / 2, this.h / 2);
    [this.scratch, this.sctx] = canvas(this.w, this.h);
    this.bake(masks);
    this.flush({ x0: 0, y0: 0, x1: this.w, y1: this.h });
  }

  /* ---------- attrezzi ---------- */

  /**
   * Sceglie la proiezione su cui lavorano le prossime passate: tutto ciò che
   * viene disegnato resta dentro il suo rettangolo. Va chiusa con `release()`.
   */
  focus(rect: Rect): void {
    this.bounds = rect;
    for (const [ctx, k] of [[this.pctx, 1], [this.dctx, 1], [this.pmctx, 0.5], [this.dmctx, 0.5]] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x * this.w * k, rect.y * this.h * k, rect.w * this.w * k, rect.h * this.h * k);
      ctx.clip();
    }
  }

  release(): void {
    for (const ctx of [this.pctx, this.dctx, this.pmctx, this.dmctx]) ctx.restore();
    this.bounds = { x: 0, y: 0, w: 1, h: 1 };
  }

  /**
   * Spruzza vernice attorno a (u, v). `ru`/`rv` raggio in coordinate texture,
   * `seconds` quanto è durata la spruzzata (serve per le colature).
   * Restituisce cosa è andato storto: 'drip' colatura, 'grain' vernice sulla polvere.
   */
  spray(
    u: number, v: number, ru: number, rv: number, color: string, amount: number, steep: boolean, seconds: number
  ): 'drip' | 'grain' | null {
    const x = u * this.w;
    const y = v * this.h;
    const rx = ru * this.w;
    const ry = rv * this.h;
    this.blob(this.pctx, x, y, rx, ry, color, amount, 'source-over');
    this.blob(this.pmctx, x / 2, y / 2, rx / 2, ry / 2, PAINT_MAT, amount, 'source-over');
    // nebbia di goccioline attorno alla passata
    this.pctx.fillStyle = color;
    this.pmctx.fillStyle = PAINT_MAT;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 0.75 + Math.random() * 0.8;
      const dx = x + Math.cos(a) * rx * d;
      const dy = y + Math.sin(a) * ry * d;
      const r = 0.6 + Math.random() * 1.2;
      this.pctx.globalAlpha = this.pmctx.globalAlpha = 0.5 * amount + 0.15;
      this.pctx.beginPath();
      this.pctx.arc(dx, dy, r, 0, Math.PI * 2);
      this.pctx.fill();
      this.pmctx.beginPath();
      this.pmctx.arc(dx / 2, dy / 2, r / 2 + 0.3, 0, Math.PI * 2);
      this.pmctx.fill();
    }
    this.pctx.globalAlpha = this.pmctx.globalAlpha = 1;
    this.colors.add(color);

    let result: 'drip' | 'grain' | null = null;
    const cell = this.cell(u, v);
    // vernice sopra la polvere: resta la grana
    if (this.dusty[cell] > 0.3) {
      this.pctx.fillStyle = 'rgba(70,60,45,0.55)';
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random());
        this.pctx.beginPath();
        this.pctx.arc(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, 0.7 + Math.random() * 1.3, 0, Math.PI * 2);
        this.pctx.fill();
      }
      this.blob(this.dctx, x, y, rx, ry, '#000', 0.5, 'destination-out');
      this.blob(this.dmctx, x / 2, y / 2, rx / 2, ry / 2, '#000', 0.5, 'destination-out');
      this.spread(this.dusty, u, v, ru, rv, -0.5);
      if (seconds > 0 && Math.random() < 0.06) {
        this.grainCount++;
        result = 'grain';
      }
    }

    this.spread(this.cov, u, v, ru, rv, amount);
    this.spread(this.shiny, u, v, ru, rv, -amount * 0.5);
    if (!this.masking) this.spread(this.onGlass, u, v, ru, rv, amount);
    // chi indugia quasi un secondo su una superficie in piedi fa colare la vernice
    this.spread(this.wet, u, v, ru, rv, seconds * 1.15);
    if (steep && this.wet[cell] > 0.85 && this.isBody[cell]) {
      this.spread(this.wet, u, v, ru, rv, -0.6);
      this.drips.push({
        u: u + (Math.random() - 0.5) * ru * 0.8,
        v,
        floor: this.bounds.y + this.bounds.h,
        left: rv * (1.2 + Math.random() * 2.4),
        speed: rv * (0.8 + Math.random() * 0.9),
        r: Math.max(1.4, rx * (0.07 + Math.random() * 0.05)),
        color
      });
      this.dripCount++;
      result = 'drip';
    }
    this.touch(x, y, rx * 2.4, ry * 2.4);
    return result;
  }

  /** Carteggia: toglie la vernice fino al fondo e lascia polvere. */
  sand(u: number, v: number, ru: number, rv: number, amount: number): void {
    const x = u * this.w;
    const y = v * this.h;
    const rx = ru * this.w;
    const ry = rv * this.h;
    for (const [ctx, k] of [[this.pctx, 1], [this.pmctx, 0.5]] as const) {
      this.blob(ctx, x * k, y * k, rx * k, ry * k, '#000', amount, 'destination-out');
      // graffi: il bordo della zona carteggiata non è mai netto
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = `rgba(0,0,0,${0.35 * amount + 0.1})`;
      ctx.lineWidth = Math.max(0.6, k * 1.3);
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI;
        const ox = (Math.random() - 0.5) * rx * 1.5 * k;
        const oy = (Math.random() - 0.5) * ry * 1.5 * k;
        ctx.beginPath();
        ctx.moveTo(x * k + ox - Math.cos(a) * rx * k, y * k + oy - Math.sin(a) * ry * k);
        ctx.lineTo(x * k + ox + Math.cos(a) * rx * k, y * k + oy + Math.sin(a) * ry * k);
        ctx.stroke();
      }
      ctx.restore();
    }
    // polvere chiara tutt'attorno
    this.blob(this.dctx, x, y, rx * 1.35, ry * 1.35, 'rgb(214,208,192)', amount * 0.5, 'source-over');
    this.blob(this.dmctx, x / 2, y / 2, rx * 0.68, ry * 0.68, MATTE_MAT, amount * 0.6, 'source-over');
    this.spread(this.cov, u, v, ru, rv, -amount);
    this.spread(this.shiny, u, v, ru, rv, -amount);
    this.spread(this.dusty, u, v, ru * 1.35, rv * 1.35, amount * 0.6);
    if (!this.masking) this.spread(this.onGlass, u, v, ru, rv, -amount);
    this.spread(this.wet, u, v, ru, rv, -1);
    this.touch(x, y, rx * 1.6, ry * 1.6);
  }

  /** Panno: porta via la polvere. Restituisce true se ce n'era. */
  wipe(u: number, v: number, ru: number, rv: number, amount: number): boolean {
    const had = this.dusty[this.cell(u, v)] > 0.08;
    const x = u * this.w;
    const y = v * this.h;
    const rx = ru * this.w;
    const ry = rv * this.h;
    this.blob(this.dctx, x, y, rx, ry, '#000', amount, 'destination-out');
    this.blob(this.dmctx, x / 2, y / 2, rx / 2, ry / 2, '#000', amount, 'destination-out');
    this.spread(this.dusty, u, v, ru, rv, -amount);
    this.touch(x, y, rx, ry);
    return had;
  }

  /** Lucidatrice: la vernice diventa a specchio. Restituisce true se c'era vernice da lucidare. */
  polish(u: number, v: number, ru: number, rv: number, amount: number): boolean {
    const cell = this.cell(u, v);
    const had = this.cov[cell] > 0.35;
    const x = u * this.w;
    const y = v * this.h;
    const rx = ru * this.w;
    const ry = rv * this.h;
    // solo dove c'è vernice: il fondo non si lucida
    this.blob(this.pmctx, x / 2, y / 2, rx / 2, ry / 2, GLOSS_MAT, amount, 'source-atop');
    this.blob(this.dctx, x, y, rx, ry, '#000', amount * 0.6, 'destination-out');
    this.blob(this.dmctx, x / 2, y / 2, rx / 2, ry / 2, '#000', amount * 0.6, 'destination-out');
    if (had) this.spread(this.shiny, u, v, ru, rv, amount);
    this.spread(this.dusty, u, v, ru, rv, -amount * 0.6);
    this.touch(x, y, rx, ry);
    return had;
  }

  /** Fa avanzare le colature e asciuga la vernice fresca. Restituisce true se qualcosa si muove. */
  update(dt: number): boolean {
    const dry = Math.exp(-dt * 0.5);
    for (let i = 0; i < this.wet.length; i++) this.wet[i] *= dry;
    if (!this.drips.length) return false;
    for (const d of this.drips) {
      const step = Math.min(d.speed * dt, d.left);
      d.left -= step;
      d.v += step;
      d.u += (Math.random() - 0.5) * 0.0006;
      const cell = this.cell(d.u, d.v);
      // la goccia si ferma dove finisce la lamiera (o il bordo della proiezione)
      if (d.v >= d.floor || !(this.isBody[cell] || this.isMask[cell])) {
        d.left = 0;
        if (d.v >= d.floor) continue;
      }
      const x = d.u * this.w;
      const y = d.v * this.h;
      const r = d.left <= 0 ? d.r * 1.7 : d.r;
      const target = this.masking && this.isMask[cell] ? this.opctx : this.pctx;
      target.fillStyle = d.color;
      target.beginPath();
      target.arc(x, y, r, 0, Math.PI * 2);
      target.fill();
      this.pmctx.fillStyle = WET_MAT;
      this.pmctx.beginPath();
      this.pmctx.arc(x / 2, y / 2, r / 2 + 0.5, 0, Math.PI * 2);
      this.pmctx.fill();
      this.touch(x, y, r + 2, r + 2 + this.h * d.speed * dt);
    }
    this.drips = this.drips.filter(d => d.left > 0);
    return true;
  }

  /**
   * Mette o toglie carta e nastro. Togliendoli se ne va anche la vernice finita
   * sulla carta; rimettendoli, ciò che era già su vetri e fari resta sotto.
   */
  setMasking(on: boolean): void {
    if (on === this.masking) return;
    this.masking = on;
    const full: Box = { x0: 0, y0: 0, x1: this.w, y1: this.h };
    if (on) {
      // la vernice già su vetri e fari viene messa da parte, sotto la carta
      this.keepMasked(this.gctx, this.paint, this.paper);
      this.keepMasked(this.gmctx, this.paintM, this.paperM);
      this.eraseMasked(this.pctx, this.paper, full);
      this.eraseMasked(this.pmctx, this.paperM, { x0: 0, y0: 0, x1: this.w / 2, y1: this.h / 2 });
    } else {
      this.opctx.clearRect(0, 0, this.w, this.h);
      this.pctx.drawImage(this.glass, 0, 0);
      this.pmctx.drawImage(this.glassM, 0, 0);
      this.gctx.clearRect(0, 0, this.w, this.h);
      this.gmctx.clearRect(0, 0, this.w / 2, this.h / 2);
    }
    this.flush(full);
  }

  /** Ricomincia dal fondo grigio, con la mascheratura. */
  reset(): void {
    for (const ctx of [this.pctx, this.pmctx, this.dctx, this.dmctx, this.opctx, this.gctx, this.gmctx]) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    for (const g of [this.cov, this.wet, this.dusty, this.shiny, this.onGlass]) g.fill(0);
    this.drips = [];
    this.dripCount = this.grainCount = 0;
    this.colors.clear();
    this.masking = true;
    this.flush({ x0: 0, y0: 0, x1: this.w, y1: this.h });
  }

  stats(): SkinStats {
    let cov = 0;
    let gloss = 0;
    let dust = 0;
    let glass = 0;
    for (let i = 0; i < this.cov.length; i++) {
      if (this.isMask[i]) glass += this.onGlass[i];
      if (!this.isBody[i]) continue;
      cov += this.cov[i];
      gloss += Math.min(this.shiny[i], this.cov[i]);
      dust += this.dusty[i];
    }
    return {
      coverage: cov / this.bodyCells,
      gloss: cov > 1 ? gloss / cov : 0,
      dust: dust / this.bodyCells,
      drips: this.dripCount,
      grain: this.grainCount,
      colors: this.colors.size,
      glass: glass / this.maskCells
    };
  }

  /** Ricompone le zone toccate. Restituisce true se le texture vanno ricaricate. */
  consume(): boolean {
    if (this.pending) {
      this.flush(this.pending);
      this.pending = null;
    }
    const was = this.dirty;
    this.dirty = false;
    return was;
  }

  /* ---------- interni ---------- */

  private cell(u: number, v: number): number {
    const i = Math.min(GW - 1, Math.max(0, Math.floor(u * GW)));
    const j = Math.min(GH - 1, Math.max(0, Math.floor(v * GH)));
    return j * GW + i;
  }

  /** Aggiunge `amount` (anche negativo) alle celle sotto la passata, tra 0 e 1. */
  private spread(grid: Float32Array, u: number, v: number, ru: number, rv: number, amount: number): void {
    if (!amount) return;
    const b = this.bounds;
    const i0 = Math.max(0, Math.floor(Math.max(u - ru, b.x) * GW));
    const i1 = Math.min(GW - 1, Math.floor(Math.min(u + ru, b.x + b.w) * GW));
    const j0 = Math.max(0, Math.floor(Math.max(v - rv, b.y) * GH));
    const j1 = Math.min(GH - 1, Math.floor(Math.min(v + rv, b.y + b.h) * GH));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = ((i + 0.5) / GW - u) / ru;
        const dy = ((j + 0.5) / GH - v) / rv;
        const f = 1 - (dx * dx + dy * dy);
        if (f <= 0) continue;
        const k = j * GW + i;
        grid[k] = Math.min(1, Math.max(0, grid[k] + amount * f));
      }
    }
  }

  private blob(
    ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number,
    color: string, alpha: number, op: GlobalCompositeOperation
  ): void {
    if (rx <= 0 || ry <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = Math.min(Math.max(alpha, 0), 1);
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    // il bordo sfuma verso trasparente dello stesso colore
    ctx.fillStyle = fade(ctx, color, rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Segna come "da ricomporre" la zona toccata, senza uscire dalla proiezione in uso. */
  private touch(x: number, y: number, rx: number, ry: number): void {
    const b = this.bounds;
    const r: Box = {
      x0: Math.max(x - rx - 3, b.x * this.w),
      y0: Math.max(y - ry - 3, b.y * this.h),
      x1: Math.min(x + rx + 3, (b.x + b.w) * this.w),
      y1: Math.min(y + ry + 3, (b.y + b.h) * this.h)
    };
    if (r.x1 <= r.x0 || r.y1 <= r.y0) return;
    const p = this.pending;
    this.pending = p
      ? { x0: Math.min(p.x0, r.x0), y0: Math.min(p.y0, r.y0), x1: Math.max(p.x1, r.x1), y1: Math.max(p.y1, r.y1) }
      : r;
  }

  /** Ricompone gli strati dentro il rettangolo e protegge le zone mascherate. */
  private flush(r: Box): void {
    const x = Math.max(0, Math.floor(r.x0 / 2) * 2);
    const y = Math.max(0, Math.floor(r.y0 / 2) * 2);
    const w = Math.min(this.w, Math.ceil(r.x1 / 2) * 2) - x;
    const h = Math.min(this.h, Math.ceil(r.y1 / 2) * 2) - y;
    if (w <= 0 || h <= 0) return;
    const hx = x / 2;
    const hy = y / 2;
    const hw = w / 2;
    const hh = h / 2;

    if (this.masking) {
      // la vernice finita sulla carta resta sulla carta…
      const sc = this.sctx;
      sc.save();
      sc.beginPath();
      sc.rect(x, y, w, h);
      sc.clip();
      sc.clearRect(x, y, w, h);
      sc.drawImage(this.paint, x, y, w, h, x, y, w, h);
      sc.globalCompositeOperation = 'destination-in';
      sc.drawImage(this.paper, x, y, w, h, x, y, w, h);
      sc.restore();
      this.opctx.drawImage(this.scratch, x, y, w, h, x, y, w, h);
      // …e sotto non arriva niente
      const rect: Box = { x0: x, y0: y, x1: x + w, y1: y + h };
      const half: Box = { x0: hx, y0: hy, x1: hx + hw, y1: hy + hh };
      this.eraseMasked(this.pctx, this.paper, rect);
      this.eraseMasked(this.dctx, this.paper, rect);
      this.eraseMasked(this.pmctx, this.paperM, half);
      this.eraseMasked(this.dmctx, this.paperM, half);
    }

    const m = this.mctx;
    m.fillStyle = PRIMER;
    m.fillRect(x, y, w, h);
    m.drawImage(this.paint, x, y, w, h, x, y, w, h);
    m.drawImage(this.dust, x, y, w, h, x, y, w, h);
    if (this.masking) {
      m.drawImage(this.paper, x, y, w, h, x, y, w, h);
      m.drawImage(this.onPaper, x, y, w, h, x, y, w, h);
    }

    const t = this.tctx;
    t.fillStyle = BASE_MAT;
    t.fillRect(hx, hy, hw, hh);
    t.drawImage(this.paintM, hx, hy, hw, hh, hx, hy, hw, hh);
    t.drawImage(this.dustM, hx, hy, hw, hh, hx, hy, hw, hh);
    if (this.masking) t.drawImage(this.paperM, hx, hy, hw, hh, hx, hy, hw, hh);
    this.dirty = true;
  }

  /** Toglie da `ctx` tutto ciò che sta sotto la mascheratura, dentro il rettangolo. */
  private eraseMasked(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement, r: Box): void {
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mask, r.x0, r.y0, w, h, r.x0, r.y0, w, h);
    ctx.restore();
  }

  /** Copia in `ctx` solo la parte di `source` che sta sotto la mascheratura. */
  private keepMasked(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, mask: HTMLCanvasElement): void {
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
  }

  /** Dalla maschera ricava la carta (con il nastro lungo i bordi) e le celle da contare. */
  private bake(masks: SkinMasks): void {
    const W = this.w;
    const H = this.h;
    const src = masks.data;
    const paper = new ImageData(W, H);
    const paperM = new ImageData(W, H);
    const masked = (px: number, py: number) => px >= 0 && py >= 0 && px < W && py < H && src[(py * W + px) * 4 + 1] > 127;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        if (!masked(px, py)) continue;
        // nastro più chiaro dove la carta confina con la lamiera
        const edge = !masked(px - 3, py) || !masked(px + 3, py) || !masked(px, py - 3) || !masked(px, py + 3);
        const c = edge ? TAPE : PAPER;
        const n = edge ? 0 : ((px * 7 + py * 13) % 23) - 11;
        const o = (py * W + px) * 4;
        paper.data[o] = c[0] + n;
        paper.data[o + 1] = c[1] + n;
        paper.data[o + 2] = c[2] + n;
        paper.data[o + 3] = 255;
        paperM.data[o + 1] = 238;
        paperM.data[o + 2] = 255;
        paperM.data[o + 3] = 255;
      }
    }
    let ctx: CanvasRenderingContext2D;
    [this.paper, ctx] = canvas(W, H);
    ctx.putImageData(paper, 0, 0);
    const [full, fctx] = canvas(W, H);
    fctx.putImageData(paperM, 0, 0);
    [this.paperM, ctx] = canvas(W / 2, H / 2);
    ctx.drawImage(full, 0, 0, W / 2, H / 2);

    // celle per le statistiche
    this.bodyCells = 0;
    this.maskCells = 0;
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const o = (Math.floor(((j + 0.5) / GH) * H) * W + Math.floor(((i + 0.5) / GW) * W)) * 4;
        const body = src[o] > 127;
        const mask = src[o + 1] > 127;
        this.isBody[j * GW + i] = body ? 1 : 0;
        this.isMask[j * GW + i] = mask ? 1 : 0;
        if (body) this.bodyCells++;
        if (mask) this.maskCells++;
      }
    }
    this.bodyCells = Math.max(1, this.bodyCells);
    this.maskCells = Math.max(1, this.maskCells);
  }
}

const fades = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();

/** Sfumatura radiale colore pieno → trasparente (in cache per contesto, colore e raggio). */
function fade(ctx: CanvasRenderingContext2D, color: string, r: number): CanvasGradient {
  let byCtx = fades.get(ctx);
  if (!byCtx) fades.set(ctx, (byCtx = new Map()));
  const key = `${color}|${r.toFixed(1)}`;
  let g = byCtx.get(key);
  if (!g) {
    if (byCtx.size > 60) byCtx.clear();
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const clear = transparent(color);
    g.addColorStop(0, color);
    g.addColorStop(0.45, color);
    g.addColorStop(1, clear);
    byCtx.set(key, g);
  }
  return g;
}

/** Stesso colore con alfa zero (evita aloni scuri sul bordo della sfumatura). */
function transparent(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
  }
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
  return rgb ? `rgba(${rgb[1]},${rgb[2]},${rgb[3]},0)` : 'rgba(0,0,0,0)';
}
