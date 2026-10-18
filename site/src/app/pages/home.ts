import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzAutocompleteModule, NzAutocompleteTriggerDirective } from 'ng-zorro-antd/auto-complete';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { AppService, M, MAX_PEOPLE, Person, manilaToday, store, uid } from '../core/app.service';
import { SeoService } from '../core/seo.service';
import { locate, locationAllowed, nearestLgu } from '../core/geo';
import { BenefitCard, Choice } from '../shared/ui';
import { Checkin } from '../shared/checkin';

type View = 'city' | 'who' | 'q' | 'results' | 'family';

@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink, NzAlertModule, NzAutocompleteModule, NzBadgeModule, NzButtonModule, NzCardModule, NzDividerModule, NzEmptyModule, NzIconModule, NzInputModule, NzPopconfirmModule, NzProgressModule, BenefitCard, Choice, Checkin],
  templateUrl: './home.html'
})
export class Home {
  app = inject(AppService);
  MAX = MAX_PEOPLE;
  today = manilaToday();
  view = signal<View>('city');
  history: View[] = [];
  d = signal<Person>(this.newDraft());
  qi = signal(0);
  list = signal<Person[]>([]);
  personId = signal<string | null>(null);
  geo = signal<{ state: string; name?: string }>({ state: 'idle' });
  whoErr = signal(false);
  newsGone = signal(false);
  cityInput = viewChild<ElementRef<HTMLInputElement>>('cityInput');
  acTrigger = viewChild(NzAutocompleteTriggerDirective);

  constructor() {
    inject(SeoService).set({
      title: 'Benepisyo',
      description: 'Alamin ang lahat ng benepisyo mo sa lungsod mo: pamilya, senior, PWD, solo parent, estudyante at nanay. May source at petsa ang bawat isa.',
      path: '',
      jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Benepisyo', url: inject(SeoService).canonical(''), inLanguage: ['tl', 'en'] }
    });
    afterNextRender(() => {
      const ps = this.app.people();
      this.list.set(ps);
      this.newsGone.set(store.get('newsDismissed_' + this.app.data.version, false));
      if (ps.length) this.view.set('family');
      else this.prefillFromLocation();
    });
  }

  newDraft(extra: Partial<Person> = {}): Person {
    return { id: uid(), self: true, name: '', city: 'calamba', cityLabel: '', groups: [], answers: {}, docs: [], created: this.today, ...extra };
  }
  patch(p: Partial<Person>) { this.d.update((x) => ({ ...x, ...p })); }
  go(v: View) { this.history.push(this.view()); this.view.set(v); this.top(); }
  back() { this.view.set(this.history.pop() || 'city'); }
  top() { if (this.app.browser) window.scrollTo(0, 0); }

  /* ---------- city step ---------- */
  cityText = computed(() => (this.d().cityLabel || '').trim());
  supported = computed(() => {
    const norm = this.cityText().toLowerCase().replace(/\s*city$/, '').replace(/^city of\s*/, '').trim();
    return this.app.meta.cities.find((c: any) => c.supported && c.name.toLowerCase() === norm) || null;
  });
  options = computed(() => {
    const v = this.cityText().toLowerCase();
    return (this.app.meta.laguna_lgus as string[]).filter((c) => !v || c.toLowerCase().includes(v));
  });

  /* Prefill without a prompt only when location was already allowed for this site. */
  prefillFromLocation() {
    if (this.d().cityLabel || this.d().cityTouched) return;
    locationAllowed().then((ok) => { if (ok) this.findMe(true); });
  }
  findMe(silent = false) {
    this.geo.set({ state: 'finding' });
    locate().then(({ lat, lng }) => {
      const near = nearestLgu(lat, lng, this.app.meta.lgu_coords || {});
      if (!near) { this.geo.set({ state: 'far' }); return; }
      this.patch({ cityLabel: near.name });
      this.geo.set({ state: 'found', name: near.name });
    }).catch((e) => this.geo.set({ state: silent ? 'idle' : e.message }));
  }
  requestCity() {
    const v = this.cityText();
    const reqs = store.get<any[]>('cityRequests', []); reqs.push({ city: v, at: this.today }); store.set('cityRequests', reqs);
    this.app.send('/api/city-requests', { city: v });
    this.app.toast('success', this.app.t('city_requested', { city: v }));
  }
  cityNext() {
    const v = this.cityText();
    if (!v) { this.cityInput()?.nativeElement.focus(); return; }
    const hit = this.supported();
    this.acTrigger()?.closePanel();
    this.patch({ city: hit ? hit.id : null, cityLabel: v });
    this.go('who');
  }

  /* ---------- who step ---------- */
  toggleGroup(g: string) {
    this.whoErr.set(false);
    const gs = this.d().groups;
    this.patch({ groups: gs.includes(g) ? gs.filter((x) => x !== g) : gs.concat(g) });
  }
  whoNext() {
    if (!this.d().groups.length) { this.whoErr.set(true); return; }
    this.patch({ name: this.d().self ? '' : (this.d().name || '').trim().slice(0, 30) });
    this.qi.set(0);
    this.go('q');
  }

  /* ---------- questions ---------- */
  questions = computed(() => M.questionsFor(this.d(), this.d().city) as string[]);
  q = computed(() => this.questions()[this.qi()]);
  qTitle = computed(() => {
    const d = this.d(); const q = this.q(); const a = this.app;
    a.lang();
    const c = d.city ? a.cityName(d.city) : d.cityLabel;
    if (q === 'age_band') return d.self ? a.t('q_age_band_self') : a.t('q_age_band', { subj: a.subj(d) });
    return d.self ? a.t('q_' + q + '_self', { city: c }) : a.t('q_' + q, { subj: a.subj(d), subjposs: a.subjposs(d), city: c });
  });
  opts = computed((): [any, string][] => {
    const q = this.q(); const t = this.app.t;
    this.app.lang();
    if (q === 'age_band') return [['60_79', t('age_60_79')], ['80_99', t('age_80_99')], ['100plus', t('age_100plus')]];
    if (q === 'income') return [['low', t('income_low')], ['mid', t('income_mid')], ['high', t('income_high')], ['skip', t('income_skip')]];
    return [[true, t('yes')], [false, t('no')], [null, t('not_sure')]];
  });
  docOptions = computed(() => this.app.meta.docs.filter((x: any) => !x.groups || x.groups.some((g: string) => this.d().groups.includes(g))));
  isOn(val: any) { const a = this.d().answers; return this.q() in a && a[this.q()] === val; }
  answer(val: any) {
    const q = this.q();
    const answers = { ...this.d().answers, [q]: val };
    if (q === 'age_band' && val !== '80_99' && val !== '100plus') delete answers['milestone'];
    this.patch({ answers });
    this.qi.update((i) => i + 1); this.top();
  }
  skip() { const answers = { ...this.d().answers }; delete answers[this.q()]; this.patch({ answers }); this.qi.update((i) => i + 1); }
  qBack() { if (this.qi() === 0) this.back(); else this.qi.update((i) => i - 1); }
  toggleDoc(id: string) { const ds = this.d().docs; this.patch({ noDocs: false, docs: ds.includes(id) ? ds.filter((x) => x !== id) : ds.concat(id) }); }
  finish() {
    const d = this.d();
    const next = this.list().filter((p) => p.id !== d.id).concat(d);
    this.app.savePeople(next); this.list.set(next);
    store.set('active', d.id);
    if (!store.get('lastSeen', null)) store.set('lastSeen', this.today);
    this.history = ['family']; this.personId.set(d.id); this.view.set('results'); this.top();
  }

  /* ---------- results ---------- */
  person = computed(() => this.list().find((x) => x.id === this.personId()) || this.list()[0] || null);
  results = computed(() => { const p = this.person(); return p ? M.buildResults(this.app.data.benefits, p, this.today) : null; });
  blockedN = computed(() => (this.results()?.blocked || []).reduce((n: number, g: any) => n + g.items.length, 0));
  resultLabel = computed(() => { const p = this.person()!; this.app.lang(); return p.self ? this.app.t('results_for_self') : this.app.t('results_for', { name: p.name || this.app.t('subj_other_plain') }); });
  countLine = computed(() => {
    const p = this.person()!; const r = this.results()!; this.app.lang();
    const key = p.self ? 'results_count_self' : p.name ? 'results_count_other' : 'results_count_plain';
    return this.app.t(key, { n: r.total, name: p.name }) + (p.city ? '' : ' · ' + this.app.t('tag_national'));
  });
  blockLead(g: any) {
    const dn = g.docs.map(this.app.docName).join(' / ');
    return g.items.length === 1 ? this.app.t('blocked_get_one', { doc: dn }) : this.app.t('blocked_get', { doc: dn, n: g.items.length });
  }
  blockHow(g: any) { return this.app.t('blocked_how', { doc: g.docs.map(this.app.docName).join(' / ') }); }
  addMember(from?: Person) {
    this.d.set(this.newDraft({ self: false, ...(from ? { city: from.city, cityLabel: from.cityLabel } : {}) }));
    this.history = [this.view()];
    this.view.set(from ? 'who' : 'city'); this.top();
  }
  toFamily() { this.history = []; this.view.set('family'); this.top(); }

  /* ---------- family ---------- */
  summaries = computed(() => this.list().map((p) => {
    const r = M.buildResults(this.app.data.benefits, p, this.today);
    return { p, r, ready: r.ready.length, blocked: r.blocked.reduce((n: number, g: any) => n + g.items.length, 0) };
  }));
  changed = computed(() => {
    const ids: string[] = [];
    this.summaries().forEach(({ r }) => { r.ready.forEach((x: any) => ids.push(x.benefit.id)); r.blocked.forEach((g: any) => g.items.forEach((x: any) => ids.push(x.benefit.id))); });
    return M.changedSince(this.app.data.benefits, ids, store.get('lastSeen', null));
  });
  dismissNews() { store.set('newsDismissed_' + this.app.data.version, true); store.set('lastSeen', this.today); this.newsGone.set(true); }
  open(id: string) { store.set('active', id); this.personId.set(id); this.history = ['family']; this.view.set('results'); this.top(); }
  edit(p: Person) { this.d.set(JSON.parse(JSON.stringify(p))); this.history = ['family']; this.view.set('city'); }
  remove(p: Person) { const next = this.list().filter((x) => x.id !== p.id); this.app.savePeople(next); this.list.set(next); }
  personGroups(p: Person) { return (p.city ? this.app.cityName(p.city) : p.cityLabel) + ' · ' + p.groups.map((g) => this.app.t('group_' + g)).join(', '); }
  clearAll() {
    ['people', 'active', 'visits', 'lastSeen', 'checks'].forEach(store.del);
    this.app.toast('success', this.app.t('cleared'));
    this.list.set([]); this.d.set(this.newDraft()); this.history = []; this.view.set('city');
  }
}
