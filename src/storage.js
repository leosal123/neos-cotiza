import { normalizeQuote } from './quote.js';

export const STORAGE_KEY = 'neos-cotiza:draft:v1';
export const MAX_IMPORT_BYTES = 65536;

// Las importaciones contienen estado editable, nunca HTML, código ni totales confiados.
export function encodeQuote(quote) {
  return JSON.stringify({ app: 'neos-cotiza', version: 1, quote: normalizeQuote(quote) }, null, 2);
}

export function decodeQuote(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error('El archivo supera el límite de 64 KB.');
  }
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('El archivo no contiene JSON válido.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.app !== 'neos-cotiza' || payload.version !== 1
    || !payload.quote || typeof payload.quote !== 'object' || Array.isArray(payload.quote)) {
    throw new Error('Selecciona una cotización de Neos Cotiza, versión 1.');
  }
  return normalizeQuote(payload.quote);
}

// Un navegador puede bloquear storage o agotar la cuota: la app sigue funcionando.
export function saveDraft(quote, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, encodeQuote(quote));
    return { ok: true };
  } catch { return { ok: false, message: 'No se pudo guardar. Descarga el JSON para conservar la propuesta.' }; }
}

export function loadDraft(storage) {
  try {
    const text = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
    return { ok: true, quote: text === null ? null : decodeQuote(text) };
  } catch { return { ok: false, message: 'El borrador no está disponible. Puedes continuar sin guardado local.' }; }
}

export function removeDraft(storage) {
  try {
    (storage ?? globalThis.localStorage).removeItem(STORAGE_KEY);
    return { ok: true };
  } catch { return { ok: false, message: 'El navegador no permitió borrar el borrador. Revisa los datos del sitio.' }; }
}
