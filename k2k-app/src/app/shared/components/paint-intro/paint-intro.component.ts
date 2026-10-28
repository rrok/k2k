import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Painter, Particle, SprayCloud, drawPainter, gaussian, painterTip, preloadGun } from '../../fx/spray-engine';

/**
 * Intro "cabina di verniciatura": il verniciatore cammina sopra il logo K2K
 * e lo vernicia (andata e ritorno), poi la cabina si apre come una saracinesca.
 * Mostrata una sola volta per sessione, saltabile con un click.
 */
@Component({
  selector: 'app-paint-intro',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="paint-intro" [class.paint-intro--open]="opening()" (click)="skip()" role="presentation">
        <canvas #canvas class="paint-intro__canvas"></canvas>
        <div class="paint-intro__label">
          <span>Cabina di verniciatura</span>
          <small>clicca per entrare</small>
        </div>
      </div>
    }
  `,
  styleUrl: './paint-intro.component.scss'
})
export class PaintIntroComponent implements OnInit, OnDestroy {
  @ViewChild('canvas') set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    if (ref && !this.started) {
      this.started = true;
      this.zone.runOutsideAngular(() => this.start(ref.nativeElement));
    }
  }

  private zone = inject(NgZone);
  private started = false;
  private raf = 0;
  private timers: number[] = [];

  visible = signal(false);
  opening = signal(false);

  ngOnInit(): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try { seen = sessionStorage.getItem('k2k-intro') === '1'; } catch { /* storage bloccato */ }
    if (reduced || seen) return;
    try { sessionStorage.setItem('k2k-intro', '1'); } catch { /* storage bloccato */ }
    this.visible.set(true);
    document.documentElement.classList.add('intro-lock');
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  skip(): void {
    this.open();
  }

  private start(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Maschera: il logo viene disegnato su un canvas nascosto,
    // la vernice si deposita solo dove c'è il logo (più nebbia leggera ovunque).
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const mctx = mask.getContext('2d')!;
    const paint = document.createElement('canvas');
    paint.width = w;
    paint.height = h;
    const pctx = paint.getContext('2d')!;
    const cloud = new SprayCloud(2500);
    preloadGun();

    const img = new Image();
    img.src = 'logo-k2k.svg';

    const size = Math.min(w * 0.85, 760);
    const box = { x: (w - size) / 2, y: h / 2 - size * 0.15, w: size, h: size * 0.3 };
    const reach = Math.min(170, size * 0.25);

    const drawLogoMask = () => {
      if (!img.complete || !img.naturalWidth) return;
      const ratio = img.naturalWidth / img.naturalHeight;
      let lw = box.w;
      let lh = lw / ratio;
      if (lh > box.h) { lh = box.h; lw = lh * ratio; }
      mctx.clearRect(0, 0, w, h);
      mctx.drawImage(img, (w - lw) / 2, box.y + (box.h - lh) / 2, lw, lh);
    };
    img.onload = drawLogoMask;

    // Il verniciatore cammina sul bordo superiore del logo: andata verso destra, ritorno verso sinistra
    const passDur = 1500;
    const duration = passDur * 2;
    const t0 = performance.now();
    let last = t0;
    const gh = Math.max(90, Math.min(size * 0.2, 150));
    const g: Painter = { x: box.x - gh, y: box.y, h: gh, facing: 1, phase: 0, aim: 1, airborne: false, alpha: 1 };
    const pathAt = (t: number) => {
      const pass = t < passDur ? 0 : 1;
      const f = Math.min((t - pass * passDur) / passDur, 1);
      const p = pass === 0 ? f : 1 - f;
      const lead = gh * 0.5 * (pass === 0 ? 1 : -1);
      return {
        facing: pass === 0 ? 1 : -1,
        feetX: box.x - gh * 0.3 + p * (box.w + gh * 0.6) - lead,
        // Il polso sale e scende per coprire tutta l'altezza delle lettere
        tx: box.x - gh * 0.3 + p * (box.w + gh * 0.6),
        ty: box.y + box.h * (0.5 + Math.sin(t / 70) * 0.36)
      };
    };

    const land = (p: Particle) => {
      pctx.fillStyle = p.color;
      pctx.beginPath();
      pctx.arc(p.x, p.y, p.r * 1.4, 0, Math.PI * 2);
      pctx.fill();
    };

    const frame = (now: number) => {
      const t = now - t0;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const spraying = t < duration;

      if (spraying) {
        const path = pathAt(t);
        const prevX = g.x;
        g.facing = path.facing;
        g.x = path.feetX;
        g.y = box.y + box.h * 0.12;
        g.phase += Math.abs(g.x - prevX) / (gh * 0.2);
        const tip = painterTip(g);
        let want = Math.atan2(path.ty - tip.y, path.tx - tip.x);
        if (g.facing < 0 && want < 0) want += Math.PI * 2;
        g.aim += (want - g.aim) * (1 - Math.exp(-dt * 25));
        const reachNow = Math.hypot(path.tx - tip.x, path.ty - tip.y);
        const n = Math.max(1, Math.round(dt * 60));
        cloud.emit(tip.x, tip.y, g.aim, { reach: reachNow, mist: 3 * n, drops: 40 * n, cloud: 1.3 });
        // Copertura densa nel punto colpito
        for (let k2 = 0; k2 < 120; k2++) {
          const r = Math.abs(gaussian()) * reach * 0.42;
          const a = Math.random() * Math.PI * 2;
          const s = Math.random() * 3 + 0.8;
          pctx.fillStyle = `rgba(200, 16, 46, ${0.3 + Math.random() * 0.5})`;
          pctx.fillRect(path.tx + Math.cos(a) * r, path.ty + Math.sin(a) * r * 1.3, s, s);
        }
      } else {
        // Finito: se ne va saltellando a sinistra
        g.x -= gh * 2.2 * dt;
        g.phase += gh * 2.2 * dt / (gh * 0.2);
        g.alpha = Math.max(0, 1 - (t - duration) / 500);
      }
      cloud.update(dt, land);

      // Composizione: overspray diffuso + logo che emerge + nebbia + pistola
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.14;
      ctx.drawImage(paint, 0, 0);
      ctx.globalAlpha = 1;
      if (img.complete && img.naturalWidth) {
        drawLogoMask();
        mctx.globalCompositeOperation = 'source-in';
        mctx.drawImage(paint, 0, 0);
        mctx.globalCompositeOperation = 'source-over';
        if (!spraying) {
          // Logo finito: colori originali sopra la vernice
          const fade = Math.min((t - duration) / 400, 1);
          ctx.drawImage(mask, 0, 0);
          ctx.globalAlpha = fade;
          drawLogoMaskTo(ctx);
          ctx.globalAlpha = 1;
        } else {
          ctx.drawImage(mask, 0, 0);
        }
      }
      cloud.draw(ctx, 'lighter');
      drawPainter(ctx, g);

      if (t < duration + 700) {
        this.raf = requestAnimationFrame(frame);
      } else {
        canvas.classList.add('paint-intro__canvas--done');
        this.timers.push(window.setTimeout(() => this.zone.run(() => this.open()), 350));
      }
    };

    const drawLogoMaskTo = (c: CanvasRenderingContext2D) => {
      const ratio = img.naturalWidth / img.naturalHeight;
      let lw = box.w;
      let lh = lw / ratio;
      if (lh > box.h) { lh = box.h; lw = lh * ratio; }
      c.drawImage(img, (w - lw) / 2, box.y + (box.h - lh) / 2, lw, lh);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private open(): void {
    if (this.opening()) return;
    cancelAnimationFrame(this.raf);
    this.opening.set(true);
    document.documentElement.classList.remove('intro-lock');
    this.timers.push(window.setTimeout(() => this.visible.set(false), 900));
  }

  private cleanup(): void {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    document.documentElement.classList.remove('intro-lock');
  }
}
