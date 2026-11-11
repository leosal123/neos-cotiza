# Verificación de Neos Cotiza 1.1.1

Estado del 10 de noviembre de 2026. La versión 1.1.1 está publicada como código en [leosal123/neos-cotiza](https://github.com/leosal123/neos-cotiza), repositorio público con rama `main`. GitHub Pages y el hosting de la app no están configurados; no se ha verificado una demo en Internet.

## Resultados observados

| Área | Evidencia disponible | Límite o pendiente |
| --- | --- | --- |
| Pruebas automatizadas locales | **62 casos: 60 aprobados, 0 fallidos y 2 omitidos**, ejecutados con sockets de loopback autorizados. Incluyen el empaquetador. | Windows impidió crear enlaces simbólicos de archivo en los dos casos omitidos; junctions y enlaces de directorio sí se probaron. |
| Comparación en escritorio | Aplicar la alternativa de web corporativa mostró **S/ 2,950.00** y conservó los extras. El cálculo de alternativas conserva también las condiciones configuradas. | Completar la revisión de escenarios y navegación en los dispositivos de destino. |
| Identidad y diseño | Isotipo original en escritorio, cabecera móvil y propuesta. Tipografías locales observadas en Chrome; ilustración lateral retirada. Capturas del README actualizadas. | No se probaron teléfonos físicos ni todos los navegadores. |
| Diseño móvil | Viewports de 390 y 360 píxeles, sin desbordamiento horizontal. Ancho de contenido y documento iguales en cada medición. Comparador legible en filas y accesos móviles visibles. | No equivale a una auditoría completa de accesibilidad. |
| Estructura pública | Manifiesto compartido de **27 recursos públicos**, incluidos cuatro avisos OFL; build comprobado con `.nojekyll`, **28 archivos** en total. | La configuración de un alojamiento futuro no se ha verificado. |
| Seguridad del código base | La revisión de la versión 1.1.0 con un agente GPT-6 Luna no identificó un fallo material nuevo demostrable. | Es una revisión acotada del código anterior al nuevo empaquetador; no certifica la ausencia de vulnerabilidades en la 1.1.1. |
| JSON y borrador | Se conserva el formato de intercambio versión 1 y la clave local `neos-cotiza:draft:v1`. La suite incluye los casos de normalización y persistencia. | Revisión de los flujos completos en el navegador de esta versión. |
| PDF normal | Propuesta A4 de **una página**, con isotipo real, desglose y totales. [Ejemplo ficticio incluido](../examples/propuesta-ejemplo.pdf). | Generado con el motor de impresión de Chrome headless local; no mediante el diálogo nativo ni una impresora física. |
| PDF extenso | Tienda online, todos los extras, 20 páginas adicionales y notas de 1 990 caracteres, con una secuencia de 170 letras X: **dos páginas**. Se revisaron ajuste de líneas, totales y paginación. | Estos casos no cubren todos los textos, navegadores o tamaños de papel. |
| Empaquetado | `npm run package` construye y crea ZIP de fuentes, ZIP web y `SHA256SUMS.txt`. Valida listado permitido, enlaces simbólicos, build actual y CRC. | La reproducibilidad requiere la misma versión de Node y zlib. Generar los archivos no los publica. |
| Revisión de archivos 1.1.1 | GPT-6 Luna comprobó 54 fuentes y 28 archivos web: CRC, manifiestos, bytes y hashes coincidentes. Sin indicios de claves o datos privados en los paquetes ni metadatos personales en el PDF ficticio. El ZIP extraído pasó pruebas y generó los mismos paquetes. | El escáner no inspecciona automáticamente texto o metadatos del PDF; los directorios fuente admitidos se recopilan recursivamente. Revisar el contenido antes de cada publicación. |
| Estructura en GitHub | **54 archivos** en sus carpetas correctas. La corrección [b399b73](https://github.com/leosal123/neos-cotiza/commit/b399b739875e6c702ad4944aa45af2ca80956466) reorganizó 48 archivos mediante movimientos y conservó el historial. | Los cambios posteriores requieren sus propias comprobaciones. |
| CI en GitHub | La [ejecución 42960627849](https://github.com/leosal123/neos-cotiza/actions/runs/42960627849) de esa corrección completó `check`, pruebas y build con Node 22. Registro de pruebas: **62 aprobadas, 0 fallidas y 0 omitidas**. | El workflow valida el código y no despliega la aplicación. |
| Hosting de la app | Esta entrega no incluye el despliegue de la aplicación ni una demo alojada verificada. | Configurar y verificar el destino cuando se elija; el repositorio público no acredita una demo alojada. |

No se modificó la configuración del sistema para forzar las pruebas de enlaces simbólicos omitidas. Esas omisiones deben conservarse visibles al comunicar el resultado.

## Alcance de la impresión

Los PDF se generaron mediante el motor de impresión de Chrome headless local, usando la aplicación real, su ejemplo inicial y snapshots del modal de propuesta. Se observó el logo original, el pie «Neos Linx» y la numeración «Página n de m». El ejemplo se acompaña de [notas de uso](../examples/README.md).

Para reproducir la presentación, selecciona **A4**, **escala 100 %** y desactiva los encabezados y pies automáticos del navegador. No se probaron el diálogo nativo, impresoras físicas ni otros navegadores. La verificación del PDF acredita los casos descritos y no equivale a validar todas las salidas posibles.

## Alcance de la evidencia

Los últimos cambios de estilos, recursos o manifiesto deben estar incluidos en el build que se entregue. La lectura del código y la existencia de estilos de impresión no prueban por sí solas el resultado visual, la accesibilidad completa, el PDF o las cabeceras del hosting.

Las capturas del README se actualizaron tras revisar esta interfaz. No se observaron errores ni advertencias en el registro de consola consultado. No se han medido Core Web Vitals ni probado todos los navegadores o teléfonos físicos.

Contrastes medidos: texto secundario `#5A606A` sobre marfil `#F3EEE6`, **5.48:1**; azul `#3947FF` sobre superficie de selección `#EDEDFF`, **5.16:1**; texto `#B8C1D0` sobre noche `#0B1526`, **10.07:1**. Las tres combinaciones superan 4.5:1 para texto normal.

El detector local de secretos usa patrones limitados y no analiza el historial Git. Sus resultados no certifican ausencia de credenciales ni vulnerabilidades. La [revisión de seguridad de la versión 1.0.0](SEGURIDAD-PREPUBLICACION.md) es un antecedente histórico y no acredita la 1.1.1.

El paquete de fuentes incluye scripts, pruebas, documentación y `examples/`; el paquete web contiene solo recursos públicos. `release/` se excluye del repositorio. Los nombres de salida para esta versión son `neos-cotiza-v1.1.1-github.zip`, `neos-cotiza-v1.1.1-web.zip` y `SHA256SUMS.txt`.

## Reproducir y registrar la entrega

```sh
npm run check
npm test
npm run build
npm run preview
npm run package
```

Las pruebas HTTP necesitan sockets de loopback. Registra el resultado sobre la misma versión que se vaya a entregar y revisa el contenido efectivo de `dist/`, incluyendo fuentes y avisos OFL. Actualiza este documento con los resultados observados y conserva los límites que sigan abiertos.
