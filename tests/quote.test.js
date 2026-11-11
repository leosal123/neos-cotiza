import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { createDefaultQuote, normalizeQuote, calculateQuote, formatMoney } from '../src/quote.js';

test('el ejemplo inicial tiene fecha de Lima y objetos independientes', () => {
  const first = createDefaultQuote();
  const second = createDefaultQuote();
  assert.equal(first.serviceId, 'landing');
  assert.deepEqual(first.extraIds, ['contenido', 'seo']);
  assert.equal(first.advancePercent, 50);
  assert.equal(first.taxPercent, 0);
  assert.match(first.recipient, /ficticio/);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const datePart = (type) => parts.find((part) => part.type === type).value;
  assert.equal(first.issuedDate, `${datePart('year')}-${datePart('month')}-${datePart('day')}`);
  first.extraIds.push('identidad');
  assert.deepEqual(second.extraIds, ['contenido', 'seo']);
});

test('el catálogo inicial conserva precios y plazos editables en soles', () => {
  assert.deepEqual(CATALOG.services.map(({ id, price, days }) => [id, price, days]), [
    ['landing', 1200, 5], ['corporate', 2400, 10], ['ecommerce', 3800, 15],
  ]);
  assert.deepEqual(CATALOG.extras.map(({ id, price, days }) => [id, price, days]), [
    ['contenido', 300, 2], ['seo', 250, 1], ['identidad', 450, 3],
  ]);
});

test('el presupuesto inicial calcula todos los importes en céntimos', () => {
  const result = calculateQuote(createDefaultQuote());
  assert.equal(result.baseCents, 120000);
  assert.equal(result.extrasCents, 55000);
  assert.equal(result.totalCents, 175000);
  assert.equal(result.advanceCents, 87500);
  assert.equal(result.balanceCents, 87500);
  assert.equal(result.estimatedDays, 8);
  assert.deepEqual(result.lines.map(({ id }) => id), ['service:landing', 'extra:contenido', 'extra:seo']);
});

test('aplica prioridad, descuento y después impuesto sobre el neto', () => {
  const result = calculateQuote({ ...createDefaultQuote(), priority: true, discountPercent: 10, taxPercent: 18 });
  assert.equal(result.priorityCents, 35000);
  assert.equal(result.subtotalCents, 210000);
  assert.equal(result.discountCents, 21000);
  assert.equal(result.taxCents, 34020);
  assert.equal(result.totalCents, 223020);
  assert.equal(result.advanceCents, 111510);
  assert.equal(result.balanceCents, 111510);
});

test('normaliza números de formulario, límites y opciones únicas conocidas', () => {
  const result = normalizeQuote({
    serviceId: 'desconocido', extraIds: ['seo', 'seo', 'inexistente', 'contenido'],
    extraPages: '25.9', priority: 'true', discountPercent: '55', taxPercent: '-5',
    advancePercent: '33.333', validityDays: '0', evil: 'no se copia',
  });
  assert.equal(result.serviceId, 'landing');
  assert.deepEqual(result.extraIds, ['contenido', 'seo']);
  assert.equal(result.extraPages, 20);
  assert.equal(result.priority, false);
  assert.equal(result.discountPercent, 40);
  assert.equal(result.taxPercent, 0);
  assert.equal(result.advancePercent, 33.33);
  assert.equal(result.validityDays, 1);
  assert.equal(Object.hasOwn(result, 'evil'), false);
  assert.equal(normalizeQuote({ extraPages: 2.9, validityDays: 95 }).extraPages, 2);
  assert.equal(normalizeQuote({ validityDays: 95 }).validityDays, 90);
});

test('limita los textos, limpia controles y no convierte objetos en texto', () => {
  const result = normalizeQuote({
    projectName: ' A\n B\u0000 C\u202e ', recipient: 'x'.repeat(200), notes: 'n'.repeat(2500),
  });
  assert.equal(result.projectName, 'A B C');
  assert.equal(result.recipient.length, 120);
  assert.equal(result.notes.length, 2000);
  assert.equal(normalizeQuote({ projectName: '' }).projectName, '');
  assert.equal(normalizeQuote({ projectName: { toString() { throw Error('No ejecutar'); } } }).projectName,
    createDefaultQuote().projectName);
  assert.doesNotMatch(normalizeQuote({ projectName: `${'a'.repeat(119)}😀` }).projectName, /[\ud800-\udbff]$/);
});

test('rechaza fechas imposibles y acepta bisiestos reales', () => {
  for (const date of ['2025-02-29', '1900-02-29', '2024-04-31', '2026-13-01', '2026-00-10',
    '2026-01-00', '0000-01-01', '1999-12-31', '2101-01-01', '2100-02-29',
    '2026-1-01', '2026-01-01T00:00:00Z', null]) {
    assert.equal(normalizeQuote({ issuedDate: date }).issuedDate, createDefaultQuote().issuedDate);
  }
  for (const date of ['2024-02-29', '2000-02-29', '2026-11-10', '2000-01-01', '2100-12-31']) {
    assert.equal(normalizeQuote({ issuedDate: date }).issuedDate, date);
  }
});

test('un estado corrupto no causa NaN, contaminación ni ejecución de getters', () => {
  for (const input of [null, undefined, [], 'texto', 10, true, new Date(), Object.create(null),
    Object.create({ serviceId: 'ecommerce' })]) {
    assert.deepEqual(normalizeQuote(input), createDefaultQuote());
  }
  const hostile = JSON.parse('{"__proto__":{"polluted":true},"serviceId":"landing"}');
  Object.defineProperty(hostile, 'extraPages', { get() { throw Error('No ejecutar'); } });
  assert.equal(calculateQuote(hostile).quote.extraPages, 0);
  assert.equal({}.polluted, undefined);
  const strangeNumbers = [NaN, Infinity, -Infinity, {}, [], null, true, '0x10', '1e3', '', '  '];
  for (const value of strangeNumbers) {
    const result = calculateQuote({ extraPages: value, discountPercent: value, taxPercent: value,
      advancePercent: value, validityDays: value });
    assert.equal(result.totalCents, 175000);
    assert.equal(result.advanceCents, 87500);
    assert.equal(result.quote.validityDays, 15);
  }
});

test('admite cero extras, páginas y adelanto; el saldo mantiene todos los céntimos', () => {
  const result = calculateQuote({ extraIds: [], extraPages: 1, advancePercent: 0 });
  assert.equal(result.extrasCents, 0);
  assert.equal(result.pagesCents, 9000);
  assert.equal(result.totalCents, 129000);
  assert.equal(result.advanceCents, 0);
  assert.equal(result.balanceCents, result.totalCents);
  assert.equal(result.lines.find((line) => line.id === 'pages').amountCents, 9000);
});

test('redondea cada recargo y porcentaje al céntimo más cercano', () => {
  const catalog = {
    services: [{ id: 'pequeno', name: 'Ejemplo', price: 1, days: 1 }],
    extras: [], extraPagePrice: 1, priorityPercent: 0.5,
  };
  const result = calculateQuote({ extraIds: [], priority: true, discountPercent: 0.5,
    taxPercent: 0.5, advancePercent: 50 }, catalog);
  assert.equal(result.baseCents, 100);
  assert.equal(result.priorityCents, 1);
  assert.equal(result.subtotalCents, 101);
  assert.equal(result.discountCents, 1);
  assert.equal(result.taxCents, 1);
  assert.equal(result.totalCents, 101);
  assert.equal(result.advanceCents, 51);
  assert.equal(result.balanceCents, 50);
});

test('el máximo admitido sigue siendo seguro y aplica el adelanto completo', () => {
  const result = calculateQuote({ serviceId: 'ecommerce', extraIds: CATALOG.extras.map((item) => item.id),
    extraPages: Number.MAX_VALUE, priority: true, discountPercent: 0, taxPercent: 100,
    advancePercent: 100, validityDays: 100 });
  assert.equal(result.subtotalCents, 792000);
  assert.equal(result.taxCents, 237600);
  assert.equal(result.totalCents, 1029600);
  assert.equal(result.advanceCents, result.totalCents);
  assert.equal(result.balanceCents, 0);
  assert.equal(result.estimatedDays, 21);
  assert.equal(result.quote.validityDays, 90);
});

test('las invariantes se conservan con combinaciones reproducibles', () => {
  let seed = 1327;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let iteration = 0; iteration < 500; iteration += 1) {
    const input = {
      serviceId: CATALOG.services[Math.floor(random() * CATALOG.services.length)].id,
      extraIds: CATALOG.extras.filter(() => random() > 0.5).map((extra) => extra.id),
      extraPages: random() * 30 - 5, priority: random() > 0.5,
      discountPercent: random() * 70 - 10, taxPercent: random() * 50 - 10,
      advancePercent: random() * 150 - 25,
    };
    const result = calculateQuote(input);
    assert.deepEqual(calculateQuote(input), result);
    assert.deepEqual(normalizeQuote(result.quote), result.quote);
    assert.equal(result.lines.reduce((sum, line) => sum + line.amountCents, 0), result.subtotalCents);
    assert.equal(result.totalCents, result.subtotalCents - result.discountCents + result.taxCents);
    assert.equal(result.advanceCents + result.balanceCents, result.totalCents);
    assert.ok(result.discountCents <= result.subtotalCents);
    assert.ok(result.advanceCents <= result.totalCents);
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && value >= 0, key);
    }
  }
});

test('explica errores de configuración y evita importes fuera del rango seguro', () => {
  for (const catalog of [null, {}, { ...CATALOG, extraPagePrice: NaN },
    { ...CATALOG, priorityPercent: Infinity },
    { ...CATALOG, services: [{ ...CATALOG.services[0], price: 1.5 }] }]) {
    assert.throws(() => calculateQuote({}, catalog), /Catálogo inválido/);
  }
  const hugeCatalog = { ...CATALOG, extraPagePrice: Math.floor(Number.MAX_SAFE_INTEGER / 100) };
  assert.throws(() => calculateQuote({ extraPages: 20 }, hugeCatalog), RangeError);
});

test('formatea soles a partir de céntimos enteros', () => {
  assert.match(formatMoney(123456), /S\/\s*1[,.]234[,.]56/);
  assert.match(formatMoney(0), /0[,.]00/);
  assert.throws(() => formatMoney(NaN), TypeError);
  assert.throws(() => formatMoney(1.5), TypeError);
});
