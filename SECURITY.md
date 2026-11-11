# Seguridad y privacidad · Neos Cotiza 1.1.1

Neos Cotiza es una demo estática sin autenticación, backend de datos, pagos ni integraciones externas. Sus importes y propuestas sirven para demostrar una interacción; no sustituyen la revisión comercial o tributaria de un proyecto real.

## Datos en el navegador

- El formulario se mantiene en memoria mientras usas la página.
- Activar el guardado local permite conservar un borrador en la clave `neos-cotiza:draft:v1` de `localStorage`.
- La aplicación no cifra ese almacenamiento. Quien tenga acceso al mismo perfil del navegador, o código con acceso al mismo origen, podría leerlo.
- Desactivar el guardado solicita borrar el borrador existente. Al volver a abrir la página, recuperar un borrador requiere una acción expresa.
- El botón de borrado elimina el borrador de esta aplicación. No elimina los JSON o PDF que hayas descargado, las copias de esos archivos ni los datos de otros sitios.
- El navegador puede bloquear o eliminar el almacenamiento. El borrador local no constituye una copia de seguridad.

Para demostraciones usa información ficticia. Antes de compartir una descarga o una captura, revisa sus campos y el destino. No incluyas datos de clientes reales, contraseñas, tokens ni información sensible en el repositorio.

## Entradas e importación

Un JSON importado se trata como datos, no como código. La importación admite hasta 65 536 bytes, exige la identidad `neos-cotiza` y la versión `1`, y rechaza JSON malformado o una estructura incompatible. Los campos de la cotización se normalizan: se descartan propiedades inesperadas, se acotan números y textos, y se conservan únicamente las opciones del catálogo.

El catálogo del proyecto define los servicios y precios; los importes finales se recalculan en lugar de confiar en un total suministrado por un archivo. Al modificar esta función, conserva los límites de tamaño, tipos, longitudes y porcentajes, y el rechazo de versiones incompatibles.

Al modificar la interfaz, presenta el texto introducido por el usuario con `textContent` o nodos de texto. Evita interpretar texto libre mediante `innerHTML` o scripts. Mantén rutas, URLs y nombres de descarga controlados por la aplicación. Una validación del navegador facilita este flujo local; no sería una frontera de autorización si se añadiera un servidor.

## Ejecución y publicación

Node.js proporciona herramientas y un servidor de archivos para desarrollo, vinculado a `127.0.0.1`. Ese servidor admite recursos del manifiesto `scripts/project-files.mjs`, limita métodos y valida las rutas. Su alcance es local: no ofrece autenticación, autorización entre usuarios ni persistencia de datos de servidor. Publica únicamente el contenido revisado de `dist/` en un alojamiento estático con HTTPS.

La app no incorpora llamadas a servicios externos, fuentes remotas ni librerías de CDN. El isotipo y las cuatro fuentes se sirven localmente; sus avisos de origen están en [RECURSOS.md](docs/RECURSOS.md). Una vez alojada, el proveedor puede conservar registros de acceso, y el contenido público de la demo será accesible a terceros. Revisa la configuración efectiva del alojamiento antes de usarlo con información real; una política CSP en HTML no configura todas las cabeceras HTTP del servidor.

El workflow de comprobación usa permisos `contents: read`, no conserva credenciales de checkout y no tiene pasos de despliegue. La [ejecución con Node 22](https://github.com/leosal123/neos-cotiza/actions/runs/42960627849) completó `check`, pruebas y build. Las acciones se fijan a un SHA completo verificado en sus repositorios oficiales. Al actualizarlas, revisa el cambio y conserva el SHA completo.

`npm run check` incluye en su búsqueda de patrones los archivos de pruebas y el build estático existente. Excluye `.git`, `node_modules` y `work`. El detector informa nombres de archivo, sin imprimir valores sospechosos. No analiza el historial Git ni todos los formatos posibles de credencial: revisa también el contenido y los commits que enviarás.

El empaquetador admite únicamente `examples/propuesta-ejemplo.pdf` como PDF. Su contenido ficticio y sus metadatos se revisaron para esta entrega; el detector no los inspecciona automáticamente. También recopila archivos admitidos dentro de los directorios fuente: un nombre permitido no garantiza que un documento carezca de datos privados. Revisa cualquier reemplazo o incorporación antes de compartir un nuevo paquete.

El estado de la versión 1.1.1 figura en [VERIFICACION.md](docs/VERIFICACION.md). La [revisión antes de publicación de la 1.0.0](docs/SEGURIDAD-PREPUBLICACION.md) es histórica: no acredita los nuevos módulos, recursos, estilos ni artefactos de esta versión.

## Informar de un problema

El repositorio público es [leosal123/neos-cotiza](https://github.com/leosal123/neos-cotiza). El canal privado para reportar problemas de seguridad todavía no está definido. No publiques credenciales ni información personal en un issue. Cuando se habilite un canal privado, facilita una descripción, pasos de reproducción con datos ficticios y el impacto observado; no hagas pruebas contra sistemas de terceros.

Esta guía describe el alcance técnico y las precauciones de uso. No certifica ausencia de vulnerabilidades ni cumplimiento legal.
