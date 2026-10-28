import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Painter, Particle, SPRAY_ANGLE, SprayCloud, drawPainter, drawGun, painterTip, preloadGun } from '../fx/spray-engine';

/** Titoli della home che il verniciatore vernicia dal vivo quando entrano nello schermo. */
const HEADING_SELECTOR = 'main app-home h1, main app-home h2';

/** Margine dell'alone di overspray attorno al titolo, in px. */
const HALO_PAD = 28;

const INTERACTIVE = 'a, button, input, textarea, select, label, iframe, [contenteditable], .navbar, footer, .card';

interface Row {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  /** Fascia della maschera (include lo spazio fino alla riga vicina). */
  maskTop: number;
  maskBottom: number;
}

interface Point {
  x: number;
  y: number;
}

interface HeadingJob {
  el: HTMLElement;
  rows: Row[];
  halo: HTMLCanvasElement;
  hctx: CanvasRenderingContext2D;
  rect: DOMRect;
  row: number;
  t: number;
  durations: number[];
  painter: Painter;
  /** Posizione dei piedi del verniciatore, relativa al titolo (segue lo scroll). */
  px: number;
  py: number;
  stage: 'enter' | 'paint' | 'hop' | 'leave';
  stageT: number;
  from: Point;
  to: Point;
  waitIntro: boolean;
}

/**
 * Livello di vernice globale (canvas fisso sopra la pagina):
 * - in home un verniciatore cammina sopra i titoli H1/H2 e li vernicia riga per
 *   riga (salta da una riga all'altra); l'overspray resta come alone;
 * - tenendo premuto su una zona vuota il visitatore vernicia con la pistola.
 */
@Injectable({ providedIn: 'root' })
export class SprayPaintService implements OnDestroy {
  private zone = inject(NgZone);
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private cloud = new SprayCloud(2200);
  private jobs: HeadingJob[] = [];
  private io?: IntersectionObserver;
  private raf = 0;
  private last = 0;
  private enabled = false;

  private pointer = { x: 0, y: 0, down: false, gx: 0, gy: 0, alpha: 0 };

  init(): void {
    if (this.enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.enabled = true;
    preloadGun();

    this.zone.runOutsideAngular(() => {
      const c = document.createElement('canvas');
      c.className = 'fx-spray-layer';
      c.setAttribute('aria-hidden', 'true');
      document.body.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext('2d')!;
      this.resize();
      window.addEventListener('resize', this.resize, { passive: true });

      this.io = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          this.io!.unobserve(e.target);
          this.startJob(e.target as HTMLElement);
        }
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.6 });

      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        document.addEventListener('pointerdown', this.onDown);
        document.addEventListener('pointermove', this.onMove, { passive: true });
        document.addEventListener('pointerup', this.onUp, { passive: true });
        document.addEventListener('pointercancel', this.onUp, { passive: true });
        window.addEventListener('blur', this.onUp);
      }
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.canvas?.remove();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('pointerdown', this.onDown);
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.onUp);
  }

  /** Marca i nuovi titoli da verniciare (chiamato a ogni cambio del DOM). */
  scan(root: HTMLElement): void {
    if (!this.enabled || !this.io) return;
    root.querySelectorAll<HTMLElement>(HEADING_SELECTOR).forEach(el => {
      if (el.dataset['spray']) return;
      el.dataset['spray'] = '1';
      // Titoli già passati (es. ritorno con scroll ripristinato): subito verniciati
      if (el.getBoundingClientRect().bottom < 0) {
        el.classList.add('is-painted');
        return;
      }
      el.classList.add('fx-spray');
      this.io!.observe(el);
    });
  }

  /* ---------- Titoli ---------- */

  private startJob(el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const rows = measureRows(el, rect);
    if (!rows.length) {
      this.finish(el);
      return;
    }

    el.classList.add('fx-spray-host');
    const halo = document.createElement('canvas');
    halo.className = 'fx-spray-halo';
    halo.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    halo.width = Math.ceil((rect.width + HALO_PAD * 2) * dpr);
    halo.height = Math.ceil((rect.height + HALO_PAD * 2) * dpr);
    halo.style.width = `${rect.width + HALO_PAD * 2}px`;
    halo.style.height = `${rect.height + HALO_PAD * 2}px`;
    el.appendChild(halo);
    const hctx = halo.getContext('2d')!;
    hctx.scale(dpr, dpr);

    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 32;
    const h = Math.max(56, Math.min(fontSize * 1.25, 120));
    const start = feetOn(rows[0], 0, h);

    this.jobs.push({
      el, rows, halo, hctx, rect,
      row: 0,
      t: 0,
      durations: rows.map(r => Math.max(0.7, Math.min(0.5 + (r.x1 - r.x0) * 0.0016, 1.6))),
      painter: { x: 0, y: 0, h, facing: 1, phase: 0, aim: 0.9, airborne: false, alpha: 0 },
      px: start.x - h * 1.4,
      py: start.y,
      stage: 'enter',
      stageT: 0,
      from: { x: start.x - h * 1.4, y: start.y },
      to: start,
      waitIntro: !!el.closest('main section:first-child')
    });
    this.applyMask(this.jobs[this.jobs.length - 1], 0);
    this.ensureLoop();
  }

  private applyMask(job: HeadingJob, p: number): void {
    const layers = job.rows.map((r, i) => {
      const prog = i < job.row ? 1 : i > job.row ? 0 : p;
      let stops: string;
      if (prog <= 0) stops = 'transparent 0, transparent 0';
      else if (prog >= 1) stops = '#000 0, #000 0';
      else {
        const edge = r.x0 + (r.x1 - r.x0) * prog;
        stops = `#000 ${edge - 30}px, rgba(0,0,0,.35) ${edge - 6}px, transparent ${edge + 10}px`;
      }
      return `linear-gradient(90deg, ${stops}) 0 ${r.maskTop}px / 100% ${r.maskBottom - r.maskTop}px no-repeat`;
    }).join(', ');
    job.el.style.setProperty('-webkit-mask', layers);
    job.el.style.setProperty('mask', layers);
  }

  private finish(el: HTMLElement): void {
    el.style.removeProperty('-webkit-mask');
    el.style.removeProperty('mask');
    el.classList.remove('fx-spray');
    el.classList.add('is-painted', 'is-wet');
    window.setTimeout(() => el.classList.remove('is-wet'), 1600);
  }

  private stepJob(job: HeadingJob, dt: number, introLock: boolean): boolean {
    if (job.waitIntro && introLock) return true;
    const rect = job.rect;
    const g = job.painter;
    const h = g.h;
    const prevX = job.px;
    job.stageT += dt;
    g.airborne = false;

    switch (job.stage) {
      case 'enter': {
        // Arriva camminando da sinistra
        const k = Math.min(job.stageT / 0.5, 1);
        job.px = job.from.x + (job.to.x - job.from.x) * k;
        job.py = job.to.y;
        g.alpha = Math.min(1, job.stageT / 0.2);
        if (k >= 1) this.setStage(job, 'paint');
        break;
      }
      case 'paint': {
        const r = job.rows[job.row];
        job.t += dt;
        const raw = Math.min(job.t / job.durations[job.row], 1);
        const feet = feetOn(r, raw, h);
        job.px = feet.x;
        job.py = feet.y;
        g.x = rect.left + job.px;
        g.y = rect.top + job.py;

        // Punta la pistola sul bordo che sta verniciando
        const tx = rect.left + r.x0 + (r.x1 - r.x0) * raw;
        const ty = rect.top + (r.top + r.bottom) / 2;
        const tip = painterTip(g);
        const want = Math.max(0.35, Math.min(Math.atan2(ty - tip.y, tx - tip.x), 1.45));
        g.aim += (want - g.aim) * (1 - Math.exp(-dt * 18));
        const n = Math.max(1, Math.round(dt * 60));
        this.cloud.emit(tip.x, tip.y, g.aim, { reach: Math.hypot(tx - tip.x, ty - tip.y), mist: 2 * n, drops: 16 * n, owner: job });

        this.applyMask(job, raw);
        if (raw >= 1) {
          job.row++;
          job.t = 0;
          if (job.row < job.rows.length) {
            job.from = { x: job.px, y: job.py };
            job.to = feetOn(job.rows[job.row], 0, h);
            this.setStage(job, 'hop');
          } else {
            this.finish(job.el);
            this.setStage(job, 'leave');
          }
        }
        break;
      }
      case 'hop': {
        // Salto alla riga successiva
        const k = Math.min(job.stageT / 0.55, 1);
        job.px = job.from.x + (job.to.x - job.from.x) * k;
        job.py = job.from.y + (job.to.y - job.from.y) * k - Math.sin(Math.PI * k) * h * 0.7;
        g.airborne = k < 1;
        g.aim += (0.5 - g.aim) * (1 - Math.exp(-dt * 10));
        if (k >= 1) this.setStage(job, 'paint');
        break;
      }
      case 'leave': {
        // Se ne va soddisfatto a destra
        job.px += h * 1.8 * dt;
        g.alpha = Math.max(0, 1 - job.stageT / 0.7);
        g.aim += (0.5 - g.aim) * (1 - Math.exp(-dt * 10));
        if (g.alpha <= 0) return false;
        break;
      }
    }

    if (!g.airborne) g.phase += Math.abs(job.px - prevX) / (h * 0.2);
    g.x = rect.left + job.px;
    g.y = rect.top + job.py;
    return true;
  }

  private setStage(job: HeadingJob, stage: HeadingJob['stage']): void {
    job.stage = stage;
    job.stageT = 0;
  }

  private landOnHalo = (p: Particle): void => {
    const job = p.owner as HeadingJob | undefined;
    if (job) {
      const x = p.x - job.rect.left + HALO_PAD;
      const y = p.y - job.rect.top + HALO_PAD;
      job.hctx.fillStyle = p.color;
      job.hctx.beginPath();
      job.hctx.arc(x, y, p.r * 0.9, 0, Math.PI * 2);
      job.hctx.fill();
    } else {
      // Spruzzo del visitatore: la vernice resta qualche secondo e poi sbiadisce
      this.cloud.splat(p.x, p.y, p.r * 1.3, p.color);
    }
  };

  /* ---------- Spruzzo con il mouse ---------- */

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !isBlank(e.target)) return;
    e.preventDefault();
    const ptr = this.pointer;
    ptr.down = true;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (ptr.alpha <= 0) {
      ptr.gx = e.clientX - Math.cos(SPRAY_ANGLE) * 90;
      ptr.gy = e.clientY - Math.sin(SPRAY_ANGLE) * 90;
    }
    document.documentElement.classList.add('fx-spraying');
    this.ensureLoop();
  };

  private onMove = (e: PointerEvent): void => {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
  };

  private onUp = (): void => {
    this.pointer.down = false;
    document.documentElement.classList.remove('fx-spraying');
  };

  private stepPointer(dt: number): void {
    const ptr = this.pointer;
    const reach = 90;
    const nx = ptr.x - Math.cos(SPRAY_ANGLE) * reach;
    const ny = ptr.y - Math.sin(SPRAY_ANGLE) * reach;
    const k = 1 - Math.exp(-dt * 25);
    ptr.gx += (nx - ptr.gx) * k;
    ptr.gy += (ny - ptr.gy) * k;
    ptr.alpha = ptr.down ? Math.min(1, ptr.alpha + dt * 6) : Math.max(0, ptr.alpha - dt * 3);
    if (ptr.down) {
      const n = Math.max(1, Math.round(dt * 60));
      const aim = Math.atan2(ptr.y - ptr.gy, ptr.x - ptr.gx);
      this.cloud.emit(ptr.gx, ptr.gy, aim, { reach: Math.hypot(ptr.x - ptr.gx, ptr.y - ptr.gy), mist: 2 * n, drops: 14 * n });
    }
  }

  /* ---------- Loop ---------- */

  private resize = (): void => {
    if (!this.canvas || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.ceil(this.w * dpr);
    this.canvas.height = Math.ceil(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private ensureLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const ctx = this.ctx!;
    const introLock = document.documentElement.classList.contains('intro-lock');

    // 1) letture di layout, 2) simulazione, 3) scritture di stile
    for (const job of this.jobs) job.rect = job.el.getBoundingClientRect();
    this.jobs = this.jobs.filter(job => this.stepJob(job, dt, introLock));
    this.stepPointer(dt);
    this.cloud.update(dt, this.landOnHalo);

    ctx.clearRect(0, 0, this.w, this.h);
    this.cloud.draw(ctx);
    for (const job of this.jobs) {
      if (job.waitIntro && introLock) continue;
      drawPainter(ctx, job.painter);
    }
    const ptr = this.pointer;
    drawGun(ctx, ptr.gx, ptr.gy, SPRAY_ANGLE, 120, ptr.alpha);

    if (this.jobs.length || this.cloud.alive || ptr.down || ptr.alpha > 0) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.raf = 0;
      ctx.clearRect(0, 0, this.w, this.h);
    }
  };
}

/** Piedi del verniciatore sopra la riga, un po' dietro il punto che sta verniciando. */
function feetOn(r: Row, p: number, h: number): Point {
  return {
    x: r.x0 + (r.x1 - r.x0) * p - h * 0.55,
    y: r.top + (r.bottom - r.top) * 0.14
  };
}

/** Righe di testo del titolo (coordinate relative al titolo). */
function measureRows(el: HTMLElement, rect: DOMRect): Row[] {
  // Solo i nodi di testo: i box degli elementi inline-block falserebbero le righe
  const rects: DOMRect[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent!.trim()) continue;
    range.selectNodeContents(n);
    rects.push(...Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1));
  }
  const rows: Row[] = [];
  for (const r of rects) {
    const top = r.top - rect.top;
    const bottom = r.bottom - rect.top;
    const mid = (top + bottom) / 2;
    const row = rows.find(x => mid > x.top && mid < x.bottom);
    if (row) {
      row.x0 = Math.min(row.x0, r.left - rect.left);
      row.x1 = Math.max(row.x1, r.right - rect.left);
      row.top = Math.min(row.top, top);
      row.bottom = Math.max(row.bottom, bottom);
    } else {
      rows.push({ x0: r.left - rect.left, x1: r.right - rect.left, top, bottom, maskTop: 0, maskBottom: 0 });
    }
  }
  rows.sort((a, b) => a.top - b.top);
  rows.forEach((r, i) => {
    const h = r.bottom - r.top;
    r.maskTop = i === 0 ? r.top - h * 0.4 : (rows[i - 1].bottom + r.top) / 2;
    r.maskBottom = i === rows.length - 1 ? r.bottom + h * 0.6 : (r.bottom + rows[i + 1].top) / 2;
  });
  return rows;
}

/** Click su una zona "vuota" (niente testo, link o controlli): si può verniciare. */
function isBlank(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !(el instanceof Element) || el.closest(INTERACTIVE)) return false;
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) return false;
  }
  return !el.matches('p, h1, h2, h3, h4, h5, h6, span, li, strong, small, i, em, b');
}

