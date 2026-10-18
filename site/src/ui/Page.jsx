import React from 'react';
import { Root } from './Shell.jsx';
import Home from './Home.jsx';
import City from './City.jsx';
import Detail from './Detail.jsx';
import About, { NotFound } from './About.jsx';

const ACTIVE = { home: 'home', city: 'city', detail: 'city', about: 'about', notfound: '' };

/* props: { cfg, data: {meta, benefits?, offices?}, page, ... } — identical on server and in the browser. */
export default function Page(props) {
  const { cfg, data, page } = props;
  let body;
  if (page === 'home') body = <Home />;
  else if (page === 'city') body = <City city={props.city} benefits={data.benefits} />;
  else if (page === 'detail') body = <Detail b={props.benefit} city={props.city} office={props.office} />;
  else if (page === 'about') body = <About />;
  else body = <NotFound />;
  return <Root cfg={cfg} data={data} active={ACTIVE[page]}>{body}</Root>;
}
