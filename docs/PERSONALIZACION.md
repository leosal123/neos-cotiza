# Personalización y publicación · versión 1.1.1

## Cambiar servicios y precios

Edita `src/catalog.js` para modificar los precios y las opciones de demostración. Mantén los identificadores únicos y estables: las selecciones importadas dependen de ellos. `src/ui/form.js` sincroniza los importes de las opciones existentes al cargar la app.

Al añadir o eliminar servicios o extras, actualiza también sus controles en `index.html`: los atributos `value` de los controles con `name="service"` o `name="extra"`, y los atributos `data-service-price` y `data-extra-price` deben coincidir con los identificadores del catálogo. Para cambiar nombres o descripciones visibles, revisa tanto el catálogo usado en el resumen como los textos de las tarjetas HTML. Actualiza también el contenido HTML de respaldo y las selecciones iniciales de `src/quote.js` cuando corresponda.

El catálogo actual admite precios en **soles enteros no negativos**, por ejemplo `price: 1200`; la capa de cálculo los convierte a céntimos. Cambia `extraPagePrice` para ajustar el precio por página adicional y `priorityPercent` para el recargo, inicialmente 20. Los plazos `days` también deben ser enteros no negativos.

La validación admite hasta 20 páginas adicionales, descuentos de 0 a 40 %, impuesto opcional de 0 a 30 %, adelantos de 0 a 100 %, una vigencia de 1 a 90 días y fechas de 2000 a 2100. El menú de adelanto ofrece atajos de 0, 30, 50 y 100 %; al importar se conserva cualquier porcentaje válido dentro del rango. Si cambias esos límites, revisa la validación de `src/quote.js`, los controles HTML, el paso de páginas en `src/app.js`, sus botones en `src/ui/summary.js` y las pruebas.

La comparación está en `src/ui/comparison.js`. Calcula cada servicio del catálogo conservando el resto de la cotización. Si añades o eliminas servicios, revisa también esa sección, su distribución y las pruebas de comparación.

Antes de adoptar precios para trabajo real, acuerda el alcance y revisa las condiciones comerciales y tributarias aplicables. Esta guía y la propuesta de la demo no son documentos legales.

## Cambiar la apariencia

Empieza por `styles/tokens.css`: contiene colores, roles tipográficos, radios y otras variables. La paleta usa marfil `#F3EEE6`, piedra `#D8D0C4`, noche `#0B1526` y azul `#3947FF`. Las cuatro fuentes se cargan desde archivos locales con sus avisos OFL.

| Quieres cambiar… | Archivo |
| --- | --- |
| Reglas generales | `styles/base.css` |
| Distribución de la página | `styles/layout.css` |
| Tarjetas y controles compartidos | `styles/components.css` |
| Resumen de importes | `styles/summary.css` |
| Propuesta y diálogos | `styles/proposal.css` |
| Comportamiento por ancho | `styles/responsive.css` |
| Impresión | `styles/print.css` |

Mantén contraste, foco visible, tamaños de controles y lectura móvil. Comprueba que la propuesta siga siendo legible al imprimir en A4, con textos largos y varias líneas de servicios. El isotipo original está en `assets/brand/neos-linx-isotipo.webp`; su procedencia y los avisos de las fuentes se documentan en [RECURSOS.md](RECURSOS.md).

## Añadir recursos públicos

`scripts/project-files.mjs` es el manifiesto común del servidor, comprobador y build. Al añadir una imagen, fuente, módulo o hoja de estilos que utilice la app, incluye su ruta y comprueba su tipo MIME. Conserva los avisos de licencia que acompañen a los recursos. Los documentos y archivos privados quedan fuera de ese manifiesto.

## Preparar el contenido público

1. Conserva los ejemplos ficticios o reemplázalos por otros datos ficticios.
2. Actualiza las capturas `docs/captura-desktop.jpg` y `docs/captura-mobile.jpg` cuando cambie la interfaz.
3. Ejecuta `npm run check`, `npm test` y `npm run build` desde la raíz del proyecto.
4. Revisa `dist/`: debe contener los recursos del manifiesto y `.nojekyll`, incluidos los cuatro avisos OFL. Usa `npm run preview` para servir ese resultado en `127.0.0.1:4173`.
5. Comprueba las funciones en escritorio y móvil, JSON y borrado del borrador. Revisa también la impresión y el PDF que genere el navegador; la comprobación de la vista HTML no sustituye esa revisión.

Los archivos descargados desde la demo pueden contener lo que haya escrito quien la usa. No los añadas a un commit ni a una captura pública sin revisar su contenido.

Ejecuta `npm run package` para construir la web y generar en `release/` el ZIP de fuentes, el ZIP web y `SHA256SUMS.txt`. La carpeta `release/` queda fuera del repositorio y de los paquetes. El ejemplo ficticio `examples/propuesta-ejemplo.pdf` es el único PDF admitido por el empaquetador; conserva las cotizaciones privadas fuera del proyecto.

## Repositorio en GitHub

El código está publicado en [leosal123/neos-cotiza](https://github.com/leosal123/neos-cotiza), repositorio público con rama `main`. Antes de enviar cambios, revisa el contenido y la configuración; no incluyas credenciales, archivos de clientes ni borradores personales.

Usa como raíz del repositorio únicamente la carpeta del proyecto. Mantén fuera la carpeta de trabajo que la contiene, los informes privados de herramientas y los demás proyectos. Antes del envío, revisa la lista de archivos preparados para el commit y cualquier historial existente. Si preparas un ZIP de fuentes, comprueba que no incluya un directorio `.git`, borradores ni archivos ajenos al proyecto.

El workflow `.github/workflows/checks.yml` completó `check`, pruebas y build con Node 22 en [esta ejecución](https://github.com/leosal123/neos-cotiza/actions/runs/42960627849). No configura hosting, no publica Pages y no necesita secretos de despliegue. Que un repositorio sea público no define por sí solo una licencia para reutilizar su contenido; la licencia de distribución queda pendiente de decisión.

## Publicar `dist/` en GitHub Pages

El repositorio ya es público. GitHub Pages y el hosting de la app todavía no están configurados, y no se ha verificado una demo en Internet. Estos pasos describen una futura publicación de la aplicación.

GitHub Pages puede publicar desde la raíz de una rama o desde su carpeta `/docs`; no permite elegir `/dist` como carpeta de origen de una rama. Para esta estructura, una opción manual es copiar **el contenido** de `dist/` a la raíz de una rama dedicada, por ejemplo `gh-pages`, y seleccionar esa rama con `/(root)` en **Settings → Pages → Deploy from a branch**. Conserva el archivo vacío `.nojekyll` que ya incluye el build en la raíz publicada para servir los archivos estáticos sin el procesamiento de Jekyll. Véanse las instrucciones oficiales para [configurar el origen](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) y [crear el sitio](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Mantén el código fuente en `main`. No selecciones la carpeta `docs/` de este proyecto como origen: contiene documentación, no el build. Cada actualización del sitio requiere generar y revisar un nuevo `dist/`, copiarlo a la rama de publicación y enviar ese cambio.

Tras configurar Pages, usa la URL que indique GitHub y comprueba la subruta de proyecto `/neos-cotiza/`, junto con la carga de CSS, módulos, isotipo e impresión. Conserva las referencias relativas, activa HTTPS y comprueba la URL efectiva. El sitio de Pages es público, incluso en los planes que permiten alojarlo desde un repositorio privado. [Disponibilidad y exposición de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Otro hosting estático

Sube solo el contenido de `dist/` al directorio público del destino elegido. Configura HTTPS y las cabeceras que admita ese hosting, y prueba la aplicación en su ruta final. No expongas el servidor local de Node como sustituto de un despliegue.
