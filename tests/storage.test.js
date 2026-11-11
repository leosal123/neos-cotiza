import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultQuote, normalizeQuote } from '../src/quote.js';
import {
  STORAGE_KEY, MAX_IMPORT_BYTES, encodeQuote, decodeQuote, saveDraft, loadDraft, removeDraft,
} from '../src/storage.js';

// Este sustituto mantiene todas las pruebas locales y sin cuentas ni servicios.
function memoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(STORAGE_KEY, initialValue);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function envelope(quote = createDefaultQuote()) {
  return JSON.stringify({ app: 'neos-cotiza', version: 1, quote });
}

function assertSafeFailure(result, privateText) {
  assert.equal(result.ok, false);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
  assert.equal(result.message.includes(privateText), false);
  assert.equal(Object.hasOwn(result, 'quote'), false);
}

test('el formato de intercambio es JSON legible con identidad y versión', () => {
  assert.equal(STORAGE_KEY, 'neos-cotiza:draft:v1');
  assert.equal(MAX_IMPORT_BYTES, 65536);
  const input = { ...createDefaultQuote(), extraPages: 999, unknown: 'no exportar' };
  const encoded = encodeQuote(input);
  assert.match(encoded, /^\{\n\s+"app"/);
  assert.deepEqual(JSON.parse(encoded), {
    app: 'neos-cotiza', version: 1, quote: normalizeQuote(input),
  });
  assert.deepEqual(decodeQuote(encoded), normalizeQuote(input));
});

test('importar normaliza los campos y descarta propiedades inesperadas', () => {
  const input = {
    serviceId: 'ecommerce', extraIds: ['seo', 'seo', 'desconocido'],
    extraPages: '99', discountPercent: '90', priority: 'true', issuedDate: '2026-11-10',
    projectName: ' Negocio\u0000 ficticio ', unknown: 'ignorar',
  };
  const imported = decodeQuote(envelope(input));
  assert.deepEqual(imported, normalizeQuote(input));
  assert.equal(imported.extraPages, 20);
  assert.equal(imported.discountPercent, 40);
  assert.equal(imported.priority, false);
  assert.deepEqual(imported.extraIds, ['seo']);
  assert.equal(Object.hasOwn(imported, 'unknown'), false);
});

test('rechaza JSON malformado, aplicaciones ajenas, versiones y estructuras inválidas', () => {
  const invalidTexts = [
    '', '{', 'null', '[]', '42', '"texto"', JSON.stringify(createDefaultQuote()),
    JSON.stringify({ app: 'otra-app', version: 1, quote: {} }),
    JSON.stringify({ app: 'neos-cotiza', version: 0, quote: {} }),
    JSON.stringify({ app: 'neos-cotiza', version: 2, quote: {} }),
    JSON.stringify({ app: 'neos-cotiza', version: '1', quote: {} }),
    JSON.stringify({ app: 'neos-cotiza', version: 1 }),
    JSON.stringify({ app: 'neos-cotiza', version: 1, quote: null }),
    JSON.stringify({ app: 'neos-cotiza', version: 1, quote: [] }),
    JSON.stringify({ app: 'neos-cotiza', version: 1, quote: 'texto' }),
  ];
  for (const text of invalidTexts) assert.throws(() => decodeQuote(text), Error);
  for (const value of [null, undefined, 12, {}, []]) {
    assert.throws(() => decodeQuote(value), Error);
  }
});

test('el límite de importación cuenta bytes UTF-8 y no solo caracteres', () => {
  const tooManyAscii = envelope({ notes: 'a'.repeat(MAX_IMPORT_BYTES) });
  assert.throws(() => decodeQuote(tooManyAscii), Error);
  const multibyte = envelope({ notes: 'é'.repeat(33000) });
  assert.ok(multibyte.length < MAX_IMPORT_BYTES);
  assert.ok(new TextEncoder().encode(multibyte).byteLength > MAX_IMPORT_BYTES);
  assert.throws(() => decodeQuote(multibyte), Error);
  const ordinary = envelope({ notes: 'é'.repeat(2000) });
  assert.equal(decodeQuote(ordinary).notes.length, 2000);
});

test('los textos con marcado permanecen como datos sin ejecutarse ni interpretarse', () => {
  const markup = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const input = { ...createDefaultQuote(), projectName: markup, recipient: markup, notes: markup };
  const imported = decodeQuote(encodeQuote(input));
  assert.equal(imported.projectName, markup);
  assert.equal(imported.recipient, markup);
  assert.equal(imported.notes, markup);
  const prototypeAttempt = '{"app":"neos-cotiza","version":1,"quote":{"__proto__":{"polluted":true}}}';
  assert.deepEqual(decodeQuote(prototypeAttempt), createDefaultQuote());
  assert.equal({}.polluted, undefined);
});

test('guarda, carga y borra exclusivamente la clave de borrador', () => {
  const storage = memoryStorage();
  storage.setItem('otra-app', 'conservar');
  assert.deepEqual(loadDraft(storage), { ok: true, quote: null });
  const quote = { ...createDefaultQuote(), serviceId: 'corporate', extraIds: [] };
  assert.deepEqual(saveDraft(quote, storage), { ok: true });
  assert.deepEqual(decodeQuote(storage.getItem(STORAGE_KEY)), normalizeQuote(quote));
  assert.deepEqual(loadDraft(storage), { ok: true, quote: normalizeQuote(quote) });
  assert.deepEqual(removeDraft(storage), { ok: true });
  assert.deepEqual(loadDraft(storage), { ok: true, quote: null });
  assert.equal(storage.getItem('otra-app'), 'conservar');
});

test('un borrador corrupto devuelve un error sin contenido ni reemplazo silencioso', () => {
  const privateText = 'CONTENIDO_PRIVADO_DE_EJEMPLO';
  const storage = memoryStorage(`${privateText} <contenido inválido>`);
  assertSafeFailure(loadDraft(storage), privateText);
  assert.equal(storage.getItem(STORAGE_KEY), `${privateText} <contenido inválido>`);
  assert.throws(() => decodeQuote(`${privateText} <contenido inválido>`), (error) => {
    assert.equal(error.message.includes(privateText), false);
    return true;
  });
});

test('el bloqueo o la cuota de almacenamiento no filtran contenido de errores', () => {
  const privateText = 'CONTENIDO_PRIVADO_DE_EJEMPLO';
  const blocked = {
    getItem() { throw new Error(privateText); },
    setItem() { throw new Error(privateText); },
    removeItem() { throw new Error(privateText); },
  };
  assertSafeFailure(loadDraft(blocked), privateText);
  assertSafeFailure(saveDraft(createDefaultQuote(), blocked), privateText);
  assertSafeFailure(removeDraft(blocked), privateText);
  const quotaStorage = memoryStorage();
  quotaStorage.setItem = () => {
    const error = new Error(privateText);
    error.name = 'QuotaExceededError';
    throw error;
  };
  assertSafeFailure(saveDraft(createDefaultQuote(), quotaStorage), privateText);
});

test('localStorage se resuelve dentro del control de errores cuando no se pasa sustituto', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const privateText = 'CONTENIDO_PRIVADO_DE_EJEMPLO';
  try {
    const storage = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    assert.deepEqual(saveDraft(createDefaultQuote()), { ok: true });
    assert.deepEqual(loadDraft(), { ok: true, quote: createDefaultQuote() });
    assert.deepEqual(removeDraft(), { ok: true });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error(privateText); },
    });
    assertSafeFailure(saveDraft(createDefaultQuote()), privateText);
    assertSafeFailure(loadDraft(), privateText);
    assertSafeFailure(removeDraft(), privateText);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
