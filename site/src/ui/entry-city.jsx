import React from 'react';
import { boot } from './boot.jsx';
import City from './City.jsx';
boot((p) => <City city={p.city} benefits={p.data.benefits} />);
