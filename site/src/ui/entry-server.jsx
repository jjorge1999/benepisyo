import React from 'react';
import { renderToString } from 'react-dom/server';
import { StyleProvider, createCache, extractStyle } from '@ant-design/cssinjs';
import Page from './Page.jsx';

/* Returns the page HTML and the Ant Design CSS it uses, so pages read fine before the script loads. */
export function render(props) {
  const cache = createCache();
  const html = renderToString(<StyleProvider cache={cache}><Page {...props} /></StyleProvider>);
  return { html, css: extractStyle(cache) };
}
