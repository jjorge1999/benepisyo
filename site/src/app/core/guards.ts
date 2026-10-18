import { CanMatchFn } from '@angular/router';
import DATA from '../../generated/data.json';
import M from '../../match.js';

const d: any = DATA;
const isCity = (id: string) => d.meta.cities.some((c: any) => c.supported && c.id === id);

/* Only real cities and benefits get a page; anything else falls through to "not found". */
export const supportedCity: CanMatchFn = (_r, seg) => isCity(seg[0]?.path);
export const benefitInCity: CanMatchFn = (_r, seg) => isCity(seg[0]?.path) && d.benefits.some((b: any) => b.id === seg[1]?.path && M.appliesToCity(b, seg[0].path));
