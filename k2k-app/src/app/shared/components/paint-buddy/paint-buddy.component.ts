import { Component, ElementRef, ViewChild, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import { Painter, drawPainter } from '../../fx/spray-engine';
import { PaintGameService } from '../../services/paint-game.service';

/** Mezzo busto del verniciatore K2K, disegnato su canvas (lo stesso che vernicia i titoli). */
@Component({
  selector: 'app-buddy-face',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<canvas #c class="buddy-face" aria-hidden="true"></canvas>`
})
export class BuddyFaceComponent {
  @ViewChild('c', { static: true }) private ref!: ElementRef<HTMLCanvasElement>;

  constructor() {
    afterNextRender(() => {
      const canvas = this.ref.nativeElement;
      const size = 128;
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      // sfondo: luce della cabina
      const bg = ctx.createRadialGradient(size * 0.5, size * 0.3, 4, size * 0.5, size * 0.5, size * 0.7);
      bg.addColorStop(0, '#3a3d45');
      bg.addColorStop(1, '#141519');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      // solo testa e spalle: i piedi restano fuori dal canvas
      const painter: Painter = { x: size * 0.44, y: size * 3.02, h: size * 2.42, facing: 1, phase: 0, aim: 0.6, airborne: true, alpha: 1 };
      drawPainter(ctx, painter);
    });
  }
}

/**
 * Invito al minigioco: il verniciatore con il fumetto "Vuoi verniciare con me?".
 * Il gioco si apre solo cliccando qui.
 */
@Component({
  selector: 'app-paint-invite',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [BuddyFaceComponent],
  template: `
    <button type="button" class="invite" (click)="game.start()">
      <span class="invite__say">Vuoi verniciare con me?</span>
      <span class="invite__who"><app-buddy-face /></span>
    </button>
  `
})
export class PaintInviteComponent {
  readonly game = inject(PaintGameService);
}
