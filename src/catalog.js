// Precios orientativos en soles enteros: edita este archivo para tu catálogo.
// Los servicios y negocios de la demostración son ficticios.
export const CATALOG = {
  services: [
    {
      id: 'landing',
      name: 'Landing de conversión',
      description: 'Una página para presentar tu servicio y recibir consultas.',
      price: 1200,
      days: 5,
      tag: 'Para empezar',
      features: ['Una página principal', 'Diseño adaptable', 'Formulario de contacto'],
    },
    {
      id: 'corporate',
      name: 'Web corporativa',
      description: 'Un sitio para explicar tu negocio, servicios y trayectoria.',
      price: 2400,
      days: 10,
      tag: 'Más presencia',
      features: ['Hasta cinco páginas', 'Secciones de servicios', 'Formulario de contacto'],
    },
    {
      id: 'ecommerce',
      name: 'Tienda online',
      description: 'Una propuesta de catálogo y experiencia de compra para tu marca.',
      price: 3800,
      days: 15,
      tag: 'Para vender',
      features: ['Catálogo de productos', 'Carrito de compra', 'Configuración de tienda'],
    },
  ],
  extras: [
    {
      id: 'contenido',
      name: 'Redacción de contenido',
      description: 'Textos claros para presentar el negocio y sus servicios.',
      price: 300,
      days: 2,
    },
    {
      id: 'seo',
      name: 'SEO inicial',
      description: 'Títulos, descripciones y estructura básica para buscadores.',
      price: 250,
      days: 1,
    },
    {
      id: 'identidad',
      name: 'Identidad visual básica',
      description: 'Paleta, tipografía y pautas visuales para el proyecto.',
      price: 450,
      days: 3,
    },
  ],
  extraPagePrice: 90,
  priorityPercent: 20,
};
