import { RenderMode, ServerRoute } from '@angular/ssr';
import DATA from '../generated/data.json';
import M from '../match.js';

const d: any = DATA;
const cities = d.meta.cities.filter((c: any) => c.supported);

/* Every page is pre-rendered to static HTML at build time (GitHub Pages has no server). */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'tungkol', renderMode: RenderMode.Prerender },
  { path: '404', renderMode: RenderMode.Prerender },
  { path: ':city', renderMode: RenderMode.Prerender, getPrerenderParams: async () => cities.map((c: any) => ({ city: c.id })) },
  {
    path: ':city/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => cities.flatMap((c: any) => d.benefits.filter((b: any) => M.appliesToCity(b, c.id)).map((b: any) => ({ city: c.id, id: b.id })))
  },
  { path: '**', renderMode: RenderMode.Client }
];
