import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AppService, M, peso } from '../core/app.service';

/* Confirmed / reported / may have changed. */
@Component({
  selector: 'app-status-tag',
  imports: [NzTagModule, NzIconModule],
  template: `<nz-tag class="badge" [class]="st()" [nzColor]="color()"><nz-icon [nzType]="icon()" [nzTheme]="st() === 'confirmed' ? 'fill' : 'outline'" /> {{ app.t('badge_' + st()) }}</nz-tag>`
})
export class StatusTag {
  app = inject(AppService);
  b = input.required<any>();
  today = input.required<string>();
  st = computed(() => M.effectiveStatus(this.b(), this.today()) as string);
  color = computed(() => ({ confirmed: 'success', reported: 'warning', outdated: 'error' } as any)[this.st()]);
  icon = computed(() => ({ confirmed: 'check-circle', reported: 'info-circle', outdated: 'exclamation-circle' } as any)[this.st()]);
}

@Component({
  selector: 'app-level-tag',
  imports: [NzTagModule],
  template: `@if (b().level === 'local') { <nz-tag nzColor="green">{{ app.t('tag_local', { city: app.cityName(b().city) }) }}</nz-tag> } @else { <nz-tag nzColor="blue">{{ app.t('tag_national') }}</nz-tag> }`
})
export class LevelTag {
  app = inject(AppService);
  b = input.required<any>();
}

@Component({
  selector: 'app-amount',
  template: `
    @if (b().amount_php) {
      <div class="amount" [class.amount-lg]="size() === 'lg'">{{ peso(b().amount_php) }} @if (b().amount_note) { <span class="amount-note">{{ app.L(b().amount_note) }}</span> }</div>
    } @else {
      <div class="value" [class.value-lg]="size() === 'lg'">{{ b().value ? app.L(b().value) : app.t('detail_amount_unknown') }}</div>
    }`
})
export class Amount {
  app = inject(AppService);
  b = input.required<any>();
  size = input<'md' | 'lg'>('md');
  peso = peso;
}

@Component({
  selector: 'app-maybe',
  template: `@if (res() && res().fit === 'maybe' && res().unknown.length) { <span class="maybe">{{ app.t('maybe_note', { what: what() }) }}</span> }`
})
export class MaybeLine {
  app = inject(AppService);
  res = input<any>(null);
  what = computed(() => (this.res()?.unknown || []).map((u: string) => this.app.t('maybe_' + u)).join(', '));
}

@Component({
  selector: 'app-benefit-card',
  imports: [NzCardModule, NzIconModule, RouterLink, StatusTag, LevelTag, Amount, MaybeLine],
  host: { class: 'card', '[attr.data-id]': 'b().id', '[attr.data-groups]': 'b().groups.join(" ")' },
  template: `
    <nz-card nzSize="small" nzHoverable>
      <div class="col gap4">
        <a class="title" [routerLink]="app.benefitLink(b())">{{ app.L(b().title) }}</a>
        <app-amount [b]="b()" />
        <span class="muted">{{ app.L(b().frequency) }}</span>
        @if (b().expires_on) { <span class="maybe"><nz-icon nzType="clock-circle" /> {{ app.t('ends_on', { date: app.fmtDate(b().expires_on) }) }}</span> }
        @if (b().no_apply) { <span class="muted">{{ app.t('no_apply') }}</span> }
        <app-maybe [res]="res()" />
        <div class="row wrap gap6 meta">
          <app-level-tag [b]="b()" />
          <app-status-tag [b]="b()" [today]="today()" />
          <span class="muted small">{{ app.t('checked', { date: app.fmtDate(b().verification.checked_on) }) }}</span>
        </div>
      </div>
    </nz-card>`
})
export class BenefitCard {
  app = inject(AppService);
  b = input.required<any>();
  res = input<any>(null);
  today = input.required<string>();
}

/* Large tappable option with a radio or checkbox look. */
@Component({
  selector: 'app-choice',
  imports: [NzButtonModule, NzIconModule],
  host: { '[class.on]': 'on()' },
  template: `
    <button nz-button nzBlock nzSize="large" type="button" class="choice"
      [attr.role]="multi() ? 'checkbox' : 'radio'" [attr.aria-checked]="on()" [attr.aria-pressed]="on()">
      @if (multi()) { <nz-icon [nzType]="on() ? 'check-square' : 'border'" [nzTheme]="on() ? 'fill' : 'outline'" /> }
      @if (icon()) { <nz-icon [nzType]="icon()!" /> }
      <span class="choice-text"><ng-content />@if (hint()) { <span class="hint">{{ hint() }}</span> }</span>
    </button>`
})
export class Choice {
  on = input(false);
  multi = input(false);
  hint = input<string | null>(null);
  icon = input<string | null>(null);
}
