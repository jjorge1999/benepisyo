import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { AppService } from '../core/app.service';
import { SeoService } from '../core/seo.service';

const C = {
  intro: { tl: 'Ang Benepisyo ay libreng gabay para malaman ng bawat Pilipino ang lahat ng benepisyong puwede niyang makuha sa sariling lungsod: pambansa at lokal, may eksaktong halaga, dadalhin at opisina.', en: 'Benepisyo is a free guide that helps every Filipino find every benefit they can get in their own city: national and local, with exact amounts, what to bring and which office to visit.' },
  notgov: { tl: 'Hindi ito opisyal na website ng gobyerno.', en: 'This is not an official government website.' },
  notgov2: { tl: 'Ang opisina na nagbibigay ng benepisyo ang magpapasya kung kwalipikado kayo. Kumpirmahin muna bago pumunta.', en: 'The issuing office decides eligibility. Confirm before you go.' },
  acc: { tl: 'Paano namin sinisigurong tama', en: 'How we keep it accurate' },
  acc1: { tl: 'Kumpirmado: may opisyal na source (batas, ordinansa, website o post ng lungsod) at na-check sa loob ng 6 na buwan.', en: 'Confirmed: backed by an official source (law, ordinance, city website or post) and checked within 6 months.' },
  acc2: { tl: 'Ulat: galing sa balita, paaralan o user; hindi pa kumpirmado ng opisyal na source.', en: 'Reported: from news, a school or a user; not yet confirmed by an official source.' },
  acc3: { tl: 'Baka nagbago na: hindi pa nare-recheck nang higit 6 na buwan.', en: 'May have changed: not rechecked in over 6 months.' },
  priv: { tl: 'Walang account. Ang inyong mga sagot at listahan ng pamilya ay naka-save lang sa phone ninyo. Kung gagamitin ang lokasyon, sa phone lang ito tinitingnan para hulaan ang lungsod; hindi ito ipinapadala o sine-save. Hindi kami humihingi ng ID number, eksaktong kita o birthday. Ang contact sa report ay opsyonal at binubura pagkalipas ng 90 araw (RA 10173, Data Privacy Act).', en: 'No accounts. Your answers and family list are saved on your phone only. If you use your location, it is only checked on your phone to guess your city; it is never sent or saved. We never ask for ID numbers, exact income or birthdays. Contact details on reports are optional and deleted after 90 days (RA 10173, Data Privacy Act).' },
  free: { tl: 'Walang bayad, walang fixer', en: 'Free, no fixers' },
  free2: { tl: 'Libre ang mga benepisyong nakalista dito. Huwag magbayad sa sinumang nag-aalok na "ilakad" ito.', en: 'The benefits listed here are free. Don\'t pay anyone offering to "process" them for you.' },
  covered: { tl: 'Ang lungsod na saklaw ngayon: Calamba, Laguna.', en: 'City covered now: Calamba, Laguna.' }
} as const;


@Component({
  selector: 'app-about',
  imports: [NzAlertModule, NzCardModule],
  template: `
    <div class="col gap16">
      <h1 class="h1">{{ app.t('about_title') }}</h1>
      <p class="m0">{{ app.L(C.intro) }}</p>
      <nz-alert nzType="warning" nzShowIcon [nzMessage]="ng" [nzDescription]="app.L(C.notgov2)" />
      <ng-template #ng><b>{{ app.L(C.notgov) }}</b></ng-template>
      <nz-card [nzTitle]="app.L(C.acc)"><ul class="m0"><li>{{ app.L(C.acc1) }}</li><li>{{ app.L(C.acc2) }}</li><li>{{ app.L(C.acc3) }}</li></ul></nz-card>
      <nz-card nzTitle="Privacy"><p class="m0">{{ app.L(C.priv) }}</p></nz-card>
      <nz-card [nzTitle]="app.L(C.free)"><p class="m0">{{ app.L(C.free2) }}</p></nz-card>
      <span class="muted">Data {{ app.meta.data_version }} · {{ app.L(C.covered) }}</span>
    </div>`
})
export class About {
  app = inject(AppService);
  C = C;
  constructor() { inject(SeoService).set({ title: 'Tungkol sa Benepisyo', description: this.app.t('footer_disclaimer'), path: 'tungkol/' }); }
}

@Component({
  selector: 'app-not-found',
  imports: [NzButtonModule, RouterLink],
  template: `<div class="col gap16 pad40"><h1 class="h1">{{ app.t('not_found') }}</h1><a nz-button nzType="primary" class="self-start" routerLink="/"><span>Benepisyo</span></a></div>`
})
export class NotFound {
  app = inject(AppService);
  constructor() { inject(SeoService).set({ title: 'Benepisyo', description: this.app.t('not_found'), path: '' }); }
}
