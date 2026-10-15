import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleDashboard, dashboardRange, dashboardStat } from '../src/lib/dashboard';

test('Hoy respeta la medianoche de Bolivia aunque el servidor esté en UTC', () => {
  const before = dashboardRange('hoy', new Date('2026-10-15T03:59:59Z'));
  const after = dashboardRange('hoy', new Date('2026-10-15T04:00:00Z'));
  assert.equal(new Date(before.start).toISOString(), '2026-10-14T04:00:00.000Z');
  assert.equal(new Date(after.start).toISOString(), '2026-10-15T04:00:00.000Z');
  assert.equal(after.labels.length, 6);
});

test('La semana empieza el lunes local y admite cambios de año', () => {
  const range = dashboardRange('semana', new Date('2027-01-01T12:00:00Z'));
  assert.equal(new Date(range.start).toISOString(), '2026-12-28T04:00:00.000Z');
  assert.equal(new Date(range.previousStart).toISOString(), '2026-12-21T04:00:00.000Z');
  assert.equal(new Date(range.end).toISOString(), '2027-01-04T04:00:00.000Z');
});

test('El mes contempla febrero bisiesto y el período anterior completo', () => {
  const range = dashboardRange('mes', new Date('2024-02-29T20:00:00Z'));
  assert.equal(new Date(range.previousStart).toISOString(), '2024-01-01T04:00:00.000Z');
  assert.equal(new Date(range.end).toISOString(), '2024-03-01T04:00:00.000Z');
  assert.deepEqual(range.labels, ['1–7', '8–14', '15–21', '22–28', '29–29']);
});

test('Sin base previa no inventa un porcentaje de crecimiento', () => {
  assert.equal(dashboardStat(5, 0).changePercent, null);
  assert.equal(dashboardStat(0, 0).changePercent, 0);
  assert.equal(dashboardStat(0, 10).changePercent, -100);
  assert.equal(dashboardStat(15, 10).changePercent, 50);
});

test('Un negocio vacío devuelve ceros y todas las barras del período', () => {
  const stats = assembleDashboard('semana', new Date('2026-10-15T12:00:00Z'), [], []);
  assert.equal(stats.quotes.value, 0);
  assert.equal(stats.sales.value, 0);
  assert.equal(stats.receivable.changePercent, 0);
  assert.deepEqual(stats.chart.map((point) => point.value), [0, 0, 0, 0, 0, 0, 0]);
});

test('Agrega más de 200 operaciones y conserva huecos del gráfico sin mezclar períodos', () => {
  const stats = assembleDashboard('semana', new Date('2026-10-15T12:00:00Z'), [
    { current_period: 0, total: '100', approved: '50' },
    { current_period: 1, total: '450', approved: '250' },
  ], [
    { current_period: 0, bucket: -1, total: '100', receivable: '20' },
    { current_period: 1, bucket: 0, total: '210', receivable: '30' },
    { current_period: 1, bucket: 2, total: '5', receivable: '2' },
  ]);
  assert.equal(stats.quotes.value, 450);
  assert.equal(stats.approved.value, 250);
  assert.equal(stats.sales.value, 215);
  assert.equal(stats.sales.previousValue, 100);
  assert.equal(stats.receivable.value, 32);
  assert.deepEqual(stats.chart.map((point) => point.value), [210, 0, 5, 0, 0, 0, 0]);
});
