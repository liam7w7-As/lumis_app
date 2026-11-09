import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../apps/mobile/src/lib/api';
import { sendPendingQuote } from '../../apps/mobile/src/lib/pendingQuote';
import type { QuoteSubmission } from '../../apps/mobile/src/lib/novaled';

test('una respuesta perdida conserva el envío y el reintento recupera la misma cotización', async () => {
  let stored: string | null = null;
  let visible: QuoteSubmission | null = null;
  const payload = { solicitud_id: 'lumis-fixed-request-001', tipo_documento: 'cotizacion', items: [] } as unknown as QuoteSubmission;
  const storage = { write: async (value: string) => { stored = value; }, remove: async () => { stored = null; } };
  const accepted = new Map<string, number>();
  let requests = 0;
  const send = async (input: QuoteSubmission) => {
    requests++;
    if (!accepted.has(input.solicitud_id)) accepted.set(input.solicitud_id, 17);
    if (requests === 1) throw new ApiError(0, 'Se perdió la respuesta', 'NETWORK_ERROR');
    return { data: { id: accepted.get(input.solicitud_id) } };
  };
  await assert.rejects(() => sendPendingQuote(payload, storage, send, value => { visible = value; }), /Se perdió la respuesta/);
  assert.equal(visible, payload);
  assert.equal(JSON.parse(stored!).solicitud_id, payload.solicitud_id);
  const result = await sendPendingQuote(JSON.parse(stored!) as QuoteSubmission, storage, send, value => { visible = value; });
  assert.equal(result.data.id, 17);
  assert.equal(accepted.size, 1);
  assert.equal(requests, 2);
  assert.equal(stored, null);
  assert.equal(visible, null);
});

test('una validación rechazada libera el formulario; una sesión vencida conserva el envío', async () => {
  let stored: string | null = null;
  let visible: QuoteSubmission | null = null;
  const payload = { solicitud_id: 'lumis-fixed-request-002' } as QuoteSubmission;
  const storage = { write: async (value: string) => { stored = value; }, remove: async () => { stored = null; } };
  for (const status of [422, 401]) {
    await assert.rejects(() => sendPendingQuote(payload, storage, async () => { throw new ApiError(status, 'Rechazado'); }, value => { visible = value; }));
    assert.equal(stored === null, status === 422);
    assert.equal(visible === null, status === 422);
  }
});
