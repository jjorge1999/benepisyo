import { CanMatchFn } from '@angular/router';
import DATA from '../../generated/data.json';

const d: any = DATA;
const lgus = () => import('./lgus').then((m) => m.LGU_BY_ID);

/* Only real cities/towns and benefits get a page; anything else falls through to "not found". */
export const isLgu: CanMatchFn = async (_r, seg) => (await lgus()).has(seg[0]?.path);
export const localBenefit: CanMatchFn = (_r, seg) => d.benefits.some((b: any) => b.level === 'local' && b.city === seg[0]?.path && b.id === seg[1]?.path);
export const sharedBenefit: CanMatchFn = (_r, seg) => d.benefits.some((b: any) => b.level !== 'local' && b.id === seg[1]?.path);
