/* Benepisyo browser app. Progressive enhancement over static pages. */
(function () {
  'use strict';
  var I = window.BI18N, M = window.BMatch;
  var body = document.getElementById('bp-config') || document.body;
  var ROOT = body.getAttribute('data-root') || '';
  var LINKS = body.getAttribute('data-links') || 'pretty';
  var API = body.getAttribute('data-api') || '';
  var PAGE = body.getAttribute('data-page');
  var TODAY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); /* Philippine date (UTC+8) */
  var MAX_PEOPLE = 6;
  var DATA = null;

  /* ---------- storage (safe) ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('bp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('bp.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del: function (k) { try { localStorage.removeItem('bp.' + k); } catch (e) { /* ignore */ } }
  };

  /* ---------- helpers ---------- */
  var lang = store.get('lang', 'tl') === 'en' ? 'en' : 'tl';
  function t(k, v) { return I.t(lang, k, v); }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function L(obj) { return obj ? (obj[lang] || obj.tl || obj.en || '') : ''; }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function peso(n) { return '₱' + Number(n).toLocaleString('en-PH'); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function link(p) { return LINKS === 'file' ? ROOT + (p ? p + 'index.html' : 'home.html') : ROOT + p; }
  function fmtDate(iso) {
    try { return new Date(iso + 'T00:00:00Z').toLocaleDateString(lang === 'en' ? 'en-PH' : 'fil-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return iso; }
  }
  function toast(msg) {
    var el = $('#toast'); if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 3200);
  }
  function benefitById(id) { return DATA ? DATA.benefits.filter(function (b) { return b.id === id; })[0] : null; }
  function officeById(id) { return DATA ? DATA.offices.filter(function (o) { return o.id === id; })[0] : null; }
  function docName(id) { var d = DATA && DATA.meta.docs.filter(function (x) { return x.id === id; })[0]; return d ? d[lang] : id; }
  function cityName(id) { var c = DATA && DATA.meta.cities.filter(function (x) { return x.id === id; })[0]; return c ? c.name : ''; }
  function benefitUrl(b) { return link((b.level === 'local' ? b.city : 'calamba') + '/' + b.id + '/'); }

  /* ---------- people ---------- */
  function people() { return store.get('people', []); }
  function savePeople(list) { store.set('people', list.slice(0, MAX_PEOPLE)); }
  function activePerson() {
    var list = people(); var id = store.get('active', null);
    return list.filter(function (p) { return p.id === id; })[0] || list[0] || null;
  }
  function personLabel(p) { return p.self ? t('results_for_self') : (p.name ? t('results_for', { name: p.name }) : t('results_for', { name: t('subj_other_plain') })); }
  function subj(p) { return p.self ? t('subj_self') : (p.name ? t('subj_other', { name: p.name }) : t('subj_other_plain')); }
  function subjposs(p) { return p.self ? t('subjposs_self') : (p.name ? t('subjposs_other', { name: p.name }) : t('subjposs_other_plain')); }

  /* ---------- language ---------- */
  function applyLang() {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'tl');
    $$('[data-ph-en]').forEach(function (el) {
      if (!el.getAttribute('data-ph-tl')) el.setAttribute('data-ph-tl', el.getAttribute('placeholder') || '');
      el.setAttribute('placeholder', lang === 'en' ? el.getAttribute('data-ph-en') : el.getAttribute('data-ph-tl'));
    });
  }
  function bindLangToggle() {
    var btn = $('#lang-toggle'); if (!btn) return;
    btn.addEventListener('click', function () {
      lang = lang === 'en' ? 'tl' : 'en';
      store.set('lang', lang);
      applyLang();
      rerender();
    });
  }
  var rerender = function () {};

  /* ---------- network: reports, check-ins, outbox ---------- */
  function post(path, payload) {
    if (!API) return Promise.reject(new Error('no-api'));
    return fetch(API.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }
  function queue(path, payload) {
    var box = store.get('outbox', []); box.push({ path: path, payload: payload, at: Date.now() }); store.set('outbox', box.slice(-50));
  }
  function send(path, payload) {
    return post(path, payload).then(function () { return 'sent'; }).catch(function () { queue(path, payload); return 'queued'; });
  }
  function flushOutbox() {
    if (!API || !navigator.onLine) return;
    var box = store.get('outbox', []); if (!box.length) return;
    store.set('outbox', []);
    box.forEach(function (item) { post(item.path, item.payload).catch(function () { queue(item.path, item.payload); }); });
  }

  /* ---------- sheet (modal) ---------- */
  function openSheet(title, inner, onMount) {
    closeSheet();
    var back = document.createElement('div');
    back.className = 'sheet-back'; back.id = 'sheet-back';
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title">' + h(title) + '</h2><button class="btn quiet small" type="button" id="sheet-close">' + h(t('dismiss')) + '</button></div>' + inner + '</div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) { if (e.target === back) closeSheet(); });
    $('#sheet-close').addEventListener('click', closeSheet);
    document.addEventListener('keydown', escClose);
    var first = back.querySelector('button, input, textarea'); if (first) first.focus();
    if (onMount) onMount(back);
  }
  function escClose(e) { if (e.key === 'Escape') closeSheet(); }
  function closeSheet() { var b = $('#sheet-back'); if (b) b.remove(); document.removeEventListener('keydown', escClose); }

  /* ---------- check-in prompt ---------- */
  function pendingCheckin() {
    var visits = store.get('visits', []);
    for (var i = 0; i < visits.length; i++) {
      var v = visits[i];
      if (!v.answered && M.daysBetween(v.at, TODAY) >= 1 && benefitById(v.id)) return v;
    }
    return null;
  }
  function markVisit(id, patch) {
    var visits = store.get('visits', []);
    visits.forEach(function (v) { if (v.id === id && !v.answered) Object.keys(patch).forEach(function (k) { v[k] = patch[k]; }); });
    store.set('visits', visits);
  }
  function renderCheckin(slot) {
    var v = pendingCheckin(); if (!v || !slot) return;
    var b = benefitById(v.id);
    var city = v.city || 'calamba';
    slot.innerHTML = '<div class="banner" id="checkin"><b>' + h(t('checkin_q', { title: L(b.title) })) + '</b><div class="row">' +
      '<button class="btn small" data-ans="yes">' + h(t('checkin_yes')) + '</button>' +
      '<button class="btn secondary small" data-ans="no">' + h(t('checkin_no')) + '</button>' +
      '<button class="btn quiet small" data-ans="different">' + h(t('checkin_diff')) + '</button></div><div id="checkin-more"></div></div>';
    function done(answer, extra) {
      markVisit(v.id, { answered: answer });
      send('/api/checkins', { benefit_id: v.id, answer: answer, reason: extra && extra.reason || null, detail: extra && extra.detail || null, city: city });
      slot.innerHTML = '<div class="banner"><b>' + h(t('checkin_thanks', { city: cityName(city) || 'Calamba' })) + '</b></div>';
    }
    $$('[data-ans]', slot).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = btn.getAttribute('data-ans');
        var more = $('#checkin-more', slot);
        if (a === 'yes') return done('yes');
        if (a === 'no') {
          more.innerHTML = '<p><b>' + h(t('checkin_why')) + '</b></p><div class="row">' + ['budget', 'ended', 'sched', 'other'].map(function (r) {
            return '<button class="btn quiet small" data-reason="' + r + '">' + h(t('checkin_' + r)) + '</button>';
          }).join('') + '</div>';
          $$('[data-reason]', more).forEach(function (rb) { rb.addEventListener('click', function () { done('no', { reason: rb.getAttribute('data-reason') }); }); });
          return;
        }
        more.innerHTML = '<div class="field"><label for="checkin-detail">' + h(t('checkin_diff_q')) + '</label><textarea class="input" id="checkin-detail" maxlength="500"></textarea></div><button class="btn small" id="checkin-send">' + h(t('report_send')) + '</button>';
        $('#checkin-send', more).addEventListener('click', function () { done('different', { detail: $('#checkin-detail', more).value.trim().slice(0, 500) }); });
      });
    });
  }

  /* ---------- results rendering ---------- */
  function badgeHtml(b) {
    var st = M.effectiveStatus(b, TODAY);
    return '<span class="badge ' + st + '">' + h(t('badge_' + st)) + '</span>';
  }
  function amountHtml(b) {
    if (b.amount_php) return '<div class="amount">' + peso(b.amount_php) + (b.amount_note ? ' <small>' + h(L(b.amount_note)) + '</small>' : '') + '</div>';
    if (b.value) return '<div class="value">' + h(L(b.value)) + '</div>';
    return '<div class="value">' + h(t('detail_amount_unknown')) + '</div>';
  }
  function levelTag(b) {
    return '<span class="tag">' + h(b.level === 'local' ? t('tag_local', { city: cityName(b.city) }) : t('tag_national')) + '</span>';
  }
  function maybeLine(res) {
    if (res.fit !== 'maybe' || !res.unknown.length) return '';
    var what = res.unknown.map(function (u) { return t('maybe_' + u); }).join(', ');
    return '<p class="maybe">' + h(t('maybe_note', { what: what })) + '</p>';
  }
  function cardHtml(item) {
    var b = item.benefit;
    return '<li class="card"><a class="title" href="' + h(benefitUrl(b)) + '">' + h(L(b.title)) + '</a>' + amountHtml(b) +
      '<div class="muted small">' + h(L(b.frequency)) + '</div>' + maybeLine(item.result) +
      '<div class="meta">' + levelTag(b) + badgeHtml(b) + '<span>' + h(t('checked', { date: fmtDate(b.verification.checked_on) })) + '</span></div></li>';
  }
  function resultsHtml(p) {
    var r = M.buildResults(DATA.benefits, p);
    var countKey = p.self ? 'results_count_self' : (p.name ? 'results_count_other' : 'results_count_plain');
    var html = '<div class="result-head"><h2>' + h(personLabel(p)) + '</h2><p class="muted">' + h(t(countKey, { n: r.total, name: p.name })) +
      (p.city ? '' : ' · ' + h(t('tag_national'))) + '</p></div>';
    html += '<div class="section-label">' + h(t('ready_title')) + ' <span class="count">' + r.ready.length + '</span></div>';
    html += '<p class="muted small">' + h(t('ready_sub')) + '</p>';
    html += '<ul class="cards">' + r.ready.map(cardHtml).join('') + '</ul>';
    if (r.blocked.length) {
      html += '<div class="section-label">' + h(t('blocked_title')) + ' <span class="count">' + r.blocked.reduce(function (n, g) { return n + g.items.length; }, 0) + '</span></div>';
      r.blocked.forEach(function (g) {
        var dn = g.docs.map(docName).join(' / ');
        var lead = g.items.length === 1 ? t('blocked_get_one', { doc: dn }) : t('blocked_get', { doc: dn, n: g.items.length });
        html += '<div class="unlock"><p class="lead">' + h(lead) + '</p>' +
          (g.unlocker ? '<a class="btn secondary" href="' + h(benefitUrl(g.unlocker)) + '">' + h(t('blocked_how', { doc: dn })) + '</a>' : '') +
          '<ul class="cards">' + g.items.map(cardHtml).join('') + '</ul></div>';
      });
    }
    return { html: html, ready: r.ready.length, blocked: r.blocked.reduce(function (n, g) { return n + g.items.length; }, 0) };
  }

  /* ---------- home: flow + family ---------- */
  function initHome() {
    var app = $('#app'); if (!app) return;
    var view = { name: people().length ? 'family' : 'city', draft: null, qi: 0, history: [] };

    function newDraft() { return { id: uid(), self: true, name: '', city: 'calamba', cityLabel: 'Calamba', groups: [], answers: {}, docs: [], created: TODAY }; }
    function go(name) { view.history.push(view.name); view.name = name; render(); window.scrollTo(0, 0); }
    function back() { view.name = view.history.pop() || 'city'; render(); }
    function progress(step, total) {
      var s = ''; for (var i = 0; i < total; i++) s += '<span class="' + (i <= step ? 'on' : '') + '"></span>'; return '<div class="progress" aria-hidden="true">' + s + '</div>';
    }

    function renderCity() {
      var d = view.draft || (view.draft = newDraft());
      var lgus = DATA.meta.laguna_lgus;
      app.innerHTML = '<div class="panel stack">' + progress(0, 4) +
        '<label class="q-title" for="city-input">' + h(t('step_city')) + '</label><p class="muted">' + h(t('step_city_hint')) + '</p>' +
        '<input class="input" id="city-input" list="city-list" autocomplete="off" placeholder="' + h(t('city_placeholder')) + '" value="' + h(d.cityLabel || '') + '">' +
        '<datalist id="city-list">' + lgus.map(function (c) { return '<option value="' + h(c) + '">'; }).join('') + '</datalist>' +
        '<div id="city-note"></div><div class="flow-nav">' +
        (people().length ? '<button class="btn quiet" id="to-family">' + h(t('nav_family')) + '</button>' : '<span></span>') +
        '<button class="btn" id="city-next">' + h(t('next')) + '</button></div></div>';
      var input = $('#city-input');
      function check() {
        var v = input.value.trim();
        var norm = v.toLowerCase().replace(/\s*city$/, '').replace(/^city of\s*/, '').trim();
        var hit = DATA.meta.cities.filter(function (c) { return c.supported && c.name.toLowerCase() === norm; })[0];
        var note = $('#city-note');
        if (!v) { note.innerHTML = ''; return; }
        if (hit) { note.innerHTML = '<p class="note">' + h(t('city_supported')) + '</p>'; }
        else {
          note.innerHTML = '<div class="note warn stack-sm"><p>' + h(t('city_unsupported', { city: v })) + '</p><button class="linkish" id="req-city">' + h(t('city_request')) + '</button></div>';
          $('#req-city').addEventListener('click', function () {
            var reqs = store.get('cityRequests', []); reqs.push({ city: v, at: TODAY }); store.set('cityRequests', reqs);
            send('/api/city-requests', { city: v });
            toast(t('city_requested', { city: v }));
          });
        }
        return hit;
      }
      input.addEventListener('input', check);
      check();
      if (people().length) $('#to-family').addEventListener('click', function () { view.name = 'family'; render(); });
      $('#city-next').addEventListener('click', function () {
        var v = input.value.trim(); if (!v) { input.focus(); return; }
        var hit = check();
        d.city = hit ? hit.id : null; d.cityLabel = v;
        go('who');
      });
    }

    function renderWho() {
      var d = view.draft;
      var groups = DATA.meta.groups;
      app.innerHTML = '<div class="panel stack">' + progress(1, 4) + '<h2 class="q-title">' + h(t('step_who')) + '</h2>' +
        '<div class="choices" role="radiogroup">' +
        '<button class="choice" role="radio" data-self="1" aria-pressed="' + (d.self ? 'true' : 'false') + '">' + h(t('who_self')) + '</button>' +
        '<button class="choice" role="radio" data-self="0" aria-pressed="' + (!d.self ? 'true' : 'false') + '">' + h(t('who_family')) + '</button></div>' +
        '<div class="field" id="name-field"' + (d.self ? ' hidden' : '') + '><label for="who-name">' + h(t('who_name')) + '</label><input class="input" id="who-name" maxlength="30" placeholder="' + h(t('who_name_ph')) + '" value="' + h(d.name) + '"></div>' +
        '<p><b>' + h(t('who_groups')) + '</b></p><div class="choices">' +
        groups.map(function (g) {
          var on = d.groups.indexOf(g.id) !== -1;
          return '<button class="choice" role="checkbox" data-group="' + g.id + '" aria-checked="' + on + '"><span class="box" aria-hidden="true">' + (on ? '✓' : '') + '</span><span>' + h(g[lang]) + '<span class="hint">' + h(L(g.hint)) + '</span></span></button>';
        }).join('') + '</div><p id="who-err" class="note bad" hidden>' + h(t('need_group')) + '</p>' +
        '<div class="flow-nav"><button class="btn quiet" id="who-back">' + h(t('back')) + '</button><button class="btn" id="who-next">' + h(t('next')) + '</button></div></div>';
      $$('[data-self]', app).forEach(function (btn) {
        btn.addEventListener('click', function () {
          d.self = btn.getAttribute('data-self') === '1';
          $$('[data-self]', app).forEach(function (b2) { b2.setAttribute('aria-pressed', b2 === btn ? 'true' : 'false'); });
          $('#name-field').hidden = d.self;
        });
      });
      $$('[data-group]', app).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var g = btn.getAttribute('data-group'); var i = d.groups.indexOf(g);
          if (i === -1) d.groups.push(g); else d.groups.splice(i, 1);
          var on = i === -1; btn.setAttribute('aria-checked', on); $('.box', btn).textContent = on ? '✓' : '';
          $('#who-err').hidden = true;
        });
      });
      $('#who-back').addEventListener('click', back);
      $('#who-next').addEventListener('click', function () {
        d.name = d.self ? '' : ($('#who-name').value || '').trim().slice(0, 30);
        if (!d.groups.length) { $('#who-err').hidden = false; return; }
        view.qi = 0; go('q');
      });
    }

    function questionTitle(q, d) {
      var c = d.city ? cityName(d.city) : d.cityLabel;
      if (q === 'age_band') return d.self ? t('q_age_band_self') : t('q_age_band', { subj: subj(d) });
      if (d.self) return t('q_' + q + '_self', { city: c });
      return t('q_' + q, { subj: subj(d), subjposs: subjposs(d), city: c });
    }

    function renderQ() {
      var d = view.draft;
      var qs = M.questionsFor(d, d.city);
      if (view.qi >= qs.length) return finish();
      var q = qs[view.qi];
      var opts;
      if (q === 'age_band') opts = [['60_79', t('age_60_79')], ['80_99', t('age_80_99')], ['100plus', t('age_100plus')]];
      else if (q === 'income') opts = [['low', t('income_low')], ['mid', t('income_mid')], ['high', t('income_high')], ['skip', t('income_skip')]];
      else if (q !== 'docs') opts = [[true, t('yes')], [false, t('no')], [null, t('not_sure')]];
      var head = '<div class="panel stack">' + progress(2, 4) + '<h2 class="q-title" id="q-title">' + h(questionTitle(q, d)) + '</h2>';
      if (q === 'docs') {
        var docs = DATA.meta.docs.filter(function (x) { return !x.groups || x.groups.some(function (g) { return d.groups.indexOf(g) !== -1; }); });
        app.innerHTML = head + '<p class="muted">' + h(t('q_docs_hint')) + '</p><div class="choices" aria-labelledby="q-title">' +
          docs.map(function (x) { var on = d.docs.indexOf(x.id) !== -1; return '<button class="choice" role="checkbox" data-doc="' + x.id + '" aria-checked="' + on + '"><span class="box" aria-hidden="true">' + (on ? '✓' : '') + '</span><span>' + h(x[lang]) + '</span></button>'; }).join('') +
          '<button class="choice" role="checkbox" data-doc="__none" aria-checked="false"><span class="box" aria-hidden="true"></span><span>' + h(t('none_yet')) + '</span></button></div>' +
          '<div class="flow-nav"><button class="btn quiet" id="q-back">' + h(t('back')) + '</button><button class="btn" id="q-done">' + h(t('see_results')) + '</button></div></div>';
        $$('[data-doc]', app).forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-doc');
            if (id === '__none') {
              d.docs = []; $$('[data-doc]', app).forEach(function (b2) { b2.setAttribute('aria-checked', b2 === btn ? 'true' : 'false'); $('.box', b2).textContent = b2 === btn ? '✓' : ''; });
              return;
            }
            var none = $('[data-doc="__none"]', app); none.setAttribute('aria-checked', 'false'); $('.box', none).textContent = '';
            var i = d.docs.indexOf(id); if (i === -1) d.docs.push(id); else d.docs.splice(i, 1);
            var on = i === -1; btn.setAttribute('aria-checked', on); $('.box', btn).textContent = on ? '✓' : '';
          });
        });
        $('#q-done').addEventListener('click', function () { d.docsAnswered = true; finish(); });
      } else {
        app.innerHTML = head + '<div class="choices" role="radiogroup" aria-labelledby="q-title">' +
          opts.map(function (o, i) { var cur = d.answers[q]; var on = cur === o[0] && cur !== undefined; return '<button class="choice" role="radio" data-i="' + i + '" aria-pressed="' + on + '">' + h(o[1]) + '</button>'; }).join('') + '</div>' +
          '<div class="flow-nav"><button class="btn quiet" id="q-back">' + h(t('back')) + '</button><button class="linkish" id="q-skip">' + h(t('skip')) + '</button></div></div>';
        $$('[data-i]', app).forEach(function (btn) {
          btn.addEventListener('click', function () {
            d.answers[q] = opts[+btn.getAttribute('data-i')][0];
            if (q === 'age_band' && d.answers.age_band !== '80_99' && d.answers.age_band !== '100plus') delete d.answers.milestone;
            view.qi++; renderQ(); window.scrollTo(0, 0);
          });
        });
        $('#q-skip').addEventListener('click', function () { delete d.answers[q]; view.qi++; renderQ(); });
      }
      $('#q-back').addEventListener('click', function () { if (view.qi === 0) back(); else { view.qi--; renderQ(); } });
      var first = $('.choice', app); if (first) first.focus({ preventScroll: true });
    }

    function finish() {
      var d = view.draft;
      var list = people().filter(function (p) { return p.id !== d.id; });
      list.push(d);
      savePeople(list);
      store.set('active', d.id);
      if (!store.get('lastSeen', null)) store.set('lastSeen', TODAY);
      view.draft = null; view.history = ['family']; view.name = 'results'; view.personId = d.id;
      render(); window.scrollTo(0, 0);
    }

    function renderResults() {
      var p = people().filter(function (x) { return x.id === view.personId; })[0] || activePerson();
      if (!p) { view.name = 'city'; return render(); }
      store.set('active', p.id);
      var r = resultsHtml(p);
      var canAdd = people().length < MAX_PEOPLE;
      app.innerHTML = r.html + '<div class="panel stack"><p><b>' + h(t('add_member')) + '</b></p><div class="row">' +
        (canAdd ? '<button class="btn" id="add-member">' + h(t('add_member_btn')) + '</button>' : '') +
        '<button class="btn quiet" id="to-family">' + h(t('nav_family')) + '</button></div></div>';
      if (canAdd) $('#add-member').addEventListener('click', function () {
        view.draft = newDraft(); view.draft.self = false; view.draft.city = p.city; view.draft.cityLabel = p.cityLabel; view.history = ['results']; view.name = 'who'; render(); window.scrollTo(0, 0);
      });
      $('#to-family').addEventListener('click', function () { view.name = 'family'; render(); window.scrollTo(0, 0); });
    }

    function renderFamily() {
      var list = people();
      if (!list.length) { view.name = 'city'; return render(); }
      var lastSeen = store.get('lastSeen', null);
      var ids = [];
      list.forEach(function (p) {
        var r = M.buildResults(DATA.benefits, p);
        r.ready.forEach(function (x) { ids.push(x.benefit.id); });
        r.blocked.forEach(function (g) { g.items.forEach(function (x) { ids.push(x.benefit.id); }); });
      });
      var changed = M.changedSince(DATA.benefits, ids, lastSeen);
      var html = '<div id="checkin-slot"></div>';
      if (changed.length && !store.get('newsDismissed_' + DATA.version, false)) {
        html += '<div class="banner" id="news"><b>' + h(t('whats_new')) + '</b><ul>' + changed.map(function (b) { return '<li><a href="' + h(benefitUrl(b)) + '">' + h(t('whats_new_item', { title: L(b.title) })) + '</a></li>'; }).join('') +
          '</ul><button class="linkish" id="news-dismiss">' + h(t('dismiss')) + '</button></div>';
      }
      html += '<div class="result-head"><h2>' + h(t('family_title')) + '</h2><p class="muted small">' + h(t('family_sub')) + '</p></div><div class="family">';
      list.forEach(function (p) {
        var r = M.buildResults(DATA.benefits, p);
        var blocked = r.blocked.reduce(function (n, g) { return n + g.items.length; }, 0);
        var label = p.self ? t('results_for_self') : (p.name || t('who_family'));
        html += '<div class="person"><div class="who"><b>' + h(label) + '</b><p class="muted small">' + h(p.city ? cityName(p.city) : p.cityLabel) + ' · ' + h(p.groups.map(function (g) { return t('group_' + g); }).join(', ')) + '</p><p class="small">' + h(t('family_counts', { ready: r.ready.length, blocked: blocked })) + '</p></div>' +
          '<div class="row"><button class="btn small" data-open="' + p.id + '">' + h(t('open')) + '</button><button class="btn quiet small" data-edit="' + p.id + '">' + h(t('edit')) + '</button><button class="linkish" data-remove="' + p.id + '">' + h(t('remove')) + '</button></div></div>';
      });
      html += '</div><div class="row">' + (list.length < MAX_PEOPLE ? '<button class="btn" id="add-member">' + h(t('add_member_btn')) + '</button>' : '') +
        '<a class="btn quiet" href="' + h(link('calamba/')) + '">' + h(t('nav_city')) + '</a></div>' +
        '<div id="clear-zone"><button class="linkish" id="clear-all">' + h(t('clear_all')) + '</button></div>';
      app.innerHTML = html;
      renderCheckin($('#checkin-slot'));
      var nd = $('#news-dismiss'); if (nd) nd.addEventListener('click', function () { store.set('newsDismissed_' + DATA.version, true); store.set('lastSeen', TODAY); $('#news').remove(); });
      $$('[data-open]', app).forEach(function (b) { b.addEventListener('click', function () { view.personId = b.getAttribute('data-open'); view.history = ['family']; view.name = 'results'; render(); window.scrollTo(0, 0); }); });
      $$('[data-edit]', app).forEach(function (b) {
        b.addEventListener('click', function () {
          var p = people().filter(function (x) { return x.id === b.getAttribute('data-edit'); })[0];
          view.draft = JSON.parse(JSON.stringify(p)); view.history = ['family']; view.name = 'city'; render();
        });
      });
      $$('[data-remove]', app).forEach(function (b) { b.addEventListener('click', function () { savePeople(people().filter(function (x) { return x.id !== b.getAttribute('data-remove'); })); render(); }); });
      var add = $('#add-member'); if (add) add.addEventListener('click', function () { view.draft = newDraft(); view.draft.self = false; view.history = ['family']; view.name = 'city'; render(); });
      $('#clear-all').addEventListener('click', function () {
        var z = $('#clear-zone');
        z.innerHTML = '<div class="note bad stack-sm"><p>' + h(t('clear_confirm')) + '</p><div class="row"><button class="btn small" id="clear-yes">' + h(t('clear_yes')) + '</button><button class="btn quiet small" id="clear-no">' + h(t('cancel')) + '</button></div></div>';
        $('#clear-yes').addEventListener('click', function () { ['people', 'active', 'visits', 'lastSeen', 'checks'].forEach(store.del); toast(t('cleared')); view.name = 'city'; view.draft = null; render(); });
        $('#clear-no').addEventListener('click', function () { render(); });
      });
    }

    function render() {
      var hero = $('.hero'); if (hero) hero.hidden = view.name !== 'city';
      if (view.name === 'city') renderCity();
      else if (view.name === 'who') renderWho();
      else if (view.name === 'q') renderQ();
      else if (view.name === 'results') renderResults();
      else renderFamily();
    }
    rerender = render;
    render();
  }

  /* ---------- city page: filters + search ---------- */
  function initCity() {
    var active = 'all';
    var input = $('#search');
    function apply() {
      var q = input ? input.value : '';
      var hits = q.trim() ? M.search(DATA.benefits, q, 'calamba').map(function (b) { return b.id; }) : null;
      var shown = 0;
      $$('.card[data-id]').forEach(function (c) {
        var okGroup = active === 'all' || c.getAttribute('data-groups').split(' ').indexOf(active) !== -1;
        var okSearch = !hits || hits.indexOf(c.getAttribute('data-id')) !== -1;
        c.hidden = !(okGroup && okSearch); if (!c.hidden) shown++;
      });
      var none = $('#search-none'); if (none) none.hidden = shown > 0;
    }
    $$('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        active = btn.getAttribute('data-filter');
        $$('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
        apply();
      });
    });
    if (input) input.addEventListener('input', apply);
  }

  /* ---------- detail page ---------- */
  function initDetail() {
    var art = $('[data-benefit]'); if (!art) return;
    var b = benefitById(art.getAttribute('data-benefit')); if (!b) return;
    var p = activePerson();

    function renderWhy() {
      var slot = $('#why-slot'); slot.innerHTML = '';
      if (!p) return;
      var res = M.evaluate(b, p);
      if (res.fit === 'no') return;
      var c = p.city ? cityName(p.city) : p.cityLabel;
      var items = res.why.map(function (w) {
        var parts = w.split(':');
        if (parts[0] === 'group') return t('why_group_' + parts[1]);
        if (parts[0] === 'age') return t('why_age', { n: parts[1] });
        if (parts[0] === 'milestone') return t('why_milestone');
        if (parts[0] === 'resident') return t('why_resident', { city: c });
        if (parts[0] === 'income') return t('why_income_' + parts[1]);
        if (parts[0] === 'no_pension') return t('why_no_pension');
        if (parts[0] === 'employed') return t('why_employed');
        return null;
      }).filter(Boolean);
      (p.docs || []).forEach(function (d) { if ((b.needs || []).some(function (g) { return g.indexOf(d) !== -1; })) items.push(t('why_has', { doc: docName(d) })); });
      var title = p.self ? t('detail_why') : t('detail_why_other', { subj: subj(p) });
      slot.innerHTML = '<div class="why-box"><b>' + h(title) + '</b><ul>' + items.map(function (i) { return '<li>' + h(i) + '</li>'; }).join('') + '</ul>' + maybeLine(res) + '</div>';
    }

    function renderChecklist() {
      $$('#checklist li').forEach(function (li) {
        var doc = li.getAttribute('data-doc');
        var have = !!(p && doc && doc.split('|').some(function (d) { return (p.docs || []).indexOf(d) !== -1; }));
        li.classList.toggle('have', have);
        $('.tick', li).textContent = have ? '✓' : '';
        $('.have-label', li).hidden = !have;
      });
    }

    function loadCount() {
      if (!API) return;
      fetch(API.replace(/\/$/, '') + '/api/counts?ids=' + encodeURIComponent(b.id)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var n = j && j.counts && j.counts[b.id];
        if (n) $('#checkin-count').textContent = '· ' + t('checkin_count', { n: n });
      }).catch(function () { /* offline */ });
    }

    $('#plan-visit').addEventListener('click', function () { planVisit(b, p); });
    $('#share-btn').addEventListener('click', function () {
      var url = location.href;
      if (navigator.share) { navigator.share({ title: L(b.title), text: L(b.title) + ' – Benepisyo', url: url }).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(t('share_copied')); }, function () { toast(url); });
      else toast(url);
    });
    $('#report-btn').addEventListener('click', function () { openReport(b); });
    rerender = function () { renderWhy(); };
    renderWhy(); renderChecklist(); loadCount();
    var slot = document.createElement('div'); slot.id = 'checkin-slot'; art.parentNode.insertBefore(slot, art); renderCheckin(slot);
  }

  /* ---------- report form ---------- */
  function openReport(b) {
    var inner = '<form class="stack" id="report-form" novalidate>' +
      '<div class="field"><label for="rep-what">' + h(t('report_what')) + '</label><textarea class="input" id="rep-what" maxlength="1000" required></textarea></div>' +
      '<div class="field"><label for="rep-photo">' + h(t('report_photo')) + '</label><input class="input" id="rep-photo" type="file" accept="image/*"></div>' +
      '<div class="field"><label for="rep-contact">' + h(t('report_contact')) + '</label><input class="input" id="rep-contact" maxlength="100" autocomplete="off"></div>' +
      '<p id="rep-err" class="note bad" hidden>' + h(t('report_need')) + '</p>' +
      '<button class="btn block" type="submit">' + h(t('report_send')) + '</button></form>';
    openSheet(t('report_title'), inner, function (root) {
      $('#report-form', root).addEventListener('submit', function (e) {
        e.preventDefault();
        var what = $('#rep-what', root).value.trim();
        if (!what) { $('#rep-err', root).hidden = false; return; }
        var file = $('#rep-photo', root).files[0];
        var payload = { benefit_id: b.id, message: what.slice(0, 1000), contact: $('#rep-contact', root).value.trim().slice(0, 100) || null, photo: null, page: location.pathname };
        (file ? shrinkImage(file) : Promise.resolve(null)).then(function (photo) {
          payload.photo = photo;
          return send('/api/reports', payload);
        }).then(function (status) { closeSheet(); toast(status === 'sent' ? t('report_sent') : t('report_queued')); });
      });
    });
  }
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      var img = new Image(); var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 1024 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  /* ---------- visit card ---------- */
  function planVisit(b, p) {
    var others = DATA.benefits.filter(function (x) {
      if (x.id === b.id || x.office !== b.office) return false;
      if (!p) return M.appliesToCity(x, 'calamba');
      var res = M.evaluate(x, p); return res.fit !== 'no' && !res.missing.length;
    });
    var chosen = [b];
    var withName = false;
    var office = officeById(b.office);
    var inner = (others.length ? '<div class="note stack-sm" id="bundle"><p>' + h(t('plan_bundle', { n: others.length, office: L(office.name) })) + '</p><button class="btn small" id="bundle-yes">' + h(t('plan_bundle_yes')) + '</button></div>' : '') +
      (p && !p.self && p.name ? '<label class="toggle"><input type="checkbox" id="card-name"> ' + h(t('plan_name')) + '</label>' : '') +
      '<img class="card-preview" id="card-img" alt="' + h(t('plan_title') + ': ' + L(b.title)) + '">' +
      '<div class="row"><button class="btn" id="card-save">' + h(t('plan_save')) + '</button><button class="btn secondary" id="card-share">' + h(t('plan_share')) + '</button></div>' +
      '<p class="muted small">' + h(t('plan_hold')) + '</p>';
    openSheet(t('plan_title'), inner, function (root) {
      var blob = null;
      function draw() {
        drawCard(chosen, office, withName && p ? p.name : '', p).then(function (bl) {
          blob = bl; var img = $('#card-img', root); if (img.src) URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(bl);
        });
      }
      var by = $('#bundle-yes', root); if (by) by.addEventListener('click', function () { chosen = [b].concat(others); $('#bundle', root).remove(); draw(); });
      var nm = $('#card-name', root); if (nm) nm.addEventListener('change', function () { withName = nm.checked; draw(); });
      $('#card-save', root).addEventListener('click', function () {
        if (!blob) return;
        try {
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'benepisyo-' + b.id + '.png';
          document.body.appendChild(a); a.click(); a.remove(); toast(t('plan_saved'));
        } catch (e) { toast(t('plan_hold')); }
      });
      $('#card-share', root).addEventListener('click', function () {
        if (!blob) return;
        var file; try { file = new File([blob], 'benepisyo-' + b.id + '.png', { type: 'image/png' }); } catch (e) { file = null; }
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: L(b.title) }).catch(function () {});
        else toast(t('plan_hold'));
      });
      draw();
      var visits = store.get('visits', []);
      chosen.forEach(function (x) { if (!visits.some(function (v) { return v.id === x.id && !v.answered; })) visits.push({ id: x.id, at: TODAY, city: p && p.city || 'calamba' }); });
      store.set('visits', visits.slice(-30));
    });
  }

  function wrapText(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawCard(list, office, name, p) {
    var W = 1080, PAD = 72, CW = W - PAD * 2;
    var C = { bg: '#ffffff', ink: '#16251f', muted: '#4f5e57', accent: '#0b5d4e', line: '#d3dcd6', sun: '#f0b429', sunInk: '#2b1d00', soft: '#e0eee8' };
    var body = '"Atkinson Hyperlegible", system-ui, sans-serif', disp = '"Bricolage Grotesque", "Atkinson Hyperlegible", system-ui, sans-serif';
    var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('700 40px "Atkinson Hyperlegible"'), document.fonts.load('700 40px "Bricolage Grotesque"')]).catch(function () {}) : Promise.resolve();
    return fontsReady.then(function () {
      var c = document.createElement('canvas'); var ctx = c.getContext('2d');
      // Gather content
      var reqs = []; var seen = {};
      list.forEach(function (b) { b.requirements.forEach(function (r) { var s = L(r); if (!seen[s]) { seen[s] = 1; reqs.push(s); } }); });
      var checked = list.map(function (b) { return b.verification.checked_on; }).sort()[0];
      // Measure pass
      function layout(draw) {
        var y = 0;
        // header band
        if (draw) { ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, 190); ctx.fillStyle = '#ffffff'; ctx.font = '800 64px ' + disp; ctx.fillText('Benepisyo.', PAD, 110); ctx.font = '700 30px ' + body; ctx.fillText(t('plan_title').toUpperCase() + (office && office.city ? ' · ' + cityName(office.city).toUpperCase() : ''), PAD, 158); }
        y = 190;
        // perforation
        if (draw) { ctx.strokeStyle = C.line; ctx.setLineDash([14, 12]); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(PAD / 2, y + 30); ctx.lineTo(W - PAD / 2, y + 30); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.bg; }
        y += 80;
        if (name) { ctx.font = '700 40px ' + body; if (draw) { ctx.fillStyle = C.muted; ctx.fillText((lang === 'en' ? 'For ' : 'Para kay ') + name, PAD, y); } y += 64; }
        list.forEach(function (b) {
          ctx.font = '700 52px ' + disp;
          wrapText(ctx, L(b.title), CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.ink; ctx.fillText(ln, PAD, y); } y += 62; });
          ctx.font = '700 44px ' + body;
          var amt = b.amount_php ? peso(b.amount_php) + ' · ' + L(b.frequency) : (b.value ? L(b.value) : '');
          wrapText(ctx, amt, CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.accent; ctx.fillText(ln, PAD, y); } y += 54; });
          y += 24;
        });
        y += 16;
        ctx.font = '700 32px ' + body; if (draw) { ctx.fillStyle = C.muted; ctx.fillText(t('card_bring'), PAD, y); } y += 56;
        reqs.forEach(function (r) {
          ctx.font = '400 38px ' + body;
          var lines = wrapText(ctx, r, CW - 70);
          if (draw) { ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.strokeRect(PAD, y - 34, 40, 40); ctx.fillStyle = C.ink; }
          lines.forEach(function (ln) { if (draw) ctx.fillText(ln, PAD + 66, y); y += 50; });
          y += 14;
        });
        y += 24;
        ctx.font = '700 32px ' + body; if (draw) { ctx.fillStyle = C.muted; ctx.fillText(t('card_where'), PAD, y); } y += 56;
        ctx.font = '700 40px ' + body;
        wrapText(ctx, L(office.name), CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.ink; ctx.fillText(ln, PAD, y); } y += 52; });
        ctx.font = '400 36px ' + body;
        wrapText(ctx, L(office.place), CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.muted; ctx.fillText(ln, PAD, y); } y += 48; });
        y += 40;
        // free stamp
        if (draw) {
          ctx.save(); ctx.translate(PAD, y); ctx.rotate(-0.03);
          ctx.font = '800 46px ' + body; var sw = ctx.measureText(t('card_free')).width + 56;
          ctx.fillStyle = C.sun; ctx.fillRect(0, 0, sw, 84); ctx.strokeStyle = C.sunInk; ctx.lineWidth = 5; ctx.strokeRect(0, 0, sw, 84);
          ctx.fillStyle = C.sunInk; ctx.fillText(t('card_free'), 28, 58); ctx.restore();
        }
        y += 140;
        if (draw) { ctx.fillStyle = C.line; ctx.fillRect(PAD, y - 40, CW, 3); }
        ctx.font = '400 30px ' + body;
        var foot = t('checked', { date: fmtDate(checked) }) + ' · ' + t('card_confirm');
        wrapText(ctx, foot, CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.muted; ctx.fillText(ln, PAD, y); } y += 42; });
        if (draw) { ctx.fillStyle = C.accent; ctx.font = '700 30px ' + body; ctx.fillText('benepisyo.ph', PAD, y + 8); }
        y += 60;
        return y;
      }
      c.width = W; c.height = 400; ctx.textBaseline = 'alphabetic';
      var H = layout(false);
      c.width = W; c.height = Math.ceil(H);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, c.height);
      layout(true);
      return new Promise(function (resolve) { c.toBlob(function (bl) { resolve(bl); }, 'image/png'); });
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    applyLang();
    bindLangToggle();
    var off = $('#offline');
    function net() { if (off) off.hidden = navigator.onLine !== false; if (navigator.onLine) flushOutbox(); }
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
    try {
      if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) navigator.serviceWorker.register(ROOT + 'sw.js').catch(function () {});
    } catch (e) { /* not available in this frame */ }
    fetch(ROOT + 'data.json').then(function (r) { if (!r.ok) throw new Error('data'); return r.json(); }).then(function (d) {
      DATA = d;
      if (PAGE === 'home') initHome();
      else if (PAGE === 'city') initCity();
      else if (PAGE === 'detail') initDetail();
    }).catch(function () {
      if (PAGE === 'city') { /* static list still works without data */ }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
