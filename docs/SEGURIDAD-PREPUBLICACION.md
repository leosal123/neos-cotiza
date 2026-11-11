# Revisión histórica de seguridad · versión 1.0.0

**Antecedente histórico.** Este informe corresponde exclusivamente a Neos Cotiza **1.0.0**, antes del rediseño y la reorganización de módulos de la versión 1.1.0. Sus pruebas, capturas, conteos de archivos y conclusiones no acreditan la versión actual. Consulta el estado de la **1.1.0** en [VERIFICACION.md](VERIFICACION.md).

Fecha: 10 de noviembre de 2026. Proyecto: **Neos Cotiza**, demo estática de portafolio. Revisión solicitada con agentes **GPT-6 Luna** y coordinada por el agente principal.

## Resultado

No se detectaron credenciales ni datos personales reales en los archivos y paquetes revisados. La revisión de la aplicación no encontró una vulnerabilidad material demostrable en los flujos examinados. Se encontró y corrigió un hueco en el escaneo previo a publicación: los archivos de pruebas estaban excluidos aunque se entregarían en el repositorio público.

La conclusión de aquella revisión fue que el paquete corregido de la versión 1.0.0 quedaba preparado para publicar su contenido como demo estática. Se refería a esa entrega concreta; no acredita la versión 1.1.0, la configuración de una cuenta, un futuro repositorio ni un hosting.

## Revisión por agentes

| Agente GPT-6 Luna | Alcance | Resultado |
| --- | --- | --- |
| Secretos y datos | Árbol del proyecto, ZIP de fuentes, ZIP web, documentación, pruebas, archivos ocultos, capturas, metadatos detectables y manifiesto de entrega | Sin indicios demostrables de secretos o datos privados. Las capturas muestran datos marcados como ficticios. Los candidatos numéricos y menciones genéricas de credenciales se revisaron como ejemplos o falsos positivos. |
| Aplicación | JSON → normalización → DOM/impresión, porcentajes, fechas, almacenamiento y exportación | Sin vulnerabilidad material demostrada. 23 pruebas de cálculo y almacenamiento aprobadas. |
| Servidor y entrega | Rutas, métodos, enlaces simbólicos, build, detector local, workflow y acciones de GitHub | Confirmó y reprodujo la omisión del escaneo de pruebas. Verificó la corrección con una muestra ficticia y ejecutó las comprobaciones finales. |

Los agentes trabajaron en ámbitos separados. Las pruebas utilizaron datos ficticios en carpetas temporales; no se consultaron cuentas, credenciales del equipo o sistemas de producción para validar secretos. Los resultados del detector identificaron archivos y categorías, sin copiar valores sospechosos a los informes públicos.

## Hallazgo corregido

**Cobertura del detector de secretos.** `scripts/check.mjs` excluía los directorios `tests` y `test`, los archivos con sufijo de prueba y `dist`. Un agente colocó un señuelo con formato de token en una prueba de una copia aislada: la comprobación informó éxito, demostrando la omisión. No se encontró una credencial real en las pruebas de esta entrega.

Se modificó el detector para incluir archivos de pruebas y el build existente. Solo excluye `.git`, `node_modules` y `work`, que no forman parte del ZIP entregado. Se añadieron ocho pruebas de regresión para verificar la cobertura, el rechazo de archivos `.env`, la salida sin valores y el tratamiento de muestras temporales. Al repetir la reproducción aislada, el detector rechazó la muestra e informó únicamente su archivo.

## Controles comprobados

- Importación limitada a 65 536 bytes, comprobación de versión y estructura, selección explícita de campos y recálculo de importes.
- Textos representados mediante `textContent` o nodos de texto, sin interpretar el contenido de una cotización como HTML o JavaScript.
- Catálogo cerrado, porcentajes acotados, fechas válidas e importes en céntimos enteros; los datos importados no controlan URLs ni rutas de publicación.
- Guardado local opcional, recuperación expresa y borrado limitado a la clave de esta aplicación.
- Servidor de desarrollo vinculado a loopback, lista fija de recursos y rechazo de traversal, enlaces simbólicos y métodos no admitidos.
- Build limitado a ocho archivos públicos y `.nojekyll`, sin fuentes privadas, documentos ni muestras locales.
- Workflow con permisos `contents: read`, sin credenciales persistentes de checkout, cachés, secretos de despliegue ni publicación. Las dos acciones están fijadas a SHA completos contrastados con sus repositorios y versiones oficiales.
- Paquetes con manifiestos explícitos, sin rutas que salgan de su raíz, entradas duplicadas, `.env`, claves privadas, historial Git, dependencias locales o datos de borradores.

## Comprobaciones finales

```text
npm test       42 casos: 41 aprobados, 0 fallidos, 1 omitido
npm run build  comprobación correcta; 8 archivos públicos y .nojekyll
```

La prueba omitida requiere crear un enlace simbólico de archivo que este Windows no permite. Las pruebas de enlaces de directorio sí se ejecutaron. No se cambió la configuración del sistema para hacer pasar las pruebas.

El ZIP de fuentes incluye **27 archivos** y el ZIP web **9 archivos**. Los ZIP se comprueban contra su manifiesto y contra los bytes de las fuentes; sus sumas SHA-256 se entregan en `SHA256SUMS.txt`, fuera del código de la aplicación. Una revisión final del contenido de los ZIP se realiza tras su regeneración.

## Límites y condiciones de uso

- La revisión combina detección por patrones y lectura de código con agentes. Un resultado sin alertas no prueba la ausencia de todos los formatos posibles de secreto o de vulnerabilidad.
- La entrega no contiene `.git`. No hay un historial local del proyecto que revisar; cualquier repositorio o commits que se creen después requieren su propia revisión antes de enviarlos. Sube únicamente la carpeta del proyecto entregado.
- `localStorage` pertenece al origen y perfil del navegador; no es un almacén cifrado ni aislamiento entre cuentas. La demo no tiene cuentas. Los archivos JSON y PDF exportados incluyen los textos introducidos por quien la usa.
- No se ha publicado ni revisado un repositorio remoto. Las protecciones, permisos, colaboradores y alertas de GitHub no se han configurado. Tampoco se ha verificado un hosting público.
- La revisión funcional del PDF final y del selector manual de JSON continúa pendiente según [VERIFICACION.md](VERIFICACION.md). No se identificó una filtración por esas funciones, pero no se afirma haber completado sus pruebas de navegador.

## Fuentes primarias consultadas

- [OWASP: prevención de XSS en el DOM](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html): selección de puntos de representación e interpretación de datos.
- [GitHub: escaneo de secretos](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning): alcance del proveedor, tipos de patrones y análisis de historial. La revisión local no supone que se hayan configurado esas funciones remotas.
- Versiones y commits oficiales de [actions/checkout](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1) y [actions/setup-node](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1).

## Vigencia de este registro

Los conteos de ocho archivos públicos, 27 archivos de fuentes y las ejecuciones de 42 pruebas mencionados arriba pertenecen a la entrega **1.0.0**. Se conservan como evidencia histórica; no describen el manifiesto, los paquetes ni los resultados de **1.1.0**. Usa [VERIFICACION.md](VERIFICACION.md) para el estado de la versión actual.
