# Taller de Costura PWA

Aplicación web progresiva (PWA) para la gestión integral de un taller de costura: cortes, prendas, trabajadores, asignaciones de tareas y pagos.

## Stack

- **Vanilla JS** (módulos ES, sin bundler, sin npm, sin TypeScript)
- **SPA con hash routing** en `js/app.js`
- **IndexedDB** con Dexie 4 (`js/db.js`) — sin datos semilla, BD arranca vacía
- **Tema oscuro** mobile-first con CSS custom properties
- **Service Worker** en `service-worker.js` — pre-cache de 38 assets, cache-first fetch, SPA fallback offline
- **CDN**: Dexie 4, SheetJS (xlsx), jsPDF + AutoTable, Chart.js, Inter

## Inicio rápido

```bash
python -m http.server 8080
```

O VS Code Live Server. La PWA requiere `localhost` o HTTPS.

## Estructura del proyecto

```
index.html              → Shell SPA + scripts CDN + <main id="app">
manifest.json           → PWA manifest (nombre, iconos, theme-color)
service-worker.js       → Install pre-cache, fetch cache-first, message skipWaiting
js/
  app.js                → Router hash, bottom-nav singleton, registro SW + updatefound
  db.js                 → Esquema Dexie (sin populate/seed)
  utils.js              → Escape HTML, conversión y formateo de moneda
  views/
    shared.js           → Modal confirmar, toast, tabs, header, estado vacío
    dashboard.js        → KPIs + 3 gráficos con Chart.js
    gestion-cortes.js   → Lista de cortes con filtros y progreso
    gestion-prendas.js  → CRUD prendas + importación Excel
    gestion-trabajadores.js → CRUD trabajadores
    gestion-pagos.js    → Pagos (3 tabs: resumen, registrar, historial)
    nuevo-corte.js      → Crear corte (seleccionar prenda, tallas, tareas)
    administrar-tareas/ → 5 tabs: resumen, corte, trabajador, editar, asignar
    gestion-pagos/      → Tabs de pagos: resumen, registrar, historial
css/
  style.css             → Cadena @import (variables → base → ... → views/*)
  variables.css         → Custom properties del tema oscuro
  views/                → CSS específico por vista
icons/                  → Iconos PWA (192x192, 512x512 PNG)
```

## Rutas hash

| Ruta | Vista | Bottom nav |
|---|---|---|
| `#dashboard` | KPIs + Chart.js (3 gráficos) | Sí |
| `#gestion-cortes` | Lista de cortes | Sí |
| `#gestion-prendas` | CRUD prendas | Sí |
| `#gestion-trabajadores` | CRUD trabajadores | Sí |
| `#historial-pagos` | Pagos (3 tabs) | Sí |
| `#nuevo-corte` | Formulario de corte | Oculto |
| `#administrar-tareas/:id` | 5 tabs de gestión | Oculto |
| `#nueva-prenda` / `#editar-prenda/:id` | Formulario prenda | Oculto |

## Manejo de moneda

| Campo | Unidad | Tipo | Ejemplo |
|---|---|---|---|
| `precioUnitario` (tareas) | Centavos | Entero | `5` = 0.05 Bs |
| `precioVentaUnitario` | Bolivianos | Decimal | `15.00` = 15 Bs |
| `monto` (pagos) | Centavos | Entero | `2550` = 25.50 Bs |

Funciones en `js/utils.js`: `centavosABolivianos()`, `bolivianosACentavos()`, `formatBs()`, `formatCtv()`, `formatCostoTotal()`, `formatNumero()`.

## Base de datos

- **Sin restricciones FK** — borrados en cascada manuales
- **Sin datos semilla** — la BD arranca vacía
- Para reiniciar: DevTools → Application → IndexedDB → borrar `TallerCosturaDB`

## Service Worker

- `CACHE_NAME = "taller-costura-v1.0"` — incrementar al modificar assets
- **Install**: pre-cachea 38 assets locales, `skipWaiting()`
- **Fetch**: cache-first (cache → network → cachea). Navegación offline → `index.html`
- **Actualización**: `js/app.js` muestra banner "Nueva versión disponible" al detectar SW nuevo; botón "Recargar" fuerza activación

## Patrón de vistas

Renderizar HTML → cargar datos → adjuntar event listeners. Re-render completo tras cada mutación. Funciones globales para `onclick` inline exportadas con `window.nombreFuncion = nombreFuncion`.
