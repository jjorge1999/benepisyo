import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import DATA from '../../generated/data.json';

const SITE_URL: string = ((DATA as any).site_url || 'https://benepisyo.pages.dev').replace(/\/$/, '');

/* Title, description, canonical URL, Open Graph and JSON-LD for each pre-rendered page. */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  canonical(path: string) { return SITE_URL + '/' + path; }

  set(o: { title: string; description: string; path: string; jsonld?: unknown }) {
    const url = this.canonical(o.path);
    this.title.setTitle(o.title);
    this.meta.updateTag({ name: 'description', content: o.description });
    this.meta.updateTag({ property: 'og:title', content: o.title });
    this.meta.updateTag({ property: 'og:description', content: o.description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: SITE_URL + '/og.png' });
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = this.doc.createElement('link'); link.rel = 'canonical'; this.doc.head.appendChild(link); }
    link.href = url;
    this.doc.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
    if (o.jsonld) {
      const s = this.doc.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(o.jsonld).replace(/</g, '\\u003c');
      this.doc.head.appendChild(s);
    }
  }
}
