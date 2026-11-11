import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultQuote } from '../src/quote.js';
import { getComparisonOptions } from '../src/ui/comparison.js';

test('compara tres servicios con los extras del ejemplo y su diferencia real', () => {
  const options = getComparisonOptions(createDefaultQuote());
  assert.deepEqual(options, [
    {
      serviceId: 'landing', name: 'Landing de conversión', totalCents: 175000,
      estimatedDays: 8, differenceCents: 0, isCurrent: true,
    },
    {
      serviceId: 'corporate', name: 'Web corporativa', totalCents: 295000,
      estimatedDays: 13, differenceCents: 120000, isCurrent: false,
    },
    {
      serviceId: 'ecommerce', name: 'Tienda online', totalCents: 435000,
      estimatedDays: 18, differenceCents: 260000, isCurrent: false,
    },
  ]);
});

test('conserva páginas, extras, prioridad, descuento e impuesto en cada escenario', () => {
  const quote = {
    ...createDefaultQuote(), serviceId: 'ecommerce', extraIds: ['seo', 'identidad'],
    extraPages: 2, priority: true, discountPercent: 12.5, taxPercent: 18,
    advancePercent: 37.5,
  };
  const options = getComparisonOptions(quote);
  assert.deepEqual(options.map((option) => option.totalCents), [257712, 406392, 579852]);
  assert.deepEqual(options.map((option) => option.differenceCents), [-322140, -173460, 0]);
  assert.deepEqual(options.map((option) => option.estimatedDays), [9, 14, 19]);
  assert.deepEqual(options.map((option) => option.isCurrent), [false, false, true]);
  assert.deepEqual(getComparisonOptions({ ...quote, advancePercent: 0 }), options);
});

test('el escenario actual sigue a la selección y no altera la cotización original', () => {
  const quote = Object.freeze({
    ...createDefaultQuote(), serviceId: 'corporate', extraIds: Object.freeze([]),
    projectName: '<img src=x onerror=alert(1)>', notes: 'Texto de prueba',
  });
  const snapshot = JSON.stringify(quote);
  const options = getComparisonOptions(quote);
  assert.equal(JSON.stringify(quote), snapshot);
  assert.equal(options.filter((option) => option.isCurrent).length, 1);
  assert.equal(options.find((option) => option.isCurrent).serviceId, 'corporate');
  assert.deepEqual(options.map((option) => option.totalCents), [120000, 240000, 380000]);
  assert.deepEqual(options.map((option) => option.differenceCents), [-120000, 0, 140000]);
  assert.equal(JSON.stringify(options).includes('<img'), false);
});

test('normaliza entradas no válidas sin ejecutar getters ni confiar en totales importados', () => {
  let getterCalls = 0;
  const quote = { ...createDefaultQuote(), totalCents: 1, extraPages: 999 };
  Object.defineProperty(quote, 'serviceId', {
    enumerable: true,
    get() { getterCalls += 1; return 'ecommerce'; },
  });
  const options = getComparisonOptions(quote);
  assert.equal(getterCalls, 0);
  assert.equal(options[0].isCurrent, true);
  assert.deepEqual(options.map((option) => option.totalCents), [355000, 475000, 615000]);
  assert.deepEqual(getComparisonOptions(null), getComparisonOptions(createDefaultQuote()));
});
