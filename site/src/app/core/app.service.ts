import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import I18N from '../../i18n.js';
import M from '../../match.js';
import DATA from '../../generated/data.json';
import { LGU_NAMES } from './names';

export { M };
export const MAX_PEOPLE = 6;
export const manilaToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
export const peso = (n: number) => '₱' + Number(n).toLocaleString('en-PH');
export const uid = () => Math.random().toString(36).slice(2, 10);

export type Lang = 'tl' | 'en';
export interface Person {
  id: string; self: boolean; name: string; city: string | null; cityLabel: string;
  groups: string[]; answers: Record<string, any>; docs: string[]; created: string; noDocs?: boolean; cityTouched?: boolean;
}

/* localStorage that never throws (private mode, blocked storage, server render). */
export const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('bp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('bp.' + k, JSON.stringify(v)); } catch { /* unavailable */ } },
  del(k: string) { try { localStorage.removeItem('bp.' + k); } catch { /* ignore */ } }
};

@Injectable({ providedIn: 'root' })
export class AppService {
  private platformId = inject(PLATFORM_ID);
  private doc = inject(DOCUMENT);
  private message = inject(NzMessageService);

  readonly browser = isPlatformBrowser(this.platformId);
  readonly data: any = DATA;
  readonly meta: any = (DATA as any).meta;
  /** Date the pages were built: used for badges so server and browser render the same thing. */
  readonly built: string = (DATA as any).built;
  readonly api: string = (DATA as any).api || '';
  readonly siteHost: string = (DATA as any).site_host || '';

  /* Language: pages render in Tagalog first, then switch to the saved choice after loading. */
  readonly lang = signal<Lang>('tl');
  readonly offline = signal(false);

  t = (k: string, v?: Record<string, unknown>) => I18N.t(this.lang(), k, v);
  L = (o: any) => (o ? o[this.lang()] || o.tl || o.en || '' : '');

  initBrowser() {
    if (!this.browser) return;
    if (store.get<string>('lang', 'tl') === 'en') this.setLang('en');
    const net = () => { this.offline.set(navigator.onLine === false); if (navigator.onLine) this.flushOutbox(); };
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
  }

  setLang(l: Lang) {
    store.set('lang', l);
    this.lang.set(l);
    this.doc.documentElement.lang = l === 'en' ? 'en' : 'tl';
  }

  fmtDate = (iso: string) => {
    try { return new Date(iso + 'T00:00:00Z').toLocaleDateString(this.lang() === 'en' ? 'en-PH' : 'fil-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return iso; }
  };
  cityName = (id: string | null) => (id ? LGU_NAMES[id] || this.meta.cities.find((c: any) => c.id === id)?.name || '' : '');
  /** Cities with full, verified local data (others get national + law-based benefits). */
  isFull = (id: string | null) => !!id && this.meta.cities.some((c: any) => c.id === id && c.supported);
  /** Office names like "OSCA ng {city}" filled in for a town, or "your city or town" when unknown. */
  officeFor = (o: any, cityId: string | null) => {
    if (!o?.template) return o;
    const c = this.cityName(cityId);
    const fill = (x: any) => ({ tl: x.tl.replace('{city}', c || 'inyong lungsod o bayan'), en: x.en.replace('{city}', c || 'your city or town') });
    return { ...o, name: fill(o.name), place: fill(o.place), map_query: c ? o.map_query.replace('{city}', c) : null };
  };
  docName = (id: string) => this.meta.docs.find((d: any) => d.id === id)?.[this.lang()] || id;
  benefitLink = (b: any) => (b.level === 'local' ? ['/', b.city, b.id] : ['/b', b.id]);
  benefitById = (id: string) => this.data.benefits.find((b: any) => b.id === id);
  officeById = (id: string) => this.data.offices.find((o: any) => o.id === id);
  subj = (p: Person) => (p.self ? this.t('subj_self') : p.name ? this.t('subj_other', { name: p.name }) : this.t('subj_other_plain'));
  subjposs = (p: Person) => (p.self ? this.t('subjposs_self') : p.name ? this.t('subjposs_other', { name: p.name }) : this.t('subjposs_other_plain'));

  toast(kind: 'success' | 'info', text: string) { this.message[kind](text); }

  /* Saved family list (phone only). */
  people(): Person[] { return store.get<Person[]>('people', []); }
  savePeople(list: Person[]) { store.set('people', list.slice(0, MAX_PEOPLE)); }
  activePerson(): Person | null {
    const list = this.people(); const id = store.get<string | null>('active', null);
    return list.find((p) => p.id === id) || list[0] || null;
  }

  /* Reports, check-ins, city requests: send now, or keep on the phone until there is a connection. */
  private post(path: string, payload: unknown) {
    if (!this.api) return Promise.reject(new Error('no-api'));
    return fetch(this.api.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }
  private queue(path: string, payload: unknown) {
    const box = store.get<any[]>('outbox', []); box.push({ path, payload, at: Date.now() }); store.set('outbox', box.slice(-50));
  }
  send(path: string, payload: unknown): Promise<'sent' | 'queued'> {
    return this.post(path, payload).then(() => 'sent' as const).catch(() => { this.queue(path, payload); return 'queued' as const; });
  }
  flushOutbox() {
    if (!this.api || !navigator.onLine) return;
    const box = store.get<any[]>('outbox', []); if (!box.length) return;
    store.set('outbox', []);
    box.forEach((item) => this.post(item.path, item.payload).catch(() => this.queue(item.path, item.payload)));
  }

  /* "Did you get it?" prompt a day after planning a visit. */
  pendingCheckin(today: string) {
    const visits = store.get<any[]>('visits', []);
    return visits.find((v) => !v.answered && M.daysBetween(v.at, today) >= 1 && this.benefitById(v.id)) || null;
  }

  readonly isEn = computed(() => this.lang() === 'en');
}
