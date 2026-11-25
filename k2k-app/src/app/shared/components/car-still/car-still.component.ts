import { Component, ElementRef, NgZone, OnDestroy, ViewChild, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import { CarStage } from '../../fx/car-stage';

/**
 * Auto illustrata in cabina, come immagine: ferma sotto i neon, con i riflessi
 * che scorrono sulla fiancata insieme alla pagina.
 */
@Component({
  selector: 'app-car-still',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="car-still" role="img" aria-label="Auto appena verniciata nella cabina K2K">
      <span class="car-still__tube" aria-hidden="true"></span>
      <span class="car-still__mark" aria-hidden="true">K2K</span>
      <div class="car-still__slot" #slot></div>
      <canvas #canvas aria-hidden="true"></canvas>
    </div>
  `
})
export class CarStillComponent implements OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('slot', { static: true }) private slotRef!: ElementRef<HTMLElement>;

  private zone = inject(NgZone);
  private car = new CarStage('#c8102e');
  private box = { x: 0, y: 0, w: 0 };
  private size = { w: 0, h: 0 };
  private raf = 0;
  private cleanup: (() => void)[] = [];

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.start()));
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach(fn => fn());
  }

  private start(): void {
    const canvas = this.canvasRef.nativeElement;
    const layout = () => {
      const sr = canvas.getBoundingClientRect();
      const cr = this.slotRef.nativeElement.getBoundingClientRect();
      if (!sr.width || !cr.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.size = { w: sr.width, h: sr.height };
      canvas.width = Math.ceil(sr.width * dpr);
      canvas.height = Math.ceil(sr.height * dpr);
      canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.box = { x: cr.left - sr.left, y: cr.top - sr.top, w: cr.width };
      this.car.resize(cr.width, dpr);
      this.draw();
    };
    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    const onScroll = () => this.queue();
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) window.addEventListener('scroll', onScroll, { passive: true });
      else window.removeEventListener('scroll', onScroll);
    });
    io.observe(canvas);
    this.cleanup.push(() => ro.disconnect(), () => io.disconnect(), () => window.removeEventListener('scroll', onScroll));
    layout();
  }

  private queue(): void {
    if (this.raf || !this.car.ready) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.size.w, this.size.h);
    if (!this.car.ready) return;
    // I riflessi dipendono da dove si trova l'auto nello schermo
    const r = canvas.getBoundingClientRect();
    const shine = ((r.top + r.height / 2) / Math.max(window.innerHeight, 1) - 0.5) * 1.6;
    this.car.draw(ctx, this.box.x, this.box.y, this.box.w, shine);
  }
}
