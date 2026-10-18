import { Routes } from '@angular/router';
import { isLgu, localBenefit, sharedBenefit } from './core/guards';

/* Each page is its own lazy chunk, so a visitor downloads only the page they open. */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  { path: 'tungkol', loadComponent: () => import('./pages/about').then((m) => m.About) },
  { path: 'b/:id', canMatch: [sharedBenefit], loadComponent: () => import('./pages/detail').then((m) => m.Detail) },
  { path: ':city', canMatch: [isLgu], loadComponent: () => import('./pages/city').then((m) => m.City) },
  { path: ':city/:id', canMatch: [localBenefit], loadComponent: () => import('./pages/detail').then((m) => m.Detail) },
  { path: '**', loadComponent: () => import('./pages/about').then((m) => m.NotFound) }
];
