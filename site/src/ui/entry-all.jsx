/* Single bundle for file previews, where separate script files can't be loaded. */
import React from 'react';
import { boot } from './boot.jsx';
import Home from './Home.jsx';
import City from './City.jsx';
import Detail from './Detail.jsx';
import About, { NotFound } from './About.jsx';
boot((p) => (p.page === 'home' ? <Home /> : p.page === 'city' ? <City city={p.city} benefits={p.data.benefits} /> : p.page === 'detail' ? <Detail b={p.benefit} city={p.city} office={p.office} /> : p.page === 'about' ? <About /> : <NotFound />));
