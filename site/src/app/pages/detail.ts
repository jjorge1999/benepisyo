import { Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { AppService, M, Person, manilaToday, peso, store } from '../core/app.service';
import { SeoService } from '../core/seo.service';
import { makeCard } from '../core/visit-card.js';
import { Amount, LevelTag, MaybeLine, StatusTag } from '../shared/ui';
import { Checkin } from '../shared/checkin';
import { LGU_BY_ID } from '../core/lgus';

function shrinkImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

@Component({
  selector: 'app-detail',
  imports: [FormsModule, RouterLink, NzAlertModule, NzButtonModule, NzCardModule, NzCheckboxModule, NzIconModule, NzInputModule, NzModalModule, NzStepsModule, NzTagModule, NzTimelineModule, Amount, LevelTag, MaybeLine, StatusTag, Checkin],
  templateUrl: './detail.html'
})
export class Detail {
  app = inject(AppService);
  seo = inject(SeoService);
  city = input<string | undefined>(undefined); // route param, only for a city's own benefits
  id = input.required<string>();
  lugar = input<string | undefined>(undefined); // ?lugar= town, for benefits every LGU gives

  b = computed(() => this.app.benefitById(this.id()));
  isLocal = computed(() => this.b().level === 'local');
  /** Town shown on the page. Shared pages render generic first (same as the pre-rendered HTML), then fill in the town. */
  place = signal<string | null>(null);
  c = computed(() => { const l = LGU_BY_ID.get(this.place() || ''); return l ? { id: l.id, name: l.name, where: l.where } : null; });
  office = computed(() => this.app.officeFor(this.app.officeById(this.b().office), this.place()));
  st = computed(() => M.effectiveStatus(this.b(), this.app.built));
  mapUrl = computed(() => (this.office()?.map_query ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(this.office().map_query) : null));
  history = computed(() => (this.b().history || []).slice().sort((x: any, y: any) => (x.date < y.date ? 1 : -1)));

  p = signal<Person | null>(null);
  today = signal(this.app.built);
  count = signal(0);
  ready = signal(false);

  constructor() {
    afterNextRender(() => {
      const p = this.app.activePerson();
      this.p.set(p);
      if (!this.isLocal()) {
        const q = this.lugar();
        this.place.set(q && LGU_BY_ID.has(q) ? q : p?.city && LGU_BY_ID.has(p.city) ? p.city : null);
      }
      this.today.set(manilaToday());
      this.ready.set(true);
      if (this.app.api) {
        fetch(this.app.api.replace(/\/$/, '') + '/api/counts?ids=' + encodeURIComponent(this.b().id)).then((r) => (r.ok ? r.json() : null))
          .then((j) => { const n = j?.counts?.[this.b().id]; if (n) this.count.set(n); }).catch(() => {});
      }
    });
  }

  ngOnInit() {
    const b = this.b();
    if (this.isLocal()) this.place.set(this.city() || b.city);
    const c = this.c(); const office = this.office();
    const path = this.isLocal() ? `${b.city}/${b.id}/` : `b/${b.id}/`;
    this.seo.set({
      title: `${b.title.tl} – ${c ? c.name : 'Benepisyo'}`,
      description: b.summary.tl.slice(0, 155),
      path,
      jsonld: {
        '@context': 'https://schema.org', '@type': 'GovernmentService',
        name: b.title.tl, alternateName: b.title.en, description: b.summary.tl,
        areaServed: this.isLocal() && c ? { '@type': 'City', name: c.name + ', ' + c.where } : { '@type': 'Country', name: 'Philippines' },
        provider: { '@type': 'GovernmentOrganization', name: office.name.en },
        isAccessibleForFree: !!b.free, url: this.seo.canonical(path)
      }
    });
  }

  /* Why this person qualifies */
  why = computed(() => {
    const p = this.p(); if (!p) return null;
    const b = this.b(); const a = this.app; a.lang();
    const res = M.evaluate(b, p, this.today());
    if (res.fit === 'no') return null;
    const c = p.city ? a.cityName(p.city) : p.cityLabel;
    const items = res.why.map((w: string) => {
      const [k, v] = w.split(':');
      if (k === 'group') return a.t('why_group_' + v);
      if (k === 'age') return a.t('why_age', { n: v });
      if (k === 'resident') return a.t('why_resident', { city: c });
      if (k === 'income') return a.t('why_income_' + v);
      if (['milestone', 'no_pension', 'employed', 'four_ps', 'not_four_ps', 'children', 'lost_job'].includes(k)) return a.t('why_' + k);
      return null;
    }).filter(Boolean);
    (p.docs || []).forEach((d) => { if ((b.needs || []).some((g: string[]) => g.includes(d))) items.push(a.t('why_has', { doc: a.docName(d) })); });
    return { res, items, title: p.self ? a.t('detail_why') : a.t('detail_why_other', { subj: a.subj(p) }) };
  });
  has(doc?: string) { const p = this.p(); return !!(p && doc && doc.split('|').some((d) => (p.docs || []).includes(d))); }

  share() {
    const b = this.b(); const url = location.href;
    if (navigator.share) { navigator.share({ title: this.app.L(b.title), text: this.app.L(b.title) + ' – Benepisyo', url }).catch(() => {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => this.app.toast('success', this.app.t('share_copied')), () => this.app.toast('info', url));
    else this.app.toast('info', url);
  }

  /* ---------- report ---------- */
  reportOpen = signal(false);
  repWhat = '';
  repContact = '';
  repFile: File | null = null;
  repErr = signal(false);
  repBusy = signal(false);
  async sendReport() {
    if (!this.repWhat.trim()) { this.repErr.set(true); return; }
    this.repBusy.set(true);
    const photo = this.repFile ? await shrinkImage(this.repFile) : null;
    const status = await this.app.send('/api/reports', { benefit_id: this.b().id, message: this.repWhat.trim().slice(0, 1000), contact: this.repContact.trim().slice(0, 100) || null, photo, page: location.pathname });
    this.repBusy.set(false); this.reportOpen.set(false);
    this.repWhat = ''; this.repContact = ''; this.repFile = null; this.repErr.set(false);
    this.app.toast('success', status === 'sent' ? this.app.t('report_sent') : this.app.t('report_queued'));
  }
  pickFile(e: Event) { this.repFile = (e.target as HTMLInputElement).files?.[0] || null; }

  /* ---------- visit card ---------- */
  visitOpen = signal(false);
  bundle = signal(false);
  withName = signal(false);
  cardUrl = signal<string | null>(null);
  private blob: Blob | null = null;
  others = computed(() => {
    const b = this.b(); const p = this.p();
    return M.cityBenefits(this.app.data.benefits, this.place()).filter((x: any) => {
      if (x.id === b.id || x.office !== b.office) return false;
      if (!p) return true;
      const res = M.evaluate(x, p, this.today()); return res.fit !== 'no' && !res.missing.length;
    });
  });
  openVisit() {
    this.bundle.set(false); this.withName.set(false); this.visitOpen.set(true); this.draw();
  }
  draw() {
    const b = this.b(); const p = this.p();
    const chosen = this.bundle() ? [b].concat(this.others()) : [b];
    const a = this.app;
    const draw = makeCard({ t: a.t, L: a.L, lang: a.lang(), fmtDate: a.fmtDate, cityName: a.cityName, peso, siteHost: a.siteHost || location.host });
    draw(chosen, this.office(), this.withName() && p ? p.name : '', p).then((bl) => {
      this.blob = bl;
      const old = this.cardUrl(); if (old) URL.revokeObjectURL(old);
      this.cardUrl.set(URL.createObjectURL(bl));
    });
    const visits = store.get<any[]>('visits', []);
    chosen.forEach((x: any) => { if (!visits.some((v) => v.id === x.id && !v.answered)) visits.push({ id: x.id, at: this.today(), city: p?.city || 'calamba' }); });
    store.set('visits', visits.slice(-30));
  }
  saveCard() {
    if (!this.blob) return;
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(this.blob); a.download = 'benepisyo-' + this.b().id + '.png';
      document.body.appendChild(a); a.click(); a.remove(); this.app.toast('success', this.app.t('plan_saved'));
    } catch { this.app.toast('info', this.app.t('plan_hold')); }
  }
  shareCard() {
    if (!this.blob) return;
    let file: File | null; try { file = new File([this.blob], 'benepisyo-' + this.b().id + '.png', { type: 'image/png' }); } catch { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: this.app.L(this.b().title) }).catch(() => {});
    else this.app.toast('info', this.app.t('plan_hold'));
  }
}
