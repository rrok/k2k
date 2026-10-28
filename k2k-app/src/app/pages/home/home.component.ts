import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PartnerBannerComponent } from '../../shared/components/partner-banner/partner-banner.component';
import { SprayMistComponent } from '../../shared/components/spray-mist/spray-mist.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, PartnerBannerComponent, SprayMistComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {}
