import { Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AppService } from './core/app.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NzButtonModule, NzIconModule, NzAlertModule],
  template: `
    <div class="bp-layout">
      @if (app.offline()) { <nz-alert id="offline" nzBanner nzType="warning" [nzMessage]="app.t('offline')" /> }
      <header class="bp-head">
        <div class="wrap bp-head-row">
          <a class="brand" routerLink="/">
            <b>Benepisyo<span>.</span></b>
            <small>{{ app.t('brand_tag') }}</small>
          </a>
          <button nz-button nzGhost id="lang-toggle" type="button" (click)="app.setLang(app.lang() === 'en' ? 'tl' : 'en')">
            <nz-icon nzType="translation" /><span>{{ app.t('lang_switch') }}</span>
          </button>
        </div>
      </header>
      <nav class="bp-nav" aria-label="Main">
        <div class="wrap row gap4">
          <a nz-button nzType="text" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page"><span>{{ app.t('nav_family') }}</span></a>
          <a nz-button nzType="text" [routerLink]="['/', navCity()]" routerLinkActive="active" ariaCurrentWhenActive="page"><span>{{ app.t('nav_city') }}</span></a>
          <a nz-button nzType="text" routerLink="/tungkol" routerLinkActive="active" ariaCurrentWhenActive="page"><span>{{ app.t('nav_about') }}</span></a>
        </div>
      </nav>
      <main id="main" class="wrap bp-main"><router-outlet /></main>
      <footer class="bp-foot">
        <div class="wrap col gap8">
          <b>{{ app.t('footer_disclaimer') }}</b>
          <span class="muted">{{ app.t('footer_privacy') }}</span>
          <span class="muted"><a routerLink="/tungkol">{{ app.t('nav_about') }}</a> · Data {{ app.meta.data_version }}</span>
        </div>
      </footer>
    </div>`
})
export class App {
  app = inject(AppService);
  /** "All benefits" opens the saved person's city; Calamba until someone is saved. */
  navCity = signal('calamba');
  constructor() {
    afterNextRender(() => {
      this.app.initBrowser();
      const c = this.app.activePerson()?.city;
      if (c) this.navCity.set(c);
      try {
        if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
          navigator.serviceWorker.register(document.baseURI.replace(/[^/]*$/, '') + 'sw.js').catch(() => {});
        }
      } catch { /* not available */ }
    });
  }
}
