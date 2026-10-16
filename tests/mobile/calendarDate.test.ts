import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceLocalDate } from '../../apps/mobile/src/lib/calendarDate';

test('editar la fecha conserva la hora local y el día elegido en distintas zonas horarias', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['America/La_Paz', 'Pacific/Auckland', 'America/New_York']) {
      process.env.TZ = zone;
      const original = new Date(2026, 9, 16, 23, 45, 20);
      const edited = new Date(replaceLocalDate(original.toISOString(), 2026, 8, 30));
      assert.deepEqual([edited.getFullYear(), edited.getMonth(), edited.getDate()], [2026, 8, 30], zone);
      assert.deepEqual([edited.getHours(), edited.getMinutes(), edited.getSeconds()], [23, 45, 20], zone);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('el calendario acepta años bisiestos y rechaza fechas inexistentes', () => {
  const source = new Date(2026, 0, 31, 12).toISOString();
  const leapDay = new Date(replaceLocalDate(source, 2028, 1, 29));
  assert.equal(leapDay.getDate(), 29);
  assert.equal(leapDay.getMonth(), 1);
  assert.throws(() => replaceLocalDate(source, 2027, 1, 29));
  assert.throws(() => replaceLocalDate(source, 2026, 3, 31));
  assert.throws(() => replaceLocalDate('inválido', 2026, 0, 1));
});
