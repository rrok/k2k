import { Component, ElementRef, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { PaintIntroComponent } from './shared/components/paint-intro/paint-intro.component';
import { PaintCanComponent } from './shared/components/paint-can/paint-can.component';
import { MotionFxService } from './shared/services/motion-fx.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, PaintIntroComponent, PaintCanComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    const fx = inject(MotionFxService);
    afterNextRender(() => fx.init(host.nativeElement));
  }
}
