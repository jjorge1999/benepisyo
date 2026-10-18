import { Routes } from '@angular/router';
import { supportedCity, benefitInCity } from './core/guards';

/* Each page is its own lazy chunk, so a visitor downloads only the page they open. */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  { path: 'tungkol', loadComponent: () => import('./pages/about').then((m) => m.About) },
  { path: '404', loadComponent: () => import('./pages/about').then((m) => m.NotFound) },
  { path: ':city', canMatch: [supportedCity], loadComponent: () => import('./pages/city').then((m) => m.City) },
  { path: ':city/:id', canMatch: [benefitInCity], loadComponent: () => import('./pages/detail').then((m) => m.Detail) },
  { path: '**', loadComponent: () => import('./pages/about').then((m) => m.NotFound) }
];
