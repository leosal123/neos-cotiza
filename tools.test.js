import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { createStaticServer, parsePort } from '../scripts/server.mjs';
import { MIME_TYPES, PUBLIC_FILES } from '../scripts/project-files.mjs';

const runFile = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'work');
const PUBLIC_CONTENT = new Map(PUBLIC_FILES.map((relative) => {
  const extension = path.posix.extname(relative);
  const content = extension === '.html'
    ? '<!doctype html><html lang="es"><title>Prueba local</title></html>'
    : extension === '.css' ? 'body { color: #111; }'
      : extension === '.js' ? 'export const fixture = "prueba";'
        : extension === '.txt' ? 'LICENCIA_FICTICIA_DE_PRUEBA\n'
        : Buffer.concat([Buffer.from(`RECURSO_BINARIO_FICTICIO:${relative}`), Buffer.from([0, 0x80, 0xff])]);
  return [relative, content];
}));
const EXPECTED_DIST = [...PUBLIC_CONTENT.keys(), '.nojekyll'].sort();

// Todas las muestras son ficticias y quedan dentro de work/. La limpieza solo
// retira rutas registradas, una a una; nunca usa borrado recursivo.
async function fixture(t, { populate = true } = {}) {
  await mkdir(WORK, { recursive: true });
  const root = await mkdtemp(path.join(WORK, 'neos-cotiza-tools-'));
  const tracked = new Set(['']);
  const filename = (relative) => {
    const result = path.resolve(root, relative);
    if (result !== root && !result.startsWith(`${root}${path.sep}`)) throw new Error('Fixture fuera de work');
    return result;
  };
  const remember = (relative) => {
    filename(relative);
    let current = relative;
    while (current && current !== '.') {
      tracked.add(current);
      current = path.posix.dirname(current);
    }
  };
  t.after(async () => {
    assert.equal(path.dirname(root), WORK);
    assert.ok(path.basename(root).startsWith('neos-cotiza-tools-'));
    const ordered = [...tracked].sort((left, right) => right.split('/').length - left.split('/').length || right.length - left.length);
    for (const relative of ordered) {
      const target = filename(relative);
      let info;
      try {
        info = await lstat(target);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      if (info.isDirectory() && !info.isSymbolicLink()) await rmdir(target);
      else await unlink(target);
    }
  });
  const directory = async (relative) => {
    remember(relative);
    await mkdir(filename(relative), { recursive: true });
  };
  const write = async (relative, content) => {
    remember(relative);
    await directory(path.posix.dirname(relative));
    await writeFile(filename(relative), content, 'utf8');
  };
  const link = async (relative, target, type) => {
    remember(relative);
    await directory(path.posix.dirname(relative));
    await symlink(filename(target), filename(relative), type);
  };
  if (populate) {
    for (const [relative, content] of PUBLIC_CONTENT) await write(relative, content);
  }
  // El build puede crearlos; se registran antes de ejecutarlo para cerrar también
  // el caso de una compilación que falle a mitad del proceso.
  for (const relative of EXPECTED_DIST) remember(`dist/${relative}`);
  return { root, filename, write, directory, link, remember };
}

async function serve(t, rootDirectory) {
  const server = createStaticServer({ rootDirectory });
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(address.address, '127.0.0.1');
  return (target, method = 'GET') => new Promise((resolve, reject) => {
    // http.request preserva el path original, incluidas las secuencias ../ que
    // fetch y URL normalizarían antes de que lleguen al servidor.
    const request = http.request({
      host: '127.0.0.1', port: address.port, path: target, method, agent: false,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({ status: response.statusCode, headers: response.headers, bytes, body: bytes.toString('utf8') });
      });
    });
    request.setTimeout(3000, () => request.destroy(new Error('La petición local excedió el límite de tiempo')));
    request.on('connect', (response, socket, head) => {
      socket.destroy();
      resolve({ status: response.statusCode, headers: response.headers, body: head.toString('utf8') });
    });
    request.on('error', reject);
    request.end();
  });
}

async function prepareBuild(sample) {
  await sample.directory('scripts');
  for (const relative of ['scripts/build.mjs', 'scripts/project-files.mjs']) {
    sample.remember(relative);
    await copyFile(path.join(ROOT, ...relative.split('/')), sample.filename(relative));
  }
}

async function build(sample) {
  try {
    const result = await runFile(process.execPath, ['scripts/build.mjs'], {
      cwd: sample.root, windowsHide: true, timeout: 5000,
    });
    return { status: 0, ...result };
  } catch (error) {
    return { status: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function filesIn(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await filesIn(path.join(directory, entry.name), relative));
    else result.push(relative);
  }
  return result.sort();
}

function noSymlinkPrivilege(error, t) {
  if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
    t.skip('El sistema no permite crear este tipo de enlace simbólico.');
    return true;
  }
  return false;
}

test('PORT acepta solo enteros dentro del rango de puertos', () => {
  assert.equal(parsePort(), 4173);
  assert.equal(parsePort('1'), 1);
  assert.equal(parsePort('4173'), 4173);
  assert.equal(parsePort('65535'), 65535);
  for (const value of ['', '0', '65536', '-1', '+4173', ' 4173', '4173 ', '1.5', '4e3', '4173x']) {
    assert.throws(() => parsePort(value), /PORT/u, `Debe rechazar ${JSON.stringify(value)}`);
  }
});

test('el servidor entrega exclusivamente los recursos públicos con MIME y cabeceras esperados', async (t) => {
  const sample = await fixture(t);
  const request = await serve(t, sample.root);
  const expectedMime = new Map([
    ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'], ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2'],
    ['.txt', 'text/plain; charset=utf-8'],
  ]);
  for (const [relative, content] of PUBLIC_CONTENT) {
    const response = await request(`/${relative}`);
    assert.equal(response.status, 200, relative);
    assert.deepEqual(response.bytes, Buffer.from(content));
    assert.equal(response.headers['content-type'], expectedMime.get(path.extname(relative)));
    assert.equal(response.headers['content-length'], String(Buffer.byteLength(content)));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.deepEqual(response.headers['content-security-policy'].split('; '), [
      "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
      "font-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'",
      "form-action 'none'", "frame-ancestors 'none'",
    ]);
  }
  assert.equal((await request('/')).body, PUBLIC_CONTENT.get('index.html'));
  assert.equal((await request('/src/app.js?version=prueba')).body, PUBLIC_CONTENT.get('src/app.js'));
});

test('el servidor bloquea archivos privados y directorios aunque existan en la raíz', async (t) => {
  const sample = await fixture(t);
  const marker = 'CONTENIDO_FICTICIO_NO_PUBLICO';
  for (const relative of ['.env', '.git/config', 'docs/manual.md', 'tests/example.js', 'scripts/private.mjs', 'package.json', 'assets/extra.json', 'assets/fonts/private.woff2', 'assets/fonts/private.txt', 'assets/brand/private.webp', 'assets/private.png', 'src/private.js', 'src/ui/private.js', 'styles/private.css']) {
    await sample.write(relative, marker);
  }
  const request = await serve(t, sample.root);
  for (const target of ['/.env', '/.git/config', '/docs/manual.md', '/tests/example.js', '/scripts/private.mjs', '/package.json', '/assets/extra.json', '/assets/fonts/private.woff2', '/assets/fonts/private.txt', '/assets/brand/private.webp', '/assets/private.png', '/src/private.js', '/src/ui/private.js', '/styles/private.css', '/src/', '/src/ui/', '/assets/', '/assets/fonts/', '/assets/brand/', '/styles/', '/.git/', '/missing']) {
    const response = await request(target);
    assert.equal(response.status, 404, target);
    assert.equal(response.body.includes(marker), false);
    assert.equal(response.body.includes(sample.root), false);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('el servidor rechaza traversal directo, codificado y URL malformadas', async (t) => {
  const sample = await fixture(t);
  const request = await serve(t, sample.root);
  for (const target of ['/../.env', '/src/../app.js', '/assets/fonts/../../index.html', '/styles/../index.html', '/src/ui/%2e%2e/app.js', '/%2e%2e/.env', '/src/%2E%2E/app.js', '/%2e%2e%2f.env', '/src%5capp.js', '/%00', '/%', '/%E0%A4%A', '/%C0%AF', '//example.invalid/index.html']) {
    assert.equal((await request(target)).status, 400, target);
  }
  // Una segunda capa de codificación no se decodifica ni se resuelve.
  assert.equal((await request('/%252e%252e/.env')).status, 404);
});

test('los MIME registrados no amplían la lista pública a todos los assets', () => {
  assert.equal(Object.isFrozen(PUBLIC_FILES), true);
  assert.equal(Object.isFrozen(MIME_TYPES), true);
  assert.equal(new Set(PUBLIC_FILES).size, PUBLIC_FILES.length);
  assert.equal(MIME_TYPES['.woff2'], 'font/woff2');
  assert.equal(MIME_TYPES['.webp'], 'image/webp');
  assert.equal(MIME_TYPES['.png'], 'image/png');
  assert.equal(MIME_TYPES['.txt'], 'text/plain; charset=utf-8');
  assert.ok(PUBLIC_FILES.includes('src/ui/dom.js'));
  assert.ok(PUBLIC_FILES.includes('styles/tokens.css'));
  assert.equal(PUBLIC_FILES.includes('styles.css'), false);
  assert.equal(PUBLIC_FILES.includes('print.css'), false);
  assert.equal(PUBLIC_FILES.filter((relative) => relative.endsWith('-OFL.txt')).length, 4);
});

test('HEAD conserva metadatos sin cuerpo y los demás métodos responden 405', async (t) => {
  const sample = await fixture(t);
  const request = await serve(t, sample.root);
  const head = await request('/src/app.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], String(Buffer.byteLength(PUBLIC_CONTENT.get('src/app.js'))));
  const missingHead = await request('/.env', 'HEAD');
  assert.equal(missingHead.status, 404);
  assert.equal(missingHead.body, '');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    const response = await request('/', method);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.match(response.headers['content-security-policy'], /connect-src 'none'/u);
  }
  const connect = await request('127.0.0.1:1', 'CONNECT');
  assert.equal(connect.status, 405);
  assert.equal(connect.headers.allow, 'GET, HEAD');
  assert.equal(connect.headers.connection, 'close');
});

test('el servidor no sigue un archivo público convertido en enlace simbólico', async (t) => {
  const sample = await fixture(t);
  await sample.write('private-fixture.txt', 'ARCHIVO_FICTICIO_PRIVADO');
  await unlink(sample.filename('src/app.js'));
  try {
    await sample.link('src/app.js', 'private-fixture.txt', 'file');
  } catch (error) {
    if (noSymlinkPrivilege(error, t)) return;
    throw error;
  }
  const request = await serve(t, sample.root);
  assert.equal((await request('/src/app.js')).status, 404);
});

test('el servidor no sigue directorios enlazados ni una raíz enlazada', async (t) => {
  const sample = await fixture(t, { populate: false });
  await sample.write('private-dir/app.js', 'export const privateFixture = true;');
  await sample.write('private-dir/index.html', '<!doctype html><title>Raíz ficticia privada</title>');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    await sample.link('src', 'private-dir', linkType);
    await sample.link('linked-root', 'private-dir', linkType);
  } catch (error) {
    if (noSymlinkPrivilege(error, t)) return;
    throw error;
  }
  const request = await serve(t, sample.root);
  assert.equal((await request('/src/app.js')).status, 404);
  const rootRequest = await serve(t, sample.filename('linked-root'));
  assert.equal((await rootRequest('/index.html')).status, 404);
});

test('build copia solo el manifiesto público, es repetible y excluye documentos/configuración', async (t) => {
  const sample = await fixture(t);
  await prepareBuild(sample);
  for (const relative of ['docs/manual.md', '.git/config', '.env', 'package.json', 'tests/example.js', 'assets/not-public.json']) {
    await sample.write(relative, 'MUESTRA_FICTICIA_A_EXCLUIR');
  }
  const first = await build(sample);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(await filesIn(sample.filename('dist')), EXPECTED_DIST);
  for (const [relative, content] of PUBLIC_CONTENT) {
    assert.deepEqual(await readFile(sample.filename(`dist/${relative}`)), Buffer.from(content));
  }
  assert.equal(await readFile(sample.filename('dist/.nojekyll'), 'utf8'), '');
  const second = await build(sample);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(await filesIn(sample.filename('dist')), EXPECTED_DIST);
  for (const [relative, content] of PUBLIC_CONTENT) {
    assert.deepEqual(await readFile(sample.filename(`dist/${relative}`)), Buffer.from(content));
  }
});

test('build se detiene ante contenido desconocido sin borrar ni sobrescribir la entrega previa', async (t) => {
  const sample = await fixture(t);
  await prepareBuild(sample);
  await sample.write('dist/index.html', 'ENTREGA_PREVIA_FICTICIA');
  await sample.write('dist/docs/extra.txt', 'CONTENIDO_ADICIONAL_FICTICIO');
  const result = await build(sample);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Contenido inesperado en dist/u);
  assert.equal(await readFile(sample.filename('dist/index.html'), 'utf8'), 'ENTREGA_PREVIA_FICTICIA');
  assert.equal(await readFile(sample.filename('dist/docs/extra.txt'), 'utf8'), 'CONTENIDO_ADICIONAL_FICTICIO');
});

test('build también rechaza assets desconocidos en directorios públicos anidados', async (t) => {
  const sample = await fixture(t);
  await prepareBuild(sample);
  await sample.write('dist/index.html', 'ENTREGA_PREVIA_FICTICIA');
  await sample.write('dist/assets/fonts/private.woff2', 'ARCHIVO_FICTICIO_A_CONSERVAR');
  const result = await build(sample);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Contenido inesperado en dist: assets\/fonts\/private\.woff2/u);
  assert.equal(await readFile(sample.filename('dist/index.html'), 'utf8'), 'ENTREGA_PREVIA_FICTICIA');
  assert.equal(await readFile(sample.filename('dist/assets/fonts/private.woff2'), 'utf8'), 'ARCHIVO_FICTICIO_A_CONSERVAR');
});

test('build comprueba todas las fuentes antes de sobrescribir dist', async (t) => {
  const sample = await fixture(t);
  await prepareBuild(sample);
  await sample.write('dist/index.html', 'ENTREGA_PREVIA_FICTICIA');
  const removed = PUBLIC_FILES.find((relative) => relative.endsWith('.woff2'));
  await unlink(sample.filename(removed));
  const result = await build(sample);
  assert.equal(result.status, 1);
  assert.equal(await readFile(sample.filename('dist/index.html'), 'utf8'), 'ENTREGA_PREVIA_FICTICIA');
});

test('build no escribe a través de una carpeta dist enlazada', async (t) => {
  const sample = await fixture(t);
  await prepareBuild(sample);
  await sample.write('previous-delivery/marker.txt', 'CONSERVAR_MUESTRA');
  try {
    await sample.link('dist', 'previous-delivery', process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (noSymlinkPrivilege(error, t)) return;
    throw error;
  }
  const result = await build(sample);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dist debe ser una carpeta local/u);
  assert.deepEqual(await readdir(sample.filename('previous-delivery')), ['marker.txt']);
  assert.equal(await readFile(sample.filename('previous-delivery/marker.txt'), 'utf8'), 'CONSERVAR_MUESTRA');
});

test('build rechaza módulos cuyo directorio fuente sea un enlace', async (t) => {
  const sample = await fixture(t, { populate: false });
  await prepareBuild(sample);
  for (const [relative, content] of PUBLIC_CONTENT) {
    await sample.write(relative.startsWith('src/') ? relative.replace('src/', 'linked-sources/') : relative, content);
  }
  try {
    await sample.link('src', 'linked-sources', process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (noSymlinkPrivilege(error, t)) return;
    throw error;
  }
  const result = await build(sample);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Enlace simbólico no permitido/u);
  await assert.rejects(lstat(sample.filename('dist')), { code: 'ENOENT' });
});
