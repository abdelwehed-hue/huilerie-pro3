import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType, normalizeItem, validateSiteTranslations } from './content.js';

const translations = () => ({
  fr: { title: '  Article FR  ', summary: 'Résumé', body: 'Texte' },
  ar: { title: 'عنوان عربي', summary: 'ملخص', body: 'نص' },
  en: { title: 'English title', summary: 'Summary', body: 'Body' }
});

test('site content accepts the three language objects and bounded text fields', () => {
  assert.equal(validateSiteTranslations({ fr: { title: 'Titre' }, ar: { title: 'عنوان' }, en: { title: 'Title' } }), null);
});

test('site content rejects missing languages, arrays, unsafe keys and oversized values', () => {
  assert.match(validateSiteTranslations({ fr: {}, ar: {} }), /fr, ar et en/);
  assert.match(validateSiteTranslations({ fr: [], ar: {}, en: {} }), /fr, ar et en/);
  assert.match(validateSiteTranslations({ fr: { 'bad key': 'x' }, ar: {}, en: {} }), /Nom de champ/);
  assert.match(validateSiteTranslations({ fr: { title: 12 }, ar: {}, en: {} }), /texte/);
  assert.match(validateSiteTranslations({ fr: { title: 'x'.repeat(30001) }, ar: {}, en: {} }), /30 000/);
});

test('news drafts normalize all translations and retain audit fields', () => {
  const doc = normalizeItem('news', { status: 'draft', translations: translations() }, 'admin@example.com');
  assert.equal(doc.error, undefined);
  assert.equal(doc.title, 'Article FR');
  assert.equal(doc.translations.ar.title, 'عنوان عربي');
  assert.equal(doc.status, 'draft');
  assert.equal(doc.updatedBy, 'admin@example.com');
  assert.equal(doc.publishedAt, null);
  assert.ok(doc.updatedAt instanceof Date);
});

test('published items require a title in every language', () => {
  const data = translations();
  data.en.title = ' ';
  const doc = normalizeItem('news', { status: 'published', translations: data }, 'admin@example.com');
  assert.match(doc.error, /titre est obligatoire/);
});

test('normalizer rejects invalid status, image URL, language shape and unsupported type', () => {
  assert.match(normalizeItem('news', { status: 'online', translations: translations() }, 'admin').error, /Statut/);
  assert.match(normalizeItem('news', { status: 'draft', imageUrl: 'javascript:alert(1)', translations: translations() }, 'admin').error, /URL d’image/);
  assert.match(normalizeItem('news', { status: 'draft', translations: { fr: {}, ar: [], en: {} } }, 'admin').error, /traductions/);
  assert.match(normalizeItem('other', { status: 'draft', translations: translations() }, 'admin').error, /Type de contenu/);
});

test('products map French fields to the legacy name and description fields', () => {
  const doc = normalizeItem('products', { status: 'draft', translations: translations(), imageUrl: '/api/public/media/abc' }, 'admin');
  assert.equal(doc.name, 'Article FR');
  assert.equal(doc.description, 'Résumé');
  assert.equal(doc.imageUrl, '/api/public/media/abc');
});

test('publishedAt is stable when an already-published item is edited', () => {
  const publishedAt = new Date('2026-10-01T12:00:00.000Z');
  const previous = { status: 'published', publishedAt };
  const doc = normalizeItem('news', { status: 'published', translations: translations() }, 'admin', previous);
  assert.equal(doc.publishedAt, publishedAt);
});

test('image type detection checks file signatures rather than declared MIME types', () => {
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectImageType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(detectImageType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectImageType(Buffer.from('0000ftypavif')), 'image/avif');
  assert.equal(detectImageType(Buffer.from('<svg></svg>')), null);
  assert.equal(detectImageType('not a buffer'), null);
});
