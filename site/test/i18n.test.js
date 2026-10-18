const test = require('node:test');
const assert = require('node:assert/strict');
const { strings } = require('../src/i18n.js');
const benefits = require('../../data/benefits.json');
const offices = require('../../data/offices.json');
const meta = require('../../data/meta.json');

test('every UI string exists in Tagalog and English', () => {
  const tl = Object.keys(strings.tl).sort();
  const en = Object.keys(strings.en).sort();
  assert.deepEqual(tl.filter((k) => !en.includes(k)), [], 'missing in English');
  assert.deepEqual(en.filter((k) => !tl.includes(k)), [], 'missing in Tagalog');
});

test('every benefit points to a real office and uses known groups and documents', () => {
  const officeIds = offices.map((o) => o.id);
  const groupIds = meta.groups.map((g) => g.id);
  const docIds = meta.docs.map((d) => d.id);
  for (const b of benefits) {
    assert.ok(officeIds.includes(b.office), `${b.id}: office ${b.office}`);
    b.groups.forEach((g) => assert.ok(groupIds.includes(g), `${b.id}: group ${g}`));
    (b.needs || []).flat().forEach((d) => assert.ok(docIds.includes(d), `${b.id}: doc ${d}`));
    b.requirements.forEach((r) => (r.doc ? r.doc.split('|') : []).forEach((d) => assert.ok(docIds.includes(d), `${b.id}: requirement doc ${d}`)));
    ['title', 'summary', 'who', 'frequency'].forEach((f) => assert.ok(b[f].tl && b[f].en, `${b.id}: ${f} bilingual`));
    b.requirements.concat(b.steps).forEach((x) => assert.ok(x.tl && x.en, `${b.id}: requirement/step bilingual`));
  }
});

test('benefit ids are unique and URL-safe', () => {
  const ids = benefits.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^[a-z0-9][a-z0-9-]{2,63}$/));
});
