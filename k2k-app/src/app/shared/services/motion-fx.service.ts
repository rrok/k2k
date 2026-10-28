import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { SprayPaintService } from './spray-paint.service';

/** Elementi che "vengono spruzzati" quando entrano nel viewport. */
const REVEAL_SELECTOR = [
  'main section:not(:first-child) .section-header',
  'main section:not(:first-child) .row > [class*="col-"]',
  'main section:not(:first-child) > .container > :not(.row):not(.section-header):not(h1):not(h2)'
].join(',');



/**
 * Effetto "firma" di ogni pagina, diverso per ognuna (la home ha verniciatore,
 * scotch carta e nuvola). L'elemento parte nello stato iniziale della classe e
 * anima quando entra nello schermo (classe is-in).
 */
const PAGE_FX: Record<string, { selector: string; fx: string }[]> = {
  // Lucidatura: da opaco e graffiato a lucido, con il tampone della lucidatrice
  'app-chi-siamo': [
    { selector: 'h1, h2', fx: 'fx-polish' },
    { selector: 'img, .col-6 > .d-flex', fx: 'fx-polish-soft' }
  ],
  // Levabolli: l'ammaccatura torna in forma con un colpo secco
  'app-assicurazioni': [
    { selector: 'section:not(:first-child) .card', fx: 'fx-dent' },
    { selector: 'h1, h2', fx: 'fx-dent-text' }
  ],
  // Tergicristallo che pulisce il vetro appannato
  'app-cristalli': [{ selector: 'h1, h2, .rounded-4', fx: 'fx-wiper' }],
  // Flotta aziendale che entra in fila e frena
  'app-aziende': [{ selector: 'h2, .d-flex.align-items-start', fx: 'fx-fleet' }],
  // Spruzzata attraverso lo stencil: il colore arriva a puntini e si riempie
  'app-contatti': [{ selector: 'h1, h2, section:not(:first-child) .card', fx: 'fx-stencil' }]
};

const TILT_SELECTOR = '.card-hover';
const SPOTLIGHT_SELECTOR = '.fx-spotlight';

/**
 * Effetti di movimento, applicati automaticamente alle pagine:
 * - reveal "a spruzzo" delle sezioni allo scroll
 * - un effetto da carrozzeria diverso per ogni pagina (PAGE_FX)
 * - vernice che cola tra sezioni di colore diverso e sotto i badge rossi
 * - card coperte di scotch carta che viene tolto striscia per striscia
 * - tilt 3D + riflesso trasparente sulle card
 * - riflesso di luce che segue il mouse (spotlight)
 */
@Injectable({ providedIn: 'root' })
export class MotionFxService implements OnDestroy {
  private zone = inject(NgZone);
  private spray = inject(SprayPaintService);
  private io?: IntersectionObserver;
  private mo?: MutationObserver;
  private root?: HTMLElement;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  private scanQueued = false;

  init(root: HTMLElement): void {
    if (this.root) return;
    this.root = root;
    this.spray.init();
    this.zone.runOutsideAngular(() => {
      this.io = new IntersectionObserver(entries => this.onIntersect(entries), {
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.12
      });
      // Le pagine sono lazy-loaded: osserva il DOM e marca i nuovi elementi
      this.mo = new MutationObserver(() => this.queueScan());
      this.mo.observe(root, { childList: true, subtree: true });
      this.queueScan();

      if (this.finePointer && !this.reduced) {
        document.addEventListener('pointermove', this.onPointerMove, { passive: true });
        document.addEventListener('pointerout', this.onPointerOut, { passive: true });
      }
    });
  }

  ngOnDestroy(): void {
    this.io?.disconnect();
    this.mo?.disconnect();
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerout', this.onPointerOut);
  }

  private queueScan(): void {
    if (this.scanQueued) return;
    this.scanQueued = true;
    requestAnimationFrame(() => {
      this.scanQueued = false;
      this.scan();
    });
  }

  private scan(): void {
    if (!this.root || !this.io) return;

    this.scanDripEdges(this.root);

    this.spray.scan(this.root);

    if (this.reduced) return;

    this.scanPageFx(this.root);

    // Stagger: ritardo crescente tra fratelli dello stesso contenitore (da sinistra a destra)
    const counters = new Map<Element, number>();
    this.root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(el => {
      if (el.dataset['fx']) return;
      // Chi ha già un effetto di pagina non viene anche sfumato
      if (el.matches('[data-pfx]') || el.querySelector('[data-pfx]')) return;
      el.dataset['fx'] = '1';
      const parent = el.parentElement!;
      const i = counters.get(parent) ?? 0;
      counters.set(parent, i + 1);
      el.style.setProperty('--fx-delay', `${Math.min(i, 6) * 120}ms`);
      el.classList.add('fx-reveal');
      this.io!.observe(el);
    });
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      this.io!.unobserve(el);
      el.classList.add('is-in');
      const pfx = el.dataset['pfx'];
      if (pfx) {
        if (el.matches('h1, h2')) el.classList.add('is-painted');
        // Finito l'effetto, l'elemento torna normale (via maschere, filtri e overlay)
        const done = (e: AnimationEvent) => {
          if (e.target !== el || !/^(pfx-|fx-paint-cycle)/.test(e.animationName)) return;
          el.removeEventListener('animationend', done);
          el.classList.remove(pfx, 'is-in');
        };
        el.addEventListener('animationend', done);
      }
      if (el.classList.contains('fx-reveal')) {
        // A transizione finita rimuove la maschera (altrimenti taglia ombre e hover)
        const done = (e: TransitionEvent) => {
          if (e.target !== el || e.propertyName !== 'opacity') return;
          el.removeEventListener('transitionend', done);
          el.classList.remove('fx-reveal', 'is-in');
          el.style.removeProperty('--fx-delay');
        };
        el.addEventListener('transitionend', done);
      }
    }
  }

  /**
   * Vernice che cola: dove una sezione confina con una di colore diverso,
   * il colore di quella sopra cola su quella sotto. Ogni bordo ha gocce
   * diverse (posizione e scala casuali). Anche i badge rossi gocciolano.
   */
  private scanDripEdges(root: HTMLElement): void {
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('main section, footer'));
    for (let i = 1; i < blocks.length; i++) {
      const cur = blocks[i];
      const above = bgColor(blocks[i - 1]);
      const same = above === bgColor(cur);
      // Il footer resta tra una pagina e l'altra: aggiorna o togli le sue gocce
      const existing = cur.querySelector<HTMLElement>(':scope > .fx-drip-edge');
      if (existing) {
        if (same) existing.remove();
        else existing.style.setProperty('--drip-color', above);
        continue;
      }
      if (same) continue;

      const edge = document.createElement('div');
      edge.className = 'fx-drip-edge';
      edge.setAttribute('aria-hidden', 'true');
      const scale = 0.7 + Math.random() * 0.6;
      edge.style.setProperty('--drip-color', above);
      edge.style.setProperty('--drip-x', `${Math.round(Math.random() * 400)}px`);
      edge.style.setProperty('--drip-scale', scale.toFixed(2));
      cur.classList.add('fx-drip-host');
      cur.prepend(edge);
      if (this.reduced) edge.classList.add('is-in');
      else this.io!.observe(edge);
    }

    if (this.reduced) return;
    root.querySelectorAll<HTMLElement>('main .badge.bg-k2k-red:not(.fx-badge-drip)').forEach(el => {
      el.classList.add('fx-badge-drip');
      el.style.setProperty('--drip-x', `${Math.round(Math.random() * 220)}px`);
      this.io!.observe(el);
    });
  }

  /** Effetto firma della pagina corrente. */
  private scanPageFx(root: HTMLElement): void {
    for (const [page, items] of Object.entries(PAGE_FX)) {
      const host = root.querySelector<HTMLElement>(`main ${page}`);
      if (!host) continue;
      const counters = new Map<Element, number>();
      for (const { selector, fx } of items) {
        host.querySelectorAll<HTMLElement>(selector).forEach(el => {
          if (el.dataset['pfx']) return;
          el.dataset['pfx'] = fx;
          const group = el.closest('.row') ?? el.parentElement!;
          const i = counters.get(group) ?? 0;
          counters.set(group, i + 1);
          el.style.setProperty('--pfx-delay', `${Math.min(i, 6) * 140}ms`);
          if (fx === 'fx-wiper') {
            // Lunghezza della spazzola: deve arrivare agli angoli
            el.style.setProperty('--blade', `${Math.hypot(el.offsetWidth / 2, el.offsetHeight) + 12}px`);
          }
          el.classList.add(fx);
          this.io!.observe(el);
        });
      }
    }
    // Titoli senza effetto: pennellata subito
    root.querySelectorAll<HTMLElement>('main :is(h1, h2):not([data-pfx]):not([data-spray])').forEach(el => el.classList.add('is-painted'));
  }

  private onPointerMove = (e: PointerEvent): void => {
    const target = e.target as Element | null;
    if (!target?.closest) return;

    const card = target.closest<HTMLElement>(TILT_SELECTOR);
    if (card) {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      card.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
    }

    const spot = target.closest<HTMLElement>(SPOTLIGHT_SELECTOR);
    if (spot) {
      const r = spot.getBoundingClientRect();
      spot.style.setProperty('--sx', `${e.clientX - r.left}px`);
      spot.style.setProperty('--sy', `${e.clientY - r.top}px`);
    }
  };

  private onPointerOut = (e: PointerEvent): void => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(TILT_SELECTOR);
    if (card && !card.contains(e.relatedTarget as Node | null)) {
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    }
  };
}

/** Colore di sfondo effettivo (trasparente = bianco della pagina). */
function bgColor(el: HTMLElement): string {
  const c = getComputedStyle(el).backgroundColor;
  return c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) ? 'rgb(255, 255, 255)' : c;
}
