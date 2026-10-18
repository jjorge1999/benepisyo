/* Editor admin page. Served at /admin behind Cloudflare Access. No external scripts. */
export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Benepisyo Editor</title>
<style>
:root { --bg:#f3f6f2; --surface:#fff; --ink:#16251f; --muted:#4f5e57; --line:#d3dcd6; --accent:#0b5d4e; --good:#1d7a3e; --warn:#8f5400; --bad:#b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e1613; --surface:#15201c; --ink:#e6eee9; --muted:#a3b2aa; --line:#2b3a33; --accent:#5cc4a9; --good:#72d394; --warn:#f2b660; --bad:#ff8c82; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { background:var(--surface); border-bottom:1px solid var(--line); padding:12px max(16px, env(safe-area-inset-left)); display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; }
header b { font-size:18px; }
nav { display:flex; gap:4px; flex-wrap:wrap; }
nav button, .btn { min-height:38px; padding:6px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--ink); font:inherit; font-weight:600; cursor:pointer; }
nav button[aria-pressed="true"] { background:var(--accent); color:var(--surface); border-color:var(--accent); }
.btn.primary { background:var(--accent); color:var(--surface); border-color:var(--accent); }
.btn.danger { color:var(--bad); }
main { max-width:72rem; margin:0 auto; padding:16px max(16px, env(safe-area-inset-left)); display:flex; flex-direction:column; gap:16px; }
.panel { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:16px; display:flex; flex-direction:column; gap:12px; min-width:0; }
.scroll { overflow-x:auto; }
table { border-collapse:collapse; width:100%; font-variant-numeric:tabular-nums; }
th, td { text-align:left; padding:8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:13px; color:var(--muted); }
.pill { display:inline-block; padding:1px 8px; border-radius:999px; font-size:12px; font-weight:700; border:1px solid currentColor; }
.fresh { color:var(--good); } .recheck { color:var(--warn); } .outdated { color:var(--bad); }
textarea, input, select { width:100%; font:13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; padding:8px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--ink); }
textarea.json { min-height:420px; }
.row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(14rem, 1fr)); gap:10px; }
label { font-weight:600; font-size:13px; display:flex; flex-direction:column; gap:4px; }
.msg { padding:10px 12px; border-radius:8px; border:1px solid var(--line); }
.msg.err { border-color:var(--bad); color:var(--bad); } .msg.ok { border-color:var(--good); color:var(--good); }
.muted { color:var(--muted); } .small { font-size:13px; }
[hidden] { display:none !important; }
</style>
</head>
<body>
<header><b>Benepisyo Editor</b><nav id="tabs">
<button data-tab="queue" aria-pressed="true">Verification queue</button>
<button data-tab="reports" aria-pressed="false">Reports</button>
<button data-tab="new" aria-pressed="false">New benefit</button>
<button data-tab="import" aria-pressed="false">Import</button>
<button data-tab="stats" aria-pressed="false">Stats</button>
</nav><span class="muted small" id="me"></span></header>
<main id="main"></main>
<script>
(function () {
  var main = document.getElementById('main');
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(path, opts) {
    opts = opts || {};
    return fetch('/api/admin' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
  }
  function msg(el, text, ok) { el.innerHTML = '<div class="msg ' + (ok ? 'ok' : 'err') + '">' + h(text) + '</div>'; }

  var TEMPLATE = { id: 'calamba-new-benefit', level: 'local', city: 'calamba', groups: ['senior'], kind: 'cash',
    title: { tl: '', en: '' }, amount_php: null, frequency: { tl: '', en: '' }, summary: { tl: '', en: '' }, who: { tl: '', en: '' },
    rules: { resident: true }, needs: [['senior_id']], requirements: [{ doc: 'senior_id', tl: '', en: '' }], office: 'osca-calamba',
    steps: [{ tl: '', en: '' }], free: true, sources: [{ type: 'ordinance', label: '', url: 'https://' }],
    verification: { status: 'reported', checked_on: new Date().toISOString().slice(0, 10), method: { tl: '', en: '' } }, keywords: [], history: [] };

  function queue() {
    main.innerHTML = '<div class="panel"><p class="muted small">Oldest check first. Recheck after 90 days; shown as outdated to the public after 180 days.</p><div class="scroll" id="q">Loading…</div></div>';
    api('/queue').then(function (j) {
      document.getElementById('q').innerHTML = '<table><thead><tr><th>Benefit</th><th>Status</th><th>Badge</th><th>Checked</th><th>Open reports</th><th></th></tr></thead><tbody>' +
        j.items.map(function (i) {
          return '<tr><td><b>' + h(i.title) + '</b><br><span class="muted small">' + h(i.id) + ' · ' + h(i.level) + (i.city ? ' · ' + h(i.city) : '') + '</span></td><td>' + h(i.status) + (i.unpublished_changes ? '<br><span class="small recheck">unpublished changes</span>' : '') +
            '</td><td>' + h(i.verification) + '</td><td><span class="pill ' + i.flag + '">' + h(i.checked_on || 'never') + ' (' + (i.days_since_check == null ? '–' : i.days_since_check + 'd') + ')</span></td><td>' + i.open_reports + '</td><td><button class="btn" data-open="' + h(i.id) + '">Open</button></td></tr>';
        }).join('') + '</tbody></table>' + (j.items.length ? '' : '<p class="muted">No benefits yet. Use Import to load the seed data.</p>');
      Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) { b.onclick = function () { edit(b.getAttribute('data-open')); }; });
    }).catch(function (e) { msg(document.getElementById('q'), e.message); });
  }

  function edit(id) {
    main.innerHTML = '<div class="panel">Loading…</div>';
    Promise.all([api('/benefits/' + id), api('/benefits/' + id + '/history')]).then(function (res) {
      var b = res[0], hist = res[1].items;
      main.innerHTML = '<div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">' + h(b.title) + '</h2><span class="muted">' + h(b.status) + (b.submitted_by ? ' · submitted by ' + h(b.submitted_by) : '') + '</span></div>' +
        '<label>Benefit JSON (draft)<textarea class="json" id="json"></textarea></label>' +
        '<label>Change note (shown publicly in “Changes” when published)<input id="note" maxlength="300"></label>' +
        '<div class="row"><button class="btn" id="save">Save draft</button><button class="btn" id="submit">Submit for review</button><button class="btn primary" id="publish">Publish</button><button class="btn danger" id="archive">Archive…</button></div><div id="out"></div></div>' +
        '<div class="panel"><h3 style="margin:0">Record a verification</h3><div class="grid">' +
        '<label>Result<select id="v-status"><option value="confirmed">confirmed</option><option value="reported">reported</option></select></label>' +
        '<label>Checked on<input id="v-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
        '<label>How (English)<input id="v-method" placeholder="Called OSCA, spoke to staff (name), 2026-10-20"></label>' +
        '<label>How (Tagalog)<input id="v-method-tl"></label>' +
        '<label>New source URL (optional)<input id="v-url" placeholder="https://"></label>' +
        '<label>Source label<input id="v-label"></label>' +
        '<label>Source type<select id="v-type"><option>official_post</option><option>official_site</option><option>ordinance</option><option>law</option><option>direct</option><option>news</option><option>secondary</option></select></label>' +
        '</div><div class="row"><button class="btn primary" id="verify">Save verification</button></div><div id="vout"></div></div>' +
        '<div class="panel"><h3 style="margin:0">History</h3><div class="scroll"><table><tbody>' + hist.map(function (x) { return '<tr><td class="small">' + h(x.at.replace('T', ' ').slice(0, 16)) + '</td><td>' + h(x.action) + '</td><td>' + h(x.editor) + '</td><td>' + h(x.note || '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      document.getElementById('json').value = JSON.stringify(b.draft, null, 2);
      var out = document.getElementById('out');
      function body() { try { return JSON.parse(document.getElementById('json').value); } catch (e) { msg(out, 'JSON error: ' + e.message); return null; } }
      document.getElementById('save').onclick = function () { var d = body(); if (!d) return; api('/benefits/' + id, { method: 'PUT', body: { data: d, note: document.getElementById('note').value } }).then(function () { msg(out, 'Draft saved.', true); }).catch(function (e) { msg(out, e.message); }); };
      document.getElementById('submit').onclick = function () { api('/benefits/' + id + '/submit', { method: 'POST', body: {} }).then(function () { msg(out, 'Submitted. A second editor must publish.', true); }).catch(function (e) { msg(out, e.message); }); };
      document.getElementById('publish').onclick = function () { api('/benefits/' + id + '/publish', { method: 'POST', body: { note: document.getElementById('note').value } }).then(function (j) { msg(out, 'Published.' + (j.deploy_triggered ? ' Site rebuild started.' : ' Rebuild the site to go live.'), true); }).catch(function (e) { msg(out, e.message); }); };
      document.getElementById('archive').onclick = function () {
        out.innerHTML = '<div class="row"><input id="arch-reason" placeholder="Reason, e.g. program ended in 2026"><button class="btn danger" id="arch-yes">Archive benefit</button></div>';
        document.getElementById('arch-yes').onclick = function () { api('/benefits/' + id + '/archive', { method: 'POST', body: { reason: document.getElementById('arch-reason').value } }).then(function () { msg(out, 'Archived.', true); }).catch(function (e) { msg(out, e.message); }); };
      };
      document.getElementById('verify').onclick = function () {
        var url = document.getElementById('v-url').value.trim();
        api('/benefits/' + id + '/verify', { method: 'POST', body: { status: document.getElementById('v-status').value, checked_on: document.getElementById('v-date').value, method: document.getElementById('v-method').value, method_tl: document.getElementById('v-method-tl').value, source: url ? { url: url, label: document.getElementById('v-label').value || url, type: document.getElementById('v-type').value } : null } })
          .then(function (j) { msg(document.getElementById('vout'), 'Verification saved.' + (j.deploy_triggered ? ' Site rebuild started.' : ''), true); }).catch(function (e) { msg(document.getElementById('vout'), e.message); });
      };
    }).catch(function (e) { msg(main, e.message); });
  }

  function reports() {
    main.innerHTML = '<div class="panel"><div class="row"><label style="max-width:14rem">Status<select id="rs"><option value="new">new</option><option value="checking">checking</option><option value="fixed">fixed</option><option value="rejected">rejected</option><option value="">all</option></select></label></div><div class="scroll" id="rl">Loading…</div></div>';
    function load() {
      var s = document.getElementById('rs').value;
      api('/reports' + (s ? '?status=' + s : '')).then(function (j) {
        document.getElementById('rl').innerHTML = j.items.length ? '<table><thead><tr><th>When</th><th>Benefit</th><th>Report</th><th>Contact</th><th>Action</th></tr></thead><tbody>' + j.items.map(function (r) {
          return '<tr><td class="small">' + h(r.created_at.slice(0, 10)) + '</td><td>' + h(r.benefit_id) + '<br><button class="btn" data-open="' + h(r.benefit_id) + '">Open</button></td><td>' + h(r.message) + (r.has_photo ? '<br><a href="/api/admin/reports/' + r.id + '/photo" target="_blank" rel="noopener">View photo</a> <span class="muted small">(blur IDs and faces before any public use)</span>' : '') +
            '</td><td>' + h(r.contact || '—') + '</td><td><div class="row">' + ['checking', 'fixed', 'rejected'].map(function (st) { return '<button class="btn" data-r="' + r.id + '" data-s="' + st + '">' + st + '</button>'; }).join('') + '</div><span class="small muted">' + h(r.status) + (r.handled_by ? ' · ' + h(r.handled_by) : '') + '</span></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted">No reports with this status.</p>';
        Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (b) { b.onclick = function () { api('/reports/' + b.getAttribute('data-r'), { method: 'PATCH', body: { status: b.getAttribute('data-s') } }).then(load); }; });
        Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) { b.onclick = function () { edit(b.getAttribute('data-open')); }; });
      }).catch(function (e) { msg(document.getElementById('rl'), e.message); });
    }
    document.getElementById('rs').onchange = load; load();
  }

  function create() {
    main.innerHTML = '<div class="panel"><p class="muted small">Every benefit needs Tagalog and English text, an https source, and a check date. New benefits start as drafts.</p><textarea class="json" id="json"></textarea><div class="row"><button class="btn primary" id="create">Create draft</button></div><div id="out"></div></div>';
    document.getElementById('json').value = JSON.stringify(TEMPLATE, null, 2);
    document.getElementById('create').onclick = function () {
      var out = document.getElementById('out'); var d;
      try { d = JSON.parse(document.getElementById('json').value); } catch (e) { return msg(out, 'JSON error: ' + e.message); }
      api('/benefits', { method: 'POST', body: { data: d } }).then(function () { edit(d.id); }).catch(function (e) { msg(out, e.message); });
    };
  }

  function importer() {
    main.innerHTML = '<div class="panel"><p class="muted small">Paste the contents of data/benefits.json. Existing ids are skipped.</p><textarea class="json" id="json" placeholder="[ ... ]"></textarea><label class="row" style="flex-direction:row"><input type="checkbox" id="pub" style="width:auto"> Publish immediately (initial seed only)</label><div class="row"><button class="btn primary" id="go">Import</button></div><div id="out"></div></div>';
    document.getElementById('go').onclick = function () {
      var out = document.getElementById('out'); var list;
      try { list = JSON.parse(document.getElementById('json').value); } catch (e) { return msg(out, 'JSON error: ' + e.message); }
      api('/import', { method: 'POST', body: { benefits: list, publish: document.getElementById('pub').checked } }).then(function (j) {
        msg(out, 'Imported ' + j.imported + ', skipped ' + j.skipped.length + (Object.keys(j.errors).length ? ', errors: ' + JSON.stringify(j.errors) : ''), !Object.keys(j.errors).length);
      }).catch(function (e) { msg(out, e.message); });
    };
  }

  function stats() {
    main.innerHTML = '<div class="panel" id="st">Loading…</div>';
    api('/stats').then(function (j) {
      function tbl(rows, a, b) { return '<table><tbody>' + rows.map(function (r) { return '<tr><td>' + h(r[a]) + '</td><td>' + h(r[b]) + '</td></tr>'; }).join('') + '</tbody></table>'; }
      document.getElementById('st').innerHTML = '<h3 style="margin:0">Check-ins ' + h(j.month) + '</h3>' + tbl(j.checkins, 'answer', 'n') + '<h3 style="margin:0">Reports</h3>' + tbl(j.reports, 'status', 'n') + '<h3 style="margin:0">Most requested cities</h3>' + tbl(j.city_requests, 'city', 'n');
    }).catch(function (e) { msg(document.getElementById('st'), e.message); });
  }

  var views = { queue: queue, reports: reports, new: create, import: importer, stats: stats };
  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      views[b.getAttribute('data-tab')]();
    };
  });
  api('/me').then(function (j) { document.getElementById('me').textContent = j.email; }).catch(function () {});
  queue();
})();
</script>
</body>
</html>`;
