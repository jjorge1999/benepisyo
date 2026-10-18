#!/usr/bin/env node
/*
 * Writes src/generated/data.json, which the app bundles and pre-renders from.
 *   SITE_URL      public address, e.g. https://jjorge1999.github.io/benepisyo
 *   API_BASE      reports/check-ins API (optional; without it they wait on the phone)
 *   BENEFITS_URL  build from the admin's published feed instead of data/benefits.json
 *   BUILD_DATE    override "today" (YYYY-MM-DD, Philippine time)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '../../data');
const OUT = path.resolve(here, '../src/generated/data.json');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const today = process.env.BUILD_DATE || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const siteUrl = (process.env.SITE_URL || 'https://benepisyo.pages.dev').replace(/\/$/, '');

let benefits = read('benefits.json');
if (process.env.BENEFITS_URL) {
  const res = await fetch(process.env.BENEFITS_URL);
  if (!res.ok) throw new Error('Could not load published benefits: HTTP ' + res.status);
  const list = (await res.json()).benefits || [];
  if (list.length) benefits = list;
  else console.warn('Published feed is empty; using data/benefits.json.');
}
benefits = benefits.filter((b) => !b.expires_on || b.expires_on >= today);
const meta = read('meta.json');
const out = {
  version: meta.data_version, built: today, site_url: siteUrl, site_host: siteUrl.replace(/^https?:\/\//, ''),
  api: process.env.API_BASE || '', benefits, offices: read('offices.json'), meta
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`data: ${benefits.length} benefits, built ${today}, site ${siteUrl}`);
