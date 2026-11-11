# Arquitectura de Neos Cotiza 1.1.1

## Alcance

Una aplicación estática de una sola página para explorar el alcance y precio de un proyecto web. HTML legible, CSS por responsabilidades y módulos ES de JavaScript. Los cálculos, la comparación, la importación y el borrador se ejecutan en el navegador.

No existe backend de datos, base de datos, autenticación, API externa, envío de propuestas ni procesamiento de pagos. Node.js se usa para herramientas y para un servidor local de archivos; sus controles no convierten la demo en un backend productivo autenticado.

## Mapa del código

| Archivo o módulo | Responsabilidad |
| --- | --- |
| `index.html` | Estructura semántica, controles, tarjetas y propuesta imprimible |
| `styles/tokens.css` | Paleta, tipografías locales y variables de diseño |
| `styles/base.css` | Reglas generales y accesibilidad de base |
| `styles/layout.css` | Estructura de página y distribución |
| `styles/components.css` | Controles, tarjetas y elementos compartidos |
| `styles/summary.css` | Resumen de la cotización |
| `styles/proposal.css` | Vista de propuesta y diálogos |
| `styles/responsive.css` | Adaptación a anchos de pantalla |
| `styles/print.css` | Presentación de impresión |
| `src/catalog.js` | Servicios, extras, precios y días ilustrativos |
| `src/quote.js` | Normalización, límites y cálculo en céntimos |
| `src/storage.js` | Formato JSON y operaciones del borrador local |
| `src/app.js` | Coordinación del estado, eventos, importación y exportación |
| `src/ui/dom.js` | Creación de nodos, avisos y apertura de diálogos |
| `src/ui/form.js` | Lectura, sincronización y validación de controles |
| `src/ui/summary.js` | Desglose e importes del resumen |
| `src/ui/proposal.js` | Contenido de la propuesta imprimible |
| `src/ui/comparison.js` | Cálculo y representación de las alternativas |
| `scripts/project-files.mjs` | Manifiesto único de recursos públicos y tipos MIME |
| `scripts/server.mjs` | Servidor local de archivos con alcance limitado |
| `scripts/check.mjs` | Comprobación estática y búsqueda limitada de secretos |
| `scripts/build.mjs` | Copia de los recursos públicos a `dist/` |
| `scripts/package.mjs` | ZIP de fuentes y web, validación de contenido y hashes SHA-256 |
| `examples/` | Propuesta ficticia en PDF y sus instrucciones |

El flujo principal es **entrada → normalización → cálculo → resumen y comparación**. La propuesta se representa al abrirla o imprimir. Los textos del usuario se insertan como texto o nodos, sin interpretarlos como HTML.

## Cálculo y comparación

El catálogo expresa precios en soles enteros no negativos. El cálculo los convierte a céntimos enteros. Los porcentajes se aplican con redondeo al céntimo en cada paso:

1. Servicio base + extras + páginas adicionales.
2. Recargo de prioridad, si se activa; inicialmente 20 %.
3. Descuento sobre el subtotal que incluye la prioridad.
4. Impuesto opcional sobre el importe descontado.
5. Total = importe descontado + impuesto.
6. Adelanto sobre el total; saldo = total − adelanto.

La tasa de impuesto empieza en cero. La aplicación no determina si existe una obligación tributaria. Todos los precios son ejemplos.

La comparación recorre los tres servicios del catálogo. Para cada alternativa cambia únicamente `serviceId`: conserva extras, páginas, prioridad, descuento, impuesto y adelanto. Recalcula el total y muestra su diferencia respecto de la opción actual, junto con el plazo inicial. Aplicar una alternativa actualiza el formulario, el resumen y, si está activo, el borrador.

El plazo suma días del servicio y extras. Las páginas adicionales y la prioridad requieren coordinar el calendario; el recargo no modifica automáticamente los días estimados.

## Persistencia e intercambio

El estado activo vive en memoria. El guardado opcional conserva un solo borrador en `neos-cotiza:draft:v1`. Desactivar el guardado o pulsar el botón de borrado elimina esa clave si el navegador lo permite. Recuperar un borrador al volver a abrir la app requiere una acción expresa.

El formato de intercambio sigue siendo **versión 1**, aunque la aplicación sea 1.1.1: contiene `app: "neos-cotiza"`, `version: 1` y `quote`. Se admiten hasta 65 536 bytes. Se valida el formato, se normalizan sus campos y se recalcula con el catálogo actual. Los totales del archivo no constituyen una fuente de precios.

Importar reemplaza la propuesta abierta y actualiza el borrador si el guardado está activo. Borrar el borrador mantiene la propuesta abierta en memoria. El almacenamiento depende del origen y perfil del navegador, no sincroniza equipos y no separa usuarios del mismo perfil.

## Recursos y entrega

El isotipo original de Neos Linx y las cuatro fuentes se alojan dentro del proyecto. `styles/tokens.css` declara Bricolage Grotesque para titulares, Geist para texto, Geist Mono para cifras e Instrument Serif en cursiva para acentos editoriales. Los avisos OFL se conservan con las fuentes. Véase [procedencia y licencias específicas](RECURSOS.md).

El servidor, el build y el comprobador consumen `scripts/project-files.mjs`. Una extensión MIME registrada no permite servir archivos ajenos al manifiesto. El build añade `.nojekyll`; los documentos y pruebas se conservan en el repositorio y no se sirven como parte de la aplicación.

Las rutas relativas permiten alojar el resultado bajo una subruta de proyecto. El servidor local escucha en `127.0.0.1`; restringe métodos, rutas y recursos, y entrega cabeceras de seguridad para el desarrollo. El futuro hosting deberá configurar y verificar sus propias cabeceras y HTTPS.

El workflow de comprobación utiliza Node 22, permisos de lectura, checkout sin credenciales persistentes y acciones fijadas a SHA completo. Ejecuta comprobaciones, pruebas y build; no publica el sitio.

La impresión utiliza el motor del navegador y `styles/print.css`. Guardar como PDF depende del diálogo del sistema. La validación final de la interfaz, impresión, PDF y hosting se describe por separado en [VERIFICACION.md](VERIFICACION.md).

## Si se amplía el producto

Guardar cotizaciones de varias personas, autenticar usuarios, enviar mensajes, integrar un CRM o cobrar requiere otro alcance técnico. Habrá que definir servidor, permisos, datos y operación adecuados a ese flujo. La validación del navegador actual no sería una frontera de autorización para esas funciones.
