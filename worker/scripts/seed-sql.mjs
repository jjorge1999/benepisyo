#!/usr/bin/env node
/* Prints SQL that loads data/benefits.json as published benefits. Existing rows are left untouched. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const benefits = JSON.parse(readFileSync(path.join(here, '..', '..', 'data', 'benefits.json'), 'utf8'));
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const at = new Date().toISOString();

const lines = [];
for (const b of benefits) {
  const text = JSON.stringify(b);
  lines.push(`INSERT OR IGNORE INTO benefits (id, draft, published, status, updated_by, updated_at, published_by, published_at) VALUES (${q(b.id)}, ${q(text)}, ${q(text)}, 'published', 'seed', ${q(at)}, 'seed', ${q(at)});`);
}
lines.push(`INSERT INTO history (benefit_id, at, editor, action, note) SELECT id, ${q(at)}, 'seed', 'import', 'initial seed' FROM benefits WHERE updated_by = 'seed' AND id NOT IN (SELECT benefit_id FROM history);`);
process.stdout.write(lines.join('\n') + '\n');
