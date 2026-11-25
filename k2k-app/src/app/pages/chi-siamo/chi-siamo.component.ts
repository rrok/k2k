import { Component } from '@angular/core';
import { CarStillComponent } from '../../shared/components/car-still/car-still.component';
import { PartnerBannerComponent } from '../../shared/components/partner-banner/partner-banner.component';

@Component({
  selector: 'app-chi-siamo',
  standalone: true,
  imports: [PartnerBannerComponent, CarStillComponent],
  templateUrl: './chi-siamo.component.html',
  styleUrl: './chi-siamo.component.scss'
})
export class ChiSiamoComponent {}
