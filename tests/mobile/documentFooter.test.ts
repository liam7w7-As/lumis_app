import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentFooter, PDF_FOOTER_OPTIONS } from '../../apps/mobile/src/lib/documentFooter';
import { documentBusiness } from '../../apps/mobile/src/lib/documentBusiness';
import { buildQuoteHtml } from '../../apps/mobile/src/lib/quoteDocument';
import { buildDeliveryNoteHtml } from '../../apps/mobile/src/lib/deliveryDocument';
import { sampleBusiness, sampleFonts, sampleImages, sampleQuote, sampleSale } from './documentFixtures';

const images = { ...sampleImages, facebook: 'facebook.png', instagram: 'instagram.png', tiktok: 'tiktok.png', linkedin: 'linkedin.png', web: 'web.png', map: 'map.png' };
const company = { ...sampleBusiness, redes_sociales: '@negocio', website: 'www.negocio.com' };

test('each social icon can be hidden independently while the remaining footer data stays visible', () => {
  for (const [key, label] of [['mostrar_facebook', 'Facebook'], ['mostrar_instagram', 'Instagram'], ['mostrar_tiktok', 'TikTok'], ['mostrar_linkedin', 'LinkedIn']] as const) {
    const footer = buildDocumentFooter({ ...company, [key]: false }, images, 'La Paz');
    assert.ok(!footer.includes(`alt="${label}"`));
    for (const other of ['Facebook', 'Instagram', 'TikTok', 'LinkedIn'].filter(item => item !== label)) assert.ok(footer.includes(`alt="${other}"`));
    assert.ok(footer.includes('@negocio'));
    assert.ok(footer.includes('www.negocio.com'));
    assert.ok(footer.includes('La Paz'));
  }
});

test('all social switches off hide the shared handle, and website/address switches work independently', () => {
  const footer = buildDocumentFooter({ ...company, mostrar_facebook: false, mostrar_instagram: false, mostrar_tiktok: false, mostrar_linkedin: false, mostrar_website: false }, images, 'Av. Central');
  assert.ok(!footer.includes('@negocio'));
  assert.ok(!footer.includes('www.negocio.com'));
  assert.ok(footer.includes('Av. Central'));
  assert.ok(footer.includes('width:100%'));
  const hidden = Object.fromEntries(PDF_FOOTER_OPTIONS.map(option => [option.key, false]));
  assert.equal(buildDocumentFooter({ ...company, ...hidden }, images, 'Av. Central'), '');
});

test('empty data and unavailable icons do not create empty footer blocks', () => {
  assert.equal(buildDocumentFooter({ redes_sociales: ' ', website: null }, images, ''), '');
  const footer = buildDocumentFooter(company, sampleImages, '');
  assert.ok(!footer.includes('<img'));
  assert.ok(footer.includes('@negocio') && footer.includes('www.negocio.com'));
  assert.equal((footer.match(/width:50%/g) ?? []).length, 2);
});

test('footer text remains escaped and older company responses preserve the previous visible defaults', () => {
  const business = documentBusiness(null);
  for (const option of PDF_FOOTER_OPTIONS) assert.equal(business[option.key], true);
  const footer = buildDocumentFooter({ redes_sociales: '<script>alert(1)</script>', website: '" onload="alert(2)' }, images, '<b>Dirección</b>');
  assert.ok(!footer.includes('<script>') && !footer.includes('<b>') && !footer.includes(' onload="'));
  assert.ok(footer.includes('&lt;script&gt;') && footer.includes('&lt;b&gt;'));
});

test('quote, sale and delivery builders consume the saved company footer preferences', () => {
  const business = { ...company, mostrar_facebook: false, mostrar_instagram: false, mostrar_linkedin: false, mostrar_website: false, mostrar_direccion: false };
  const common = { business, images, fonts: sampleFonts, branchName: null };
  const htmls = [
    buildQuoteHtml({ ...common, quote: sampleQuote }),
    buildDeliveryNoteHtml({ ...common, sale: sampleSale, documentType: 'sale' }),
    buildDeliveryNoteHtml({ ...common, sale: sampleSale, documentType: 'delivery' }),
  ];
  for (const html of htmls) {
    const footer = html.split('<div class="page-footer">')[1].split('<table class="masthead">')[0];
    assert.ok(footer.includes('alt="TikTok"'));
    assert.ok(!footer.includes('alt="Facebook"') && !footer.includes('alt="Instagram"') && !footer.includes('alt="LinkedIn"'));
    assert.ok(!footer.includes('alt="Web"') && !footer.includes('alt="Ubicación"'));
  }
});
