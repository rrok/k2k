import { Component, HostListener, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent implements OnDestroy {
  isCollapsed = true;

  links = [
    { path: '/', label: 'Home' },
    { path: '/chi-siamo', label: 'Chi Siamo' },
    { path: '/servizi', label: 'Servizi' },
    { path: '/assicurazioni', label: 'Assicurazioni' },
    { path: '/cristalli', label: 'Cristalli' },
    { path: '/aziende', label: 'Aziende' }
  ];

  toggleNav(): void {
    this.setOpen(this.isCollapsed);
  }

  closeNav(): void {
    this.setOpen(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeNav();
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove('nav-open');
  }

  private setOpen(open: boolean): void {
    this.isCollapsed = !open;
    // Con il menu a tutto schermo aperto la pagina sotto non scorre
    document.documentElement.classList.toggle('nav-open', open);
  }
}
