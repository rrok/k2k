import { Component, ElementRef, Input, NgZone, OnDestroy, afterNextRender, inject } from '@angular/core';
import { GUN, SprayCloud } from '../../fx/spray-engine';

/**
 * Nuvola di vernice continua (come in cabina): esce dall'ugello della pistola
 * passata in `gun` e si espande verso sinistra. Il mouse sposta la nebbia.
 * Senza pistola visibile (mobile) la nuvola entra dal bordo destro.
 */
@Component({
  selector: 'app-spray-mist',
  standalone: true,
  template: `<canvas aria-hidden="true"></canvas>`,
  styles: [`
    :host { position: absolute; inset: 0; pointer-events: none; }
    canvas { width: 100%; height: 100%; display: block; }
  `]
})
export class SprayMistComponent implements OnDestroy {
  @Input() gun?: HTMLElement;

  private host = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private cloud = new SprayCloud(900);
  private raf = 0;
  private last = 0;
  private time = 0;
  private visible = true;
  private io?: IntersectionObserver;
  private push = { x: -9999, y: -9999, radius: 150 };
  private cleanup: (() => void)[] = [];

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.zone.runOutsideAngular(() => this.start());
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.cleanup.forEach(fn => fn());
  }

  private start(): void {
    const hostEl = this.host.nativeElement as HTMLElement;
    const canvas = hostEl.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = hostEl.clientWidth;
      h = hostEl.clientHeight;
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const section = hostEl.parentElement!;
    const onMove = (e: PointerEvent) => {
      const r = hostEl.getBoundingClientRect();
      this.push.x = e.clientX - r.left;
      this.push.y = e.clientY - r.top;
    };
    const onLeave = () => { this.push.x = this.push.y = -9999; };
    section.addEventListener('pointermove', onMove, { passive: true });
    section.addEventListener('pointerleave', onLeave, { passive: true });
    this.cleanup.push(
      () => window.removeEventListener('resize', resize),
      () => section.removeEventListener('pointermove', onMove),
      () => section.removeEventListener('pointerleave', onLeave)
    );

    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible && !this.raf) {
        this.last = performance.now();
        this.raf = requestAnimationFrame(frame);
      }
    });
    this.io.observe(hostEl);

    const frame = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.time += dt;

      // Ugello: dalla pistola se visibile, altrimenti dal bordo destro
      let nx = w + 20;
      let ny = h * 0.32;
      let reach = w * 0.55;
      const gun = this.gun;
      if (gun && gun.offsetParent) {
        const hr = hostEl.getBoundingClientRect();
        const gr = gun.getBoundingClientRect();
        nx = gr.left - hr.left + (GUN.tipX / GUN.w) * gr.width;
        ny = gr.top - hr.top + (GUN.tipY / GUN.h) * gr.height;
        reach = Math.max(260, nx * 0.6);
        gun.classList.toggle('is-firing', this.firing());
      }

      // Il carrozziere spruzza a passate: getti di ~1,8 s con brevi pause
      if (this.firing()) {
        const sweep = Math.sin(this.time * 1.7) * 0.16;
        const n = Math.max(1, Math.round(dt * 60));
        this.cloud.emit(nx, ny, Math.PI + sweep - 0.04, { reach, mist: 2 * n, drops: 3 * n, cloud: 1.4, density: 0.85 });
      }
      this.cloud.update(dt, undefined, this.push);

      ctx.clearRect(0, 0, w, h);
      this.cloud.draw(ctx, 'lighter');

      if ((this.visible && this.time < 3.5) || this.cloud.alive) {
        this.raf = requestAnimationFrame(frame);
      } else {
        this.raf = 0;
      }
    };
    this.last = performance.now();
    this.raf = requestAnimationFrame(frame);
  }

  private firing(): boolean {
    return this.visible && this.time < 2.0 && !document.documentElement.classList.contains('intro-lock');
  }
}
