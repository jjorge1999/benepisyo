import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Root } from './Shell.jsx';

const ACTIVE = { home: 'home', city: 'city', detail: 'city', about: 'about', notfound: '' };

/* Hydrate the server-rendered page with the same props it was built from. */
export function boot(render) {
  const props = JSON.parse(document.getElementById('bp-props').textContent);
  hydrateRoot(document.getElementById('root'), <Root cfg={props.cfg} data={props.data} active={ACTIVE[props.page]}>{render(props)}</Root>);
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) navigator.serviceWorker.register(props.cfg.root + 'sw.js').catch(() => {});
  } catch (e) { /* not available in this frame */ }
}
