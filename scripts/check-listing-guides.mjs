import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locales = ['en', 'fr', 'de', 'nl', 'pl', 'es', 'it', 'pt'];
const slugs = ['vinted-description-template', 'vinted-listing-checklist', 'vinted-photo-to-listing'];
const titles = new Set();
const headings = new Set();
const directory = path.join(root, 'src/i18n/listing-guides');
const files = existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith('.json')) : [];
assert.equal(files.length, locales.length, 'Each of the eight site languages needs a real translation');
const text = (value, label) => assert.ok(typeof value === 'string' && value.trim().length > 0, `${label} must contain text`);
for (const locale of locales) {
  const copy = JSON.parse(readFileSync(path.join(directory, `${locale}.json`), 'utf8'));
  assert.deepEqual(Object.keys(copy.pages).sort(), [...slugs].sort(), `${locale}: exactly three distinct pages`);
  for (const key of ['resources', 'home', 'answer', 'contents', 'examples', 'exampleNote', 'copy', 'copied', 'copyError', 'checks', 'progress', 'faq', 'related', 'ctaTitle', 'ctaBody', 'freeNote', 'setup', 'setupNote', 'photoCaption']) text(copy.ui[key], `${locale}.${key}`);
  assert.ok(copy.ui.progress.includes('{done}') && copy.ui.progress.includes('{total}'), `${locale}: progress placeholders`);
  for (const slug of slugs) {
    const page = copy.pages[slug];
    for (const key of ['title', 'description', 'heading', 'answer']) text(page[key], `${locale}/${slug}.${key}`);
    assert.ok(page.title.length <= 80, `${locale}/${slug}: title too long`);
    assert.ok(page.description.length >= 80 && page.description.length <= 180, `${locale}/${slug}: description length ${page.description.length}`);
    assert.ok(!titles.has(page.title), `Duplicate title: ${page.title}`);
    assert.ok(!headings.has(page.heading), `Untranslated heading: ${page.heading}`);
    titles.add(page.title);
    headings.add(page.heading);
    assert.equal(page.sections.length, 3, `${locale}/${slug}: three useful sections`);
    page.sections.forEach((section, index) => {
      text(section.heading, `${locale}/${slug}: section ${index}`);
      text(section.body, `${locale}/${slug}: section ${index} body`);
    });
    assert.ok(page.checks.length >= 5, `${locale}/${slug}: a practical checklist`);
    page.checks.forEach(check => text(check, `${locale}/${slug}: checklist item`));
    assert.equal(page.faq.length, 3, `${locale}/${slug}: three answered questions`);
    page.faq.forEach(item => {
      text(item.question, `${locale}/${slug}: FAQ question`);
      text(item.answer, `${locale}/${slug}: FAQ answer`);
    });
    if (slug === 'vinted-description-template') {
      assert.equal(page.examples.length, 3, `${locale}: three copyable templates`);
      page.examples.forEach(example => {
        text(example.label, `${locale}: template label`);
        assert.ok(example.text.includes('[') && example.text.includes(']'), `${locale}: templates must show placeholders, not pretend to know the item`);
      });
    }
  }
}
for (const file of [...slugs.flatMap(slug => [`src/pages/${slug}.astro`, `src/pages/[lang]/${slug}.astro`]), 'src/components/ListingGuide.astro', 'src/components/ListingGuideLinks.astro', 'src/i18n/listingGuides.ts']) assert.ok(existsSync(path.join(root, file)), `Missing implementation: ${file}`);

if (process.argv.includes('--built')) {
  const origin = 'https://autolister.app';
  const sitemapFiles = readdirSync(path.join(root, 'dist')).filter(file => /^sitemap-\d+\.xml$/.test(file));
  assert.ok(sitemapFiles.length > 0, 'Built sitemap missing');
  const sitemap = sitemapFiles.map(file => readFileSync(path.join(root, 'dist', file), 'utf8')).join('\n');
  for (const locale of locales) {
    const copy = JSON.parse(readFileSync(path.join(directory, `${locale}.json`), 'utf8'));
    const prefix = locale === 'en' ? '' : `/${locale}`;
    const homepage = readFileSync(path.join(root, 'dist', prefix, 'index.html'), 'utf8');
    for (const slug of slugs) {
      const url = `${origin}${prefix}/${slug}`;
      const file = path.join(root, 'dist', prefix, slug, 'index.html');
      assert.ok(existsSync(file), `Missing built route: ${url}`);
      const html = readFileSync(file, 'utf8');
      assert.match(html, new RegExp(`<html[^>]+lang="${locale}"`), `${url}: HTML language`);
      assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${url}: one H1`);
      assert.ok(html.includes(`rel="canonical" href="${url}"`), `${url}: self canonical`);
      assert.ok(!/name="robots"[^>]*noindex/.test(html), `${url}: unexpected noindex`);
      for (const alternate of [...locales, 'x-default']) {
        const altPrefix = alternate === 'en' || alternate === 'x-default' ? '' : `/${alternate}`;
        assert.ok(html.includes(`hreflang="${alternate}" href="${origin}${altPrefix}/${slug}"`), `${url}: missing alternate ${alternate}`);
      }
      const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
      const graph = schemas.find(schema => Array.isArray(schema['@graph']))?.['@graph'];
      assert.ok(graph, `${url}: page-specific structured data`);
      assert.equal(graph.find(item => item['@type'] === 'WebPage')?.url, url);
      const faq = graph.find(item => item['@type'] === 'FAQPage');
      assert.deepEqual(faq.mainEntity.map(item => ({ question: item.name, answer: item.acceptedAnswer.text })), copy.pages[slug].faq, `${url}: schema must match visible FAQ copy`);
      assert.ok(sitemap.includes(`${url}</loc>`) || sitemap.includes(`${url}/</loc>`), `${url}: missing from sitemap`);
      assert.ok(homepage.includes(`href="${prefix}/${slug}"`), `${url}: orphaned from localized home`);
      assert.ok(html.includes('data-track-event="chrome_store_click"'), `${url}: missing conversion tracking`);
    }
  }
}
console.log(`Verified ${slugs.length * locales.length} translated listing guides${process.argv.includes('--built') ? ', rendered HTML, hreflang, JSON-LD, internal links and sitemap' : ' and source contracts'}.`);
