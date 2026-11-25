import {
  Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild, ViewEncapsulation, effect, inject, signal
} from '@angular/core';
import type { PaintStudio, StudioEvent, Tool } from '../../fx/car3d/studio';
import { PaintGameService } from '../../services/paint-game.service';
import { BuddyFaceComponent } from '../paint-buddy/paint-buddy.component';

interface ToolButton {
  id: Tool;
  label: string;
  icon: string;
}

interface Verdict {
  score: number;
  title: string;
  lines: string[];
}

const TOOLS: ToolButton[] = [
  { id: 'spray', label: 'Vernicia', icon: 'fa-solid fa-spray-can-sparkles' },
  { id: 'sand', label: 'Carteggia', icon: 'fa-solid fa-compact-disc' },
  { id: 'wipe', label: 'Pulisci', icon: 'fa-solid fa-hand-sparkles' },
  { id: 'polish', label: 'Lucida', icon: 'fa-solid fa-wand-magic-sparkles' }
];

const COLORS = [
  { name: 'Rosso K2K', value: '#c8102e' },
  { name: 'Arancio', value: '#f2600c' },
  { name: 'Giallo', value: '#f2b705' },
  { name: 'Verde', value: '#1e9e4a' },
  { name: 'Acqua', value: '#17b8a6' },
  { name: 'Blu', value: '#0e4fd0' },
  { name: 'Viola', value: '#7a2bd6' },
  { name: 'Rosa', value: '#ff4fa3' },
  { name: 'Nero', value: '#101114' },
  { name: 'Bianco', value: '#f0f2f4' }
];

const SIZES = [0.62, 1, 1.55];

/** Cosa dice il verniciatore quando succede qualcosa (una frase a caso per evento). */
const LINES: Record<string, string[]> = {
  hello: ['Eccoti! Scegli un colore e spruzza sull\'auto. Occhio: se resti fermo, la vernice cola.'],
  spray: ['Passate leggere e regolari… così!', 'Bene: pistola sempre in movimento.', 'Tinta unita o arlecchino? Decidi tu.'],
  drip: ['Ahi, colatura! Sei rimasto fermo troppo a lungo.', 'Troppa vernice nello stesso punto: cola. Si carteggia e si rifà.', 'Cola, cola… capita a tutti, la prima volta.'],
  grain: ['Hai verniciato sulla polvere: è venuta la grana. Carteggia e pulisci.', 'Sotto c\'era polvere: si vede. Il panno serve a questo.'],
  sand: ['Carteggia finché torna grigio. Poi però togli la polvere.', 'Vai di carta! Dopo passa il panno.'],
  wipe: ['Via la polvere: adesso la vernice attacca bene.', 'Pulito. Ora si può riverniciare.'],
  polish: ['Guarda come brilla! La lucidatura fa la differenza.', 'A specchio. Così si consegna un\'auto.'],
  bare: ['Qui non c\'è vernice da lucidare: prima spruzza.'],
  turnTouch: ['Trascina fuori dall\'auto per girarla. Con due dita la giri e la ingrandisci.'],
  turnMouse: ['Trascina fuori dall\'auto per girarla, con la rotella la ingrandisci.'],
  maskOff: ['Via carta e nastro: sotto è rimasto tutto pulito. Da adesso occhio a vetri e fari!'],
  maskOn: ['Di nuovo mascherata: vetri, fari e targa sono protetti.'],
  reset: ['Si riparte dal fondo. Capita anche ai migliori.'],
  photo: ['Foto fatta! Falla vedere in giro.'],
  size: ['Passata stretta per i dettagli, larga per le fiancate.']
};

/** Secondi minimi tra due commenti dello stesso tipo. */
const COOLDOWN: Record<string, number> = { spray: 14, sand: 12, wipe: 10, polish: 10, bare: 6, drip: 5, grain: 6 };

/**
 * Minigioco "Vernicia con me": un'auto 3D da girare e verniciare a mano.
 * Si può verniciare male, carteggiare, pulire, riverniciare e lucidare; il
 * verniciatore commenta e alla fine dà un voto. Pensato prima per il telefono.
 * three.js viene scaricato solo quando il gioco si apre.
 */
@Component({
  selector: 'app-paint-game',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [BuddyFaceComponent],
  template: `
    @if (game.open()) {
      <div class="pgame" role="dialog" aria-modal="true" aria-label="Vernicia con me" [class.is-ready]="ready()">
        <div class="pgame__tubes" aria-hidden="true"><i></i><i></i><i></i></div>
        <canvas class="pgame__gl" #gl></canvas>
        <canvas class="pgame__fx"></canvas>

        @if (!ready()) {
          <p class="pgame__loading">{{ failed() ? 'Su questo dispositivo la cabina 3D non parte.' : 'Porto l\'auto in cabina…' }}</p>
        }

        <header class="pgame__top">
          <div class="pgame__coach">
            <app-buddy-face />
            <p aria-live="polite">{{ say() }}</p>
          </div>
          <button type="button" class="pgame__round" (click)="close()" aria-label="Chiudi il gioco"><i class="bi bi-x-lg"></i></button>
        </header>

        <!-- Giro dell'auto: comodo col pollice -->
        <button type="button" class="pgame__turn pgame__turn--l" aria-label="Gira l'auto a sinistra"
                (pointerdown)="turn(1, $event)" (pointerup)="turn(0)" (pointerleave)="turn(0)" (pointercancel)="turn(0)">
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
        <button type="button" class="pgame__turn pgame__turn--r" aria-label="Gira l'auto a destra"
                (pointerdown)="turn(-1, $event)" (pointerup)="turn(0)" (pointerleave)="turn(0)" (pointercancel)="turn(0)">
          <i class="bi bi-arrow-clockwise"></i>
        </button>

        <!-- Attribuzione richiesta dalla licenza del modello (CC BY 4.0) -->
        <p class="pgame__credit">
          Modello 3D:
          <a href="https://sketchfab.com/3d-models/mercedes-benz-gls-580-b5af1a627724412aafca863feab06095" target="_blank" rel="noopener">“Mercedes Benz GLS 580” di Joses</a> ·
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · adattato
        </p>

        <div class="pgame__dock">
          <div class="pgame__actions">
            <button type="button" [class.is-on]="masking()" (click)="toggleMask()" [attr.aria-pressed]="masking()">
              <i class="bi bi-file-earmark"></i>Maschera
            </button>
            <button type="button" (click)="reset()"><i class="bi bi-arrow-repeat"></i>Ricomincia</button>
            <button type="button" (click)="photo()"><i class="bi bi-camera"></i>Foto</button>
            <button type="button" class="pgame__vote" (click)="judge()"><i class="bi bi-award"></i>Voto</button>
          </div>

          <!-- sempre visibili: toccando un colore si torna alla pistola -->
          <div class="pgame__colors" role="group" aria-label="Colore della vernice" [class.is-idle]="tool() !== 'spray'">
            <button type="button" class="pgame__size" (click)="nextSize()" [attr.aria-label]="'Larghezza della passata: ' + sizeName()">
              <span [style.--s]="sizes[size()]"></span>
            </button>
            @for (c of colors; track c.value) {
              <button type="button" class="pgame__chip" [class.is-active]="c.value === color()" [style.--chip]="c.value"
                      [attr.aria-label]="c.name" [attr.aria-pressed]="c.value === color()" (click)="pickColor(c.value)"></button>
            }
          </div>

          <div class="pgame__tools" role="group" aria-label="Attrezzi">
            @for (t of tools; track t.id) {
              <button type="button" [class.is-active]="t.id === tool()" [attr.aria-pressed]="t.id === tool()" (click)="pickTool(t.id)">
                <i [class]="t.icon"></i><span>{{ t.label }}</span>
              </button>
            }
          </div>
        </div>

        @if (verdict(); as v) {
          <div class="pgame__verdict" role="alertdialog" aria-label="Il voto del verniciatore">
            <div class="pgame__card">
              <app-buddy-face />
              <p class="pgame__score"><b>{{ v.score }}</b><span>/10</span></p>
              <h2>{{ v.title }}</h2>
              <ul>
                @for (l of v.lines; track l) { <li>{{ l }}</li> }
              </ul>
              <p class="pgame__pitch">Sulla tua auto vera, però, è meglio se ci pensiamo noi.</p>
              <a class="btn btn-whatsapp" target="_blank"
                 href="https://wa.me/393277380403?text=Ciao%2C%20vorrei%20un%20preventivo%20rapido">
                <i class="bi bi-whatsapp me-2"></i>Preventivo WhatsApp
              </a>
              <button type="button" class="btn btn-ghost" (click)="verdict.set(null)">Continua a verniciare</button>
            </div>
          </div>
        }
      </div>
    }
  `
})
export class PaintGameComponent implements OnDestroy {
  readonly game = inject(PaintGameService);
  private zone = inject(NgZone);

  readonly tools = TOOLS;
  readonly colors = COLORS;
  readonly sizes = SIZES;
  readonly tool = signal<Tool>('spray');
  readonly color = signal(COLORS[0].value);
  readonly size = signal(1);
  readonly masking = signal(true);
  readonly ready = signal(false);
  readonly failed = signal(false);
  readonly say = signal(LINES['hello'][0]);
  readonly verdict = signal<Verdict | null>(null);

  private studio?: PaintStudio;
  private glEl?: HTMLCanvasElement;
  private cleanup: (() => void)[] = [];
  private spoke = new Map<string, number>();
  private turning = 0;
  private turnRaf = 0;
  private rotated = false;
  private hintTimer = 0;

  /**
   * Angular richiama questo setter ogni volta che cambia un blocco del template
   * (colori, voto…): la cabina va accesa una volta sola per canvas.
   */
  @ViewChild('gl') set glRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    const el = ref?.nativeElement;
    if (el === this.glEl) return;
    this.glEl = el;
    if (el) this.zone.runOutsideAngular(() => void this.start(el));
    else this.stop();
  }

  constructor() {
    effect(() => document.documentElement.classList.toggle('game-open', this.game.open()));
  }

  ngOnDestroy(): void {
    this.stop();
    document.documentElement.classList.remove('game-open');
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.verdict()) this.verdict.set(null);
    else this.game.close();
  }

  sizeName(): string {
    return ['stretta', 'media', 'larga'][this.size()];
  }

  pickTool(t: Tool): void {
    this.tool.set(t);
    if (this.studio) this.studio.tool = t;
  }

  pickColor(c: string): void {
    this.color.set(c);
    if (this.studio) this.studio.color = c;
    this.pickTool('spray');
  }

  nextSize(): void {
    this.size.update(s => (s + 1) % SIZES.length);
    if (this.studio) this.studio.size = SIZES[this.size()];
    this.speak('size', true);
  }

  toggleMask(): void {
    this.masking.update(m => !m);
    this.studio?.setMasking(this.masking());
    this.speak(this.masking() ? 'maskOn' : 'maskOff', true);
  }

  reset(): void {
    this.studio?.reset();
    this.masking.set(true);
    this.speak('reset', true);
  }

  /** Tiene premuto: l'auto gira finché non si rilascia. */
  turn(dir: number, e?: Event): void {
    e?.preventDefault();
    this.turning = dir;
    cancelAnimationFrame(this.turnRaf);
    if (!dir) return;
    this.zone.runOutsideAngular(() => {
      const step = () => {
        this.studio?.orbit(this.turning * 0.035, 0);
        this.rotated = true;
        if (this.turning) this.turnRaf = requestAnimationFrame(step);
      };
      step();
    });
  }

  /** Il verniciatore guarda il lavoro e dà il voto. */
  judge(): void {
    if (!this.studio) return;
    const s = this.studio.stats();
    // con il 90% di carrozzeria coperta il lavoro è completo
    const cover = Math.min(1, s.coverage / 0.9);
    const clean = cover > 0.4 ? Math.max(0, 1 - s.dust * 4) : 0;
    const glass = s.glass > 0.012;
    const raw =
      10 * (0.6 * cover + 0.25 * s.gloss * cover + 0.15 * clean) -
      Math.min(s.drips, 8) * 0.3 - Math.min(s.grain, 6) * 0.4 - (glass ? 1 : 0);
    const score = Math.min(10, Math.max(1, Math.round(raw)));
    const title =
      s.coverage < 0.03 ? 'Non hai ancora cominciato!' :
      score <= 3 ? 'Diciamo che c\'è margine. Tanto margine.' :
      score <= 5 ? 'Come primo giorno in cabina non c\'è male.' :
      score <= 7 ? 'Niente male! Ancora un po\' di mano e ci siamo.' :
      score <= 9 ? (s.gloss < 0.5 ? 'Bel lavoro! Manca solo una bella lucidata.' : 'Bel lavoro: coperta bene e bella lucida.') :
      'Assunto! Quando puoi cominciare?';
    const lines = [
      `Carrozzeria verniciata: ${Math.round(cover * 100)}%`,
      `Vernice lucidata: ${Math.round(s.gloss * 100)}%`,
      s.drips ? `Colature: ${s.drips}` : 'Nessuna colatura',
      s.colors > 2 ? `${s.colors} colori: stile arlecchino` : s.colors === 2 ? 'Bicolore' : 'Tinta unita'
    ];
    if (s.dust > 0.05) lines.push('C\'è ancora polvere di carteggiatura in giro');
    if (glass) lines.push('Vernice anche su vetri e fari: la mascheratura serve a questo');
    this.verdict.set({ score, title, lines });
  }

  /** Scatta una foto dell'auto: condivisione sul telefono, download sul computer. */
  photo(): void {
    if (!this.studio) return;
    const shot = this.studio.snapshot();
    const ctx = shot.getContext('2d')!;
    const pad = Math.round(shot.width * 0.03);
    ctx.font = `italic 800 ${Math.round(shot.width * 0.045)}px "Barlow Condensed", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.fillText('L\'HO VERNICIATA IO', pad, pad);
    ctx.font = `600 ${Math.round(shot.width * 0.022)}px "Barlow Condensed", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('K2K CARROZZERIA · GAMBETTOLA E BORELLO', pad, pad + Math.round(shot.width * 0.052));
    shot.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'k2k-la-mia-auto.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        nav.share({ files: [file], title: 'La mia auto verniciata alla K2K' }).catch(() => undefined);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    }, 'image/png');
    this.speak('photo', true);
  }

  /* ---------- interni ---------- */

  private async start(canvas: HTMLCanvasElement): Promise<void> {
    try {
      const { PaintStudio } = await import('../../fx/car3d/studio');
      // nel frattempo il gioco può essere stato chiuso
      if (canvas !== this.glEl) return;
      const overlay = canvas.parentElement!.querySelector<HTMLCanvasElement>('.pgame__fx')!;
      const studio = await PaintStudio.create(canvas, overlay, Math.min(window.innerWidth, window.innerHeight) < 700);
      // il modello arriva dalla rete: nel frattempo il gioco può essere stato chiuso
      if (canvas !== this.glEl) {
        studio.dispose();
        return;
      }
      this.studio = studio;
      studio.tool = this.tool();
      studio.color = this.color();
      studio.size = SIZES[this.size()];
      studio.setMasking(this.masking());
      studio.onEvent = e => this.onStudio(e);
      const root = canvas.parentElement!;
      const top = root.querySelector<HTMLElement>('.pgame__top')!;
      const dock = root.querySelector<HTMLElement>('.pgame__dock')!;
      const fit = () => {
        studio.resize(canvas.clientWidth, canvas.clientHeight);
        // l'auto va centrata nello spazio libero tra il fumetto e i comandi
        studio.setInsets(top.offsetTop + top.offsetHeight, canvas.clientHeight - dock.offsetTop);
      };
      const ro = new ResizeObserver(fit);
      ro.observe(canvas);
      ro.observe(top);
      ro.observe(dock);
      fit();
      this.cleanup.push(() => ro.disconnect());
      this.zone.run(() => this.ready.set(true));
      // chi non ha ancora girato l'auto dopo qualche secondo riceve il suggerimento
      const touch = window.matchMedia('(pointer: coarse)').matches;
      this.hintTimer = window.setTimeout(() => {
        if (!this.rotated) this.speak(touch ? 'turnTouch' : 'turnMouse', true);
      }, 9000);
    } catch (err) {
      console.error(err);
      this.zone.run(() => this.failed.set(true));
    }
  }

  private stop(): void {
    cancelAnimationFrame(this.turnRaf);
    clearTimeout(this.hintTimer);
    this.rotated = false;
    this.cleanup.forEach(fn => fn());
    this.cleanup = [];
    this.studio?.dispose();
    this.studio = undefined;
    this.ready.set(false);
    this.failed.set(false);
    this.verdict.set(null);
    this.spoke.clear();
    this.say.set(LINES['hello'][0]);
  }

  private onStudio(e: StudioEvent): void {
    if (e === 'rotate') this.rotated = true;
    else this.speak(e, false);
  }

  /** Cambia il fumetto, senza ripetersi troppo spesso. */
  private speak(key: string, force: boolean): void {
    const now = performance.now() / 1000;
    const last = this.spoke.get(key) ?? -9999;
    if (!force && now - last < (COOLDOWN[key] ?? 8)) return;
    // gli errori (colature, grana) hanno la precedenza sui complimenti
    const serious = key === 'drip' || key === 'grain';
    const lastAny = this.spoke.get('*') ?? -9999;
    if (!force && !serious && now - lastAny < 3.5) return;
    this.spoke.set(key, now);
    this.spoke.set('*', now);
    const options = LINES[key];
    if (!options) return;
    const text = options[Math.floor(Math.random() * options.length)];
    this.zone.run(() => this.say.set(text));
  }
}
