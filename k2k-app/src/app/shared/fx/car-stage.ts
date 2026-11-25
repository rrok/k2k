import { CAR, drawGlassShine, drawLamps, drawPaint, drawParts, drawShine, drawWells, drawWheel } from './car-art';

/** Margine orizzontale attorno all'auto, in unità di disegno (bagliore dei fari). */
const PAD = 40;

/**
 * Disegna l'auto illustrata con riflesso sul pavimento e ombra.
 * La carrozzeria e i dettagli fissi stanno su livelli fuori schermo: a ogni
 * fotogramma si ridisegnano solo i riflessi dei neon.
 */
export class CarStage {
  private k = 0;
  private base = document.createElement('canvas');
  private parts = document.createElement('canvas');
  private out = document.createElement('canvas');

  constructor(private color: string) {}

  get ready(): boolean {
    return this.k > 0;
  }

  /** Ridimensiona i livelli: `width` larghezza dell'auto in px CSS. */
  resize(width: number, dpr: number): void {
    const k = (width * dpr) / CAR.w;
    if (Math.abs(k - this.k) < 0.002) return;
    this.k = k;
    for (const c of [this.base, this.parts, this.out]) {
      c.width = Math.ceil((CAR.w + PAD * 2) * k);
      c.height = Math.ceil(CAR.h * k);
    }
    const b = this.units(this.base);
    drawWells(b);
    drawPaint(b, this.color);
    const p = this.units(this.parts);
    drawParts(p);
    for (const wheel of CAR.wheels) drawWheel(p, wheel.x, wheel.y);
  }

  /**
   * Disegna l'auto: (x, y) angolo in alto a sinistra, `w` larghezza.
   * `shine` −1…1 sposta i riflessi dei neon sulla fiancata.
   */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, shine: number): void {
    if (!this.k) return;
    const car = this.compose(shine);
    const s = w / CAR.w;
    const pad = PAD * s;
    const h = CAR.h * s;
    const ground = y + CAR.ground * s;

    // Riflesso sul pavimento lucido, che sfuma verso il basso
    const depth = h * 0.46;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - pad, ground, w + pad * 2, depth);
    ctx.clip();
    ctx.globalAlpha = 0.3;
    ctx.translate(0, ground * 2);
    ctx.scale(1, -1);
    ctx.drawImage(car, x - pad, y, w + pad * 2, h);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const fade = ctx.createLinearGradient(0, ground, 0, ground + depth);
    fade.addColorStop(0, 'rgba(0,0,0,0.15)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(x - pad, ground, w + pad * 2, depth + 1);
    ctx.restore();

    // Ombra a terra: larga sotto la scocca, netta sotto le ruote
    ctx.save();
    ctx.translate(x + w * 0.5, ground);
    ctx.scale(1, 0.085);
    const shadow = ctx.createRadialGradient(0, 0, w * 0.08, 0, 0, w * 0.52);
    shadow.addColorStop(0, 'rgba(0,0,0,0.9)');
    shadow.addColorStop(0.7, 'rgba(0,0,0,0.55)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    for (const wheel of CAR.wheels) {
      ctx.save();
      ctx.translate(x + wheel.x * s, ground);
      ctx.scale(1, 0.16);
      const reach = CAR.wheelR * 1.12 * s;
      const contact = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
      contact.addColorStop(0, 'rgba(0,0,0,0.95)');
      contact.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = contact;
      ctx.beginPath();
      ctx.arc(0, 0, reach, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.drawImage(car, x - pad, y, w + pad * 2, h);

    // Luce dei fari sul pavimento, davanti al muso
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x + (CAR.headlight.x - 70) * s, ground + 6 * s);
    ctx.scale(1, 0.2);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.2);
    pool.addColorStop(0, 'rgba(215,232,255,0.3)');
    pool.addColorStop(1, 'rgba(215,232,255,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Contesto del livello già scalato in unità di disegno. */
  private units(c: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(this.k, 0, 0, this.k, PAD * this.k, 0);
    return ctx;
  }

  private compose(shine: number): HTMLCanvasElement {
    const o = this.units(this.out);
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.drawImage(this.base, 0, 0);
    o.setTransform(this.k, 0, 0, this.k, PAD * this.k, 0);
    drawShine(o, shine);
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.drawImage(this.parts, 0, 0);
    o.setTransform(this.k, 0, 0, this.k, PAD * this.k, 0);
    drawGlassShine(o, shine);
    drawLamps(o, 1);
    return this.out;
  }
}
