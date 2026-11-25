import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PaintInviteComponent } from '../../shared/components/paint-buddy/paint-buddy.component';
import { PartnerBannerComponent } from '../../shared/components/partner-banner/partner-banner.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, PartnerBannerComponent, PaintInviteComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  /** Come si chiede un preventivo (scheda dell'hero). */
  preventivo = [
    { title: 'Fotografa il danno', text: 'Bastano le foto fatte con il telefono.' },
    { title: 'Inviale su WhatsApp', text: 'Oppure passa in una delle due sedi.' },
    { title: 'Ricevi il preventivo', text: 'Rapido e gratuito.' }
  ];

  /** I numeri in breve, sotto l'hero. */
  fatti = [
    { value: '2', label: 'sedi: Gambettola e Borello' },
    { value: '4', label: 'compagnie assicurative partner' },
    { value: '0 €', label: 'di anticipo sui sinistri convenzionati' },
    { value: '100%', label: 'ricambi originali' }
  ];

  /** Il lavoro passo per passo, dal preventivo alla riconsegna. */
  percorso = [
    {
      icon: 'fa-solid fa-camera',
      title: 'Preventivo',
      text: 'Foto su WhatsApp o visita in sede: preventivo rapido e gratuito. Con l\'assicurazione apriamo noi la pratica.'
    },
    {
      icon: 'fa-solid fa-screwdriver-wrench',
      title: 'Riparazione',
      text: 'Danni da collisione riparati con ricambi originali. Per la grandine, tecnica levabolli.'
    },
    {
      icon: 'fa-solid fa-tape',
      title: 'Preparazione',
      text: 'Fondo dove serve, poi carta e nastro a proteggere vetri, fari e ruote.'
    },
    {
      icon: 'fa-solid fa-spray-can-sparkles',
      title: 'Verniciatura a forno',
      text: 'Colore steso in cabina e cotto a forno, per un risultato perfetto e duraturo.'
    },
    {
      icon: 'fa-solid fa-key',
      title: 'Riconsegna',
      text: 'Auto lucidata, lavata e igienizzata in omaggio. Nel frattempo ti muovi con l\'auto di cortesia.'
    }
  ];

  perche = [
    {
      icon: 'fa-solid fa-file-shield',
      title: 'Sinistri Zero Pensieri',
      text: 'Gestiamo tutto noi con Allianz, Generali, Prima e Zurich. Nessun anticipo.'
    },
    {
      icon: 'fa-solid fa-spray-can-sparkles',
      title: 'Verniciatura a Forno',
      text: 'Tecnologie di ultima generazione per un risultato perfetto e duraturo.'
    },
    {
      icon: 'fa-solid fa-car',
      title: 'Auto di Cortesia',
      text: 'Mobilità garantita per tutta la durata dell\'intervento, senza costi aggiuntivi.'
    },
    {
      icon: 'fa-solid fa-pump-soap',
      title: 'Lavaggio Omaggio',
      text: 'Lavaggio esterno e igienizzazione interni inclusi in ogni riparazione.'
    }
  ];

  servizi = [
    {
      title: 'Carrozzeria e Verniciatura a Forno',
      text: 'Riparazione danni da collisione con ricambi originali e garanzia.'
    },
    {
      title: 'Riparazione Danni da Grandine',
      text: 'Tecnica levabolli specializzata senza verniciare.'
    },
    {
      title: 'Centro Glassdrive (Borello)',
      text: 'Sostituzione cristalli e ricalibrazione sistemi ADAS.'
    },
    {
      title: 'Gestione Sinistri Completa',
      text: 'Pratiche dirette con le assicurazioni convenzionate.'
    }
  ];

  /** Campioni della mazzetta colori nella sezione servizi. */
  mazzetta = [
    { label: 'Carrozzeria', color: '#17181b' },
    { label: 'Verniciatura', color: '#8e0b20' },
    { label: 'Grandine', color: '#c8102e' },
    { label: 'Cristalli', color: '#ff4d5e' },
    { label: 'Sinistri', color: '#ecdfb2', light: true },
    { label: 'Auto di cortesia', color: '#c9ced3', light: true },
    { label: 'Lavaggio omaggio', color: '#f4f5f6', light: true }
  ];
}
