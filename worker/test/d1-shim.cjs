/* Minimal Cloudflare D1 stand-in over Node's built-in SQLite, for tests only. */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
  return {
    prepare(sql) {
      let params = [];
      const stmt = () => db.prepare(sql);
      const api = {
        bind(...args) { params = args.map((v) => (v === undefined ? null : v)); return api; },
        async first() { return stmt().get(...params) || null; },
        async all() { return { results: stmt().all(...params) }; },
        async run() { const r = stmt().run(...params); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; }
      };
      return api;
    }
  };
}

function createR2() {
  const store = new Map();
  return {
    async put(key, value, opts) { store.set(key, { value, httpMetadata: opts && opts.httpMetadata }); },
    async get(key) { const o = store.get(key); return o ? { body: o.value, httpMetadata: o.httpMetadata } : null; },
    store
  };
}

module.exports = { createD1, createR2 };
