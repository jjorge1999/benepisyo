import { RenderMode, ServerRoute } from '@angular/ssr';
import DATA from '../generated/data.json';
import RAW from '../generated/lgus.json';

const d: any = DATA;
const lgus: any = RAW;

/*
 * Pre-rendered to static HTML (GitHub Pages has no server): home, about, every shared benefit, all 149 cities
 * and the fully covered cities' own benefits. The ~1,490 municipalities open in the app (from 404.html) to keep the site small.
 */
const full = d.meta.cities.filter((c: any) => c.supported).map((c: any) => c.id);
const cityIds = Array.from(new Set(lgus.l.filter((r: any[]) => r[5] === 1).map((r: any[]) => r[0]).concat(full)));

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'tungkol', renderMode: RenderMode.Prerender },
  { path: 'b/:id', renderMode: RenderMode.Prerender, getPrerenderParams: async () => d.benefits.filter((b: any) => b.level !== 'local').map((b: any) => ({ id: b.id })) },
  { path: ':city', renderMode: RenderMode.Prerender, getPrerenderParams: async () => cityIds.map((city) => ({ city })) },
  { path: ':city/:id', renderMode: RenderMode.Prerender, getPrerenderParams: async () => d.benefits.filter((b: any) => b.level === 'local').map((b: any) => ({ city: b.city, id: b.id })) },
  { path: '**', renderMode: RenderMode.Client }
];
