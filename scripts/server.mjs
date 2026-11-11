import http from 'node:http';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MIME_TYPES, PUBLIC_FILES } from './project-files.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// La lista fija impide servir documentos, pruebas, scripts o archivos privados.
const PUBLIC_PATHS = new Set(PUBLIC_FILES.map((relative) => `/${relative}`));

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(response) {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
}

function respond(request, response, status, message) {
  const body = `${message}\n`;
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

function requestedFile(target) {
  if (typeof target !== 'string' || target.length > 2048) return null;
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  let decoded;
  try {
    // decodeURIComponent rechaza escapes y secuencias UTF-8 malformadas.
    decoded = decodeURIComponent(target.split('?', 1)[0]);
  } catch {
    return null;
  }
  if (/[\\\u0000-\u001f\u007f#]/u.test(decoded)) return null;
  if (decoded.split('/').some((part) => part === '.' || part === '..')) return null;
  return decoded === '/' ? '/index.html' : decoded;
}

async function readPublicFile(rootDirectory, publicPath) {
  const rootInfo = await lstat(rootDirectory);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Raíz no válida');
  const resolvedRoot = await realpath(rootDirectory);
  let current = rootDirectory;
  const parts = publicPath.slice(1).split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('Enlace simbólico no permitido');
    const finalPart = index === parts.length - 1;
    if (finalPart ? !info.isFile() : !info.isDirectory()) throw new Error('Ruta no válida');
  }
  const resolvedFile = await realpath(current);
  if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Ruta fuera de la raíz');
  return readFile(current);
}

// Se exporta para que las pruebas puedan usar un puerto efímero y cerrar el servidor.
export function createStaticServer({ rootDirectory = PROJECT_ROOT } = {}) {
  const root = path.resolve(rootDirectory);
  const server = http.createServer(async (request, response) => {
    securityHeaders(response);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      respond(request, response, 405, 'Método no permitido');
      return;
    }
    const publicPath = requestedFile(request.url);
    if (publicPath === null) {
      respond(request, response, 400, 'Ruta no válida');
      return;
    }
    if (!PUBLIC_PATHS.has(publicPath)) {
      respond(request, response, 404, 'Archivo no disponible');
      return;
    }
    const contentType = MIME_TYPES[path.posix.extname(publicPath)];
    try {
      const body = await readPublicFile(root, publicPath);
      response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      // No se devuelven rutas del equipo ni errores internos al navegador.
      respond(request, response, 404, 'Archivo no disponible');
    }
  });
  // Node entrega CONNECT en un evento propio: se rechaza sin abrir un túnel.
  server.on('connect', (request, socket) => {
    const response = new http.ServerResponse(request);
    response.assignSocket(socket);
    response.once('finish', () => socket.end());
    securityHeaders(response);
    response.setHeader('Connection', 'close');
    response.setHeader('Allow', 'GET, HEAD');
    respond(request, response, 405, 'Método no permitido');
  });
  return server;
}

export function parsePort(value = '4173') {
  if (!/^[0-9]{1,5}$/u.test(value)) throw new Error('PORT debe ser un número entre 1 y 65535.');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new Error('PORT debe estar entre 1 y 65535.');
  return port;
}

function start() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o posterior.');
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--dist') || args.length > 1) {
    throw new Error('Uso: node scripts/server.mjs [--dist]');
  }
  const rootDirectory = args.includes('--dist') ? path.join(PROJECT_ROOT, 'dist') : PROJECT_ROOT;
  const port = parsePort(process.env.PORT ?? '4173');
  const server = createStaticServer({ rootDirectory });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `El puerto ${port} ya está ocupado.` : 'No se pudo iniciar el servidor local.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Neos Cotiza: http://127.0.0.1:${port}${args.includes('--dist') ? ' (dist)' : ''}`);
    console.log('Pulsa Ctrl+C para detenerlo.');
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    start();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
