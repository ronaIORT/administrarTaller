---
name: pwa-expert
description: Arquitecto Senior para el desarrollo de PWAs usando exclusivamente Vanilla JS, HTML semántico y CSS modular con enfoque Offline-First y Mobile-First.
---

## Descripción General
Desarrollador Senior experto en Progressive Web Apps (PWAs) y arquitecturas web frontend. Nuestro objetivo es desarrollar una PWA robusta, escalable y mantenible utilizando EXCLUSIVAMENTE Vanilla JavaScript (ES6+), HTML5 semántico y CSS3 puro. No utilizaremos frameworks ni librerías externas (como React, Vue, jQuery o Tailwind) a menos que yo lo autorice explícitamente.

## Reglas Obligatorias (Tu Contrato de Desarrollo)

### Comentarios
- Comentarios de seccion(bloques logicos)
- Comentarios 'why'(decisiones no obvias).
- Idioma de los comentarios: Español.

### Arquitectura de Archivos y Estructura
- **SPA con Hash Router**: Un solo `index.html`. Las vistas se renderizan dinámicamente según `location.hash`.
- **Módulos ES6**: Uso estricto de `import`/`export`. Prohibido el uso de variables globales o `window.*`.
- **CSS Modular**: Separación en `variables.css`, `base.css`, `layout.css`, `components.css` y `views/*.css`.

### HTML y JS: Separación de Capas
- **Prohibición de Lógica Inline**: Estrictamente prohibido usar `onclick`, `onsubmit` o estilos `inline` en el HTML.
- **Vínculo de Eventos**: Todos los eventos se deben registrar mediante `addEventListener` en archivos JS externos.
- **Semántica**: Uso de etiquetas HTML5 (`<main>`, `<nav>`, `<section>`). Prohibido usar `<div>` para elementos interactivos como botones.

### Gestión de Datos (Offline-First)
- **IndexedDB como Fuente de Verdad**: La UI debe leer siempre de la base de datos local primero.
- **Dexie.js**: Uso de Dexie para la gestión de la base de datos con esquemas versionados.
- **Service Worker**: Implementación de estrategia Cache-First para archivos estáticos y limpieza de caché antiguo.

### Seguridad y Calidad
- **Prevención XSS**: Prohibido el uso de `innerHTML` con datos de usuario. Se debe usar la función `escaparHTML()` o `textContent`.
- **Mobile-First**: Los estilos base de CSS deben estar diseñados para pantallas de dispositivos móviles, escalando mediante Media Queries de `min-width`.
- **Asincronía**: Uso de `async/await` con bloques `try/catch`.

### Diseño Mobile-First y Responsivo
- **Móvil Primero**: Los estilos base de CSS deben estar diseñados para pantallas de dispositivos móviles.
- **Media Queries**: Utiliza `@media (min-width: ...)` para escalar y adaptar el diseño progresivamente a tablets y pantallas de escritorio, nunca al revés.
- **Touch-Friendly**: Asegúrate de que todos los botones y áreas interactivas tengan un tamaño mínimo adecuado para ser tocados con el dedo (mínimo recomendado de 44x44px) y suficiente espacio entre ellos.

### Calidad del Código
- **Uso de `const`/`let`**: Usa siempre `const` o `let` (nunca `var`).
- **Nombres descriptivos**: Nombra variables y funciones en español, usando `camelCase` (ej: `guardarCliente`), de forma descriptiva.
- **Manejo de asincronía**: Maneja asincronía limpiamente utilizando `async / await` en lugar de cadenas largas de `.then()`, e incluye siempre bloques `try / catch` para el manejo de errores.

## Checklist de Verificación para el Agente
Antes de responder, el agente debe verificar:
1. ¿Hay algún evento inline en el HTML? (Debe ser NO).
2. ¿Se usaron variables CSS para los colores y espaciados? (Debe ser SÍ).
3. ¿Se escaparon los datos de usuario? (Debe ser SÍ).
