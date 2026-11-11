# Contribuir a Neos Cotiza

Necesitas Node.js 22 o posterior. El proyecto no requiere instalar paquetes de npm.

```sh
npm start
npm run check
npm test
npm run build
```

Detén el servidor local con `Ctrl+C`. Después del build, `npm run preview` permite revisar `dist/` en el puerto 4173.

## Preparar un cambio

- Describe qué comportamiento cambia y por qué. Mantén el cambio centrado en ese objetivo.
- Consulta el [mapa de módulos](docs/ARQUITECTURA.md) y la [guía de personalización](docs/PERSONALIZACION.md) para editar los archivos relacionados.
- Conserva los cálculos monetarios en `src/quote.js` y la representación en `src/ui/`. Añade pruebas útiles cuando cambies reglas, importación, persistencia o controles de seguridad.
- Para cambios visuales, revisa teclado, foco, anchos de pantalla y propuesta imprimible. Indica qué comprobaste y qué quedó pendiente.
- Si añades un recurso público, actualiza `scripts/project-files.mjs`; conserva sus avisos de origen y licencia. Evita servicios externos o dependencias nuevas sin acordar antes su necesidad.

## Contenido y revisión

Usa datos ficticios en pruebas, capturas y ejemplos. Revisa el diff y los archivos que vas a enviar: no incluyas credenciales, cotizaciones reales, exportaciones personales ni archivos de clientes. Los resultados de un detector de patrones no sustituyen esa revisión.

Mantén los avisos OFL de las fuentes y respeta la identidad de Neos Linx. No añadas una licencia general del proyecto ni cambies las condiciones de uso de la marca sin una decisión de su titular.

Para problemas de seguridad, sigue [SECURITY.md](SECURITY.md) y evita exponer datos o credenciales en un issue público. El workflow solo valida el código; una contribución no configura ni ejecuta un despliegue.
