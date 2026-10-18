import React from 'react';
import { boot } from './boot.jsx';
import About, { NotFound } from './About.jsx';
boot((p) => (p.page === 'notfound' ? <NotFound /> : <About />));
