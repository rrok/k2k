import { Injectable, signal } from '@angular/core';

/** Apre e chiude il minigioco "Vernicia con me" (il componente vive in app-root). */
@Injectable({ providedIn: 'root' })
export class PaintGameService {
  readonly open = signal(false);

  start(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}
