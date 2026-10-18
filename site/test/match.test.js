const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/match.js');
const benefits = require('../../data/benefits.json');

const base = { city: 'calamba', docs: [], answers: {} };
const ids = (list) => list.map((x) => x.benefit.id);

test('senior with Senior ID can claim birthday cash gift and discount now', () => {
  const p = { ...base, groups: ['senior'], docs: ['senior_id'], answers: { age_band: '60_79', resident: true, income: 'mid', pension: true } };
  const r = M.buildResults(benefits, p);
  assert.ok(ids(r.ready).includes('calamba-senior-birthday-cash'));
  assert.ok(ids(r.ready).includes('senior-discount'));
  assert.ok(!ids(r.ready).includes('calamba-senior-id'), 'already has the ID, so the ID guide is hidden');
  assert.ok(!ids(r.ready).includes('senior-social-pension'), 'has a pension, so social pension does not apply');
  assert.ok(!ids(r.ready).includes('senior-milestone-cash-gift'), 'under 80');
});

test('senior without ID is blocked, and the Senior ID unlocks them', () => {
  const p = { ...base, groups: ['senior'], docs: [], answers: { age_band: '60_79', resident: true } };
  const r = M.buildResults(benefits, p);
  const g = r.blocked.find((x) => x.key === 'senior_id');
  assert.ok(g, 'blocked group for senior_id exists');
  assert.equal(g.unlocker.id, 'calamba-senior-id');
  assert.ok(g.items.length >= 2);
  assert.ok(ids(r.ready).includes('calamba-senior-id'), 'the ID itself is ready to apply for');
  assert.equal(r.ready[0].benefit.level, 'local', 'local benefits first');
});

test('80-year-old turning a milestone age with National ID gets the cash gift', () => {
  const p = { ...base, groups: ['senior'], docs: ['national_id', 'senior_id'], answers: { age_band: '80_99', milestone: true, resident: true } };
  const r = M.buildResults(benefits, p);
  assert.ok(ids(r.ready).includes('senior-milestone-cash-gift'));
});

test('non-resident sees national benefits only', () => {
  const p = { ...base, groups: ['senior'], docs: ['senior_id'], answers: { age_band: '60_79', resident: false } };
  const r = M.buildResults(benefits, p);
  assert.ok(r.ready.every((x) => x.benefit.level === 'national'));
});

test('skipped answers give "maybe", never exclusion', () => {
  const p = { ...base, groups: ['solo_parent'], docs: ['solo_parent_id'], answers: {} };
  const res = M.evaluate(benefits.find((b) => b.id === 'solo-parent-subsidy'), p);
  assert.equal(res.fit, 'maybe');
  assert.deepEqual(res.unknown.sort(), ['income', 'resident']);
});

test('higher-income solo parent does not get the subsidy but keeps the leave if employed', () => {
  const p = { ...base, groups: ['solo_parent'], docs: ['solo_parent_id'], answers: { resident: true, income: 'high', employed: true } };
  const r = M.buildResults(benefits, p);
  assert.ok(!ids(r.ready).includes('solo-parent-subsidy'));
  assert.ok(!ids(r.ready).includes('solo-parent-discount'));
  assert.ok(ids(r.ready).includes('solo-parent-leave'));
});

test('unsupported city keeps national benefits and drops Calamba ones', () => {
  const p = { city: null, groups: ['pwd'], docs: ['pwd_id'], answers: {} };
  const r = M.buildResults(benefits, p);
  assert.ok(ids(r.ready).includes('pwd-discount'));
  assert.ok(!ids(r.ready).concat(r.blocked.flatMap((g) => ids(g.items))).includes('calamba-pwd-id'));
});

test('questions never exceed six and always end with documents', () => {
  const q = M.questionsFor({ groups: ['senior', 'solo_parent', 'mother'], answers: { age_band: '80_99' } }, 'calamba');
  assert.ok(q.length <= 6);
  assert.equal(q[q.length - 1], 'docs');
});

test('badges: confirmed, reported, and outdated after 180 days', () => {
  const b = benefits.find((x) => x.id === 'senior-discount');
  assert.equal(M.effectiveStatus(b, '2026-10-19'), 'confirmed');
  assert.equal(M.effectiveStatus(b, '2027-05-01'), 'outdated');
  const r = benefits.find((x) => x.id === 'calamba-senior-birthday-cash');
  assert.equal(M.effectiveStatus(r, '2026-10-19'), 'reported');
});

test('search works in Tagalog and English', () => {
  const a = M.search(benefits, 'gamot', 'calamba').map((b) => b.id);
  const b = M.search(benefits, 'medicine', 'calamba').map((b) => b.id);
  assert.ok(a.includes('philhealth-gamot'));
  assert.ok(b.includes('philhealth-gamot'));
});

test('every benefit has at least one source and a check date', () => {
  for (const b of benefits) {
    assert.ok(b.sources && b.sources.length, b.id + ' has a source');
    assert.ok(b.verification && b.verification.checked_on, b.id + ' has a check date');
    assert.ok(b.title.tl && b.title.en && b.summary.tl && b.summary.en, b.id + ' bilingual');
  }
});
