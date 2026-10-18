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

test('low-income 4Ps family with indigency certificate', () => {
  const p = { city: 'calamba', groups: ['family'], docs: ['indigency', 'philhealth'], answers: { resident: true, income: 'low', four_ps: true, children: true, lost_job: false } };
  const r = M.buildResults(benefits, p, '2026-10-19');
  const ready = ids(r.ready);
  ['calamba-burial-aid', 'calamba-hospital-aid', 'lifeline-rate', 'aics', 'philhealth-gamot'].forEach((id) => assert.ok(ready.includes(id), id));
  assert.ok(!ready.includes('four-ps'), 'already in 4Ps');
  assert.ok(!ready.includes('uplift-2026'), 'UPLIFT is for families not in 4Ps');
  assert.ok(!ready.includes('tupad'), 'did not lose a job');
  assert.ok(!ready.includes('calamba-indigency-certificate'), 'already has the certificate');
});

test('family not in 4Ps sees 4Ps and UPLIFT, and UPLIFT ends after December 2026', () => {
  const p = { city: 'calamba', groups: ['family'], docs: [], answers: { resident: true, income: 'low', four_ps: false, children: true, lost_job: true } };
  let ready = ids(M.buildResults(benefits, p, '2026-10-19').ready);
  ['four-ps', 'uplift-2026', 'tupad', 'calamba-indigency-certificate'].forEach((id) => assert.ok(ready.includes(id), id));
  ready = ids(M.buildResults(benefits, p, '2027-01-05').ready);
  assert.ok(!ready.includes('uplift-2026'), 'expired program disappears');
});

test('city financial aid waits on the Certificate of Indigency', () => {
  const p = { city: 'calamba', groups: ['family'], docs: [], answers: { resident: true, income: 'low' } };
  const g = M.buildResults(benefits, p, '2026-10-19').blocked.find((x) => x.key === 'indigency');
  assert.ok(g, 'blocked by indigency');
  assert.equal(g.unlocker.id, 'calamba-indigency-certificate');
  assert.ok(g.items.length >= 5, 'unlocks the city aid programs: ' + g.items.length);
});

test('household questions stay within six', () => {
  const q = M.questionsFor({ groups: ['family'], answers: {} }, 'calamba');
  assert.deepEqual(q, ['resident', 'income', 'four_ps', 'children', 'lost_job', 'docs']);
});

test('every city and town gets the law-based IDs; Calamba keeps its own verified version', () => {
  const senior = { groups: ['senior'], docs: [], answers: { age_band: '60_79', resident: true } };
  const nas = ids(M.buildResults(benefits, { ...senior, city: 'nasugbu' }, '2026-10-19').ready);
  assert.ok(nas.includes('lgu-senior-id'), 'Nasugbu senior sees the law-based Senior ID');
  assert.ok(!nas.some((id) => id.startsWith('calamba-')), 'no Calamba-only benefits outside Calamba');
  const cal = ids(M.buildResults(benefits, { ...senior, city: 'calamba' }, '2026-10-19').ready);
  assert.ok(cal.includes('calamba-senior-id') && !cal.includes('lgu-senior-id'), 'Calamba uses its own Senior ID entry');
  const g = M.buildResults(benefits, { ...senior, city: 'nasugbu' }, '2026-10-19').blocked.find((x) => x.key === 'senior_id');
  assert.equal(g.unlocker.id, 'lgu-senior-id', 'the law-based ID unlocks the senior discount anywhere');
});

test('no city chosen: national benefits only', () => {
  const r = M.buildResults(benefits, { city: null, groups: ['pwd'], docs: [], answers: {} }, '2026-10-19');
  assert.ok(ids(r.ready).concat(r.blocked.flatMap((g) => ids(g.items))).every((id) => benefits.find((b) => b.id === id).level === 'national'));
});

test('every LGU in the list has a unique id and a name', () => {
  const lgus = require('../../data/lgus.json');
  assert.ok(lgus.length > 1600);
  assert.equal(new Set(lgus.map((x) => x.id)).size, lgus.length);
  assert.ok(lgus.every((x) => x.name && x.region && (x.type === 'city' || x.type === 'municipality')));
  assert.ok(lgus.find((x) => x.id === 'calamba' && x.province === 'Laguna'));
});
