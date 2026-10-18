/* Every Philippine city and municipality (PSA PSGC, 30 June 2026), with town-centre coordinates where known (GeoNames). */
import RAW from '../../generated/lgus.json';
import { LGU_NAMES } from './names';

export interface Lgu { id: string; name: string; where: string; lat: number | null; lng: number | null; city: boolean }

const raw: any = RAW;
export const LGUS: Lgu[] = raw.l.map((r: any[]) => ({ id: r[0], name: r[1], where: raw.w[r[2]], lat: r[3], lng: r[4], city: r[5] === 1 }));
export const LGU_BY_ID = new Map(LGUS.map((l) => [l.id, l]));
LGUS.forEach((l) => (LGU_NAMES[l.id] = l.name));

export const lguLabel = (l: Lgu) => `${l.name}, ${l.where}`;

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\bcity of\b|\bcity\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const FOLDED = LGUS.map((l) => ({ l, name: fold(l.name), label: fold(lguLabel(l)) }));

/* What the person typed -> the town, when it is unambiguous ("Calamba, Laguna", "Nasugbu", "Quezon City"). */
export function resolveLgu(text: string): Lgu | null {
  const q = fold(text);
  if (!q) return null;
  const byLabel = FOLDED.find((x) => x.label === q);
  if (byLabel) return byLabel.l;
  const byName = FOLDED.filter((x) => x.name === q);
  if (byName.length === 1) return byName[0].l;
  const cities = byName.filter((x) => x.l.city);
  return cities.length === 1 ? cities[0].l : null;
}

/* Suggestions while typing: names that start with the text first, then cities, at most `n`. */
export function suggestLgus(text: string, n = 8): Lgu[] {
  const q = fold(text);
  if (!q) return [];
  return FOLDED.filter((x) => x.label.includes(q))
    .sort((a, b) => Number(!a.name.startsWith(q)) - Number(!b.name.startsWith(q)) || Number(b.l.city) - Number(a.l.city) || a.name.localeCompare(b.name))
    .slice(0, n).map((x) => x.l);
}

/* Nearest town centre to a position, within maxKm. Runs on the phone only. */
export function nearestLgu(lat: number, lng: number, maxKm = 25): Lgu | null {
  const rad = (d: number) => (d * Math.PI) / 180;
  let best: Lgu | null = null; let bestKm = Infinity;
  for (const l of LGUS) {
    if (l.lat == null || l.lng == null) continue;
    const dLat = rad(l.lat - lat), dLng = rad(l.lng - lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(l.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.sqrt(h));
    if (km < bestKm) { bestKm = km; best = l; }
  }
  return best && bestKm <= maxKm ? best : null;
}
