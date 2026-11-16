import test from 'node:test';
import assert from 'node:assert/strict';
import { rankScanProducts, type ScanProduct } from '../src/lib/quoteScanMatching';
import { readQuoteImage } from '../src/lib/quoteVision';

const line = { name: 'Interruptor 32A', quantity: 3, unit: null, unitPrice: null, codigoInterno: null };
const product = (id: number, name: string): ScanProduct => ({
  id, name, description: null, price: 65, stock: 0, unit: 'Unidad', codigoInterno: null, marca: null, procedencia: null,
});
test('el escáner solo selecciona coincidencias exactas únicas y conserva diferencias técnicas', () => {
  const exact = rankScanProducts(line, [product(1, 'INTERRUPTOR 32A'), product(2, 'Interruptor 63A')]);
  assert.equal(exact.selectedProductId, 1);
  assert.equal(exact.match, 'exact');
  assert.deepEqual(exact.candidates.map(item => item.id), [1]);
  const ambiguous = rankScanProducts(line, [product(1, 'Interruptor 32A'), product(2, 'interruptor 32a')]);
  assert.equal(ambiguous.selectedProductId, null);
  assert.equal(ambiguous.match, 'suggested');
  const decimals = rankScanProducts({ ...line, name: 'Cable 2.5mm' }, [product(1, 'Cable 25mm')]);
  assert.equal(decimals.match, 'none');
  assert.equal(decimals.selectedProductId, null);
  const fuzzy = rankScanProducts({ ...line, name: 'Termomagnético Sica 32A' }, [product(1, 'Interruptor Sica 32A')]);
  assert.equal(fuzzy.match, 'suggested');
  assert.equal(fuzzy.selectedProductId, null);
  const conflicting = rankScanProducts({ ...line, name: 'Interruptor 63A', codigoInterno: 'TM-32' },
    [{ ...product(1, 'Interruptor 32A'), codigoInterno: 'TM-32' }]);
  assert.equal(conflicting.match, 'suggested', 'Un código no oculta una contradicción en la medida leída');
  assert.equal(conflicting.selectedProductId, null);
});

test('OpenAI recibe imagen y esquema estricto sin persistencia; datos ausentes siguen siendo null', async t => {
  const original = globalThis.fetch, previousKey = process.env.OPENAI_API_KEY, previousModel = process.env.OPENAI_SCAN_MODEL;
  process.env.OPENAI_API_KEY = 'test-only-key-not-real';
  delete process.env.OPENAI_SCAN_MODEL;
  t.after(() => {
    globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_SCAN_MODEL; else process.env.OPENAI_SCAN_MODEL = previousModel;
  });
  let sent: Record<string, any> | null = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{
      type: 'output_text', text: JSON.stringify({ items: [{ ...line, quantity: null }] }),
    }] }] }), { status: 200 });
  };
  const result = await readQuoteImage({ buffer: Buffer.from([137, 80, 78, 71]), ext: 'png' });
  assert.equal(result[0].quantity, null);
  assert.equal(result[0].unitPrice, null);
  assert.equal(sent!.store, false);
  assert.equal(sent!.model, 'gpt-4o-mini');
  assert.equal(sent!.text.format.type, 'json_schema');
  assert.equal(sent!.text.format.strict, true);
  assert.match(sent!.input[0].content[1].image_url, /^data:image\/png;base64,/);
});

test('respuestas incompletas, rechazos y errores de proveedor no exponen texto crudo', async t => {
  const original = globalThis.fetch, previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-key-not-real';
  t.after(() => { globalThis.fetch = original; if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
  for (const value of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'private-provider-text' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: 'private-provider-text' }] }] },
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify(value));
    await assert.rejects(readQuoteImage({ buffer: Buffer.from([1]), ext: 'png' }), error => {
      assert.equal((error as {code:string}).code, 'SCAN_UNREADABLE');
      assert.doesNotMatch((error as Error).message, /private-provider/);
      return true;
    });
  }
  globalThis.fetch = async () => new Response('private-key-failure', { status: 401 });
  await assert.rejects(readQuoteImage({ buffer: Buffer.from([1]), ext: 'png' }), error => {
    assert.equal((error as {code:string}).code, 'SCAN_PROVIDER_UNAVAILABLE');
    assert.doesNotMatch((error as Error).message, /private-key/);
    return true;
  });
});
