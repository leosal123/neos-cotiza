// Única lista de recursos que el servidor puede leer y el build puede entregar.
// Las rutas son relativas al proyecto y usan / también en Windows.
export const PUBLIC_FILES = Object.freeze([
  'index.html',
  'assets/brand/neos-linx-isotipo.webp',
  'assets/fonts/bricolage-grotesque-opsz.woff2',
  'assets/fonts/geist-normal.woff2',
  'assets/fonts/geist-mono-normal.woff2',
  'assets/fonts/instrument-serif-italic.woff2',
  'assets/fonts/Bricolage-Grotesque-OFL.txt',
  'assets/fonts/Geist-OFL.txt',
  'assets/fonts/Geist-Mono-OFL.txt',
  'assets/fonts/Instrument-Serif-OFL.txt',
  'styles/tokens.css',
  'styles/base.css',
  'styles/layout.css',
  'styles/components.css',
  'styles/summary.css',
  'styles/proposal.css',
  'styles/responsive.css',
  'styles/print.css',
  'src/app.js',
  'src/catalog.js',
  'src/quote.js',
  'src/storage.js',
  'src/ui/dom.js',
  'src/ui/form.js',
  'src/ui/summary.js',
  'src/ui/proposal.js',
  'src/ui/comparison.js',
]);

// Tener un tipo registrado no publica otros archivos de esa extensión.
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
});
