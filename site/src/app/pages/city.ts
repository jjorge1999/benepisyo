import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AppService, M } from '../core/app.service';
import { SeoService } from '../core/seo.service';
import { BenefitCard } from '../shared/ui';

export const PAGE_SIZE = 8;

/* All benefits for a city. Only the current page of cards is rendered, so long lists stay fast on cheap phones. */
@Component({
  selector: 'app-city',
  imports: [FormsModule, RouterLink, NzButtonModule, NzEmptyModule, NzIconModule, NzInputModule, NzPaginationModule, NzSegmentedModule, NzTagModule, BenefitCard],
  template: `
    <div class="col gap16">
      <section class="hero">
        <h1>{{ app.t('city_page_title', { city: c().name }) }}</h1>
        <p class="muted">{{ app.t('city_page_sub', { city: c().name }) }}</p>
      </section>
      <a nz-button nzType="primary" nzSize="large" nzBlock routerLink="/"><span>{{ app.t('start_quiz') }}</span></a>
      <nz-input-wrapper nzSize="large" class="search">
        <nz-icon nzInputPrefix nzType="search" />
        <input nz-input id="search" type="search" [attr.aria-label]="app.t('search_ph')" [placeholder]="app.t('search_ph')" [ngModel]="q()" (ngModelChange)="q.set($event); page.set(1)" />
      </nz-input-wrapper>
      <nz-segmented id="level" nzBlock [nzOptions]="levelOptions()" [ngModel]="level()" (ngModelChange)="level.set($event); page.set(1)" />
      <div class="row wrap gap6 filters" role="group" aria-label="Filter">
        @for (g of groups(); track g.id) {
          <nz-tag nzMode="checkable" class="filter-tag" [attr.data-filter]="g.id" [attr.aria-pressed]="group() === g.id" [nzChecked]="group() === g.id" (nzCheckedChange)="group.set(g.id); page.set(1)">{{ g.label }}</nz-tag>
        }
      </div>
      <span class="muted" id="result-count">{{ app.t('showing', { n: filtered().length, total: all().length }) }}</span>
      <div class="col gap10" id="benefit-list">
        @for (b of shown(); track b.id) { <app-benefit-card [b]="b" [today]="app.built" /> }
        @empty { <nz-empty id="search-none" nzNotFoundImage="simple" [nzNotFoundContent]="app.t('search_none')" /> }
      </div>
      @if (filtered().length > size) {
        <nz-pagination class="pager" [nzPageIndex]="page()" (nzPageIndexChange)="go($event)" [nzPageSize]="size" [nzTotal]="filtered().length" />
      }
    </div>`
})
export class City {
  app = inject(AppService);
  seo = inject(SeoService);
  city = input.required<string>(); // route param
  size = PAGE_SIZE;
  q = signal('');
  group = signal('all');
  level = signal<string>('all');
  page = signal(1);

  c = computed(() => this.app.meta.cities.find((x: any) => x.id === this.city()));
  all = computed(() => this.app.data.benefits
    .filter((b: any) => M.appliesToCity(b, this.city()))
    .sort((a: any, b: any) => (a.level === b.level ? 0 : a.level === 'local' ? -1 : 1)));
  filtered = computed(() => {
    const hits = this.q().trim() ? new Set(M.search(this.all(), this.q(), this.city()).map((b: any) => b.id)) : null;
    return this.all().filter((b: any) => (this.group() === 'all' || b.groups.includes(this.group()))
      && (this.level() === 'all' || b.level === this.level()) && (!hits || hits.has(b.id)));
  });
  shown = computed(() => this.filtered().slice((this.page() - 1) * this.size, this.page() * this.size));
  levelOptions = computed(() => { this.app.lang(); return [
    { value: 'all', label: this.app.t('filter_all') },
    { value: 'local', label: this.c().name },
    { value: 'national', label: this.app.t('level_national_short') }
  ]; });
  groups = computed(() => [{ id: 'all', label: this.app.t('filter_all') }].concat(this.app.meta.groups.map((g: any) => ({ id: g.id, label: g[this.app.lang()] }))));

  ngOnInit() {
    const c = this.c();
    const list = this.all();
    this.seo.set({
      title: `Benepisyo sa ${c.name}`,
      description: this.app.t('city_page_sub', { city: c.name }),
      path: `${c.id}/`,
      jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list.map((b: any, i: number) => ({ '@type': 'ListItem', position: i + 1, url: this.seo.canonical(`${c.id}/${b.id}/`), name: b.title.tl })) }
    });
  }

  go(p: number) {
    this.page.set(p);
    if (this.app.browser) document.getElementById('result-count')?.scrollIntoView({ block: 'start' });
  }
}
