import React from 'react';
import { boot } from './boot.jsx';
import Detail from './Detail.jsx';
boot((p) => <Detail b={p.benefit} city={p.city} office={p.office} />);
