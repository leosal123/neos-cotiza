import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkCss, checkHtml, checkImports, localReference, scanSecrets } from '../scripts/check.mjs';
import { PUBLIC_FILES } from '../scripts/project-files.mjs';
import { CONTENT_SECURITY_POLICY } from '../scripts/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'work');
const META_POLICY = CONTENT_SECURITY_POLICY.split('; ').filter((directive) => !directive.startsWith('frame-ancestors ')).join('; ');
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${META_POLICY}">`;

function validHtml(policy = CSP_META) {
  const styles = PUBLIC_FILES.filter((relative) => relative.endsWith('.css'))
    .map((relative) => `<link rel="stylesheet" href="./${relative}">`).join('');
  return `<!doctype html><html lang="es-PE"><head>${policy}<title>Prueba</title>${styles}<link rel="icon" href="./assets/brand/neos-linx-isotipo.webp"><script type="module" src="./src/app.js"></script></head><body><main id="main"></main></body></html>`;
}

test('las referencias normalizadas aceptan ../ solo cuando permanecen dentro del manifiesto', () => {
  const font = PUBLIC_FILES.find((relative) => relative.endsWith('.woff2'));
  assert.equal(localReference(`../${font}`, 'styles/tokens.css'), font);
  assert.equal(localReference('../catalog.js', 'src/ui/form.js'), 'src/catalog.js');
  assert.equal(localReference('./ui/../catalog.js?version=prueba#local', 'src/app.js'), 'src/catalog.js');
  assert.equal(localReference('#main', 'index.html'), null);
  for (const reference of ['../../index.html', '../../src/app.js', '../assets/secret.woff2', 'https://example.invalid/font.woff2', '//example.invalid/font.woff2', '%2f%2fexample.invalid/font.woff2', '..%5cindex.html', '%00', '%']) {
    assert.throws(() => localReference(reference, 'styles/tokens.css'), /Referencia|Recurso/u, reference);
  }
});

test('se revisan los recursos de CSS y los imports locales de módulos UI', () => {
  const font = PUBLIC_FILES.find((relative) => relative.endsWith('.woff2'));
  assert.doesNotThrow(() => checkCss(`@font-face { font-family: "Local"; src: url('../${font}') format('woff2'); }`, 'styles/tokens.css'));
  assert.doesNotThrow(() => checkCss('/* url(https://example.invalid/ignorado) */ body { color: #111; }', 'styles/base.css'));
  assert.doesNotThrow(() => checkImports("import { fixture } from '../catalog.js'; import './dom.js';", 'src/ui/form.js'));
  for (const css of ['@import "./base.css";', 'body { background: url(https://example.invalid/image.png); }', 'body { background: url(../../index.html); }', 'body { background: url(../assets/private.png); }']) {
    assert.throws(() => checkCss(css, 'styles/base.css'), /importaciones|Referencia|Recurso/u);
  }
  for (const source of ["import 'package';", "import './private.js';", "import '../../scripts/check.mjs';", "import('https://example.invalid/module.js');"]) {
    assert.throws(() => checkImports(source, 'src/ui/form.js'), /Importación|Referencia|Recurso/u);
  }
});

test('HTML exige una política CSP real dentro de head y mantiene todos los CSS locales', () => {
  assert.doesNotThrow(() => checkHtml(validHtml()));
  assert.throws(() => checkHtml(validHtml('')), /Content-Security-Policy real/u);
  assert.throws(() => checkHtml(validHtml(`<!-- ${CSP_META} -->`)), /Content-Security-Policy real/u);
  assert.throws(() => checkHtml(validHtml(`<title>${CSP_META}</title>`)), /Content-Security-Policy real/u);
  assert.throws(() => checkHtml(validHtml(`<template>${CSP_META}</template>`)), /Content-Security-Policy real/u);
  assert.throws(() => checkHtml(validHtml('').replace('<main id="main">', `<main id="main">${CSP_META}`)), /Content-Security-Policy real/u);
  assert.throws(() => checkHtml(validHtml(`${CSP_META}${CSP_META}`)), /exactamente un/u);
  assert.throws(() => checkHtml(validHtml(CSP_META.replace("connect-src 'none'", "connect-src 'self'"))), /política local estricta/u);
  assert.throws(() => checkHtml(validHtml(CSP_META.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"))), /política local estricta/u);
  assert.throws(() => checkHtml(validHtml().replace('<link rel="stylesheet" href="./styles/tokens.css">', '')), /Falta la referencia local obligatoria/u);
});

test('HTML rechaza scripts o estilos inline y recursos fuera del manifiesto', () => {
  for (const html of [
    validHtml().replace('<main id="main">', '<main id="main" style="display:block">'),
    validHtml().replace('<main id="main">', '<main id="main" onclick="alert(1)">'),
    validHtml().replace('<title>Prueba</title>', '<style>body {color:red}</style>'),
    validHtml().replace('src="./src/app.js"></script>', 'src="./src/app.js">alert(1)</script>'),
    validHtml().replace('src="./src/app.js"></script>', 'src="./src/app.js">'),
    validHtml().replace('./src/app.js', 'https://example.invalid/app.js'),
    validHtml().replace('./src/app.js', './src/ui/private.js'),
    validHtml().replace('type="module"', 'type="text/javascript"'),
  ]) assert.throws(() => checkHtml(html), /CSP|scripts|Referencia|Recurso|type="module"/u);
});

async function fixture(t) {
  await mkdir(WORK, { recursive: true });
  const directory = await mkdtemp(path.join(WORK, 'security-scan-'));
  t.after(async () => {
    // Solo se retira la carpeta ficticia que esta prueba acaba de crear.
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), WORK);
    assert.ok(path.basename(target).startsWith('security-scan-'));
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}

// Señuelo construido en memoria: no es una credencial emitida ni se valida en red.
function syntheticCredential() {
  return ['gh', 'p_', '0'.repeat(36)].join('');
}

for (const relative of ['tests/example.test.js', 'test/example.spec.mjs', 'example.test.js', 'dist/src/app.js']) {
  test(`el detector incluye ${relative} aunque sea una prueba o build`, async (t) => {
    const directory = await fixture(t);
    const target = path.join(directory, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `const fixture = '${syntheticCredential()}';`, 'utf8');
    assert.deepEqual(await scanSecrets(directory), [relative]);
  });
}

test('el detector informa rutas y no revela el valor de la credencial ficticia', async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'settings.json'), JSON.stringify({ fixture: syntheticCredential() }), 'utf8');
  const result = await scanSecrets(directory);
  assert.deepEqual(result, ['settings.json']);
  assert.equal(JSON.stringify(result).includes(syntheticCredential()), false);
});

test('el detector marca archivos de entorno aunque sus valores sean vacíos', async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, '.env'), 'EXAMPLE=', 'utf8');
  assert.deepEqual(await scanSecrets(directory), ['.env']);
});

test('la documentación sin valores secretos no dispara una alerta', async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'README.md'), 'No guardes tokens ni claves privadas en el código.', 'utf8');
  assert.deepEqual(await scanSecrets(directory), []);
});

test('work se mantiene fuera del escaneo de fuentes y no oculta tests públicos', async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, 'work'));
  await writeFile(path.join(directory, 'work', 'synthetic.json'), JSON.stringify({ fixture: syntheticCredential() }), 'utf8');
  assert.deepEqual(await scanSecrets(directory), []);
});
