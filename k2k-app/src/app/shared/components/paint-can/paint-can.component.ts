import { Component, ElementRef, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Bomboletta spray "torna su": si riempie di vernice man mano che si scorre
 * la pagina e in fondo si agita. Pubblica anche --paint-progress sull'<html>,
 * usato dalla striscia di vernice sotto la navbar.
 */
@Component({
  selector: 'app-paint-can',
  standalone: true,
  template: `
    <button type="button" class="paint-can" (click)="toTop()" aria-label="Torna su">
      <svg viewBox="0 0 60 110" aria-hidden="true">
        <defs>
          <linearGradient id="can-metal" x1="0" x2="1">
            <stop offset="0" stop-color="#6d747b" />
            <stop offset=".3" stop-color="#e9edf0" />
            <stop offset=".65" stop-color="#aab1b8" />
            <stop offset="1" stop-color="#5c636a" />
          </linearGradient>
          <linearGradient id="can-paint" x1="0" x2="1">
            <stop offset="0" stop-color="#8e0b20" />
            <stop offset=".35" stop-color="#ff3b5f" />
            <stop offset=".6" stop-color="#c8102e" />
            <stop offset="1" stop-color="#7a0a1c" />
          </linearGradient>
          <clipPath id="can-body"><rect x="8" y="30" width="44" height="74" rx="7" /></clipPath>
        </defs>
        <!-- erogatore e spalla -->
        <rect x="24" y="4" width="12" height="10" rx="2" fill="#1d1f22" />
        <circle cx="25" cy="8" r="1.6" fill="#c8102e" />
        <path d="M14 30 Q14 16 30 15 Q46 16 46 30 Z" fill="url(#can-metal)" />
        <!-- corpo -->
        <rect x="8" y="30" width="44" height="74" rx="7" fill="url(#can-metal)" />
        <g clip-path="url(#can-body)">
          <rect class="paint-can__fill" x="8" y="30" width="44" height="74" fill="url(#can-paint)" />
        </g>
        <rect x="8" y="30" width="44" height="74" rx="7" fill="none" stroke="rgba(0,0,0,.35)" />
        <!-- etichetta -->
        <rect x="8" y="52" width="44" height="22" fill="rgba(20,20,22,.85)" />
        <text x="30" y="67" text-anchor="middle">K2K</text>
      </svg>
      <span class="paint-can__label">Su</span>
    </button>
  `,
  styleUrl: './paint-can.component.scss'
})
export class PaintCanComponent implements OnInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private raf = 0;
  private onScroll = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.update());
  };

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
    });
    this.update();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    cancelAnimationFrame(this.raf);
  }

  toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private update(): void {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    const el = this.host.nativeElement as HTMLElement;
    document.documentElement.style.setProperty('--paint-progress', p.toFixed(4));
    el.style.setProperty('--fill', p.toFixed(4));
    el.classList.toggle('is-full', p > 0.97);
    el.classList.toggle('is-idle', window.scrollY < 120);
  }
}
