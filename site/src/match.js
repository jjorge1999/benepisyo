/* Benepisyo eligibility logic. Pure functions, no DOM. Used by the browser app and by tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BMatch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OUTDATED_DAYS = 180;
  var STALE_DAYS = 90;

  var AGE_BANDS = {
    under60: [0, 59],
    '60_79': [60, 79],
    '80_99': [80, 99],
    '100plus': [100, 200]
  };

  function daysBetween(isoA, isoB) {
    var a = Date.parse(isoA + 'T00:00:00Z');
    var b = Date.parse(isoB + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  /* Badge shown to users: confirmed | reported | outdated */
  function effectiveStatus(benefit, today) {
    var v = benefit.verification || {};
    if (!v.checked_on) return 'outdated';
    if (daysBetween(v.checked_on, today) > OUTDATED_DAYS) return 'outdated';
    return v.status === 'confirmed' ? 'confirmed' : 'reported';
  }

  function needsRecheck(benefit, today) {
    var v = benefit.verification || {};
    return !v.checked_on || daysBetween(v.checked_on, today) > STALE_DAYS;
  }

  function appliesToCity(benefit, cityId) {
    return benefit.level === 'national' || (cityId && benefit.city === cityId);
  }

  function hasDoc(person, docId) {
    return (person.docs || []).indexOf(docId) !== -1;
  }

  /* needs = [["a"], ["b","c"]] means a AND (b OR c). Returns the unmet OR-groups. */
  function missingNeeds(benefit, person) {
    return (benefit.needs || []).filter(function (group) {
      return !group.some(function (d) { return hasDoc(person, d); });
    });
  }

  function personAgeRange(person) {
    var a = person.answers || {};
    if (a.age_band && AGE_BANDS[a.age_band]) return AGE_BANDS[a.age_band];
    if ((person.groups || []).indexOf('senior') !== -1) return [60, 200];
    return null;
  }

  /*
   * Evaluate one benefit for one person.
   * Returns { fit: 'yes' | 'maybe' | 'no', why: [reasonKey...], unknown: [ruleKey...], missing: [[doc,...],...] }
   */
  function evaluate(benefit, person, today) {
    var out = { fit: 'yes', why: [], unknown: [], missing: [] };
    if (benefit.expires_on && today && benefit.expires_on < today) { out.fit = 'no'; return out; }
    var groups = person.groups || [];
    var a = person.answers || {};
    var r = benefit.rules || {};

    var groupHit = (benefit.groups || []).filter(function (g) { return groups.indexOf(g) !== -1; });
    if (!groupHit.length) { out.fit = 'no'; return out; }
    out.why.push('group:' + groupHit[0]);

    if (!appliesToCity(benefit, person.city)) { out.fit = 'no'; return out; }

    if (benefit.provides && hasDoc(person, benefit.provides)) { out.fit = 'no'; out.why.push('has:' + benefit.provides); return out; }

    function unknown(key) { out.unknown.push(key); if (out.fit === 'yes') out.fit = 'maybe'; }

    if (r.age_min != null || r.age_max != null) {
      var range = personAgeRange(person);
      var min = r.age_min != null ? r.age_min : 0;
      var max = r.age_max != null ? r.age_max : 200;
      if (!range) unknown('age');
      else if (range[1] < min || range[0] > max) { out.fit = 'no'; return out; }
      else if (range[0] < min) unknown('age');
      else out.why.push('age:' + min);
    }

    if (r.milestone) {
      if (a.milestone === true) out.why.push('milestone');
      else if (a.milestone === false) { out.fit = 'no'; return out; }
      else unknown('milestone');
    }

    if (r.resident) {
      if (a.resident === true) out.why.push('resident');
      else if (a.resident === false) { out.fit = 'no'; return out; }
      else unknown('resident');
    }

    if (r.income && r.income.length) {
      if (!a.income || a.income === 'skip') unknown('income');
      else if (r.income.indexOf(a.income) === -1) { out.fit = 'no'; return out; }
      else out.why.push('income:' + a.income);
    }

    if (r.pension === false) {
      if (a.pension === false) out.why.push('no_pension');
      else if (a.pension === true) { out.fit = 'no'; return out; }
      else unknown('pension');
    }

    if (r.employed === true) {
      if (a.employed === true) out.why.push('employed');
      else if (a.employed === false) { out.fit = 'no'; return out; }
      else unknown('employed');
    }

    if (r.four_ps === true || r.four_ps === false) {
      if (a.four_ps === r.four_ps) out.why.push(r.four_ps ? 'four_ps' : 'not_four_ps');
      else if (a.four_ps === true || a.four_ps === false) { out.fit = 'no'; return out; }
      else unknown('four_ps');
    }

    if (r.children === true) {
      if (a.children === true) out.why.push('children');
      else if (a.children === false) { out.fit = 'no'; return out; }
      else unknown('children');
    }

    if (r.lost_job === true) {
      if (a.lost_job === true) out.why.push('lost_job');
      else if (a.lost_job === false) { out.fit = 'no'; return out; }
      else unknown('lost_job');
    }

    out.missing = missingNeeds(benefit, person);
    return out;
  }

  function levelRank(b) { return b.level === 'local' ? 0 : 1; }

  function sortBenefits(list) {
    return list.slice().sort(function (x, y) {
      var l = levelRank(x.benefit) - levelRank(y.benefit);
      if (l) return l;
      var f = (x.result.fit === 'yes' ? 0 : 1) - (y.result.fit === 'yes' ? 0 : 1);
      if (f) return f;
      return (y.benefit.amount_php || 0) - (x.benefit.amount_php || 0);
    });
  }

  /* Find the benefit that issues a given document in this city (an "ID guide"). */
  function unlockerFor(benefits, docId, cityId) {
    for (var i = 0; i < benefits.length; i++) {
      var b = benefits[i];
      if (b.provides === docId && appliesToCity(b, cityId)) return b;
    }
    return null;
  }

  /*
   * Build the personal results list.
   * ready:   [{benefit, result}]  claimable with documents the person already has
   * blocked: [{key, docs:[...], unlocker, items:[{benefit,result}]}]  grouped by the first missing document
   * guides:  ID benefits the person can apply for (they also appear in ready)
   */
  function buildResults(benefits, person, today) {
    var ready = [];
    var blockedMap = {};
    var blockedOrder = [];
    benefits.forEach(function (b) {
      var res = evaluate(b, person, today);
      if (res.fit === 'no') return;
      var item = { benefit: b, result: res };
      if (!res.missing.length) { ready.push(item); return; }
      var first = res.missing[0];
      var key = first.join('|');
      if (!blockedMap[key]) {
        blockedMap[key] = { key: key, docs: first, unlocker: unlockerFor(benefits, first[0], person.city), items: [] };
        blockedOrder.push(key);
      }
      blockedMap[key].items.push(item);
    });
    var blocked = blockedOrder.map(function (k) {
      var g = blockedMap[k];
      g.items = sortBenefits(g.items);
      return g;
    }).sort(function (x, y) { return y.items.length - x.items.length; });
    return { ready: sortBenefits(ready), blocked: blocked, total: ready.length + blocked.reduce(function (n, g) { return n + g.items.length; }, 0) };
  }

  /* Which quiz questions to show for a person, in order (max 6). */
  function questionsFor(person, cityId) {
    var g = person.groups || [];
    var q = [];
    if (g.indexOf('senior') !== -1) q.push('age_band');
    if (g.indexOf('senior') !== -1 && person.answers && (person.answers.age_band === '80_99' || person.answers.age_band === '100plus')) q.push('milestone');
    if (cityId) q.push('resident');
    if (g.indexOf('senior') !== -1 || g.indexOf('solo_parent') !== -1 || g.indexOf('family') !== -1) q.push('income');
    if (g.indexOf('family') !== -1) { q.push('four_ps'); q.push('children'); q.push('lost_job'); }
    if (g.indexOf('senior') !== -1) q.push('pension');
    if (g.indexOf('solo_parent') !== -1 || g.indexOf('mother') !== -1) q.push('employed');
    return q.slice(0, 5).concat(['docs']);
  }

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var SYNONYMS = {
    gamot: ['medicine', 'botika', 'pharmacy'], medicine: ['gamot'],
    libing: ['burial', 'funeral'], burial: ['libing'], funeral: ['libing'],
    pera: ['cash', 'subsidy', 'pension'], cash: ['pera'],
    doktor: ['doctor', 'check-up', 'konsulta'], doctor: ['doktor'],
    eskwela: ['student', 'estudyante', 'tuition'], school: ['estudyante', 'tuition'],
    trabaho: ['work', 'leave'], work: ['trabaho']
  };

  function search(benefits, query, cityId) {
    var q = normalize(query).trim();
    if (!q) return [];
    var terms = q.split(/\s+/);
    var expanded = [];
    terms.forEach(function (t) { expanded.push(t); (SYNONYMS[t] || []).forEach(function (s) { expanded.push(normalize(s)); }); });
    return benefits.filter(function (b) {
      if (!appliesToCity(b, cityId)) return false;
      var hay = normalize([b.title.tl, b.title.en, b.summary.tl, b.summary.en, (b.keywords || []).join(' ')].join(' '));
      return expanded.some(function (t) { return hay.indexOf(t) !== -1; });
    });
  }

  /* Benefits on a person's list that changed since a given ISO date. */
  function changedSince(benefits, ids, sinceIso) {
    if (!sinceIso) return [];
    return benefits.filter(function (b) {
      if (ids.indexOf(b.id) === -1) return false;
      var latest = (b.history || []).reduce(function (m, h) { return h.date > m ? h.date : m; }, '');
      return latest > sinceIso;
    });
  }

  return {
    OUTDATED_DAYS: OUTDATED_DAYS,
    daysBetween: daysBetween,
    effectiveStatus: effectiveStatus,
    needsRecheck: needsRecheck,
    appliesToCity: appliesToCity,
    evaluate: evaluate,
    buildResults: buildResults,
    questionsFor: questionsFor,
    unlockerFor: unlockerFor,
    search: search,
    changedSince: changedSince,
    missingNeeds: missingNeeds
  };
});
